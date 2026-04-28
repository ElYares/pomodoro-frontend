function resolveApiBase() {
  const desktopApiBase = window.pomodoroDesktop?.apiBase;
  if (typeof desktopApiBase === "string" && desktopApiBase.trim()) {
    return desktopApiBase.replace(/\/$/, "");
  }

  return "http://localhost:8080/api/v1";
}

const API_BASE = resolveApiBase();
const TOKEN_KEY = "pomodoro.auth.token";
const USER_KEY = "pomodoro.auth.user";

export function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  const raw = window.localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setAuthSession({ token, user }) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

async function request(path, options = {}) {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "string" ? payload : payload.error || "request failed";
    throw new Error(message);
  }

  return payload;
}

export const authApi = {
  register: (data) =>
    request("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  login: (data) =>
    request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  me: () => request("/auth/me"),
  logout: () =>
    request("/auth/logout", {
      method: "POST",
    }),
};

export const tasksApi = {
  getByUser: (userId) => request(`/tasks/user/${userId}`),
  remove: (taskId) =>
    request(`/tasks/${taskId}`, {
      method: "DELETE",
    }),
  complete: (taskId) =>
    request(`/tasks/${taskId}/complete`, {
      method: "PATCH",
    }),
  importMarkdown: (formData) =>
    request("/tasks/import-markdown", {
      method: "POST",
      body: formData,
    }),
};

export const sessionsApi = {
  getActive: (userId) => request(`/sessions/active/${userId}`),
  start: (taskId) =>
    request("/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id: taskId }),
    }),
  pause: (sessionId, remainingSeconds) =>
    request(`/sessions/${sessionId}/pause`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remaining_seconds: remainingSeconds }),
    }),
  resume: (sessionId) =>
    request(`/sessions/${sessionId}/resume`, {
      method: "PATCH",
    }),
  finish: (sessionId) =>
    request(`/sessions/${sessionId}/finish`, {
      method: "PATCH",
    }),
};
