const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");
const emailInput = document.getElementById("email");
const roleInput = document.getElementById("role");
const allowedRedirectPaths = new Set(["index.html", "admin.html", "orders.html"]);
const loginButtonLabel = loginButton ? loginButton.textContent : "";

function setLoginMessage(message, type) {
  loginMessage.textContent = message;
  loginMessage.className = "order-message";

  if (type) {
    loginMessage.classList.add(`is-${type}`);
  }
}

function getRedirectPath(role) {
  return role === "admin" ? "admin.html" : "index.html";
}

function getSafeRedirectPath(pathname, role) {
  const fallbackPath = getRedirectPath(role);

  if (!pathname || !allowedRedirectPaths.has(pathname)) {
    return fallbackPath;
  }

  if (pathname === "admin.html" && role !== "admin") {
    return fallbackPath;
  }

  if (pathname === "orders.html" && role !== "user") {
    return fallbackPath;
  }

  return pathname;
}

function setFieldError(fieldId, message) {
  const field = loginForm ? loginForm.querySelector(`#${fieldId}`) : null;

  if (!field) {
    return;
  }

  let errorElement = loginForm.querySelector(`[data-error-for="${fieldId}"]`);

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
  if (!loginForm) {
    return;
  }

  loginForm.querySelectorAll(".field-error").forEach((element) => {
    element.textContent = "";
  });

  loginForm.querySelectorAll(".form-input").forEach((field) => {
    field.classList.remove("is-invalid");
    field.setAttribute("aria-invalid", "false");
  });
}

function validateLoginPayload(payload) {
  const errors = {};

  if (!payload.email) {
    errors.email = "Email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!payload.password) {
    errors.password = "Password is required.";
  }

  if (!["user", "admin"].includes(payload.role)) {
    errors.role = "Select a valid role.";
  }

  return errors;
}

function setLoginProcessingState(isProcessing) {
  if (!loginForm || !loginButton) {
    return;
  }

  loginForm.querySelectorAll("input, select, button").forEach((element) => {
    element.disabled = isProcessing;
  });

  loginButton.textContent = isProcessing ? "Logging in..." : loginButtonLabel;
}

const loginUrl = new URL(window.location.href);
const prefilledEmail = loginUrl.searchParams.get("email");
const preselectedRole = loginUrl.searchParams.get("role");
const requestedRedirect = loginUrl.searchParams.get("redirect");

if (prefilledEmail && emailInput) {
  emailInput.value = prefilledEmail;
}

if (preselectedRole && roleInput && ["user", "admin"].includes(preselectedRole)) {
  roleInput.value = preselectedRole;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const payload = {
    email: String(formData.get("email") || "").trim().toLowerCase(),
    password: String(formData.get("password") || "").trim(),
    role: String(formData.get("role") || "user"),
  };
  const fieldErrors = validateLoginPayload(payload);

  clearFieldErrors();

  if (Object.keys(fieldErrors).length > 0) {
    Object.entries(fieldErrors).forEach(([fieldId, message]) => {
      setFieldError(fieldId, message);
    });

    const firstInvalidField = loginForm.querySelector(`#${Object.keys(fieldErrors)[0]}`);

    if (firstInvalidField) {
      firstInvalidField.focus();
    }

    setLoginMessage("Please fix the highlighted fields to continue.", "error");
    return;
  }

  setLoginProcessingState(true);
  setLoginMessage("Logging you in...", null);

  try {
    const result = await apiRequest("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
        role: payload.role,
      }),
    });

    saveSession({
      token: result.token,
      user: result.user,
      loggedInAt: new Date().toISOString(),
    });

    setLoginMessage("Login successful. Redirecting...", "success");
    window.setTimeout(() => {
      window.location.href = getSafeRedirectPath(requestedRedirect, result.user.role);
    }, 700);
  } catch (error) {
    setLoginMessage(error.message, "error");
  } finally {
    setLoginProcessingState(false);
  }
});

if (loginForm) {
  loginForm.addEventListener("input", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement) || !target.classList.contains("form-input")) {
      return;
    }

    setFieldError(target.id, "");
  });
}

async function initializeLoginPage() {
  const session = await restoreSession();

  if (!session || !session.user) {
    return;
  }

  window.location.href = getSafeRedirectPath(requestedRedirect, session.user.role);
}

initializeLoginPage();
