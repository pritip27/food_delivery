const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT || 3000;
const publicDir = __dirname;
const ordersFilePath = path.join(__dirname, "orders.json");
const usersFilePath = path.join(__dirname, "users.json");
const menuFilePath = path.join(__dirname, "menu.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const MAX_BODY_SIZE = 1024 * 1024;
const API_WINDOW_MS = 1000 * 60 * 15;
const API_WINDOW_LIMIT = 300;
const AUTH_WINDOW_MS = 1000 * 60 * 15;
const AUTH_WINDOW_LIMIT = 12;
const defaultUsersSeed = [
  {
    id: "user-1",
    role: "user",
    name: "Spice Route Guest",
    email: "user@spiceroute.com",
    password: "user123",
  },
  {
    id: "admin-1",
    role: "admin",
    name: "Spice Route Admin",
    email: "admin@spiceroute.com",
    password: "admin123",
  },
];
const defaultUsers = defaultUsersSeed.map((user) => createStoredUser(user));
const users = loadUsers();

const sessions = new Map();
const rateLimits = new Map();

const defaultMenuItems = [
  {
    id: "paneer-bowl",
    name: "Smoky Paneer Bowl",
    category: "Vegetarian",
    price: 249,
    description: "Paneer tikka, saffron rice, greens, mint yogurt.",
  },
  {
    id: "burger-stack",
    name: "Zesty Burger Stack",
    category: "Fast Food",
    price: 199,
    description: "Double patty, spicy sauce, cheddar, crisp lettuce.",
  },
  {
    id: "alfredo-pasta",
    name: "Creamy Alfredo Pasta",
    category: "Pasta",
    price: 229,
    description: "Silky white sauce, herbs, garlic toast, parmesan.",
  },
  {
    id: "tandoori-pizza",
    name: "Tandoori Pizza Slice",
    category: "Fusion",
    price: 279,
    description: "Spiced topping, mozzarella, peppers, onion crunch.",
  },
  {
    id: "loaded-fries",
    name: "Loaded Fries Box",
    category: "Snacks",
    price: 149,
    description: "Crispy fries, smoky mayo, jalapeno, cheese drizzle.",
  },
  {
    id: "cold-coffee",
    name: "Cold Coffee Float",
    category: "Drinks",
    price: 119,
    description: "Rich cold coffee, vanilla cream, cocoa dust.",
  },
];
const menuItems = loadMenuItems();

const orders = loadOrders();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex"), iterations = 120000) {
  const passwordHash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
  return { passwordHash, passwordSalt: salt, passwordIterations: iterations };
}

function createStoredUser(user) {
  const { password, ...safeUser } = user;

  if (user.passwordHash && user.passwordSalt && user.passwordIterations) {
    return { ...safeUser, passwordHash: user.passwordHash, passwordSalt: user.passwordSalt, passwordIterations: user.passwordIterations };
  }

  const record = hashPassword(String(password || ""));
  return { ...safeUser, ...record };
}

function verifyPassword(password, user) {
  if (user.passwordHash && user.passwordSalt && user.passwordIterations) {
    const incoming = hashPassword(String(password || ""), user.passwordSalt, user.passwordIterations).passwordHash;

    try {
      const incomingBuffer = Buffer.from(incoming, "hex");
      const savedBuffer = Buffer.from(user.passwordHash, "hex");

      if (incomingBuffer.length !== savedBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(incomingBuffer, savedBuffer);
    } catch (error) {
      return false;
    }
  }

  return String(user.password || "") === String(password || "");
}

function migrateLegacyPasswordIfNeeded(user, password) {
  if (user.passwordHash && user.passwordSalt && user.passwordIterations) {
    return;
  }

  const record = hashPassword(String(password || ""));
  user.passwordHash = record.passwordHash;
  user.passwordSalt = record.passwordSalt;
  user.passwordIterations = record.passwordIterations;
  delete user.password;
  saveUsers();
}

function writeJsonFile(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filePath);
}

function loadOrders() {
  try {
    if (!fs.existsSync(ordersFilePath)) {
      return [];
    }

    const fileContent = fs.readFileSync(ordersFilePath, "utf8");

    if (!fileContent.trim()) {
      return [];
    }

    const parsedOrders = JSON.parse(fileContent);
    return Array.isArray(parsedOrders) ? parsedOrders : [];
  } catch (error) {
    console.error("Unable to load orders from storage:", error.message);
    return [];
  }
}

