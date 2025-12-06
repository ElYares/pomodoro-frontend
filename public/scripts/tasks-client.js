// public/scripts/tasks-client.js
import {
  startSession,
  pauseSession,
  resumeSession,   // 👈 AHORA TAMBIÉN IMPORTAMOS ESTO
  finishSession,
} from "./sessionsApi.js";

const API_BASE = "http://localhost:8080/api/v1";

let allTasks = [];        // Memoria local de tareas
let currentSession = null;
let currentTaskId = null;
let currentUserId = null;

// Mapeo visual opcional
const statusLabels = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En Curso 🔥",
  PAUSED: "Pausada ⏸",
  COMPLETED: "Completada ✅",
};

// ─────────────────────────────────────
// API: obtener tareas
// ─────────────────────────────────────
async function fetchTasksByUser(userId) {
  try {
    const res = await fetch(`${API_BASE}/tasks/user/${userId}`);
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("❌ Error obteniendo tareas:", e);
    return [];
  }
}

// ─────────────────────────────────────
// Render de tarjetas
// ─────────────────────────────────────
function renderTasks(root, tasks) {
  allTasks = tasks;

  const counter = document.getElementById("task-counter");
  if (counter) counter.innerText = tasks.length;

  if (!tasks.length) {
    root.innerHTML = `
      <div style="text-align:center; padding:20px; color:#555;">
        No hay tareas.
      </div>`;
    return;
  }

  const html = tasks
    .map((task) => {
      const rawStatus = task.status || "PENDING";
      const statusCode = rawStatus.toLowerCase(); // "IN_PROGRESS" -> "in_progress"
      const statusText =
        statusLabels[rawStatus] || statusLabels.PENDING || rawStatus;
      const project = task.project_id || "General";

      return `
        <div class="task-card status-${statusCode}" data-task-id="${task.id}">
          
          <div class="card-header">
            <span class="project-badge">${project}</span>
          </div>

          <h3 class="task-title">${task.title}</h3>
          
          <div class="card-footer">
            <div class="stat-item" title="Pomodoros">
              <span class="stat-icon">🍅</span> 
              <span>${task.pomodoros_completed || 0}</span>
            </div>
            <div class="stat-item" title="Tiempo">
              <span class="stat-icon">⏱</span> 
              <span>${task.total_focus_minutes || 0} min</span>
            </div>
            
            <div class="stat-item status-text" style="margin-left:auto;">
              ${statusText}
            </div>
          </div>

        </div>
      `;
    })
    .join("");

  root.innerHTML = html;
}

// ─────────────────────────────────────
// Inicialización: carga tareas + click
// ─────────────────────────────────────
window.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 [tasks-client] DOMContentLoaded");

  const root = document.getElementById("tasks-root");
  if (!root) {
    console.error("❌ No se encontró #tasks-root");
    return;
  }

  const userId = root.dataset.userId || "123";
  currentUserId = userId;
  console.log("👤 Usuario actual:", userId);

  const tasks = await fetchTasksByUser(userId);
  console.log("✅ Tareas cargadas:", tasks.length);
  renderTasks(root, tasks);

  // ─────────────────────────────────
  // CLICK EN TARJETAS
  // ─────────────────────────────────
  root.addEventListener("click", async (event) => {
    const card = event.target.closest(".task-card");
    if (!card) return;

    // Visual: marcar activa
    document
      .querySelectorAll(".task-card")
      .forEach((c) => c.classList.remove("active"));
    card.classList.add("active");

    const id = card.dataset.taskId;
    const taskData = allTasks.find((t) => t.id === id);
    if (!taskData) {
      console.error("❌ No se encontró la tarea en allTasks para id:", id);
      return;
    }

    // Debug de la tarea seleccionada
    console.clear();
    console.log(
      "%c Tarea Seleccionada: ",
      "background: #222; color: #bada55; padding: 4px; border-radius: 4px;"
    );
    console.log(taskData);

    try {
      // 1️⃣ Iniciar sesión real en backend
      const session = await startSession({
        userId: taskData.user_id || userId,
        taskId: taskData.id,
        focus: 25, // minutos focus por defecto
        breakMin: 5, // minutos descanso por defecto
      });

      currentSession = session;
      currentTaskId = taskData.id;

      console.log("✅ Sesión iniciada en backend:", session);

      // 2️⃣ Notificar a coffee.js para arrancar el timer
      const focusMinutes =
        session.focus_minutes || session.focusMinutes || 25;

      window.dispatchEvent(
        new CustomEvent("startTaskTimer", {
          detail: {
            minutes: focusMinutes,
            taskTitle: taskData.title,
            sessionId: session.id,
            taskId: taskData.id,
          },
        })
      );
    } catch (err) {
      console.error("❌ Error al iniciar sesión:", err);
      alert("No se pudo iniciar la sesión Pomodoro 😢");
    }
  });
});

