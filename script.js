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
const categoryFilters = document.getElementById("categoryFilters");
const customerNameInput = document.getElementById("customerName");
const upiIdInput = document.getElementById("upiId");
const heroCardLabel = document.getElementById("heroCardLabel");
const heroCardTitle = document.getElementById("heroCardTitle");
const heroCardText = document.getElementById("heroCardText");
const heroCardPrice = document.getElementById("heroCardPrice");
const heroCardMeta = document.getElementById("heroCardMeta");
const heroCardImageWrap = document.getElementById("heroCardImageWrap");
const heroCardImage = document.getElementById("heroCardImage");
const featuredHeading = document.getElementById("featuredHeading");
const featuredGrid = document.getElementById("featuredGrid");

const cart = [];
let menuItems = [];
let paymentToastTimerId = null;
let menuSearchDebounceId = null;
let selectedCategory = "";
const checkoutInputElements = checkoutForm ? Array.from(checkoutForm.querySelectorAll("input, textarea, select, button")) : [];
const checkoutSubmitLabel = placeOrderButton ? placeOrderButton.textContent : "";
const categoryDisplayOrder = ["Chaat", "Snacks", "Burgers", "Wraps", "Indian Main Course", "Beverages"];
const featuredHeroIds = ["chicken-biryani", "mutton-biryani", "chicken-shawarma", "chicken-burger"];
const featuredMenuIds = ["chicken-biryani", "chicken-shawarma", "blue-mojito", "chicken-burger", "loaded-french-fries"];
const CART_STORAGE_KEY = "spiceRouteCart";
const MENU_FILTERS_STORAGE_KEY = "spiceRouteMenuFilters";

