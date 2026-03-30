const ordersList = document.getElementById("ordersList");
const adminOrderCount = document.getElementById("adminOrderCount");
const adminRevenue = document.getElementById("adminRevenue");
const adminLatestStatus = document.getElementById("adminLatestStatus");
const adminMessage = document.getElementById("adminMessage");
const refreshOrdersButton = document.getElementById("refreshOrdersButton");
const adminLogoutButton = document.getElementById("adminLogoutButton");
const menuManagerMessage = document.getElementById("menuManagerMessage");
const refreshMenuButton = document.getElementById("refreshMenuButton");
const adminOrdersSearchInput = document.getElementById("adminOrdersSearchInput");
const adminOrderStatusFilter = document.getElementById("adminOrderStatusFilter");
const menuForm = document.getElementById("menuForm");
const menuItemsList = document.getElementById("menuItemsList");

const allowedStatuses = ["received", "preparing", "out for delivery", "delivered"];
const menuSubmitButton = document.getElementById("saveMenuItemButton");
const menuSubmitButtonLabel = menuSubmitButton ? menuSubmitButton.textContent : "";
const refreshOrdersButtonLabel = refreshOrdersButton ? refreshOrdersButton.textContent : "";
const refreshMenuButtonLabel = refreshMenuButton ? refreshMenuButton.textContent : "";
const savingOrderIds = new Set();
const deletingMenuIds = new Set();
let adminOrdersSearchDebounceId = null;

function formatPrice(value) {
  return `Rs. ${value}`;
}

function setAdminMessage(message, type) {
  adminMessage.textContent = message;
  adminMessage.className = "order-message";

  if (type) {
    adminMessage.classList.add(`is-${type}`);
  }
}

function setMenuManagerMessage(message, type) {
  menuManagerMessage.textContent = message;
  menuManagerMessage.className = "order-message";

  if (type) {
    menuManagerMessage.classList.add(`is-${type}`);
  }
}

function setFieldError(fieldId, message) {
  const field = menuForm ? menuForm.querySelector(`#${fieldId}`) : null;

  if (!field) {
    return;
  }

  let errorElement = menuForm.querySelector(`[data-error-for="${fieldId}"]`);

  if (!errorElement) {
    errorElement = document.createElement("p");
    errorElement.className = "field-error";
    errorElement.setAttribute("data-error-for", fieldId);
    field.insertAdjacentElement("afterend", errorElement);
  }

  errorElement.textContent = message || "";
  field.classList.toggle("is-invalid", Boolean(message));
  field.setAttribute("aria-invalid", message ? "true" : "false");
}

function clearFieldErrors() {
  if (!menuForm) {
    return;
  }

  menuForm.querySelectorAll(".field-error").forEach((element) => {
    element.textContent = "";
  });

  menuForm.querySelectorAll(".form-input").forEach((field) => {
    field.classList.remove("is-invalid");
    field.setAttribute("aria-invalid", "false");
  });
}

function validateMenuPayload(payload) {
  const errors = {};

  if (!payload.name) {
    errors.menuItemName = "Dish name is required.";
  } else if (payload.name.length < 2) {
    errors.menuItemName = "Dish name must be at least 2 characters.";
  }

  if (!payload.category) {
    errors.menuItemCategory = "Category is required.";
  } else if (payload.category.length < 2) {
    errors.menuItemCategory = "Category must be at least 2 characters.";
  }

  if (!Number.isFinite(payload.price) || payload.price <= 0) {
    errors.menuItemPrice = "Price must be greater than 0.";
  }

  if (!payload.description) {
    errors.menuItemDescription = "Description is required.";
  } else if (payload.description.length < 10) {
    errors.menuItemDescription = "Description must be at least 10 characters.";
  }

  return errors;
}

function setMenuProcessingState(isProcessing) {
  if (!menuForm || !menuSubmitButton) {
    return;
  }

  menuForm.querySelectorAll("input, textarea, button").forEach((element) => {
    element.disabled = isProcessing;
  });

  menuSubmitButton.textContent = isProcessing ? "Adding dish..." : menuSubmitButtonLabel;
}

function setRefreshButtonState(button, isProcessing, busyLabel, defaultLabel) {
  if (!button) {
    return;
  }

  button.disabled = isProcessing;
  button.textContent = isProcessing ? busyLabel : defaultLabel;
}

function setOrderActionState(orderId, isProcessing) {
  const select = document.querySelector(`.status-select[data-order-id="${orderId}"]`);
  const button = document.querySelector(`[data-action="save-status"][data-order-id="${orderId}"]`);

  if (select) {
    select.disabled = isProcessing;
  }

  if (button) {
    button.disabled = isProcessing;
    button.textContent = isProcessing ? "Saving..." : "Save";
  }
}

function setMenuDeleteState(menuItemId, isProcessing) {
  const button = document.querySelector(`[data-action="delete-menu-item"][data-menu-id="${menuItemId}"]`);

  if (!button) {
    return;
  }

  button.disabled = isProcessing;
  button.textContent = isProcessing ? "Deleting..." : "Delete";
}

