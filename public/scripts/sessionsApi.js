// public/scripts/sessionsApi.js

// Usa la misma base que en src/services/taskApi.js
const API = "http://localhost:8080/api/v1";

// ─────────────────────────────────────
// SESIONES POMODORO (para el navegador)
// ─────────────────────────────────────

/**
 * Crea una sesión y la inicia
 * @param {{ userId: string, taskId: string, focus: number, breakMin: number }} param0
 */
export async function startSession({ userId, taskId, focus, breakMin }) {
  const res = await fetch(`${API}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      task_id: taskId,
      focus_minutes: focus,
      break_minutes: breakMin,
    }),
  });
  if (!res.ok) {
    console.error("❌ Error iniciando sesión:", res.status, await res.text());
    throw new Error("Error iniciando sesión");
  }
  return res.json();
}

export async function pauseSession(id) {
  const res = await fetch(`${API}/sessions/${id}/pause`, { method: "PATCH" });
  if (!res.ok) throw new Error("Error pausando sesión");
  return res.json();
}

export async function resumeSession(id) {
  const res = await fetch(`${API}/sessions/${id}/resume`, { method: "PATCH" });
  if (!res.ok) throw new Error("Error reanudando sesión");
  return res.json();
}

export async function finishSession(id) {
  const res = await fetch(`${API}/sessions/${id}/finish`, { method: "PATCH" });
  if (!res.ok) throw new Error("Error finalizando sesión");
  return res.json();
}
