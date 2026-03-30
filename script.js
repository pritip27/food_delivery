const cartItemsContainer = document.getElementById("cartItems");
const itemCountElement = document.getElementById("itemCount");
const totalPriceElement = document.getElementById("totalPrice");
const menuGrid = document.getElementById("menuGrid");
const checkoutForm = document.getElementById("checkoutForm");
const orderMessageElement = document.getElementById("orderMessage");
const placeOrderButton = document.getElementById("placeOrderButton");
const paymentToast = document.getElementById("paymentModal");
const paymentToastText = document.getElementById("paymentModalText");
const closePaymentToastButton = document.getElementById("closePaymentModal");
const sessionBanner = document.getElementById("sessionBanner");
const sessionText = document.getElementById("sessionText");
const logoutButton = document.getElementById("logoutButton");
const loginNavLink = document.getElementById("loginNavLink");
const ordersNavLink = document.getElementById("ordersNavLink");
const adminNavLink = document.getElementById("adminNavLink");
const menuSearchInput = document.getElementById("menuSearchInput");
const customerNameInput = document.getElementById("customerName");
const upiIdInput = document.getElementById("upiId");

const cart = [];
let menuItems = [];
let paymentToastTimerId = null;
let menuSearchDebounceId = null;
const checkoutInputElements = checkoutForm ? Array.from(checkoutForm.querySelectorAll("input, textarea, select, button")) : [];
const checkoutSubmitLabel = placeOrderButton ? placeOrderButton.textContent : "";

function formatPrice(value) {
  return `Rs. ${value}`;
}

function getCurrentSession() {
  return typeof getSession === "function" ? getSession() : null;
}

function setOrderMessage(message, type) {
  orderMessageElement.textContent = message;
  orderMessageElement.className = "order-message";

  if (type) {
    orderMessageElement.classList.add(`is-${type}`);
  }
}

function setFieldError(fieldId, message) {
  const field = checkoutForm ? checkoutForm.querySelector(`#${fieldId}`) : null;

  if (!field) {
    return;
  }

  let errorElement = checkoutForm.querySelector(`[data-error-for="${fieldId}"]`);

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
  if (!checkoutForm) {
    return;
  }

  checkoutForm.querySelectorAll(".field-error").forEach((element) => {
    element.textContent = "";
  });

  checkoutForm.querySelectorAll(".form-input").forEach((field) => {
    field.classList.remove("is-invalid");
    field.setAttribute("aria-invalid", "false");
  });
}

function setCheckoutProcessingState(isProcessing) {
  if (!checkoutForm || !placeOrderButton) {
    return;
  }

  checkoutInputElements.forEach((element) => {
    element.disabled = isProcessing;
  });

  placeOrderButton.textContent = isProcessing ? "Processing..." : checkoutSubmitLabel;
}

function showPaymentToast(order) {
  if (!paymentToast || !paymentToastText) {
    return;
  }

  if (paymentToastTimerId) {
    window.clearTimeout(paymentToastTimerId);
  }

  paymentToastText.textContent = `Payment received for order ${order.id}. Total paid: ${formatPrice(order.total)}. Current status: ${order.status}.`;
  paymentToast.hidden = false;
  paymentToast.setAttribute("aria-hidden", "false");
  paymentToastTimerId = window.setTimeout(closePaymentToast, 4000);
}

function closePaymentToast() {
  if (!paymentToast) {
    return;
  }

  if (paymentToastTimerId) {
    window.clearTimeout(paymentToastTimerId);
    paymentToastTimerId = null;
  }

  paymentToast.hidden = true;
  paymentToast.setAttribute("aria-hidden", "true");
}

function renderSessionBanner() {
  const session = getCurrentSession();

  if (!session || !session.user) {
    sessionBanner.hidden = true;
    return;
  }

  sessionBanner.hidden = false;
  const roleLabel = session.user.role === "admin" ? "Admin" : "User";
  const displayName = session.user.name || session.user.email || roleLabel;
  sessionText.textContent = `Signed in as ${displayName} (${roleLabel})`;
}

function syncNavigationForSession() {
  const session = getCurrentSession();
  const role = session && session.user ? session.user.role : "";

  if (loginNavLink) {
    if (role === "user") {
      loginNavLink.textContent = "Account";
      loginNavLink.href = "orders.html";
    } else if (role === "admin") {
      loginNavLink.textContent = "Dashboard";
      loginNavLink.href = "admin.html";
    } else {
      loginNavLink.textContent = "Login";
      loginNavLink.href = "login.html";
    }
  }

  if (ordersNavLink) {
    ordersNavLink.hidden = role === "admin";
  }

  if (adminNavLink) {
    adminNavLink.hidden = role === "user";
  }
}