function formatPrice(value) {
  return `Rs. ${value}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getMenuItemImage(item) {
  return item && item.image ? item.image : getFallbackImageForCategory(item ? item.category : "");
}

function getFallbackImageForCategory(category) {
  const palette = {
    Chaat: { start: "#fff4df", end: "#ffd4c0", accent: "#c64035" },
    Snacks: { start: "#fff6de", end: "#ffd4b5", accent: "#d9781f" },
    Burgers: { start: "#fff6e2", end: "#ffd9b7", accent: "#b35a27" },
    Wraps: { start: "#fff7e6", end: "#ffd8c0", accent: "#a86a2f" },
    "Indian Main Course": { start: "#fff1dd", end: "#ffcfae", accent: "#b85a24" },
    Beverages: { start: "#eefcff", end: "#d7f2df", accent: "#2e8b57" },
  };
  const theme = palette[category] || palette.Snacks;
  const safeCategory = escapeHtml(category || "Menu");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420" role="img" aria-label="${safeCategory}">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${theme.start}"/>
          <stop offset="100%" stop-color="${theme.end}"/>
        </linearGradient>
      </defs>
      <rect width="640" height="420" rx="36" fill="url(#bg)"/>
      <circle cx="110" cy="86" r="58" fill="#ffffff" opacity="0.4"/>
      <circle cx="528" cy="84" r="70" fill="#ffffff" opacity="0.28"/>
      <rect x="160" y="108" width="320" height="204" rx="28" fill="#ffffff" opacity="0.6"/>
      <text x="320" y="186" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="${theme.accent}">Spice Route</text>
      <text x="320" y="234" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="800" fill="#1f352b">${safeCategory}</text>
      <text x="320" y="278" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="600" fill="#4d6257">Freshly prepared</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function readLocalStorage(key, fallbackValue) {
  try {
    const rawValue = localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallbackValue;
  } catch (error) {
    return fallbackValue;
  }
}

function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // Ignore storage failures so storefront actions still work.
  }
}

function persistCart() {
  writeLocalStorage(CART_STORAGE_KEY, cart);
}

function persistMenuFilters() {
  writeLocalStorage(MENU_FILTERS_STORAGE_KEY, {
    search: menuSearchInput ? menuSearchInput.value.trim() : "",
    category: selectedCategory,
  });
}

function restoreMenuFilters() {
  const savedFilters = readLocalStorage(MENU_FILTERS_STORAGE_KEY, {});

  if (menuSearchInput && typeof savedFilters.search === "string") {
    menuSearchInput.value = savedFilters.search;
  }

  if (typeof savedFilters.category === "string") {
    selectedCategory = savedFilters.category;
  }
}

function restoreCart() {
  const savedCart = readLocalStorage(CART_STORAGE_KEY, []);

  if (!Array.isArray(savedCart)) {
    return;
  }

  cart.length = 0;

  savedCart.forEach((item) => {
    const quantity = Number(item.quantity);
    const price = Number(item.price);

    if (!item || typeof item.id !== "string" || typeof item.name !== "string") {
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      return;
    }

    cart.push({
      id: item.id,
      name: item.name,
      price,
      quantity,
    });
  });
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

function groupMenuItemsByCategory(items) {
  const groupedItems = items.reduce((groups, item) => {
    const category = item.category || "Menu";

    if (!groups.has(category)) {
      groups.set(category, []);
    }

    groups.get(category).push(item);
    return groups;
  }, new Map());

  return Array.from(groupedItems.entries()).sort(([leftCategory], [rightCategory]) => {
    const leftIndex = categoryDisplayOrder.indexOf(leftCategory);
    const rightIndex = categoryDisplayOrder.indexOf(rightCategory);
    const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const normalizedRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

    if (normalizedLeftIndex !== normalizedRightIndex) {
      return normalizedLeftIndex - normalizedRightIndex;
    }

    return leftCategory.localeCompare(rightCategory);
  });
}

function getSortedCategories(items) {
  return groupMenuItemsByCategory(items).map(([category]) => category);
}

function renderCategoryFilters(items) {
  if (!categoryFilters) {
    return;
  }

  const categories = getSortedCategories(items);

  if (!selectedCategory || !categories.includes(selectedCategory)) {
    selectedCategory = "";
  }

  categoryFilters.innerHTML = [
    `<button class="category-chip ${selectedCategory === "" ? "is-active" : ""}" type="button" data-category="">All</button>`,
    ...categories.map(
      (category) =>
        `<button class="category-chip ${selectedCategory === category ? "is-active" : ""}" type="button" data-category="${category}">${category}</button>`
    ),
  ].join("");

  persistMenuFilters();
}

function getVisibleMenuItems() {
  if (!selectedCategory) {
    return menuItems;
  }

  return menuItems.filter((item) => item.category === selectedCategory);
}

function getHeroMenuItem(items) {
  if (items.length === 0) {
    return null;
  }

  const featuredItem = featuredHeroIds
    .map((id) => items.find((item) => item.id === id))
    .find(Boolean);

  if (featuredItem) {
    return featuredItem;
  }

  return [...items].sort((left, right) => Number(right.price || 0) - Number(left.price || 0))[0];
}

function renderHeroCard(items) {
  if (!heroCardTitle || !heroCardText || !heroCardPrice || !heroCardMeta || !heroCardLabel) {
    return;
  }

  const heroItem = getHeroMenuItem(items);

  if (!heroItem) {
    heroCardLabel.textContent = "Today's special";
    heroCardTitle.textContent = "Menu coming soon";
    heroCardText.textContent = "We are preparing fresh dishes for the next service window.";
    heroCardPrice.textContent = "Rs. --";
    heroCardMeta.textContent = "Check back shortly";
    if (heroCardImageWrap && heroCardImage) {
      heroCardImageWrap.hidden = true;
      heroCardImage.removeAttribute("src");
      heroCardImage.alt = "";
    }
    return;
  }

  if (heroCardImageWrap && heroCardImage) {
    const heroImage = getMenuItemImage(heroItem);

    if (heroImage) {
      heroCardImageWrap.hidden = false;
      heroCardImage.src = heroImage;
      heroCardImage.dataset.fallbackImage = getFallbackImageForCategory(heroItem.category);
      heroCardImage.alt = heroItem.name;
    } else {
      heroCardImageWrap.hidden = true;
      heroCardImage.removeAttribute("src");
      heroCardImage.removeAttribute("data-fallback-image");
      heroCardImage.alt = "";
    }
  }

  heroCardLabel.textContent = `${heroItem.category} spotlight`;
  heroCardTitle.textContent = heroItem.name;
  heroCardText.textContent = heroItem.description;
  heroCardPrice.textContent = formatPrice(heroItem.price);
  heroCardMeta.textContent = `${heroItem.category} favorite`;
}

function getFeaturedMenuItems(items) {
  const prioritizedItems = featuredMenuIds
    .map((id) => items.find((item) => item.id === id))
    .filter(Boolean);

  const uniqueFeaturedItems = prioritizedItems.filter(
    (item, index, list) => list.findIndex((entry) => entry.id === item.id) === index
  );

  if (uniqueFeaturedItems.length >= 3) {
    return uniqueFeaturedItems.slice(0, 3);
  }

  const fallbackItems = [...items]
    .sort((left, right) => Number(right.price || 0) - Number(left.price || 0))
    .filter((item) => !uniqueFeaturedItems.some((entry) => entry.id === item.id));

  return [...uniqueFeaturedItems, ...fallbackItems].slice(0, 3);
}

function renderFeaturedItems(items) {
  if (!featuredGrid || !featuredHeading) {
    return;
  }

  const featuredItems = getFeaturedMenuItems(items);

  if (featuredItems.length === 0) {
    featuredHeading.textContent = "Fresh specials are on the way.";
    featuredGrid.innerHTML = `
      <article class="feature-card">
        <h3>Menu refresh in progress</h3>
        <p>We are preparing a new featured lineup for the next ordering window.</p>
      </article>
    `;
    return;
  }

  const featuredCategories = Array.from(new Set(featuredItems.map((item) => item.category)));
  featuredHeading.textContent =
    featuredCategories.length > 1
      ? `Top picks across ${featuredCategories.join(", ")}.`
      : `Top picks from ${featuredCategories[0]}.`;

  featuredGrid.innerHTML = featuredItems
    .map(
      (item) => `
        <article class="feature-card feature-menu-card" data-featured-id="${item.id}">
          <div class="feature-menu-image-wrap">
            <img class="feature-menu-image" src="${getMenuItemImage(item)}" data-fallback-image="${escapeHtml(getFallbackImageForCategory(item.category))}" alt="${escapeHtml(item.name)}">
          </div>
          <span class="menu-tag">${item.category}</span>
          <h3>${item.name}</h3>
          <p>${item.description}</p>
          <div class="feature-menu-footer">
            <span class="price">${formatPrice(item.price)}</span>
            <button class="add-button" type="button" data-action="add-featured-item" data-featured-id="${item.id}">Add</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderMenu() {
  const visibleMenuItems = getVisibleMenuItems();

  if (visibleMenuItems.length === 0) {
    menuGrid.innerHTML = '<p class="menu-error">No menu items available right now.</p>';
    return;
  }

  menuGrid.innerHTML = groupMenuItemsByCategory(visibleMenuItems)
    .map(
      ([category, items]) => `
        <section class="menu-category-section" aria-label="${category}">
          <div class="menu-category-header">
            <div>
              <p class="menu-category-kicker">Menu Section</p>
              <h3>${category}</h3>
            </div>
            <span class="menu-category-count">${items.length} item${items.length === 1 ? "" : "s"}</span>
          </div>
          <div class="menu-category-grid">
            ${items
              .map(
                (item) => `
                  <article class="menu-card" data-id="${item.id}">
                    <div class="menu-card-image-wrap">
                      <img class="menu-card-image" src="${getMenuItemImage(item)}" data-fallback-image="${escapeHtml(getFallbackImageForCategory(item.category))}" alt="${escapeHtml(item.name)}">
                    </div>
                    <span class="menu-tag">${item.category}</span>
                    <h4>${item.name}</h4>
                    <p>${item.description}</p>
                    <div class="menu-footer">
                      <span class="price">${formatPrice(item.price)}</span>
                      <button class="add-button" type="button">Add</button>
                    </div>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
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
  persistCart();
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
    persistCart();
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
    const availableItemIds = new Set(menuItems.map((item) => item.id));
    const nextCart = cart.filter((item) => availableItemIds.has(item.id));

    if (nextCart.length !== cart.length) {
      cart.length = 0;
      cart.push(...nextCart);
      renderCart();
    }

    renderHeroCard(menuItems);
    renderFeaturedItems(menuItems);
    renderCategoryFilters(menuItems);
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

if (featuredGrid) {
  featuredGrid.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="add-featured-item"]');

    if (!button) {
      return;
    }

    const selectedItem = menuItems.find((item) => item.id === button.dataset.featuredId);

    if (selectedItem) {
      addToCart(selectedItem);
    }
  });
}

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

document.addEventListener(
  "error",
  (event) => {
    const target = event.target;

    if (!(target instanceof HTMLImageElement)) {
      return;
    }

    const fallbackImage = target.dataset.fallbackImage;

    if (!fallbackImage || target.src.endsWith(fallbackImage)) {
      return;
    }

    target.src = fallbackImage;
  },
  true
);

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
    selectedCategory = "";
    persistMenuFilters();

    if (menuSearchDebounceId) {
      window.clearTimeout(menuSearchDebounceId);
    }

    menuSearchDebounceId = window.setTimeout(() => {
      loadMenu();
    }, 250);
  });
}

if (categoryFilters) {
  categoryFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");

    if (!button) {
      return;
    }

    selectedCategory = button.dataset.category || "";
    renderCategoryFilters(menuItems);
    renderMenu();
  });
}

closePaymentToast();
restoreCart();
restoreMenuFilters();
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