function ensureAdminSession(session = getSession()) {

  if (!session || !session.user || session.user.role !== "admin") {
    window.location.href = "login.html?role=admin&redirect=admin.html";
    return false;
  }

  return true;
}

function renderOrderStats(orders) {
  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const latestOrder = orders[orders.length - 1];
  adminOrderCount.textContent = String(orders.length);
  adminRevenue.textContent = formatPrice(totalRevenue);
  adminLatestStatus.textContent = latestOrder ? String(latestOrder.status || "received") : "No orders";
}

function getStatusOptions(currentStatus) {
  return allowedStatuses
    .map(
      (status) => `
        <option value="${status}" ${status === currentStatus ? "selected" : ""}>${status}</option>
      `
    )
    .join("");
}

function renderOrders(orders) {
  if (orders.length === 0) {
    ordersList.innerHTML = '<p class="menu-loading">No orders yet. New orders will appear here.</p>';
    renderOrderStats([]);
    return;
  }

  ordersList.innerHTML = orders
    .slice()
    .reverse()
    .map(
      (order) => `
        <article class="order-card" data-order-id="${order.id}">
          <div class="order-card-top">
            <div>
              <p class="order-id">${order.id}</p>
              <h3>${order.customerName}</h3>
            </div>
            <span class="order-status">${order.status}</span>
          </div>
          <p class="order-meta">${order.customerPhone} | ${order.deliveryAddress}</p>
          <ul class="order-items">
            ${order.items
              .map(
                (item) => `
                  <li>${item.name} x ${item.quantity} <strong>${formatPrice(item.lineTotal)}</strong></li>
                `
              )
              .join("")}
          </ul>
          <div class="order-payment-row">
            <span>Paid by ${order.payment ? String(order.payment.paymentMethod || "upi").toUpperCase() : "UPI"} via ${order.payment ? order.payment.upiId || "saved UPI" : "saved UPI"}</span>
            <strong>${formatPrice(order.total)}</strong>
          </div>
          <div class="status-editor">
            <label class="form-field" for="status-${order.id}">Update Status</label>
            <div class="status-editor-row">
              <select class="form-input status-select" id="status-${order.id}" data-order-id="${order.id}">
                ${getStatusOptions(order.status)}
              </select>
              <button class="secondary-button status-save-button" type="button" data-action="save-status" data-order-id="${order.id}">Save</button>
            </div>
          </div>
          <div class="order-card-bottom">
            <span>${new Date(order.createdAt).toLocaleString()}</span>
            <strong>${order.userEmail || "Guest order"}</strong>
          </div>
        </article>
      `
    )
    .join("");

  renderOrderStats(orders);
}

async function loadOrders() {
  setAdminMessage("Loading latest orders...", null);
  setRefreshButtonState(refreshOrdersButton, true, "Refreshing...", refreshOrdersButtonLabel);

  try {
    const searchParams = new URLSearchParams();
    const search = adminOrdersSearchInput ? adminOrdersSearchInput.value.trim() : "";
    const status = adminOrderStatusFilter ? adminOrderStatusFilter.value.trim() : "";

    if (search) {
      searchParams.set("search", search);
    }

    if (status) {
      searchParams.set("status", status);
    }

    const requestPath = searchParams.toString() ? `/api/orders?${searchParams.toString()}` : "/api/orders";
    const orders = await apiRequest(requestPath);
    renderOrders(orders);
    setAdminMessage(`Loaded ${orders.length} order${orders.length === 1 ? "" : "s"}.`, "success");
  } catch (error) {
    if (error.message === "You must be logged in.") {
      await logoutSession();
      window.location.href = "login.html";
      return;
    }

    ordersList.innerHTML = '<p class="menu-error">Could not load orders. Please try again.</p>';
    setAdminMessage(error.message, "error");
  } finally {
    setRefreshButtonState(refreshOrdersButton, false, "Refreshing...", refreshOrdersButtonLabel);
  }
}

function renderMenuItems(menuItems) {
  if (menuItems.length === 0) {
    menuItemsList.innerHTML = '<p class="menu-loading">No menu items found. Add your first dish.</p>';
    return;
  }

  menuItemsList.innerHTML = menuItems
    .map(
      (item) => `
        <article class="order-card">
          <div class="order-card-top">
            <div>
              <p class="order-id">${item.category}</p>
              <h3>${item.name}</h3>
            </div>
            <span class="order-status">${formatPrice(item.price)}</span>
          </div>
          <p class="order-meta">${item.description}</p>
          <div class="order-card-bottom">
            <span>${item.id}</span>
            <button class="secondary-button status-save-button" type="button" data-action="delete-menu-item" data-menu-id="${item.id}">Delete</button>
          </div>
        </article>
      `
    )
    .join("");
}