function prefillCheckoutDetails() {
  const session = getCurrentSession();

  if (!session || !session.user || session.user.role !== "user") {
    return;
  }

  if (customerNameInput && !customerNameInput.value.trim()) {
    customerNameInput.value = session.user.name || "";
  }

}

function updateCheckoutAvailability() {
  const session = getCurrentSession();
  const canCheckout = cart.length > 0 && session && session.user && session.user.role === "user";
  placeOrderButton.disabled = !canCheckout;

  if (!session || !session.user) {
    setOrderMessage("Login as a user to complete payment and place orders.", "error");
    return;
  }

  if (session.user.role !== "user") {
    setOrderMessage("You are signed in as an admin. Logout and login as a user to place an order.", "error");
    return;
  }

  setOrderMessage("", null);
}

function renderMenu() {
  if (menuItems.length === 0) {
    menuGrid.innerHTML = '<p class="menu-error">No menu items available right now.</p>';
    return;
  }

  menuGrid.innerHTML = menuItems
    .map(
      (item) => `
        <article class="menu-card" data-id="${item.id}">
          <span class="menu-tag">${item.category}</span>
          <h3>${item.name}</h3>
          <p>${item.description}</p>
          <div class="menu-footer">
            <span class="price">${formatPrice(item.price)}</span>
            <button class="add-button" type="button">Add</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderCart() {
  cartItemsContainer.innerHTML = "";

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = '<p class="empty-cart">No items yet. Add your first dish.</p>';
    itemCountElement.textContent = "0";
    totalPriceElement.textContent = formatPrice(0);
    updateCheckoutAvailability();
    return;
  }

  let totalItems = 0;
  let totalPrice = 0;

  cart.forEach((item) => {
    totalItems += item.quantity;
    totalPrice += item.price * item.quantity;

    const row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML = `
      <div class="cart-item-details">
        <strong>${item.name}</strong>
        <div class="cart-item-meta">${formatPrice(item.price)} each</div>
        <div class="cart-controls" data-id="${item.id}">
          <button class="cart-control-button" type="button" data-action="decrease" aria-label="Decrease quantity for ${item.name}">-</button>
          <span class="cart-quantity">${item.quantity}</span>
          <button class="cart-control-button" type="button" data-action="increase" aria-label="Increase quantity for ${item.name}">+</button>
          <button class="cart-remove-button" type="button" data-action="remove">Remove</button>
        </div>
      </div>
      <strong>${formatPrice(item.quantity * item.price)}</strong>
    `;
    cartItemsContainer.appendChild(row);
  });

  itemCountElement.textContent = String(totalItems);
  totalPriceElement.textContent = formatPrice(totalPrice);
  updateCheckoutAvailability();
}

function addToCart(menuItem) {
  const existingItem = cart.find((item) => item.id === menuItem.id);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({
      id: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity: 1,
    });
  }

  renderCart();
}

function updateCartItem(itemId, action) {
  const existingItem = cart.find((item) => item.id === itemId);

  if (!existingItem) {
    return;
  }

  if (action === "increase") {
    existingItem.quantity += 1;
  }

  if (action === "decrease") {
    existingItem.quantity -= 1;
  }

  if (action === "remove" || existingItem.quantity <= 0) {
    const itemIndex = cart.findIndex((item) => item.id === itemId);

    if (itemIndex >= 0) {
      cart.splice(itemIndex, 1);
    }
  }

  renderCart();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D+/g, "");
}

function isValidUpiId(upiId) {
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(upiId);
}

function getOrderPayload(formData) {
  return {
    customerName: formData.get("customerName").trim(),
    customerPhone: normalizePhone(formData.get("customerPhone")),
    deliveryAddress: formData.get("deliveryAddress").trim(),
    items: cart.map((item) => ({
      id: item.id,
      quantity: item.quantity,
    })),
    payment: {
      paymentMethod: formData.get("paymentMethod"),
      upiId: String(formData.get("upiId") || "").trim().toLowerCase(),
    },
  };
}

function validateCheckoutPayload(payload) {
  const errors = {};

  if (!payload.customerName) {
    errors.customerName = "Customer name is required.";
  } else if (payload.customerName.length < 2) {
    errors.customerName = "Customer name must be at least 2 characters.";
  }

  if (!payload.customerPhone) {
    errors.customerPhone = "Phone number is required.";
  } else if (!/^\d{10}$/.test(payload.customerPhone)) {
    errors.customerPhone = "Phone number must contain exactly 10 digits.";
  }

  if (!payload.deliveryAddress) {
    errors.deliveryAddress = "Delivery address is required.";
  } else if (payload.deliveryAddress.length < 10) {
    errors.deliveryAddress = "Delivery address should be at least 10 characters.";
  }

  if (!payload.payment.upiId) {
    errors.upiId = "UPI ID is required.";
  } else if (!isValidUpiId(payload.payment.upiId)) {
    errors.upiId = "Enter a valid UPI ID like name@bank.";
  }

  return errors;
}

async function submitOrder(event) {
  event.preventDefault();

  const session = getCurrentSession();

  if (!session || !session.user || session.user.role !== "user") {
    setOrderMessage("Please login as a user before paying.", "error");
    return;
  }

  if (cart.length === 0) {
    setOrderMessage("Add at least one item before placing the order.", "error");
    return;
  }

  const formData = new FormData(checkoutForm);
  const payload = getOrderPayload(formData);
  const fieldErrors = validateCheckoutPayload(payload);
  const hasFieldErrors = Object.values(fieldErrors).some(Boolean);

  clearFieldErrors();

  if (hasFieldErrors) {
    Object.entries(fieldErrors).forEach(([fieldId, message]) => {
      setFieldError(fieldId, message);
    });

    const firstInvalidFieldId = Object.keys(fieldErrors).find((fieldId) => fieldErrors[fieldId]);

    if (firstInvalidFieldId) {
      const firstInvalidField = checkoutForm.querySelector(`#${firstInvalidFieldId}`);

      if (firstInvalidField) {
        firstInvalidField.focus();
      }
    }

    setOrderMessage("Please fix the highlighted fields to continue.", "error");
    return;
  }

  setOrderMessage("Processing payment and placing your order...", null);
  setCheckoutProcessingState(true);

  try {
    const result = await apiRequest("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    cart.length = 0;
    renderCart();
    checkoutForm.reset();
    clearFieldErrors();
    setOrderMessage(`Order placed successfully. Your order id is ${result.id}.`, "success");
    showPaymentToast(result);
  } catch (error) {
    if (error.message === "You must be logged in.") {
      await logoutSession();
      renderSessionBanner();
      updateCheckoutAvailability();
    }

    setOrderMessage(error.message, "error");
  } finally {
    setCheckoutProcessingState(false);
    updateCheckoutAvailability();
  }
}