function saveOrders() {
  writeJsonFile(ordersFilePath, orders);
}

function loadUsers() {
  try {
    if (!fs.existsSync(usersFilePath)) {
      writeJsonFile(usersFilePath, defaultUsers);
      return defaultUsers.map((user) => ({ ...user }));
    }

    const fileContent = fs.readFileSync(usersFilePath, "utf8");

    if (!fileContent.trim()) {
      writeJsonFile(usersFilePath, defaultUsers);
      return defaultUsers.map((user) => ({ ...user }));
    }

    const parsedUsers = JSON.parse(fileContent);
    const normalizedUsers = Array.isArray(parsedUsers) ? parsedUsers.map((user) => createStoredUser(user)) : defaultUsers.map((user) => ({ ...user }));
    writeJsonFile(usersFilePath, normalizedUsers);
    return normalizedUsers;
  } catch (error) {
    console.error("Unable to load users from storage:", error.message);
    return defaultUsers.map((user) => ({ ...user }));
  }
}

function saveUsers() {
  writeJsonFile(usersFilePath, users);
}

function loadMenuItems() {
  try {
    if (!fs.existsSync(menuFilePath)) {
      writeJsonFile(menuFilePath, defaultMenuItems);
      return defaultMenuItems.map((item) => ({ ...item }));
    }

    const fileContent = fs.readFileSync(menuFilePath, "utf8");

    if (!fileContent.trim()) {
      writeJsonFile(menuFilePath, defaultMenuItems);
      return defaultMenuItems.map((item) => ({ ...item }));
    }

    const parsedMenu = JSON.parse(fileContent);
    return Array.isArray(parsedMenu) ? parsedMenu : defaultMenuItems.map((item) => ({ ...item }));
  } catch (error) {
    console.error("Unable to load menu from storage:", error.message);
    return defaultMenuItems.map((item) => ({ ...item }));
  }
}

function saveMenuItems() {
  writeJsonFile(menuFilePath, menuItems);
}

function getNextOrderId() {
  const highestOrderNumber = orders.reduce((highest, order) => {
    const match = /^ORD-(\d+)$/.exec(String(order.id || ""));

    if (!match) {
      return highest;
    }

    return Math.max(highest, Number(match[1]));
  }, 0);

  return `ORD-${highestOrderNumber + 1}`;
}

function getNextUserId() {
  const highestUserNumber = users.reduce((highest, user) => {
    const match = /^user-(\d+)$/.exec(String(user.id || ""));

    if (!match) {
      return highest;
    }

    return Math.max(highest, Number(match[1]));
  }, 0);

  return `user-${highestUserNumber + 1}`;
}

function createMenuItemId(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "menu-item";
  let nextId = base;
  let counter = 2;

  while (menuItems.some((item) => item.id === nextId)) {
    nextId = `${base}-${counter}`;
    counter += 1;
  }

  return nextId;
}

function serveFile(response, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[ext] || "application/octet-stream";

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(response, 404, { message: "File not found" });
      return;
    }

    response.writeHead(200, { "Content-Type": contentType });
    response.end(data);
  });
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > MAX_BODY_SIZE) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    request.on("error", reject);
  });
}

function sanitizeUser(user) {
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
  };
}

function findUser(email, role) {
  return users.find((user) => user.email === email && user.role === role);
}

function findUserByEmail(email) {
  return users.find((user) => user.email === email);
}

function createSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  const session = {
    token,
    user: sanitizeUser(user),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };

  sessions.set(token, session);
  return session;
}

function registerUser(payload) {
  const name = String(payload.name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "").trim();
  const confirmPassword = String(payload.confirmPassword || "").trim();

  if (!name) {
    return { error: "Full name is required." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "A valid email address is required." };
  }

  if (findUserByEmail(email)) {
    return { error: "An account with this email already exists." };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters long." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const user = createStoredUser({
    id: getNextUserId(),
    role: "user",
    name,
    email,
    password,
  });

  users.push(user);
  saveUsers();
  return { user: sanitizeUser(user) };
}

