import {
  authApi,
  clearAuthSession,
  getStoredToken,
  getStoredUser,
  sessionsApi,
  setAuthSession,
  tasksApi,
} from "./api.js";

const POMODOROS_PER_CYCLE = 4;
const SHORT_BREAK = 5;
const LONG_BREAK = 15;

let authUser = null;
let allTasks = [];
let currentSession = null;
let currentTaskId = null;
let currentTaskData = null;
let lastCycleInfo = null;

const ui = {};

const statusLabels = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En foco",
  PAUSED: "Pausada",
  COMPLETED: "Completada",
};

function bindElements() {
  ui.authPanel = document.getElementById("auth-panel");
  ui.dashboard = document.getElementById("dashboard");
  ui.authTabs = [...document.querySelectorAll("[data-auth-tab]")];
  ui.authForms = [...document.querySelectorAll("[data-auth-form]")];
  ui.loginForm = document.getElementById("login-form");
  ui.registerForm = document.getElementById("register-form");
  ui.authMessage = document.getElementById("auth-message");
  ui.tasksRoot = document.getElementById("tasks-root");
  ui.taskCounter = document.getElementById("task-counter");
  ui.userName = document.getElementById("user-name");
  ui.userEmail = document.getElementById("user-email");
  ui.logoutButton = document.getElementById("logout-button");
  ui.importForm = document.getElementById("import-form");
  ui.importMessage = document.getElementById("import-message");
  ui.taskStatus = document.getElementById("task-status");
  ui.pomoMeta = document.getElementById("pomo-meta");
  ui.sessionTask = document.getElementById("session-task");
  ui.sessionPhase = document.getElementById("session-phase");
  ui.sessionHint = document.getElementById("session-hint");
  ui.progressFill = document.getElementById("cycle-progress-fill");
  ui.progressLabel = document.getElementById("cycle-progress-label");
  ui.breakBadge = document.getElementById("break-badge");
  ui.globalBanner = document.getElementById("global-banner");
  ui.pauseButton = document.getElementById("btn-pause");
  ui.resumeButton = document.getElementById("btn-resume");
  ui.completeButton = document.getElementById("btn-complete");
}

function setBanner(message = "", tone = "muted") {
  if (!ui.globalBanner) return;
  ui.globalBanner.textContent = message;
  ui.globalBanner.dataset.tone = tone;
  ui.globalBanner.hidden = !message;
}

function setAuthMessage(message = "", tone = "muted") {
  ui.authMessage.textContent = message;
  ui.authMessage.dataset.tone = tone;
  ui.authMessage.hidden = !message;
}

function setImportMessage(message = "", tone = "muted") {
  ui.importMessage.textContent = message;
  ui.importMessage.dataset.tone = tone;
  ui.importMessage.hidden = !message;
}

function switchAuthTab(tabName) {
  ui.authTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.authTab === tabName);
  });
  ui.authForms.forEach((form) => {
    form.hidden = form.dataset.authForm !== tabName;
  });
  setAuthMessage("");
}

function updateSessionPanel({
  taskTitle = "Selecciona una tarea",
  phase = "Idle",
  hint = "Importa tareas o elige una para comenzar.",
  cycleIndex = 0,
  breakMinutes = SHORT_BREAK,
} = {}) {
  ui.sessionTask.textContent = taskTitle;
  ui.sessionPhase.textContent = phase;
  ui.sessionHint.textContent = hint;
  ui.breakBadge.textContent = `${breakMinutes} min break`;

  const completedInCycle = Math.max(Math.min(cycleIndex, POMODOROS_PER_CYCLE), 0);
  const percent = (completedInCycle / POMODOROS_PER_CYCLE) * 100;
  ui.progressFill.style.width = `${percent}%`;
  ui.progressLabel.textContent = `${completedInCycle}/${POMODOROS_PER_CYCLE} pomodoros del ciclo`;
}

function updatePomodoroMeta(pomodoroIndex, cycleNumber) {
  ui.pomoMeta.textContent =
    pomodoroIndex && cycleNumber
      ? `Pomodoro ${pomodoroIndex} de ${POMODOROS_PER_CYCLE} · Ciclo ${cycleNumber}`
      : "Listo para empezar";
}

