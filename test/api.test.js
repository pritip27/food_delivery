const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { MongoClient } = require("mongodb");

const HOST = "127.0.0.1";
const PORT = 3100;
const baseUrl = `http://${HOST}:${PORT}`;
const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const databaseName = `spice_route_test_${Date.now()}`;

let serverProcess;
let mongoClient;

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const contentType = String(response.headers.get("content-type") || "");
  const payload = contentType.includes("application/json") ? await response.json() : null;
  return { response, payload };
}

async function waitForServer() {
  const timeoutAt = Date.now() + 15000;

  while (Date.now() < timeoutAt) {
    try {
      const { response } = await api("/api/menu");

      if (response.ok) {
        return;
      }
    } catch (error) {
      // Retry until the server is ready.
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for the server to start.");
}

test.before(async () => {
  mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();

  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST,
      PORT: String(PORT),
      MONGODB_URI: mongoUri,
      MONGODB_DB_NAME: databaseName,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stderr.on("data", (chunk) => {
    const message = String(chunk);

    if (message.trim()) {
      process.stderr.write(message);
    }
  });

  await waitForServer();
});

test.after(async () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    await once(serverProcess, "exit").catch(() => undefined);
  }

  if (mongoClient) {
    await mongoClient.db(databaseName).dropDatabase().catch(() => undefined);
    await mongoClient.close();
  }
});

test("loads seeded menu items", async () => {
  const { response, payload } = await api("/api/menu");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(payload));
  assert.equal(payload.length, 6);
  assert.ok(payload.some((item) => item.id === "paneer-bowl"));
  assert.ok(payload.some((item) => item.id === "cold-coffee"));
});

test("allows seeded user login and session lookup", async () => {
  const login = await api("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "user@spiceroute.com",
      password: "user123",
      role: "user",
    }),
  });

  assert.equal(login.response.status, 200);
  assert.equal(login.payload.user.email, "user@spiceroute.com");
  assert.ok(login.payload.token);

  const session = await api("/api/session", {
    headers: {
      Authorization: `Bearer ${login.payload.token}`,
    },
  });

  assert.equal(session.response.status, 200);
  assert.equal(session.payload.user.role, "user");
});

test("creates an order for a user and lets admin update the status", async () => {
  const userLogin = await api("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "user@spiceroute.com",
      password: "user123",
      role: "user",
    }),
  });

  const adminLogin = await api("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@spiceroute.com",
      password: "admin123",
      role: "admin",
    }),
  });

  const createOrder = await api("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userLogin.payload.token}`,
    },
    body: JSON.stringify({
      customerName: "Integration Test User",
      customerPhone: "9876543210",
      deliveryAddress: "42 Test Street, Bengaluru",
      items: [
        { id: "paneer-bowl", quantity: 2 },
        { id: "cold-coffee", quantity: 1 },
      ],
      payment: {
        paymentMethod: "card",
        cardholderName: "Integration Test User",
        cardNumber: "4242424242424242",
        expiryDate: "12/30",
        cvv: "123",
      },
    }),
  });

  assert.equal(createOrder.response.status, 201);
  assert.equal(createOrder.payload.status, "received");
  assert.equal(createOrder.payload.total, 617);

  const userOrders = await api("/api/orders", {
    headers: {
      Authorization: `Bearer ${userLogin.payload.token}`,
    },
  });

  assert.equal(userOrders.response.status, 200);
  assert.equal(userOrders.payload.length, 1);
  assert.equal(userOrders.payload[0].id, createOrder.payload.id);

  const updatedOrder = await api(`/api/orders/${createOrder.payload.id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminLogin.payload.token}`,
    },
    body: JSON.stringify({
      status: "preparing",
    }),
  });

  assert.equal(updatedOrder.response.status, 200);
  assert.equal(updatedOrder.payload.status, "preparing");
});
