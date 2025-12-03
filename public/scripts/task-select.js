import { getMockTasks } from "/src/services/mockTasks.js";

let tasks = getMockTasks();
let selectedTask = document.getElementById("selectedTask");

// Permite que coffee.js reinicie pomodoro
const reset = window.resetPomodoro;

// ► Al seleccionar tarea
document.addEventListener("click", (e) => {
    const el = e.target.closest(".task");
    if (!el) return;

    const id = el.dataset.id;
    const task = tasks.find(t => t.id === id);

    // Cambiar estado:
    tasks.forEach(t => t.status = "pending"); // resetear otras
    task.status = "in_progress";

    selectedTask.textContent = task.title;

    reset(); // reiniciar pomodoro
});

// ► Pausar tarea actual
window.pauseTask = function() {
    const task = tasks.find(t => t.status === "in_progress");
    if (task) task.status = "paused";
};

// ► Completar tarea actual
window.completeTask = function() {
    const task = tasks.find(t => t.status === "in_progress" || t.status === "paused");
    if (task) {
        task.status = "completed";
        task.completed = true; // coincide con backend real
    }
};