function updateControls(mode = "idle") {
  const states = {
    idle: { pause: true, resume: true, complete: true },
    focus: { pause: false, resume: true, complete: false },
    paused: { pause: true, resume: false, complete: false },
    break: { pause: true, resume: true, complete: true },
  };

  const state = states[mode] || states.idle;
  ui.pauseButton.disabled = state.pause;
  ui.resumeButton.disabled = state.resume;
  ui.completeButton.disabled = state.complete;
}

function getCurrentTimerSnapshot() {
  if (typeof window.getPomodoroSnapshot === "function") {
    return window.getPomodoroSnapshot();
  }
  return { remaining: 0, state: "idle" };
}

function getCycleContext(task) {
  const completedSoFar = task?.pomodoros_completed || 0;
  const totalAfter = completedSoFar + 1;
  let indexInCycle = totalAfter % POMODOROS_PER_CYCLE;
  if (indexInCycle === 0) {
    indexInCycle = POMODOROS_PER_CYCLE;
  }
  const cycleNumber = Math.floor((totalAfter - 1) / POMODOROS_PER_CYCLE) + 1;
  const breakMinutes = indexInCycle === POMODOROS_PER_CYCLE ? LONG_BREAK : SHORT_BREAK;

  return {
    indexInCycle,
    cycleNumber,
    breakMinutes,
  };
}

function renderTasks(tasks) {
  allTasks = tasks;
  ui.taskCounter.textContent = tasks.length;

  if (!tasks.length) {
    ui.tasksRoot.innerHTML = `
      <div class="empty-state">
        <strong>Sin tareas todavía</strong>
        <span>Sube un Markdown con checklist para empezar a trabajar.</span>
      </div>
    `;
    return;
  }

  ui.tasksRoot.innerHTML = tasks
    .map((task) => {
      const isActive = task.id === currentTaskId;
      const rawStatus = task.status || "PENDING";
      const statusCode = rawStatus.toLowerCase();
      const statusText = statusLabels[rawStatus] || rawStatus;
      const isLockedForDeletion = task.id === currentTaskId;
      return `
        <article class="task-card status-${statusCode} ${isActive ? "active" : ""}" data-task-id="${task.id}">
          <div class="card-header">
            <div class="card-meta">
              <span class="project-badge">${task.project_id}</span>
              <span class="status-chip">${statusText}</span>
            </div>
            <button
              type="button"
              class="task-delete-button"
              data-task-delete="${task.id}"
              aria-label="Eliminar tarea ${task.title}"
              ${isLockedForDeletion ? "disabled" : ""}
            >
              Eliminar
            </button>
          </div>
          <h3 class="task-title">${task.title}</h3>
          <p class="task-desc">${task.description || "Sin descripcion"}</p>
          <div class="card-footer">
            <div class="stat-item"><span>🍅</span><span>${task.pomodoros_completed || 0}</span></div>
            <div class="stat-item"><span>⏱</span><span>${task.total_focus_minutes || 0} min</span></div>
          </div>
        </article>
      `;
    })
    .join("");
}

async function deleteTask(taskId) {
  const task = allTasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }

  if (taskId === currentTaskId) {
    setBanner("No puedes eliminar la tarea activa o en descanso.", "error");
    return;
  }

  const confirmed = window.confirm(`Eliminar la tarea "${task.title}"? Esta accion no se puede deshacer.`);
  if (!confirmed) {
    return;
  }

  try {
    await tasksApi.remove(taskId);
    await refreshTasks();
    setBanner(`Tarea "${task.title}" eliminada.`, "success");
  } catch (error) {
    setBanner(error.message, "error");
  }
}

async function refreshTasks() {
  if (!authUser) return;
  const tasks = await tasksApi.getByUser(authUser.id);
  renderTasks(tasks);
  if (currentTaskId) {
    currentTaskData = tasks.find((task) => task.id === currentTaskId) || currentTaskData;
  }
}