function getTokenFromRequest(request) {
  const authHeader = String(request.headers.authorization || "");

  if (!authHeader.startsWith("Bearer ")) {
    return "";
  }

  return authHeader.slice(7).trim();
}

function getSessionFromRequest(request) {
  const token = getTokenFromRequest(request);
  const session = token ? sessions.get(token) || null : null;

  if (!session) {
    return null;
  }

  if (Date.now() >= new Date(session.expiresAt).getTime()) {
    sessions.delete(token);
    return null;
  }

  return session;
}

function cleanupExpiredSessions() {
  const now = Date.now();

  sessions.forEach((session, token) => {
    if (now >= new Date(session.expiresAt).getTime()) {
      sessions.delete(token);
    }
  });
}

function getClientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket.remoteAddress || "unknown";
}

function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const existing = rateLimits.get(key);

  if (!existing || now >= existing.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

function cleanupRateLimits() {
  const now = Date.now();

  rateLimits.forEach((value, key) => {
    if (now >= value.resetAt) {
      rateLimits.delete(key);
    }
  });
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
}

function setCorsHeaders(request, response) {
  const allowedOrigins = new Set([
    `http://${HOST}:${PORT}`,
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ]);
  const origin = String(request.headers.origin || "");

  if (allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
}

function requireSession(request, response) {
  const session = getSessionFromRequest(request);

  if (!session) {
    sendJson(response, 401, { message: "You must be logged in." });
    return null;
  }

  return session;
}

function requireRole(session, response, role) {
  if (!session || session.user.role !== role) {
    sendJson(response, 403, { message: "You do not have permission for this action." });
    return false;
  }

  return true;
}

function getVisibleOrdersForSession(session) {
  if (session.user.role === "admin") {
    return orders;
  }

  return orders.filter((order) => order.userEmail === session.user.email);
}

function isValidCardNumber(cardNumber) {
  let sum = 0;
  let shouldDouble = false;

  for (let index = cardNumber.length - 1; index >= 0; index -= 1) {
    let digit = Number(cardNumber[index]);

    if (shouldDouble) {
      digit *= 2;

      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function isValidExpiryDate(expiryDate) {
  const match = /^(\d{2})\/(\d{2})$/.exec(expiryDate);

  if (!match) {
    return false;
  }

  const month = Number(match[1]);
  const year = Number(match[2]) + 2000;

  if (month < 1 || month > 12) {
    return false;
  }

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  if (year < currentYear) {
    return false;
  }

  if (year === currentYear && month < currentMonth) {
    return false;
  }

  return true;
}

function validatePayment(payment) {
  const paymentMethod = String(payment.paymentMethod || "").trim();
  const cardholderName = String(payment.cardholderName || "").trim();
  const cardNumber = String(payment.cardNumber || "").replace(/\s+/g, "");
  const expiryDate = String(payment.expiryDate || "").trim();
  const cvv = String(payment.cvv || "").trim();

  if (!paymentMethod) {
    return { error: "Payment method is required." };
  }

  if (paymentMethod !== "card") {
    return { error: "Only card payments are supported right now." };
  }

  if (!cardholderName) {
    return { error: "Cardholder name is required." };
  }

  if (cardholderName.length < 2) {
    return { error: "Cardholder name must be at least 2 characters." };
  }

  if (!/^\d{16}$/.test(cardNumber)) {
    return { error: "Card number must contain 16 digits." };
  }

  if (!isValidCardNumber(cardNumber)) {
    return { error: "Card number appears invalid." };
  }

  if (!/^\d{2}\/\d{2}$/.test(expiryDate)) {
    return { error: "Expiry date must use MM/YY format." };
  }

  if (!isValidExpiryDate(expiryDate)) {
    return { error: "Card expiry date is invalid or already expired." };
  }

  if (!/^\d{3}$/.test(cvv)) {
    return { error: "CVV must contain 3 digits." };
  }

  return {
    payment: {
      paymentMethod,
      cardholderName,
      cardLast4: cardNumber.slice(-4),
      expiryDate,
      paidAt: new Date().toISOString(),
      paymentStatus: "paid",
    },
  };
}

function createOrder(payload, session) {
  const customerName = String(payload.customerName || "").trim();
  const customerPhone = String(payload.customerPhone || "").replace(/\D+/g, "");
  const deliveryAddress = String(payload.deliveryAddress || "").trim();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const paymentValidation = validatePayment(payload.payment || {});

  if (!customerName) {
    return { error: "Customer name is required." };
  }

  if (customerName.length < 2) {
    return { error: "Customer name must be at least 2 characters." };
  }

  if (!customerPhone) {
    return { error: "Phone number is required." };
  }

  if (!/^\d{10}$/.test(customerPhone)) {
    return { error: "Phone number must contain exactly 10 digits." };
  }

  if (!deliveryAddress) {
    return { error: "Delivery address is required." };
  }

  if (deliveryAddress.length < 10) {
    return { error: "Delivery address should be at least 10 characters." };
  }

  if (items.length === 0) {
    return { error: "At least one order item is required." };
  }

  if (paymentValidation.error) {
    return { error: paymentValidation.error };
  }

  const normalizedItems = items.map((item) => {
    const menuItem = menuItems.find((entry) => entry.id === item.id);
    const quantity = Number(item.quantity);

    if (!menuItem || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return null;
    }

    return {
      id: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity,
      lineTotal: menuItem.price * quantity,
    };
  });

  if (normalizedItems.includes(null)) {
    return { error: "One or more order items are invalid." };
  }

  const total = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const order = {
    id: getNextOrderId(),
    userId: session.user.id,
    userEmail: session.user.email,
    customerName,
    customerPhone,
    deliveryAddress,
    items: normalizedItems,
    total,
    status: "received",
    createdAt: new Date().toISOString(),
    payment: paymentValidation.payment,
  };

  orders.push(order);
  saveOrders();
  return { order };
}

function updateOrderStatus(orderId, status) {
  const order = orders.find((entry) => entry.id === orderId);
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const allowedStatuses = ["received", "preparing", "out for delivery", "delivered"];

  if (!order) {
    return { error: "Order not found." };
  }

  if (!allowedStatuses.includes(normalizedStatus)) {
    return { error: "Invalid order status." };
  }

  order.status = normalizedStatus;
  order.updatedAt = new Date().toISOString();
  saveOrders();
  return { order };
}

function createMenuItem(payload) {
  const name = String(payload.name || "").trim();
  const category = String(payload.category || "").trim();
  const description = String(payload.description || "").trim();
  const price = Number(payload.price);

  if (!name) {
    return { error: "Dish name is required." };
  }

  if (!category) {
    return { error: "Category is required." };
  }

  if (!description) {
    return { error: "Description is required." };
  }

  if (!Number.isFinite(price) || price <= 0) {
    return { error: "Price must be a number greater than 0." };
  }

  const menuItem = {
    id: createMenuItemId(name),
    name,
    category,
    price: Math.round(price),
    description,
  };

  menuItems.push(menuItem);
  saveMenuItems();
  return { menuItem };
}

function deleteMenuItem(menuItemId) {
  const itemIndex = menuItems.findIndex((item) => item.id === menuItemId);

  if (itemIndex === -1) {
    return { error: "Menu item not found." };
  }

  const [removedItem] = menuItems.splice(itemIndex, 1);
  saveMenuItems();
  return { menuItem: removedItem };
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
  const pathname = requestUrl.pathname;
  const clientIp = getClientIp(request);

  setSecurityHeaders(response);
  setCorsHeaders(request, response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (pathname.startsWith("/api/")) {
    const apiRateLimit = checkRateLimit(`${clientIp}:api`, API_WINDOW_LIMIT, API_WINDOW_MS);

    if (!apiRateLimit.allowed) {
      response.setHeader("Retry-After", String(apiRateLimit.retryAfterSeconds));
      sendJson(response, 429, { message: "Too many requests. Please try again shortly." });
      return;
    }
  }

  if ((pathname === "/api/login" || pathname === "/api/register") && request.method === "POST") {
    const authRateLimit = checkRateLimit(`${clientIp}:auth`, AUTH_WINDOW_LIMIT, AUTH_WINDOW_MS);

    if (!authRateLimit.allowed) {
      response.setHeader("Retry-After", String(authRateLimit.retryAfterSeconds));
      sendJson(response, 429, { message: "Too many authentication attempts. Please wait and retry." });
      return;
    }
  }

  if (request.method === "GET" && pathname === "/api/menu") {
    sendJson(response, 200, menuItems);
    return;
  }

  if (request.method === "POST" && pathname === "/api/menu") {
    const session = requireSession(request, response);

    if (!session) {
      return;
    }

    if (!requireRole(session, response, "admin")) {
      return;
    }

    try {
      const payload = await parseBody(request);
      const result = createMenuItem(payload);

      if (result.error) {
        sendJson(response, 400, { message: result.error });
        return;
      }

      sendJson(response, 201, result.menuItem);
      return;
    } catch (error) {
      sendJson(response, 400, { message: "Request body must be valid JSON." });
      return;
    }
  }

  if (request.method === "POST" && pathname === "/api/login") {
    try {
      const payload = await parseBody(request);
      const email = String(payload.email || "").trim().toLowerCase();
      const password = String(payload.password || "").trim();
      const role = String(payload.role || "").trim().toLowerCase();
      const user = findUser(email, role);

      if (!user || !verifyPassword(password, user)) {
        sendJson(response, 401, { message: "Invalid email, password, or role." });
        return;
      }

      migrateLegacyPasswordIfNeeded(user, password);
      const session = createSession(user);
      sendJson(response, 200, { token: session.token, user: session.user });
      return;
    } catch (error) {
      sendJson(response, 400, { message: "Request body must be valid JSON." });
      return;
    }
  }

  if (request.method === "POST" && pathname === "/api/register") {
    try {
      const payload = await parseBody(request);
      const result = registerUser(payload);

      if (result.error) {
        sendJson(response, 400, { message: result.error });
        return;
      }

      sendJson(response, 201, { user: result.user });
      return;
    } catch (error) {
      sendJson(response, 400, { message: "Request body must be valid JSON." });
      return;
    }
  }

  if (request.method === "GET" && pathname === "/api/session") {
    const session = requireSession(request, response);

    if (!session) {
      return;
    }

    sendJson(response, 200, { user: session.user });
    return;
  }

  if (request.method === "POST" && pathname === "/api/logout") {
    const token = getTokenFromRequest(request);

    if (token) {
      sessions.delete(token);
    }

    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && pathname === "/api/orders") {
    const session = requireSession(request, response);

    if (!session) {
      return;
    }

    sendJson(response, 200, getVisibleOrdersForSession(session));
    return;
  }

  if (request.method === "POST" && pathname === "/api/orders") {
    const session = requireSession(request, response);

    if (!session) {
      return;
    }

    if (!requireRole(session, response, "user")) {
      return;
    }

    try {
      const payload = await parseBody(request);
      const result = createOrder(payload, session);

      if (result.error) {
        sendJson(response, 400, { message: result.error });
        return;
      }

      sendJson(response, 201, result.order);
      return;
    } catch (error) {
      sendJson(response, 400, { message: "Request body must be valid JSON." });
      return;
    }
  }

  if (request.method === "PATCH" && /^\/api\/orders\/[^/]+\/status$/.test(pathname)) {
    const session = requireSession(request, response);

    if (!session) {
      return;
    }

    if (!requireRole(session, response, "admin")) {
      return;
    }

    try {
      const payload = await parseBody(request);
      const orderId = pathname.split("/")[3];
      const result = updateOrderStatus(orderId, payload.status);

      if (result.error) {
        sendJson(response, 400, { message: result.error });
        return;
      }

      sendJson(response, 200, result.order);
      return;
    } catch (error) {
      sendJson(response, 400, { message: "Request body must be valid JSON." });
      return;
    }
  }

  if (request.method === "DELETE" && /^\/api\/menu\/[^/]+$/.test(pathname)) {
    const session = requireSession(request, response);

    if (!session) {
      return;
    }

    if (!requireRole(session, response, "admin")) {
      return;
    }

    const menuItemId = pathname.split("/")[3];
    const result = deleteMenuItem(menuItemId);

    if (result.error) {
      sendJson(response, 404, { message: result.error });
      return;
    }

    sendJson(response, 200, result.menuItem);
    return;
  }

  if (request.method !== "GET") {
    sendJson(response, 405, { message: "Method not allowed" });
    return;
  }

  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[\\/])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(response, 403, { message: "Access denied" });
    return;
  }

  serveFile(response, filePath);
});

setInterval(() => {
  cleanupExpiredSessions();
  cleanupRateLimits();
}, 1000 * 60 * 5).unref();

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
