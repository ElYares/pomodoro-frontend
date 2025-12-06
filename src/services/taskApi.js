const API = "http://localhost:8080/api/v1";

// ─────────────────────────────────────
// TAREAS
// ─────────────────────────────────────

export async function getTasksByUser(userId) {
    const res = await fetch('http://localhost:8080/api/v1/tasks/user/${userId}',{method: "GET"});
    console.log(res);
    if (!res.ok) throw new Error("Error obteniendo tareas");
    return res.json();
}

export async function createTask(data) {
    const res = await fetch(`${API}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Error creando tarea");
    return res.json();
}

export async function updateTask(id, data) {
    const res = await fetch(`${API}/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Error actualizando tarea");
    return res.json();
}

export async function deleteTask(id) {
    const res = await fetch(`${API}/tasks/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Error eliminando tarea");
    return res.json();
}

// Marca la tarea como COMPLETED
export async function completeTask(id) {
    const res = await fetch(`${API}/tasks/${id}/complete`, { method: "PATCH" });
    if (!res.ok) throw new Error("Error completando tarea");
    return res.json();
}

// ─────────────────────────────────────
// SESIONES POMODORO
// ─────────────────────────────────────

// Crea una sesión y la inicia
export async function startSession({ userId, taskId, focus, breakMin }) {
    const res = await fetch(`${API}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            user_id: userId,
            task_id: taskId,
            focus_minutes: focus,
            break_minutes: breakMin
        })
    });
    if (!res.ok) throw new Error("Error iniciando sesión");
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
