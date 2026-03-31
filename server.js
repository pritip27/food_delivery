const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { initializeDatabase } = require("./db");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT || 3000;
const publicDir = __dirname;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const MAX_BODY_SIZE = 1024 * 1024;
const API_WINDOW_MS = 1000 * 60 * 15;
const API_WINDOW_LIMIT = 300;
const AUTH_WINDOW_MS = 1000 * 60 * 15;
const AUTH_WINDOW_LIMIT = 12;
const MAX_REMOTE_IMAGE_BYTES = 1024 * 1024 * 2;

const rateLimits = new Map();

let store;

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

const defaultMenuItems = [
  {
    id: "masala-tea",
    name: "Masala Tea",
    category: "Beverages",
    price: 40,
    description: "Hot Indian chai brewed with milk, tea leaves, ginger, and spices.",
    image: "assets/menu/items/masala-tea.svg",
  },
  {
    id: "masala-maggi",
    name: "Masala Maggi",
    category: "Snacks",
    price: 79,
    description: "Street-style Maggi noodles tossed with vegetables and house masala.",
    image: "assets/menu/items/masala-maggi.svg",
  },
  {
    id: "french-fries",
    name: "French Fries",
    category: "Snacks",
    price: 99,
    description: "Golden crispy fries served hot with ketchup and peri peri seasoning.",
    image: "assets/menu/items/french-fries.svg",
  },
  {
    id: "loaded-french-fries",
    name: "Loaded French Fries",
    category: "Snacks",
    price: 149,
    description: "Crispy fries topped with cheese sauce, mayo, herbs, and spice mix.",
    image: "assets/menu/items/loaded-french-fries.svg",
  },
  {
    id: "masala-puri",
    name: "Masala Puri",
    category: "Chaat",
    price: 89,
    description: "Crushed puri topped with ragda, chutneys, sev, and fresh onions.",
    image: "assets/menu/items/masala-puri.svg",
  },
  {
    id: "pani-puri",
    name: "Pani Puri",
    category: "Chaat",
    price: 69,
    description: "Crisp puris filled with spicy mint water, potato, and tangy chutney.",
    image: "assets/menu/items/pani-puri.svg",
  },
  {
    id: "dahi-puri",
    name: "Dahi Puri",
    category: "Chaat",
    price: 79,
    description: "Puris layered with curd, chutneys, masala, sev, and pomegranate.",
    image: "assets/menu/items/dahi-puri.svg",
  },
  {
    id: "veg-burger",
    name: "Veg Burger",
    category: "Burgers",
    price: 119,
    description: "Soft burger bun with crispy veg patty, lettuce, and burger sauce.",
    image: "assets/menu/items/veg-burger.svg",
  },
  {
    id: "chicken-burger",
    name: "Chicken Burger",
    category: "Burgers",
    price: 149,
    description: "Juicy chicken patty burger with mayo, onion, and crunchy lettuce.",
    image: "assets/menu/items/chicken-burger.svg",
  },
  {
    id: "shawarma",
    name: "Chicken Shawarma",
    category: "Wraps",
    price: 139,
    description: "Soft wrap filled with spiced chicken, cabbage, and creamy garlic sauce.",
    image: "assets/menu/items/chicken-shawarma.svg",
  },
  {
    id: "large-shawarma",
    name: "Large Shawarma",
    category: "Wraps",
    price: 189,
    description: "Extra large shawarma packed with chicken, veggies, and garlic mayo.",
    image: "assets/menu/items/large-shawarma.svg",
  },
  {
    id: "chicken-biryani",
    name: "Chicken Biryani",
    category: "Indian Main Course",
    price: 229,
    description: "Fragrant basmati rice cooked with chicken, spices, and biryani masala.",
    image: "assets/menu/items/chicken-biryani.svg",
  },
  {
    id: "mutton-biryani",
    name: "Mutton Biryani",
    category: "Indian Main Course",
    price: 289,
    description: "Aromatic basmati rice layered with tender mutton and rich biryani spices.",
    image: "assets/menu/items/mutton-biryani.svg",
  },
  {
    id: "lime-soda",
    name: "Lime Soda",
    category: "Beverages",
    price: 59,
    description: "Refreshing lime soda with a fizzy finish and a touch of black salt.",
    image: "assets/menu/items/lime-soda.svg",
  },
  {
    id: "chocolate-milkshake",
    name: "Chocolate Milkshake",
    category: "Beverages",
    price: 109,
    description: "Creamy chocolate milkshake blended smooth and topped with chocolate drizzle.",
    image: "assets/menu/items/chocolate-milkshake.svg",
  },
  {
    id: "vanilla-milkshake",
    name: "Vanilla Milkshake",
    category: "Beverages",
    price: 99,
    description: "Classic vanilla milkshake made rich, chilled, and extra creamy.",
    image: "assets/menu/items/vanilla-milkshake.svg",
  },
  {
    id: "blue-mojito",
    name: "Blue Mojito",
    category: "Beverages",
    price: 119,
    description: "Cool blue mojito with mint, lemon, and sparkling soda.",
    image: "assets/menu/items/blue-mojito.svg",
  },
];

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
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
    return {
      ...safeUser,
      passwordHash: user.passwordHash,
      passwordSalt: user.passwordSalt,
      passwordIterations: user.passwordIterations,
    };
  }

  return {
    ...safeUser,
    ...hashPassword(String(password || "")),
  };
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