async function loadMenu() {
  try {
    const searchParams = new URLSearchParams();
    const search = menuSearchInput ? menuSearchInput.value.trim() : "";

    if (search) {
      searchParams.set("search", search);
    }

    const requestPath = searchParams.toString() ? `/api/menu?${searchParams.toString()}` : "/api/menu";
    const response = await fetch(requestPath);

    if (!response.ok) {
      throw new Error("Menu request failed");
    }

    menuItems = await response.json();
    renderMenu();
  } catch (error) {
    menuGrid.innerHTML = '<p class="menu-error">Unable to load the menu. Please try again.</p>';
  }
}

menuGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".add-button");

  if (!button) {
    return;
  }

  const card = button.closest(".menu-card");
  const selectedItem = menuItems.find((item) => item.id === card.dataset.id);

  if (selectedItem) {
    addToCart(selectedItem);
  }
});

cartItemsContainer.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");

  if (!button) {
    return;
  }

  const controls = button.closest("[data-id]");

  if (!controls) {
    return;
  }

  updateCartItem(controls.dataset.id, button.dataset.action);
});

if (closePaymentToastButton) {
  closePaymentToastButton.addEventListener("click", closePaymentToast);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && paymentToast && !paymentToast.hidden) {
    closePaymentToast();
  }
});

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    await logoutSession();
    renderSessionBanner();
    syncNavigationForSession();
    updateCheckoutAvailability();
    setOrderMessage("You have been logged out.", "success");
  });
}

if (checkoutForm) {
  checkoutForm.addEventListener("submit", submitOrder);
}

if (upiIdInput) {
  upiIdInput.addEventListener("input", () => {
    upiIdInput.value = upiIdInput.value.replace(/\s+/g, "").toLowerCase();
  });
}

if (checkoutForm) {
  checkoutForm.addEventListener("input", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (!target.classList.contains("form-input")) {
      return;
    }

    setFieldError(target.id, "");
  });
}

if (menuSearchInput) {
  menuSearchInput.addEventListener("input", () => {
    if (menuSearchDebounceId) {
      window.clearTimeout(menuSearchDebounceId);
    }

    menuSearchDebounceId = window.setTimeout(() => {
      loadMenu();
    }, 250);
  });
}

closePaymentToast();
renderCart();
updateCheckoutAvailability();

async function initializeStorefront() {
  await restoreSession();
  renderSessionBanner();
  syncNavigationForSession();
  prefillCheckoutDetails();
  updateCheckoutAvailability();
  loadMenu();
}

initializeStorefront();
