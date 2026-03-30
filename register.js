const registerForm = document.getElementById("registerForm");
const registerMessage = document.getElementById("registerMessage");
const registerButton = document.getElementById("registerButton");
const registerButtonLabel = registerButton ? registerButton.textContent : "";

function setRegisterMessage(message, type) {
  registerMessage.textContent = message;
  registerMessage.className = "order-message";

  if (type) {
    registerMessage.classList.add(`is-${type}`);
  }
}

function setFieldError(fieldId, message) {
  const field = registerForm ? registerForm.querySelector(`#${fieldId}`) : null;

  if (!field) {
    return;
  }

  let errorElement = registerForm.querySelector(`[data-error-for="${fieldId}"]`);

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
  if (!registerForm) {
    return;
  }

  registerForm.querySelectorAll(".field-error").forEach((element) => {
    element.textContent = "";
  });

  registerForm.querySelectorAll(".form-input").forEach((field) => {
    field.classList.remove("is-invalid");
    field.setAttribute("aria-invalid", "false");
  });
}

function validateRegisterPayload(payload) {
  const errors = {};

  if (!payload.name) {
    errors.registerName = "Full name is required.";
  } else if (payload.name.length < 2) {
    errors.registerName = "Full name must be at least 2 characters.";
  }

  if (!payload.email) {
    errors.registerEmail = "Email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    errors.registerEmail = "Enter a valid email address.";
  }

  if (!payload.password) {
    errors.registerPassword = "Password is required.";
  } else if (payload.password.length < 6) {
    errors.registerPassword = "Password must be at least 6 characters.";
  }

  if (!payload.confirmPassword) {
    errors.registerConfirmPassword = "Please confirm your password.";
  } else if (payload.password !== payload.confirmPassword) {
    errors.registerConfirmPassword = "Passwords do not match.";
  }

  return errors;
}

function setRegisterProcessingState(isProcessing) {
  if (!registerForm || !registerButton) {
    return;
  }

  registerForm.querySelectorAll("input, button").forEach((element) => {
    element.disabled = isProcessing;
  });

  registerButton.textContent = isProcessing ? "Creating account..." : registerButtonLabel;
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(registerForm);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim().toLowerCase(),
    password: String(formData.get("password") || "").trim(),
    confirmPassword: String(formData.get("confirmPassword") || "").trim(),
  };
  const fieldErrors = validateRegisterPayload(payload);

  clearFieldErrors();

  if (Object.keys(fieldErrors).length > 0) {
    Object.entries(fieldErrors).forEach(([fieldId, message]) => {
      setFieldError(fieldId, message);
    });

    const firstInvalidField = registerForm.querySelector(`#${Object.keys(fieldErrors)[0]}`);

    if (firstInvalidField) {
      firstInvalidField.focus();
    }

    setRegisterMessage("Please fix the highlighted fields to continue.", "error");
    return;
  }

  setRegisterProcessingState(true);
  setRegisterMessage("Creating your account...", null);

  try {
    await apiRequest("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    setRegisterMessage("Account created successfully. Redirecting to login...", "success");
    window.setTimeout(() => {
      window.location.href = `login.html?email=${encodeURIComponent(payload.email)}`;
    }, 900);
  } catch (error) {
    setRegisterMessage(error.message, "error");
  } finally {
    setRegisterProcessingState(false);
  }
});

if (registerForm) {
  registerForm.addEventListener("input", (event) => {
    const target = event.target;

    if (!(target instanceof HTMLElement) || !target.classList.contains("form-input")) {
      return;
    }

    setFieldError(target.id, "");
  });
}

async function initializeRegisterPage() {
  const session = await restoreSession();

  if (!session || !session.user) {
    return;
  }

  setRegisterMessage(
    `You are already signed in as ${session.user.name}. You can still create another user account from here if you want.`,
    "success"
  );
}

initializeRegisterPage();