function showDashboard() {
  ui.authPanel.hidden = true;
  ui.dashboard.hidden = false;
  ui.userName.textContent = authUser.name;
  ui.userEmail.textContent = authUser.email;
}

function showAuth() {
  ui.dashboard.hidden = true;
  ui.authPanel.hidden = false;
}

function hydrateSession(session, task) {
  currentSession = session;
  currentTaskId = session.task_id;
  currentTaskData = task || allTasks.find((item) => item.id === session.task_id) || null;

  const taskTitle = task?.title || currentTaskData?.title || "Sesion activa";
  const breakMinutes = session.break_minutes || SHORT_BREAK;
  updatePomodoroMeta(session.pomodoro_index, session.cycle_number);
  updateSessionPanel({
    taskTitle,
    phase: session.status === "PAUSED" ? "Pausa" : "Focus",
    hint:
      session.status === "PAUSED"
        ? "Sesion restaurada en pausa. Puedes continuar."
        : "Sesion restaurada automaticamente despues de recargar.",
    cycleIndex: session.pomodoro_index - 1,
    breakMinutes,
  });
  updateControls(session.status === "PAUSED" ? "paused" : "focus");

  window.dispatchEvent(
    new CustomEvent("startTaskTimer", {
      detail: {
        minutes: session.focus_minutes,
        remainingSeconds: session.remaining_seconds,
        breakMinutes,
        taskTitle,
        sessionId: session.id,
        taskId: session.task_id,
        paused: session.status === "PAUSED",
      },
    })
  );
}

function resetSessionUi(message = "Importa tareas o elige una para comenzar.") {
  currentSession = null;
  currentTaskId = null;
  currentTaskData = null;
  lastCycleInfo = null;
  updatePomodoroMeta();
  updateSessionPanel({
    hint: message,
  });
  updateControls("idle");
}

async function restoreActiveSession() {
  const activeSession = await sessionsApi.getActive(authUser.id);
  if (!activeSession) {
    resetSessionUi();
    return;
  }

  if (activeSession.remaining_seconds <= 0 && activeSession.status === "STARTED") {
    await sessionsApi.finish(activeSession.id);
    await refreshTasks();
    resetSessionUi("La sesion previa ya habia terminado.");
    return;
  }

  hydrateSession(activeSession, activeSession.task);
}

async function bootstrapApp() {
  authUser = getStoredUser();
  const token = getStoredToken();

  if (!token || !authUser) {
    showAuth();
    return;
  }

  try {
    const response = await authApi.me();
    authUser = response.user;
    setAuthSession({ token, user: authUser });
    showDashboard();
    await refreshTasks();
    await restoreActiveSession();
    setBanner(`Sesion iniciada como ${authUser.name}.`, "success");
  } catch (_error) {
    clearAuthSession();
    authUser = null;
    showAuth();
  }
}

async function handleAuthSuccess(payload, successMessage) {
  authUser = payload.user;
  setAuthSession(payload);
  showDashboard();
  await refreshTasks();
  await restoreActiveSession();
  setAuthMessage("");
  setBanner(successMessage, "success");
}

async function onLoginSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  try {
    const payload = await authApi.login({
      email: formData.get("email"),
      password: formData.get("password"),
    });
    await handleAuthSuccess(payload, "Sesion iniciada.");
    form.reset();
  } catch (error) {
    setAuthMessage(error.message, "error");
  }
}

async function onRegisterSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  try {
    const payload = await authApi.register({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });
    await handleAuthSuccess(payload, "Cuenta creada y sesion iniciada.");
    form.reset();
  } catch (error) {
    setAuthMessage(error.message, "error");
  }
}