async function migrateLegacyPasswordIfNeeded(user, password) {
  if (user.passwordHash && user.passwordSalt && user.passwordIterations) {
    return user;
  }

  const record = hashPassword(String(password || ""));
  const updatedUser = {
    ...user,
    passwordHash: record.passwordHash,
    passwordSalt: record.passwordSalt,
    passwordIterations: record.passwordIterations,
  };

  delete updatedUser.password;
  await store.replaceUser(updatedUser);
  return updatedUser;
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

async function findUser(email, role) {
  return store.getUserByEmailAndRole(email, role);
}

async function findUserByEmail(email) {
  return store.getUserByEmail(email);
}

function createSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  return {
    token,
    user: sanitizeUser(user),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
}

async function registerUser(payload) {
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

  if (await findUserByEmail(email)) {
    return { error: "An account with this email already exists." };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters long." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const user = createStoredUser({
    id: await store.getNextUserId(),
    role: "user",
    name,
    email,
    password,
  });

  await store.insertUser(user);
  return { user: sanitizeUser(user) };
}

function getTokenFromRequest(request) {
  const authHeader = String(request.headers.authorization || "");

  if (!authHeader.startsWith("Bearer ")) {
    return "";
  }

  return authHeader.slice(7).trim();
}

async function getSessionFromRequest(request) {
  const token = getTokenFromRequest(request);
  const session = token ? await store.getSessionByToken(token) : null;

  if (!session) {
    return null;
  }

  if (Date.now() >= new Date(session.expiresAt).getTime()) {
    await store.deleteSession(token);
    return null;
  }

  return session;
}

