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

async function startServer() {
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
}

async function stopServer() {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  serverProcess.kill();
  await once(serverProcess, "exit").catch(() => undefined);
}

test.before(async () => {
  mongoClient = new MongoClient(mongoUri);
  await mongoClient.connect();
  await startServer();
});

test.after(async () => {
  await stopServer();

  if (mongoClient) {
    await mongoClient.db(databaseName).dropDatabase().catch(() => undefined);
    await mongoClient.close();
  }
});

test("loads seeded menu items", async () => {
  const { response, payload } = await api("/api/menu");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(payload));
  assert.equal(payload.length, 17);
  assert.ok(payload.some((item) => item.id === "chicken-biryani"));
  assert.ok(payload.some((item) => item.id === "blue-mojito"));
  assert.ok(payload.some((item) => item.image === "assets/menu/items/chicken-biryani.svg"));
});

test("filters menu items by search text", async () => {
  const { response, payload } = await api("/api/menu?search=milkshake");

  assert.equal(response.status, 200);
  assert.equal(payload.length, 2);
  assert.ok(payload.some((item) => item.id === "chocolate-milkshake"));
  assert.ok(payload.some((item) => item.id === "vanilla-milkshake"));
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

test("keeps a login session valid after a server restart", async () => {
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

  await stopServer();
  await startServer();

  const session = await api("/api/session", {
    headers: {
      Authorization: `Bearer ${login.payload.token}`,
    },
  });

  assert.equal(session.response.status, 200);
  assert.equal(session.payload.user.email, "user@spiceroute.com");
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
        { id: "chicken-biryani", quantity: 2 },
        { id: "blue-mojito", quantity: 1 },
      ],
      payment: {
        paymentMethod: "upi",
        upiId: "integrationtest@upi",
      },
    }),
  });

  assert.equal(createOrder.response.status, 201);
  assert.equal(createOrder.payload.status, "received");
  assert.equal(createOrder.payload.total, 577);

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

test("filters orders by search and status", async () => {
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
      customerName: "Filter Target",
      customerPhone: "9998887776",
      deliveryAddress: "77 Search Lane, Bengaluru",
      items: [{ id: "chicken-burger", quantity: 1 }],
      payment: {
        paymentMethod: "upi",
        upiId: "filtertarget@upi",
      },
    }),
  });

  await api(`/api/orders/${createOrder.payload.id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminLogin.payload.token}`,
    },
    body: JSON.stringify({
      status: "delivered",
    }),
  });

  const filteredForUser = await api("/api/orders?search=filter", {
    headers: {
      Authorization: `Bearer ${userLogin.payload.token}`,
    },
  });

  assert.equal(filteredForUser.response.status, 200);
  assert.equal(filteredForUser.payload.length, 1);
  assert.equal(filteredForUser.payload[0].customerName, "Filter Target");

  const filteredForAdmin = await api("/api/orders?status=delivered&search=chicken", {
    headers: {
      Authorization: `Bearer ${adminLogin.payload.token}`,
    },
  });

  assert.equal(filteredForAdmin.response.status, 200);
  assert.ok(filteredForAdmin.payload.some((order) => order.id === createOrder.payload.id));
});

test("lets admin edit menu items and approve or reject orders", async () => {
  const adminLogin = await api("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@spiceroute.com",
      password: "admin123",
      role: "admin",
    }),
  });

  const userLogin = await api("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "user@spiceroute.com",
      password: "user123",
      role: "user",
    }),
  });

  const menuUpdate = await api("/api/menu/chicken-biryani", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminLogin.payload.token}`,
    },
    body: JSON.stringify({
      name: "Chicken Biryani Royale",
      category: "Signature Main Course",
      price: 289,
      description: "Dum biryani layered with tender chicken, saffron rice, and slow-cooked spices.",
      image: "assets/menu/items/chicken-biryani.svg",
    }),
  });

  assert.equal(menuUpdate.response.status, 200);
  assert.equal(menuUpdate.payload.name, "Chicken Biryani Royale");
  assert.equal(menuUpdate.payload.price, 289);
  assert.equal(menuUpdate.payload.image, "assets/menu/items/chicken-biryani.svg");

  const updatedMenu = await api("/api/menu?search=royale");
  assert.equal(updatedMenu.response.status, 200);
  assert.equal(updatedMenu.payload.length, 1);
  assert.equal(updatedMenu.payload[0].id, "chicken-biryani");

  const orderOne = await api("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userLogin.payload.token}`,
    },
    body: JSON.stringify({
      customerName: "Approval Target",
      customerPhone: "9876501234",
      deliveryAddress: "90 Admin Lane, Bengaluru",
      items: [{ id: "chicken-biryani", quantity: 1 }],
      payment: {
        paymentMethod: "upi",
        upiId: "approvetest@upi",
      },
    }),
  });

  const orderTwo = await api("/api/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userLogin.payload.token}`,
    },
    body: JSON.stringify({
      customerName: "Reject Target",
      customerPhone: "9876505678",
      deliveryAddress: "91 Admin Lane, Bengaluru",
      items: [{ id: "chicken-burger", quantity: 1 }],
      payment: {
        paymentMethod: "upi",
        upiId: "rejecttest@upi",
      },
    }),
  });

  const approveOrder = await api(`/api/orders/${orderOne.payload.id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminLogin.payload.token}`,
    },
    body: JSON.stringify({
      status: "approved",
    }),
  });

  const rejectOrder = await api(`/api/orders/${orderTwo.payload.id}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminLogin.payload.token}`,
    },
    body: JSON.stringify({
      status: "rejected",
    }),
  });

  assert.equal(approveOrder.response.status, 200);
  assert.equal(approveOrder.payload.status, "approved");
  assert.equal(rejectOrder.response.status, 200);
  assert.equal(rejectOrder.payload.status, "rejected");

  const approvedOrders = await api("/api/orders?status=approved", {
    headers: {
      Authorization: `Bearer ${adminLogin.payload.token}`,
    },
  });

  const rejectedOrders = await api("/api/orders?status=rejected", {
    headers: {
      Authorization: `Bearer ${adminLogin.payload.token}`,
    },
  });

  assert.equal(approvedOrders.response.status, 200);
  assert.ok(approvedOrders.payload.some((order) => order.id === orderOne.payload.id));
  assert.equal(rejectedOrders.response.status, 200);
  assert.ok(rejectedOrders.payload.some((order) => order.id === orderTwo.payload.id));
});

test("lets admin create a menu item with an image path", async () => {
  const adminLogin = await api("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@spiceroute.com",
      password: "admin123",
      role: "admin",
    }),
  });

  const createMenuItem = await api("/api/menu", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminLogin.payload.token}`,
    },
    body: JSON.stringify({
      name: "Paneer Roll",
      category: "Wraps",
      price: 159,
      description: "Soft roll packed with paneer tikka, onions, and mint mayo.",
      image: "assets/menu/items/chicken-shawarma.svg",
    }),
  });

  assert.equal(createMenuItem.response.status, 201);
  assert.equal(createMenuItem.payload.id, "paneer-roll");
  assert.equal(createMenuItem.payload.image, "assets/menu/items/chicken-shawarma.svg");

  const menuLookup = await api("/api/menu?search=paneer%20roll");
  assert.equal(menuLookup.response.status, 200);
  assert.equal(menuLookup.payload.length, 1);
  assert.equal(menuLookup.payload[0].image, "assets/menu/items/chicken-shawarma.svg");
});