async function loadMenuItems() {
  setMenuManagerMessage("Loading menu items...", null);
  setRefreshButtonState(refreshMenuButton, true, "Refreshing...", refreshMenuButtonLabel);

  try {
    const response = await fetch("/api/menu");

    if (!response.ok) {
      throw new Error("Unable to load the menu.");
    }

    const menuItems = await response.json();
    renderMenuItems(menuItems);
    setMenuManagerMessage(`Loaded ${menuItems.length} menu item${menuItems.length === 1 ? "" : "s"}.`, "success");
  } catch (error) {
    menuItemsList.innerHTML = '<p class="menu-error">Could not load menu items. Please try again.</p>';
    setMenuManagerMessage(error.message, "error");
  } finally {
    setRefreshButtonState(refreshMenuButton, false, "Refreshing...", refreshMenuButtonLabel);
  }
}

async function saveOrderStatus(orderId) {
  const select = document.querySelector(`.status-select[data-order-id="${orderId}"]`);
  const statusBadge = document.querySelector(`[data-order-id="${orderId}"] .order-status`);

  if (!select || savingOrderIds.has(orderId)) {
    return;
  }

  const nextStatus = select.value;

  if (statusBadge && statusBadge.textContent.trim() === nextStatus) {
    setAdminMessage(`${orderId} is already marked as ${nextStatus}.`, "success");
    return;
  }

  savingOrderIds.add(orderId);
  setOrderActionState(orderId, true);

  try {
    await apiRequest(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: nextStatus,
      }),
    });

    if (statusBadge) {
      statusBadge.textContent = nextStatus;
    }

    setAdminMessage(`Updated ${orderId} to ${nextStatus}.`, "success");
    await loadOrders();
  } catch (error) {
    setAdminMessage(error.message, "error");
  } finally {
    savingOrderIds.delete(orderId);
    setOrderActionState(orderId, false);
  }
}

async function createMenuItem(event) {
  event.preventDefault();

  const formData = new FormData(menuForm);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    category: String(formData.get("category") || "").trim(),
    price: Number(formData.get("price") || 0),
    description: String(formData.get("description") || "").trim(),
  };
  const fieldErrors = validateMenuPayload(payload);

  clearFieldErrors();

  if (Object.keys(fieldErrors).length > 0) {
    Object.entries(fieldErrors).forEach(([fieldId, message]) => {
      setFieldError(fieldId, message);
    });

    const firstInvalidField = menuForm.querySelector(`#${Object.keys(fieldErrors)[0]}`);

    if (firstInvalidField) {
      firstInvalidField.focus();
    }

    setMenuManagerMessage("Please fix the highlighted fields to continue.", "error");
    return;
  }

  setMenuProcessingState(true);

  try {
    const menuItem = await apiRequest("/api/menu", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    menuForm.reset();
    clearFieldErrors();
    setMenuManagerMessage(`Added ${menuItem.name} to the menu.`, "success");
    await loadMenuItems();
  } catch (error) {
    setMenuManagerMessage(error.message, "error");
  } finally {
    setMenuProcessingState(false);
  }
}

async function deleteMenuItem(menuItemId) {
  if (deletingMenuIds.has(menuItemId)) {
    return;
  }

  deletingMenuIds.add(menuItemId);
  setMenuDeleteState(menuItemId, true);

  try {
    const removedItem = await apiRequest(`/api/menu/${menuItemId}`, {
      method: "DELETE",
    });

    setMenuManagerMessage(`Removed ${removedItem.name} from the menu.`, "success");
    await loadMenuItems();
  } catch (error) {
    setMenuManagerMessage(error.message, "error");
  } finally {
    deletingMenuIds.delete(menuItemId);
    setMenuDeleteState(menuItemId, false);
  }
}

refreshOrdersButton.addEventListener("click", loadOrders);
refreshMenuButton.addEventListener("click", loadMenuItems);
menuForm.addEventListener("submit", createMenuItem);

if (adminOrdersSearchInput) {
  adminOrdersSearchInput.addEventListener("input", () => {
    if (adminOrdersSearchDebounceId) {
      window.clearTimeout(adminOrdersSearchDebounceId);
    }

    adminOrdersSearchDebounceId = window.setTimeout(() => {
      loadOrders();
    }, 250);
  });
}

if (adminOrderStatusFilter) {
  adminOrderStatusFilter.addEventListener("change", loadOrders);
}

if (menuForm) {
  menuForm.addEventListener("input", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement) || !target.classList.contains("form-input")) {
      return;
    }

    setFieldError(target.id, "");
  });
}

ordersList.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="save-status"]');

  if (!button) {
    return;
  }

  saveOrderStatus(button.dataset.orderId);
});

menuItemsList.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="delete-menu-item"]');

  if (!button) {
    return;
  }

  deleteMenuItem(button.dataset.menuId);
});

adminLogoutButton.addEventListener("click", async () => {
  await logoutSession();
  window.location.href = "login.html";
});

async function initializeAdminDashboard() {
  const session = await restoreSession();

  if (!ensureAdminSession(session)) {
    return;
  }

  loadOrders();
  loadMenuItems();
}

initializeAdminDashboard();