// ─────────────────────────────────────
// Controles globales: Pausar / Continuar / Completar
// ─────────────────────────────────────
async function pauseTask() {
  if (!currentSession || !currentSession.id) {
    alert("No hay una sesión activa para pausar.");
    return;
  }

  try {
    console.log("⏸ Solicitando pausa de sesión:", currentSession.id);
    await pauseSession(currentSession.id);

    // Avisar a coffee.js para que detenga el timer
    window.dispatchEvent(
      new CustomEvent("pomodoro:pause", {
        detail: { sessionId: currentSession.id, taskId: currentTaskId },
      })
    );
  } catch (err) {
    console.error("❌ Error al pausar sesión:", err);
    alert("No se pudo pausar la sesión.");
  }
}

async function resumeTask() {
  if (!currentSession || !currentSession.id) {
    alert("No hay una sesión pausada para continuar.");
    return;
  }

  try {
    console.log("▶️ Solicitando reanudar sesión:", currentSession.id);
    const session = await resumeSession(currentSession.id);

    // Por si el backend actualiza remaining, estado, etc.
    currentSession = session;

    window.dispatchEvent(
      new CustomEvent("pomodoro:resume", {
        detail: { sessionId: currentSession.id, taskId: currentTaskId },
      })
    );
  } catch (err) {
    console.error("❌ Error al reanudar sesión:", err);
    alert("No se pudo reanudar la sesión.");
  }
}

async function completeTask() {
  if (!currentSession || !currentSession.id) {
    alert("No hay una sesión activa para completar.");
    return;
  }

  try {
    console.log("✅ Solicitando finalizar sesión:", currentSession.id);
    await finishSession(currentSession.id);

    // 🟢 NUEVO: marcar la tarea como COMPLETED en el backend
    if (currentTaskId) {
      console.log("✅ Marcando tarea como COMPLETADA:", currentTaskId);
      const res = await fetch(`${API_BASE}/tasks/${currentTaskId}/complete`, {
        method: "PATCH",
      });

      if (!res.ok) {
        console.error(
          "⚠️ No se pudo marcar la tarea como completada:",
          res.status,
          await res.text()
        );
      }
    }

    // Avisar a coffee.js para que termine el timer
    window.dispatchEvent(
      new CustomEvent("pomodoro:completed", {
        detail: { sessionId: currentSession.id, taskId: currentTaskId },
      })
    );

    // 🔄 Recargar tareas para reflejar:
    // - status = COMPLETED
    // - métricas actualizadas (pomodoros, minutos, etc.)
    if (currentUserId) {
      const root = document.getElementById("tasks-root");
      if (root) {
        const tasks = await fetchTasksByUser(currentUserId);
        renderTasks(root, tasks);
      }
    }
  } catch (err) {
    console.error("❌ Error al completar sesión:", err);
    alert("No se pudo completar la sesión.");
  }
}


// Exponer funciones globales para los botones de CoffeeCanvas
window.pauseTask = pauseTask;
window.resumeTask = resumeTask;   // 👈 AHORA TAMBIÉN ESTO
window.completeTask = completeTask;
