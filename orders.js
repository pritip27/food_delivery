const userOrdersList = document.getElementById("userOrdersList");
const userOrderCount = document.getElementById("userOrderCount");
const userTotalSpent = document.getElementById("userTotalSpent");
const userLatestStatus = document.getElementById("userLatestStatus");
const userOrdersMessage = document.getElementById("userOrdersMessage");
const refreshUserOrdersButton = document.getElementById("refreshUserOrdersButton");
const ordersLogoutButton = document.getElementById("ordersLogoutButton");
const userOrdersSearchInput = document.getElementById("userOrdersSearchInput");
const refreshUserOrdersButtonLabel = refreshUserOrdersButton ? refreshUserOrdersButton.textContent : "";
let userOrdersSearchDebounceId = null;

function formatPrice(value) {
  return `Rs. ${value}`;
}

function setUserOrdersMessage(message, type) {
  userOrdersMessage.textContent = message;
  userOrdersMessage.className = "order-message";

  if (type) {
    userOrdersMessage.classList.add(`is-${type}`);
  }
}

function setRefreshButtonState(isProcessing) {
  if (!refreshUserOrdersButton) {
    return;
  }

  refreshUserOrdersButton.disabled = isProcessing;
  refreshUserOrdersButton.textContent = isProcessing ? "Refreshing..." : refreshUserOrdersButtonLabel;
}

function ensureUserSession(session = getSession()) {

  if (!session || !session.user || session.user.role !== "user") {
    window.location.href = "login.html?role=user&redirect=orders.html";
    return false;
  }

  return true;
}

function renderOrderStats(orders) {
  const totalSpent = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const latestOrder = orders[orders.length - 1];
  userOrderCount.textContent = String(orders.length);
  userTotalSpent.textContent = formatPrice(totalSpent);
  userLatestStatus.textContent = latestOrder ? String(latestOrder.status || "received") : "No orders";
}

function renderOrders(orders) {
  if (orders.length === 0) {
    userOrdersList.innerHTML = '<p class="menu-loading">No orders yet. Place your first order from the storefront.</p>';
    renderOrderStats([]);
    return;
  }

  userOrdersList.innerHTML = orders
    .slice()
    .reverse()
    .map(
      (order) => `
        <article class="order-card">
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
            <span>Paid by ${order.payment ? order.payment.paymentMethod : "card"} ending ${order.payment ? order.payment.cardLast4 : "----"}</span>
            <strong>${formatPrice(order.total)}</strong>
          </div>
          <div class="order-card-bottom">
            <span>${new Date(order.createdAt).toLocaleString()}</span>
            <strong>${order.payment ? order.payment.paymentStatus : "paid"}</strong>
          </div>
        </article>
      `
    )
    .join("");

  renderOrderStats(orders);
}

async function loadOrders() {
  setUserOrdersMessage("Loading your orders...", null);
  setRefreshButtonState(true);

  try {
    const searchParams = new URLSearchParams();
    const search = userOrdersSearchInput ? userOrdersSearchInput.value.trim() : "";

    if (search) {
      searchParams.set("search", search);
    }

    const requestPath = searchParams.toString() ? `/api/orders?${searchParams.toString()}` : "/api/orders";
    const orders = await apiRequest(requestPath);
    renderOrders(orders);
    setUserOrdersMessage(`Loaded ${orders.length} order${orders.length === 1 ? "" : "s"}.`, "success");
  } catch (error) {
    if (error.message === "You must be logged in.") {
      await logoutSession();
      window.location.href = "login.html?role=user&redirect=orders.html";
      return;
    }

    userOrdersList.innerHTML = '<p class="menu-error">Could not load your orders. Please try again.</p>';
    setUserOrdersMessage(error.message, "error");
  } finally {
    setRefreshButtonState(false);
  }
}

refreshUserOrdersButton.addEventListener("click", loadOrders);

if (userOrdersSearchInput) {
  userOrdersSearchInput.addEventListener("input", () => {
    if (userOrdersSearchDebounceId) {
      window.clearTimeout(userOrdersSearchDebounceId);
    }

    userOrdersSearchDebounceId = window.setTimeout(() => {
      loadOrders();
    }, 250);
  });
}

ordersLogoutButton.addEventListener("click", async () => {
  await logoutSession();
  window.location.href = "login.html?role=user";
});

async function initializeOrdersPage() {
  const session = await restoreSession();

  if (!ensureUserSession(session)) {
    return;
  }

  loadOrders();
}

initializeOrdersPage();