async function cleanupExpiredSessions() {
  await store.deleteExpiredSessions(new Date().toISOString());
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
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
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

async function requireSession(request, response) {
  const session = await getSessionFromRequest(request);

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

function normalizeSearchFilters(searchParams) {
  return {
    search: String(searchParams.get("search") || "").trim(),
    category: String(searchParams.get("category") || "").trim(),
    status: String(searchParams.get("status") || "").trim().toLowerCase(),
  };
}

async function getVisibleOrdersForSession(session, filters = {}) {
  return store.getVisibleOrdersForUser(session.user, filters);
}

function isValidUpiId(upiId) {
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId);
}

function validatePayment(payment) {
  const paymentMethod = String(payment.paymentMethod || "").trim();
  const upiId = String(payment.upiId || "").trim().toLowerCase();

  if (!paymentMethod) {
    return { error: "Payment method is required." };
  }

  if (paymentMethod !== "upi") {
    return { error: "Only UPI payments are supported right now." };
  }

  if (!upiId) {
    return { error: "UPI ID is required." };
  }

  if (!isValidUpiId(upiId)) {
    return { error: "UPI ID appears invalid." };
  }

  return {
    payment: {
      paymentMethod,
      upiId,
      paidAt: new Date().toISOString(),
      paymentStatus: "paid",
    },
  };
}

function isValidImageValue(image) {
  const isRemoteImageUrl = isRemoteImageValue(image);

  return (
    /^assets\/[\w./-]+\.(svg|png|jpe?g|webp|gif)$/i.test(image) ||
    isRemoteImageUrl ||
    /^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(image)
  );
}

function isRemoteImageValue(image) {
  try {
    const parsedUrl = new URL(String(image || "").trim());
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch (error) {
    return false;
  }
}

async function convertRemoteImageUrlToDataUrl(imageUrl) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error("Could not download the image URL.");
  }

  const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const contentLength = Number(response.headers.get("content-length") || 0);

  if (!/^image\/(?:png|jpeg|jpg|webp|gif|svg\+xml)$/.test(contentType)) {
    throw new Error("Image URL must point to a PNG, JPG, WEBP, GIF, or SVG file.");
  }

  if (contentLength > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error("Image URL is too large. Please use an image under 2 MB.");
  }

  const arrayBuffer = await response.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);

  if (imageBuffer.length > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error("Image URL is too large. Please use an image under 2 MB.");
  }

  return `data:${contentType};base64,${imageBuffer.toString("base64")}`;
}

async function normalizeIncomingImageValue(image) {
  const normalizedImage = String(image || "").trim();

  if (!normalizedImage) {
    return "";
  }

  if (!isRemoteImageValue(normalizedImage)) {
    return normalizedImage;
  }

  return convertRemoteImageUrlToDataUrl(normalizedImage);
}

