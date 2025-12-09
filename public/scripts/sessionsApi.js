// public/scripts/sessionsApi.js
const API = "http://localhost:8080/api/v1";

/**
 * Crea una sesión de Pomodoro y devuelve TODO el objeto sesión.
 * El backend es el que decide cómo interpretar focus_minutes/break_minutes.
 */
export async function startSession({ userId, taskId, focus, breakMin } = {}) {
  const payload = {
    user_id: userId,
    task_id: taskId,
    focus_minutes: typeof focus === "number" ? focus : 25,
    break_minutes: typeof breakMin === "number" ? breakMin : 5,
  };

  const res = await fetch(`${API}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("❌ Error iniciando sesión:", res.status, text);
    throw new Error(`Error iniciando sesión: ${res.status}`);
  }

  return res.json();
}

export async function pauseSession(sessionId) {
  const res = await fetch(`${API}/sessions/${sessionId}/pause`, {
    method: "PATCH",
  });
  if (!res.ok) throw new Error("Error pausando sesión");
  return res.json();
}

export async function resumeSession(sessionId) {
  const res = await fetch(`${API}/sessions/${sessionId}/resume`, {
    method: "PATCH",
  });
  if (!res.ok) throw new Error("Error reanudando sesión");
  return res.json();
}

export async function finishSession(sessionId) {
  const res = await fetch(`${API}/sessions/${sessionId}/finish`, {
    method: "PATCH",
  });
  if (!res.ok) throw new Error("Error finalizando sesión");
  return res.json(); // { session, total_pomodoros, index_in_cycle, ... }
}
