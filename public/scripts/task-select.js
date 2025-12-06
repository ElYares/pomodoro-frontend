// public/scripts/task-select.js
import { startSession } from "./sessionsApi.js";

const DEFAULT_FOCUS_MINUTES = 25;
const DEFAULT_BREAK_MINUTES = 5;

let currentSession = null;
let currentTaskId = null;

export function getCurrentSession() {
  return currentSession;
}

export function getCurrentTaskId() {
  return currentTaskId;
}

function setupTaskClickHandlers() {
  const taskElements = document.querySelectorAll(".task-list .task");
  console.log("🔎 [task-select] .task-list .task encontrados:", taskElements.length);

  if (!taskElements.length) {
    console.warn("⚠ No se encontraron tareas en el DOM");
  }

  taskElements.forEach((el) => {
    el.addEventListener("click", async () => {
      const taskId = el.dataset.taskId || el.dataset.id;
      const userId = el.dataset.userId || "123";

      console.log("🖱 Click en tarea:", { taskId, userId });

      if (!taskId) {
        console.error("❌ Task sin data-task-id");
        return;
      }

      // Visual: marcar seleccionado
      document
        .querySelectorAll(".task-list .task")
        .forEach((t) => t.classList.remove("task-selected"));
      el.classList.add("task-selected");

      try {
        const session = await startSession({
          userId,
          taskId,
          focus: DEFAULT_FOCUS_MINUTES,
          breakMin: DEFAULT_BREAK_MINUTES,
        });

        currentSession = session;
        currentTaskId = taskId;

        console.log("✅ Sesión iniciada:", session);

        // Notificar a otros scripts (ej. coffee.js)
        const event = new CustomEvent("pomodoro:session-started", {
          detail: { session },
        });
        window.dispatchEvent(event);
      } catch (err) {
        console.error("❌ Error al iniciar sesión:", err);
        alert("No se pudo iniciar la sesión Pomodoro 😢");
      }
    });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 [task-select] DOMContentLoaded");
  setupTaskClickHandlers();
});