async function createOrder(payload, session) {
  const customerName = String(payload.customerName || "").trim();
  const customerPhone = String(payload.customerPhone || "").replace(/\D+/g, "");
  const deliveryAddress = String(payload.deliveryAddress || "").trim();
  const requestedItems = Array.isArray(payload.items) ? payload.items : [];
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

  if (requestedItems.length === 0) {
    return { error: "At least one order item is required." };
  }

  if (paymentValidation.error) {
    return { error: paymentValidation.error };
  }

  const menuItems = await store.getMenuItemsByIds(requestedItems.map((item) => item.id));
  const menuItemMap = new Map(menuItems.map((item) => [item.id, item]));
  const normalizedItems = requestedItems.map((item) => {
    const menuItem = menuItemMap.get(item.id);
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
    id: await store.getNextOrderId(),
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

  await store.insertOrder(order);
  return { order };
}

async function updateOrderStatus(orderId, status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const allowedStatuses = ["received", "approved", "rejected", "preparing", "out for delivery", "delivered"];

  if (!allowedStatuses.includes(normalizedStatus)) {
    return { error: "Invalid order status." };
  }

  const order = await store.updateOrderStatus(orderId, normalizedStatus);

  if (!order) {
    return { error: "Order not found." };
  }

  return { order };
}

async function createMenuItem(payload) {
  const name = String(payload.name || "").trim();
  const category = String(payload.category || "").trim();
  const description = String(payload.description || "").trim();
  const price = Number(payload.price);
  const image = String(payload.image || "").trim();

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

  if (image && !isValidImageValue(image)) {
    return { error: "Image must be a valid asset path or uploaded image." };
  }

  let normalizedImage = "";

  try {
    normalizedImage = await normalizeIncomingImageValue(image);
  } catch (error) {
    return { error: error.message };
  }

  const menuItem = {
    id: await store.getNextMenuItemId(name),
    name,
    category,
    price: Math.round(price),
    description,
    ...(normalizedImage ? { image: normalizedImage } : {}),
  };

  await store.insertMenuItem(menuItem);
  return { menuItem };
}

async function updateMenuItem(menuItemId, payload) {
  const name = String(payload.name || "").trim();
  const category = String(payload.category || "").trim();
  const description = String(payload.description || "").trim();
  const price = Number(payload.price);
  const image = String(payload.image || "").trim();

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

  if (image && !isValidImageValue(image)) {
    return { error: "Image must be a valid asset path or uploaded image." };
  }

  let normalizedImage = "";

  try {
    normalizedImage = await normalizeIncomingImageValue(image);
  } catch (error) {
    return { error: error.message };
  }

  const menuItem = await store.updateMenuItem(menuItemId, {
    name,
    category,
    price: Math.round(price),
    description,
    image: normalizedImage,
  });

  if (!menuItem) {
    return { error: "Menu item not found." };
  }

  return { menuItem };
}

async function deleteMenuItem(menuItemId) {
  const menuItem = await store.deleteMenuItem(menuItemId);

  if (!menuItem) {
    return { error: "Menu item not found." };
  }

  return { menuItem };
}

async function startServer() {
  store = await initializeDatabase({
    defaultUsers: defaultUsersSeed.map((user) => createStoredUser(user)),
    defaultMenuItems,
  });

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
      const filters = normalizeSearchFilters(requestUrl.searchParams);
      sendJson(response, 200, await store.getAllMenuItems(filters));
      return;
    }

    if (request.method === "POST" && pathname === "/api/menu") {
      const session = await requireSession(request, response);

      if (!session) {
        return;
      }

      if (!requireRole(session, response, "admin")) {
        return;
      }

      try {
        const payload = await parseBody(request);
        const result = await createMenuItem(payload);

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

    if (request.method === "PATCH" && /^\/api\/menu\/[^/]+$/.test(pathname)) {
      const session = await requireSession(request, response);

      if (!session) {
        return;
      }

      if (!requireRole(session, response, "admin")) {
        return;
      }

      try {
        const payload = await parseBody(request);
        const menuItemId = pathname.split("/")[3];
        const result = await updateMenuItem(menuItemId, payload);

        if (result.error) {
          const statusCode = result.error === "Menu item not found." ? 404 : 400;
          sendJson(response, statusCode, { message: result.error });
          return;
        }

        sendJson(response, 200, result.menuItem);
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
        const existingUser = await findUser(email, role);

        if (!existingUser || !verifyPassword(password, existingUser)) {
          sendJson(response, 401, { message: "Invalid email, password, or role." });
          return;
        }

        const user = await migrateLegacyPasswordIfNeeded(existingUser, password);
        const session = createSession(user);
        await store.insertSession(session);
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
        const result = await registerUser(payload);

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
      const session = await requireSession(request, response);

      if (!session) {
        return;
      }

      sendJson(response, 200, { user: session.user });
      return;
    }

    if (request.method === "POST" && pathname === "/api/logout") {
      const token = getTokenFromRequest(request);

      if (token) {
        await store.deleteSession(token);
      }

      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && pathname === "/api/orders") {
      const session = await requireSession(request, response);

      if (!session) {
        return;
      }

      const filters = normalizeSearchFilters(requestUrl.searchParams);
      sendJson(response, 200, await getVisibleOrdersForSession(session, filters));
      return;
    }

    if (request.method === "POST" && pathname === "/api/orders") {
      const session = await requireSession(request, response);

      if (!session) {
        return;
      }

      if (!requireRole(session, response, "user")) {
        return;
      }

      try {
        const payload = await parseBody(request);
        const result = await createOrder(payload, session);

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
      const session = await requireSession(request, response);

      if (!session) {
        return;
      }

      if (!requireRole(session, response, "admin")) {
        return;
      }

      try {
        const payload = await parseBody(request);
        const orderId = pathname.split("/")[3];
        const result = await updateOrderStatus(orderId, payload.status);

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
      const session = await requireSession(request, response);

      if (!session) {
        return;
      }

      if (!requireRole(session, response, "admin")) {
        return;
      }

      const menuItemId = pathname.split("/")[3];
      const result = await deleteMenuItem(menuItemId);

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
    cleanupExpiredSessions().catch((error) => {
      console.error("Unable to clean up expired sessions:", error);
    });
    cleanupRateLimits();
  }, 1000 * 60 * 5).unref();

  server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Unable to start server:", error);
  process.exit(1);
});
