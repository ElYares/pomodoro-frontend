// public/scripts/tasks-client.js
import {
  startSession,
  pauseSession,
  resumeSession,
  finishSession,
} from "./sessionsApi.js";

const API_BASE = "http://localhost:8080/api/v1";

// ⚙️ Config POMODORO (TEST)
const POMODOROS_PER_CYCLE = 4;
const FOCUS_MIN = 1;    // 1 minuto de foco
const SHORT_BREAK = 1;  // 1 minuto descanso corto
const LONG_BREAK = 2;   // 2 minutos descanso largo

let allTasks = [];
let currentSession = null;
let currentTaskId = null;
let currentUserId = null;
let currentTaskData = null;   // última tarea seleccionada
let lastCycleInfo = null;     // info devuelta por finishSession

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
      const statusCode = rawStatus.toLowerCase();
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

// Helper para actualizar el texto bajo el reloj
function updatePomodoroMeta(pomodoroIndex, cycleNumber) {
  const metaEl = document.getElementById("pomo-meta");
  if (!metaEl) return;

  metaEl.textContent = `Pomodoro ${pomodoroIndex} de ${POMODOROS_PER_CYCLE} · Ciclo ${cycleNumber}`;
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

    currentTaskData = taskData;
    currentTaskId = taskData.id;

    console.clear();
    console.log(
      "%c Tarea Seleccionada ",
      "background: #222; color: #bada55; padding: 4px; border-radius: 4px;"
    );
    console.log(taskData);

    try {
      // 1) Calcular qué pomodoro toca AHORA (para esta tarea)
      const completedSoFar = taskData.pomodoros_completed || 0;
      const totalAfter = completedSoFar + 1; // el que vamos a arrancar

      let indexInCycle = totalAfter % POMODOROS_PER_CYCLE;
      if (indexInCycle === 0) indexInCycle = POMODOROS_PER_CYCLE;

      const isEndOfCycle = indexInCycle === POMODOROS_PER_CYCLE;
      const focusMinutes = FOCUS_MIN;
      const breakMinutes = isEndOfCycle ? LONG_BREAK : SHORT_BREAK;

      const cyclesDone = Math.floor((totalAfter - 1) / POMODOROS_PER_CYCLE);
      const currentCycleNumber = cyclesDone + 1;

      console.log("🔁 Ciclo Pomodoro:", {
        completedSoFar,
        totalAfter,
        indexInCycle,
        isEndOfCycle,
        focusMinutes,
        breakMinutes,
        currentCycleNumber,
      });

      updatePomodoroMeta(indexInCycle, currentCycleNumber);

      // 2) Crear sesión en backend
      const session = await startSession({
        userId: taskData.user_id || userId,
        taskId: taskData.id,
        focus: focusMinutes,
        breakMin: breakMinutes,
      });

      currentSession = session;
      console.log("✅ Sesión creada desde backend", session);

      const usedFocusMinutes =
        session.focus_minutes ?? session.focusMinutes ?? focusMinutes;
      const usedBreakMinutes =
        session.break_minutes ?? session.breakMinutes ?? breakMinutes;

      console.log("⏱ Minutos usados para el timer:", {
        focusMinutes: usedFocusMinutes,
        breakMinutes: usedBreakMinutes,
      });

      // 3) Arrancar timer en coffee.js
      window.dispatchEvent(
        new CustomEvent("startTaskTimer", {
          detail: {
            minutes: usedFocusMinutes,
            breakMinutes: usedBreakMinutes, // solo para log
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
// Eventos que vienen DESDE coffee.js
// ─────────────────────────────────────

// Cuando termina el FOCUS automáticamente
window.addEventListener("pomodoro:focus-finished", async (e) => {
  if (!currentSession || !currentSession.id) {
    console.warn("⚠️ focus-finished pero no hay currentSession");
    return;
  }

  console.log(
    "🎯 focus terminado, llamando finishSession backend:",
    currentSession.id
  );

  try {
    const result = await finishSession(currentSession.id);
    console.log("🎯 Respuesta finishSession:", result);

    lastCycleInfo = result;

    const totalPomos = result.total_pomodoros ?? 0;
    const indexInCycle = result.index_in_cycle ?? 1;
    const cyclesDone = result.cycles_done ?? 0;
    const nextBreakMinutes = result.next_break_minutes ?? SHORT_BREAK;

    // Actualizar texto bajo el reloj con datos del backend
    updatePomodoroMeta(indexInCycle, cyclesDone + 1);

    // Recargar tareas para mostrar 🍅 y minutos actualizados
    if (currentUserId) {
      const root = document.getElementById("tasks-root");
      if (root) {
        const tasks = await fetchTasksByUser(currentUserId);
        renderTasks(root, tasks);
      }
    }

    // Decirle a coffee.js cuánto debe durar el BREAK
    window.dispatchEvent(
      new CustomEvent("pomodoro:start-break", {
        detail: { breakMinutes: nextBreakMinutes },
      })
    );
  } catch (err) {
    console.error("❌ Error en finishSession (focus-finished):", err);
  }
});

// Cuando termina el BREAK automáticamente
window.addEventListener("pomodoro:break-finished", async (e) => {
  console.log("🟢 Break terminado (evento recibido en tasks-client)");

  if (!lastCycleInfo || !currentTaskId) {
    console.warn(
      "⚠️ break-finished pero no hay lastCycleInfo o currentTaskId, no se auto-inicia el siguiente pomodoro."
    );
    return;
  }

  const isCycleEnd = lastCycleInfo.is_cycle_end;
  const totalPomos = lastCycleInfo.total_pomodoros ?? 0;

  if (isCycleEnd) {
    console.log("✅ Ciclo completo, no se crea nueva sesión automática.");
    // Puedes opcionalmente poner un mensaje en pomo-meta:
    updatePomodoroMeta(POMODOROS_PER_CYCLE, lastCycleInfo.cycles_done + 1);
    return;
  }

  // 👉 Crear automáticamente el siguiente pomodoro del ciclo
  const completedSoFar = totalPomos; // ya terminados
  const totalAfter = completedSoFar + 1;

  let indexInCycle = totalAfter % POMODOROS_PER_CYCLE;
  if (indexInCycle === 0) indexInCycle = POMODOROS_PER_CYCLE;

  const isEndOfCycleNext = indexInCycle === POMODOROS_PER_CYCLE;
  const focusMinutes = FOCUS_MIN;
  const breakMinutes = isEndOfCycleNext ? LONG_BREAK : SHORT_BREAK;

  const cyclesDone = Math.floor((totalAfter - 1) / POMODOROS_PER_CYCLE);
  const currentCycleNumber = cyclesDone + 1;

  console.log("🔁 Auto-siguiente Pomodoro:", {
    completedSoFar,
    totalAfter,
    indexInCycle,
    isEndOfCycleNext,
    focusMinutes,
    breakMinutes,
    currentCycleNumber,
  });

  updatePomodoroMeta(indexInCycle, currentCycleNumber);

  try {
    const userId =
      currentUserId ||
      (currentTaskData && currentTaskData.user_id) ||
      "123";

    const newSession = await startSession({
      userId,
      taskId: currentTaskId,
      focus: focusMinutes,
      breakMin: breakMinutes,
    });

    currentSession = newSession;
    console.log("✅ Nueva sesión AUTO creada", newSession);

    const usedFocusMinutes =
      newSession.focus_minutes ?? newSession.focusMinutes ?? focusMinutes;
    const usedBreakMinutes =
      newSession.break_minutes ?? newSession.breakMinutes ?? breakMinutes;

    window.dispatchEvent(
      new CustomEvent("startTaskTimer", {
        detail: {
          minutes: usedFocusMinutes,
          breakMinutes: usedBreakMinutes,
          taskTitle: currentTaskData ? currentTaskData.title : "Tarea",
          sessionId: newSession.id,
          taskId: currentTaskId,
        },
      })
    );
  } catch (err) {
    console.error("❌ Error creando sesión automática:", err);
  }
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
    console.log("✅ Solicitando finalizar sesión (botón Completar):", currentSession.id);
    await finishSession(currentSession.id);

    // Marcar la tarea como COMPLETED en backend
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

    window.dispatchEvent(
      new CustomEvent("pomodoro:completed", {
        detail: { sessionId: currentSession.id, taskId: currentTaskId },
      })
    );

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

// Exponer funciones globales para los botones
window.pauseTask = pauseTask;
window.resumeTask = resumeTask;
window.completeTask = completeTask;