async function handleTaskSelection(taskId) {
  const task = allTasks.find((item) => item.id === taskId);
  if (!task) return;

  if (currentSession?.id && currentTaskId === taskId) {
    setBanner("Esa tarea ya tiene una sesion activa.", "muted");
    return;
  }

  try {
    const session = await sessionsApi.start(task.id);
    currentSession = session;
    currentTaskId = task.id;
    currentTaskData = task;
    const cycle = getCycleContext(task);

    updatePomodoroMeta(session.pomodoro_index, session.cycle_number);
    updateSessionPanel({
      taskTitle: task.title,
      phase: "Focus",
      hint: "Concentrate y deja que el cafe haga el resto.",
      cycleIndex: session.pomodoro_index - 1,
      breakMinutes: session.break_minutes,
    });
    updateControls("focus");

    renderTasks(
      allTasks.map((item) =>
        item.id === task.id
          ? { ...item, status: "IN_PROGRESS" }
          : item
      )
    );

    window.dispatchEvent(
      new CustomEvent("startTaskTimer", {
        detail: {
          minutes: session.focus_minutes,
          remainingSeconds: session.remaining_seconds,
          breakMinutes: cycle.breakMinutes,
          taskTitle: task.title,
          sessionId: session.id,
          taskId: task.id,
          paused: false,
        },
      })
    );

    setBanner(`Pomodoro iniciado para "${task.title}".`, "success");
  } catch (error) {
    setBanner(error.message, "error");
  }
}

async function pauseTask() {
  if (!currentSession?.id) {
    setBanner("No hay una sesion activa para pausar.", "error");
    return;
  }

  try {
    const snapshot = getCurrentTimerSnapshot();
    currentSession = await sessionsApi.pause(currentSession.id, snapshot.remaining);
    updateSessionPanel({
      taskTitle: currentTaskData?.title || "Sesion en pausa",
      phase: "Pausa",
      hint: "La sesion quedo en pausa y se restaurara igual al recargar.",
      cycleIndex: currentSession.pomodoro_index - 1,
      breakMinutes: currentSession.break_minutes,
    });
    updateControls("paused");
    window.dispatchEvent(
      new CustomEvent("pomodoro:pause", {
        detail: { sessionId: currentSession.id, taskId: currentTaskId },
      })
    );
    await refreshTasks();
    setBanner("Sesion pausada.", "muted");
  } catch (error) {
    setBanner(error.message, "error");
  }
}

async function resumeTask() {
  if (!currentSession?.id) {
    setBanner("No hay una sesion pausada para continuar.", "error");
    return;
  }

  try {
    currentSession = await sessionsApi.resume(currentSession.id);
    updateSessionPanel({
      taskTitle: currentTaskData?.title || "Sesion activa",
      phase: "Focus",
      hint: "De vuelta al foco.",
      cycleIndex: currentSession.pomodoro_index - 1,
      breakMinutes: currentSession.break_minutes,
    });
    updateControls("focus");
    window.dispatchEvent(
      new CustomEvent("pomodoro:resume", {
        detail: { sessionId: currentSession.id, taskId: currentTaskId },
      })
    );
    await refreshTasks();
    setBanner("Sesion reanudada.", "success");
  } catch (error) {
    setBanner(error.message, "error");
  }
}

async function completeTask() {
  if (!currentSession?.id) {
    setBanner("No hay una sesion activa para completar.", "error");
    return;
  }

  try {
    await sessionsApi.finish(currentSession.id);
    if (currentTaskId) {
      await tasksApi.complete(currentTaskId);
    }
    window.dispatchEvent(
      new CustomEvent("pomodoro:completed", {
        detail: { sessionId: currentSession.id, taskId: currentTaskId },
      })
    );
    await refreshTasks();
    resetSessionUi("Tarea marcada como completada.");
    setBanner("Sesion completada y tarea cerrada.", "success");
  } catch (error) {
    setBanner(error.message, "error");
  }
}

async function onImportSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const file = formData.get("file");
  const shouldReplaceExisting = formData.get("replace_existing") === "true";

  if (!(file instanceof File) || !file.name) {
    setImportMessage("Selecciona un archivo Markdown.", "error");
    return;
  }

  try {
    const payload = new FormData();
    payload.append("file", file);
    payload.append("replace_existing", shouldReplaceExisting ? "true" : "false");
    const result = await tasksApi.importMarkdown(payload);
    form.reset();
    await refreshTasks();
    const replaceCopy =
      result.replaced_count > 0
        ? ` Se reemplazaron ${result.replaced_count} tareas anteriores.`
        : "";
    setImportMessage(`Se importaron ${result.imported} tareas.${replaceCopy}`, "success");
    setBanner(
      shouldReplaceExisting
        ? "Markdown importado y tareas anteriores reemplazadas."
        : "Tareas cargadas desde Markdown.",
      "success"
    );
  } catch (error) {
    setImportMessage(error.message, "error");
  }
}

