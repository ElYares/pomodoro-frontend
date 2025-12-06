// public/scripts/tasks-client.js

const API_BASE = "http://localhost:8080/api/v1";

const statusMap = {
  IN_PROGRESS: "En curso",
  PAUSED: "Pausada",
  COMPLETED: "Completada",
  PENDING: "Pendiente"
};

function renderError(root, message) {
  root.innerHTML = `<div class="empty-state error">Error: ${message}</div>`;
}

function renderTasks(root, tasks) {
  // 1. Si no hay tareas
  if (!tasks || !tasks.length) {
    root.innerHTML = `
      <div class="task-container">
        <div class="header">
           <h2>Mis Tareas</h2>
           <span class="count-badge">0</span>
        </div>
        <div class="empty-state">
          <p>No hay tareas activas</p>
        </div>
      </div>
    `;
    return;
  }

  // 2. Construimos el HTML (Sin emojis, diseño limpio)
  const tasksHtml = tasks.map((task) => {
    const statusClass = task.status ? task.status.toLowerCase() : "pending";
    const statusText = statusMap[task.status] || task.status || "Pendiente";
    const project = task.project_id || "Sin proyecto";

    return `
      <div 
        class="task-card ${statusClass}"
        data-task-id="${task.id}"
        data-user-id="${task.user_id}"
        data-task-status="${task.status}"
      >
        <div class="card-header">
          <span class="project-name">${project}</span>
          <span class="status-text">${statusText}</span>
        </div>

        <h3 class="task-title">${task.title}</h3>
        <p class="task-desc">${task.description || ""}</p>

        <div class="card-stats">
          <div class="stat-item">
            <span class="label">Poms:</span>
            <span class="value">${task.pomodoros_completed ?? 0}</span>
          </div>
          <div class="stat-item">
            <span class="label">Min:</span>
            <span class="value">${task.total_focus_minutes ?? 0}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  root.innerHTML = `
    <div class="task-container">
      <div class="header">
        <h2>Mis Tareas</h2>
        <span class="count-badge">${tasks.length}</span>
      </div>
      <div class="scroll-area">
        ${tasksHtml}
      </div>
    </div>
  `;
}

async function fetchTasksByUser(userId) {
  const res = await fetch(`${API_BASE}/tasks/user/${userId}`);
  if (!res.ok) throw new Error("Error al cargar tareas");
  return await res.json();
}

window.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById("tasks-root");
  if (!root) return;
  const userId = root.dataset.userId || "123";
  try {
    const tasks = await fetchTasksByUser(userId);
    renderTasks(root, tasks);
  } catch (err) {
    renderError(root, "No se pudieron cargar las tareas.");
  }
});