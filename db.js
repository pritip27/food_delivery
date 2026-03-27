const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const databaseName = process.env.MONGODB_DB_NAME || "spice_route";

async function readJsonArray(filePath, fallback = []) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback.map((entry) => ({ ...entry }));
    }

    const fileContent = fs.readFileSync(filePath, "utf8");

    if (!fileContent.trim()) {
      return fallback.map((entry) => ({ ...entry }));
    }

    const parsed = JSON.parse(fileContent);
    return Array.isArray(parsed) ? parsed : fallback.map((entry) => ({ ...entry }));
  } catch (error) {
    return fallback.map((entry) => ({ ...entry }));
  }
}

function cloneMany(items) {
  return items.map((item) => ({ ...item }));
}

async function seedCollectionIfEmpty(collection, filePath, fallbackItems) {
  const existingCount = await collection.countDocuments();

  if (existingCount > 0) {
    return;
  }

  const items = await readJsonArray(filePath, fallbackItems);

  if (items.length === 0) {
    return;
  }

  await collection.insertMany(cloneMany(items), { ordered: true });
}

async function initializeDatabase({ defaultUsers, defaultMenuItems }) {
  const client = new MongoClient(mongoUri);
  await client.connect();

  const db = client.db(databaseName);
  const users = db.collection("users");
  const menuItems = db.collection("menuItems");
  const orders = db.collection("orders");

  await users.createIndex({ email: 1 }, { unique: true });
  await users.createIndex({ id: 1 }, { unique: true });
  await menuItems.createIndex({ id: 1 }, { unique: true });
  await orders.createIndex({ id: 1 }, { unique: true });
  await orders.createIndex({ userEmail: 1, createdAt: -1 });

  await seedCollectionIfEmpty(users, path.join(__dirname, "users.json"), defaultUsers);
  await seedCollectionIfEmpty(menuItems, path.join(__dirname, "menu.json"), defaultMenuItems);
  await seedCollectionIfEmpty(orders, path.join(__dirname, "orders.json"), []);

  function withoutMongoId(document) {
    if (!document) {
      return null;
    }

    const { _id, ...rest } = document;
    return rest;
  }

  async function listIds(collection) {
    const documents = await collection.find({}, { projection: { id: 1, _id: 0 } }).toArray();
    return documents.map((document) => String(document.id || ""));
  }

  async function getNextPrefixedId(collection, prefix) {
    const ids = await listIds(collection);
    const highestNumber = ids.reduce((highest, id) => {
      const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id);

      if (!match) {
        return highest;
      }

      return Math.max(highest, Number(match[1]));
    }, 0);

    return `${prefix}-${highestNumber + 1}`;
  }

  async function createMenuItemId(name) {
    const base =
      String(name || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "menu-item";

    const ids = new Set(await listIds(menuItems));
    let nextId = base;
    let counter = 2;

    while (ids.has(nextId)) {
      nextId = `${base}-${counter}`;
      counter += 1;
    }

    return nextId;
  }

  return {
    client,
    db,
    async getUserByEmailAndRole(email, role) {
      return withoutMongoId(await users.findOne({ email, role }));
    },
    async getUserByEmail(email) {
      return withoutMongoId(await users.findOne({ email }));
    },
    async insertUser(user) {
      await users.insertOne({ ...user });
      return user;
    },
    async replaceUser(user) {
      await users.replaceOne({ id: user.id }, { ...user }, { upsert: true });
      return user;
    },
    async getAllMenuItems() {
      return (await menuItems.find({}).sort({ name: 1 }).toArray()).map(withoutMongoId);
    },
    async getMenuItemsByIds(ids) {
      return (await menuItems.find({ id: { $in: ids } }).toArray()).map(withoutMongoId);
    },
    async insertMenuItem(menuItem) {
      await menuItems.insertOne({ ...menuItem });
      return menuItem;
    },
    async deleteMenuItem(menuItemId) {
      const deleted = await menuItems.findOneAndDelete({ id: menuItemId });
      return withoutMongoId(deleted);
    },
    async getVisibleOrdersForUser(user) {
      const query = user.role === "admin" ? {} : { userEmail: user.email };
      return (await orders.find(query).sort({ createdAt: 1 }).toArray()).map(withoutMongoId);
    },
    async getNextOrderId() {
      return getNextPrefixedId(orders, "ORD");
    },
    async getNextUserId() {
      return getNextPrefixedId(users, "user");
    },
    async getNextMenuItemId(name) {
      return createMenuItemId(name);
    },
    async insertOrder(order) {
      await orders.insertOne({ ...order });
      return order;
    },
    async updateOrderStatus(orderId, status) {
      const updated = await orders.findOneAndUpdate(
        { id: orderId },
        {
          $set: {
            status,
            updatedAt: new Date().toISOString(),
          },
        },
        { returnDocument: "after" }
      );

      return withoutMongoId(updated);
    },
  };
}

module.exports = {
  initializeDatabase,
};