async function logout() {
  try {
    await authApi.logout();
  } catch (_error) {
    // noop
  }
  clearAuthSession();
  authUser = null;
  allTasks = [];
  renderTasks([]);
  resetSessionUi();
  showAuth();
  setBanner("Sesion cerrada.", "muted");
}

window.addEventListener("pomodoro:focus-finished", async () => {
  if (!currentSession?.id) return;

  try {
    const result = await sessionsApi.finish(currentSession.id);
    lastCycleInfo = result;
    currentSession = null;
    await refreshTasks();

    updatePomodoroMeta(result.index_in_cycle, result.cycles_done + 1);
    updateSessionPanel({
      taskTitle: currentTaskData?.title || "Break",
      phase: "Break",
      hint: result.is_cycle_end
        ? "Terminaste el cuarto pomodoro. Toca descanso largo."
        : "Pomodoro terminado. Toma un descanso corto.",
      cycleIndex: result.index_in_cycle,
      breakMinutes: result.next_break_minutes,
    });
    updateControls("break");

    window.dispatchEvent(
      new CustomEvent("pomodoro:start-break", {
        detail: { breakMinutes: result.next_break_minutes },
      })
    );
  } catch (error) {
    setBanner(error.message, "error");
  }
});

window.addEventListener("pomodoro:break-finished", async () => {
  if (!lastCycleInfo || !currentTaskId || !currentTaskData) {
    resetSessionUi();
    return;
  }

  if (lastCycleInfo.is_cycle_end) {
    resetSessionUi("Ciclo completo. Selecciona la siguiente tarea o vuelve a empezar.");
    setBanner("Ciclo de 4 pomodoros completado.", "success");
    return;
  }

  try {
    const newSession = await sessionsApi.start(currentTaskId);
    currentSession = newSession;

    updatePomodoroMeta(newSession.pomodoro_index, newSession.cycle_number);
    updateSessionPanel({
      taskTitle: currentTaskData.title,
      phase: "Focus",
      hint: "Siguiente pomodoro iniciado automaticamente.",
      cycleIndex: newSession.pomodoro_index - 1,
      breakMinutes: newSession.break_minutes,
    });
    updateControls("focus");

    window.dispatchEvent(
      new CustomEvent("startTaskTimer", {
        detail: {
          minutes: newSession.focus_minutes,
          remainingSeconds: newSession.remaining_seconds,
          breakMinutes: newSession.break_minutes,
          taskTitle: currentTaskData.title,
          sessionId: newSession.id,
          taskId: currentTaskId,
          paused: false,
        },
      })
    );
  } catch (error) {
    setBanner(error.message, "error");
  }
});

window.addEventListener("DOMContentLoaded", async () => {
  bindElements();

  ui.authTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchAuthTab(tab.dataset.authTab));
  });
  ui.loginForm.addEventListener("submit", onLoginSubmit);
  ui.registerForm.addEventListener("submit", onRegisterSubmit);
  ui.importForm.addEventListener("submit", onImportSubmit);
  ui.logoutButton.addEventListener("click", logout);

  ui.tasksRoot.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-task-delete]");
    if (deleteButton) {
      event.stopPropagation();
      await deleteTask(deleteButton.dataset.taskDelete);
      return;
    }

    const card = event.target.closest(".task-card");
    if (!card) return;
    await handleTaskSelection(card.dataset.taskId);
  });

  window.pauseTask = pauseTask;
  window.resumeTask = resumeTask;
  window.completeTask = completeTask;

  switchAuthTab("login");
  updateControls("idle");
  await bootstrapApp();
});
