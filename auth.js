const SESSION_STORAGE_KEY = "spiceRouteSession";

function getSession() {
  try {
    const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    return savedSession ? JSON.parse(savedSession) : null;
  } catch (error) {
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

async function restoreSession() {
  const session = getSession();

  if (!session || !session.token) {
    return null;
  }

  try {
    const response = await fetch("/api/session", {
      headers: {
        Authorization: `Bearer ${session.token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Session is no longer valid.");
    }

    const data = await response.json();
    const nextSession = {
      ...session,
      user: data.user,
      validatedAt: new Date().toISOString(),
    };

    saveSession(nextSession);
    return nextSession;
  } catch (error) {
    clearSession();
    return null;
  }
}

function getAuthHeaders(extraHeaders = {}) {
  const session = getSession();

  if (!session || !session.token) {
    return extraHeaders;
  }

  return {
    ...extraHeaders,
    Authorization: `Bearer ${session.token}`,
  };
}

async function apiRequest(url, options = {}) {
  const headers = getAuthHeaders(options.headers || {});
  const response = await fetch(url, {
    ...options,
    headers,
  });

  const isJson = String(response.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = data && data.message ? data.message : "Request failed.";
    throw new Error(message);
  }

  return data;
}

async function logoutSession() {
  try {
    await apiRequest("/api/logout", { method: "POST" });
  } catch (error) {
    // Ignore logout failures so the local session is still cleared.
  }

  clearSession();
}
