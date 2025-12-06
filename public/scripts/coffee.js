//
// coffee.js - V4.1 (Aesthetic & Transparent + control remoto)
// Sistema gráfico para el Pomodoro pixel-art en Canvas.
//

// =========================
// 1. CONFIGURACIÓN
// =========================

const canvas = document.getElementById("coffeeCanvas");
const ctx = canvas.getContext("2d");
const timerLabel = document.getElementById("timer"); // Asegúrate que exista en tu HTML

const STATE = {
    IDLE: "idle",
    FOCUS: "focus",
    BREAK: "break",
    PAUSED: "paused", // 👈 NUEVO
};

// Variables de Estado
let state = STATE.IDLE;
let isRunning = false;
let totalSeconds = 25 * 60;
let remaining = totalSeconds;
let currentTaskTitle = "Listo";

// --- Configuración Visual ---
const PIXEL = 5; // Tamaño del bloque pixel

// COLORES (Ajustados al tema Dark Glass)
const C_WHITE  = "#e4e4e7"; // Zinc-200 (Blanco suave)
const C_PANEL  = "#161616"; // DEBE coincidir con el background-color de .left-panel en CSS
const C_COFFEE = "#78350f"; // Amber-900 (Café intenso)
const C_LIQUID_TOP = "#92400e"; // Un tono más claro para la superficie
const C_STEAM  = "rgba(255, 255, 255, 0.3)";

// Dimensiones Taza
const cupWidth = 24;
const cupHeight = 32;

// Centrado Inicial
const startX = Math.floor((canvas.width - (cupWidth * PIXEL)) / 2);
// Lo subimos un poco (-10) para dar espacio a la animación de flotar
const baseStartY = Math.floor((canvas.height - (cupHeight * PIXEL)) / 2) - 10;

let coffeeLevel = 1.0;
let steamParticles = [];

// =========================
// 2. EVENTOS Y LÓGICA
// =========================

// 🟢 Iniciar un temporizador de tarea (evento disparado desde tasks-client.js)
window.addEventListener("startTaskTimer", (e) => {
    const { minutes, taskTitle, sessionId, taskId } = e.detail;
    console.log(`☕ Coffee: Iniciando timer para "${taskTitle}" (${minutes} min), sesión ${sessionId}, task ${taskId}`);

    currentTaskTitle = taskTitle;
    totalSeconds = minutes * 60;
    remaining = totalSeconds;

    state = STATE.FOCUS;
    coffeeLevel = 1.0;
    isRunning = true;

    updateTimerDisplay();
});

// ▶️ Reanudar (evento disparado desde tasks-client.js al reanudar en backend)
window.addEventListener("pomodoro:resume", (e) => {
  const { sessionId, taskId } = e.detail || {};
  console.log("▶️ Coffee: reanudar sesión", { sessionId, taskId });

  if (remaining > 0) {
    state = STATE.FOCUS;
    isRunning = true;
    updateTimerDisplay();
  }
});


// ⏸ Pausa (evento disparado desde tasks-client.js al pausar en backend)
window.addEventListener("pomodoro:pause", (e) => {
    const { sessionId, taskId } = e.detail || {};
    console.log("⏸ Coffee: pausa solicitada", { sessionId, taskId });

    isRunning = false;
    state = STATE.PAUSED;
    updateTimerDisplay();
});

// ✅ Completado (evento disparado desde tasks-client.js al terminar en backend)
window.addEventListener("pomodoro:completed", (e) => {
    const { sessionId, taskId } = e.detail || {};
    console.log("✅ Coffee: sesión completada", { sessionId, taskId });

    isRunning = false;
    remaining = 0;
    coffeeLevel = 0;
    state = STATE.IDLE;
    updateTimerDisplay();

    // Opcional: pequeña notificación
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Sesión completada", {
            body: `Has completado el Pomodoro de "${currentTaskTitle}".`,
        });
    }
});

// Puedes pedir permiso de notificaciones al cargar
if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
}

function startBreak() {
    state = STATE.BREAK;
    totalSeconds = 5 * 60;
    remaining = totalSeconds;
    coffeeLevel = 0;

    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("¡Pomodoro Completado!", { body: "Tómate un descanso ☕" });
    } else {
        alert("¡Tiempo terminado! Tómate un descanso ☕");
    }
}

function updateTimerDisplay() {
    if (!timerLabel) return;

    const m = Math.floor(remaining / 60).toString().padStart(2, "0");
    const s = Math.floor(remaining % 60).toString().padStart(2, "0");
    timerLabel.textContent = `${m}:${s}`;

    let modeLabel = "Idle";
    if (state === STATE.FOCUS) modeLabel = "Focus";
    else if (state === STATE.BREAK) modeLabel = "Break";
    else if (state === STATE.PAUSED) modeLabel = "Pausa";

    document.title = `${m}:${s} - ${modeLabel}`;
}

function updateLogic() {
    if (!isRunning) return;

    remaining -= 1;

    if (remaining < 0) {
        remaining = 0;
        isRunning = false;

        if (state === STATE.FOCUS) {
            // Termina la fase de enfoque → empieza descanso
            startBreak();
            isRunning = true;
        } else if (state === STATE.BREAK) {
            state = STATE.IDLE;
            alert("Descanso terminado. ¡A trabajar!");
        }
    }

    updateTimerDisplay();

    // Actualizar nivel gráfico
    if (state === STATE.FOCUS) {
        coffeeLevel = remaining / totalSeconds;
    } else if (state === STATE.BREAK) {
        coffeeLevel = 1 - (remaining / totalSeconds);
    }
}

// =========================
// 3. MOTOR GRÁFICO (PIXEL ART)
// =========================

function drawRect(x, y, w, h, color, offsetY = 0) {
    ctx.fillStyle = color;
    ctx.fillRect(
        startX + x * PIXEL,
        (baseStartY + offsetY) + y * PIXEL,
        w * PIXEL,
        h * PIXEL
    );
}

function drawCup(offsetY) {
    // 1. Cuerpo Taza (Bordes Blancos)
    drawRect(0, 0, cupWidth, cupHeight - 2, C_WHITE, offsetY);
    drawRect(1, cupHeight - 2, cupWidth - 2, 1, C_WHITE, offsetY);
    drawRect(2, cupHeight - 1, cupWidth - 4, 1, C_WHITE, offsetY);

    // 2. Interior
    drawRect(2, 0, cupWidth - 4, cupHeight - 2, C_PANEL, offsetY);

    // 3. Asa
    const handleX = cupWidth;
    const handleY = 6;
    drawRect(handleX, handleY, 4, 3, C_WHITE, offsetY);       // Top
    drawRect(handleX + 4, handleY + 2, 3, 10, C_WHITE, offsetY); // Right
    drawRect(handleX, handleY + 10, 4, 3, C_WHITE, offsetY);  // Bottom
    drawRect(handleX - 1, handleY + 1, 1, 2, C_WHITE, offsetY);
    drawRect(handleX - 1, handleY + 10, 1, 2, C_WHITE, offsetY);
}

function drawLiquid(offsetY) {
    if (coffeeLevel <= 0.05) return;

    const maxLiquidHeight = cupHeight - 4;
    let currentLiquidH = Math.floor(coffeeLevel * maxLiquidHeight);

    if (currentLiquidH > maxLiquidHeight) currentLiquidH = maxLiquidHeight;

    const liquidX = 2;
    const liquidBaseY = cupHeight - 3;

    // Café
    drawRect(
        liquidX,
        liquidBaseY - currentLiquidH + 1,
        cupWidth - 4,
        currentLiquidH,
        C_COFFEE,
        offsetY
    );

    // Superficie
    if (currentLiquidH > 0) {
        drawRect(
            liquidX + 2,
            liquidBaseY - currentLiquidH + 1,
            cupWidth - 8,
            1,
            C_LIQUID_TOP,
            offsetY
        );
    }
}

// --- Sistema de Partículas (Vapor) ---
function initSteam() {
    for (let i = 0; i < 4; i++) {
        steamParticles.push({
            x: cupWidth / 2 + (Math.random() * 6 - 3),
            y: -5 - (Math.random() * 10),
            speed: 0.03 + Math.random() * 0.04,
            size: 1 + Math.random() * 2,
            offset: Math.random() * 100,
        });
    }
}

function updateAndDrawSteam(globalOffsetY) {
    if (coffeeLevel <= 0 || state === STATE.BREAK) return;

    ctx.fillStyle = C_STEAM;

    steamParticles.forEach((p) => {
        p.y -= p.speed;
        p.x += Math.sin(Date.now() / 600 + p.offset) * 0.03;

        ctx.fillRect(
            startX + p.x * PIXEL,
            (baseStartY + globalOffsetY) + p.y * PIXEL,
            p.size * PIXEL,
            p.size * PIXEL
        );

        if (p.y < -20) {
            p.y = 0;
            p.x = cupWidth / 2 + (Math.random() * 8 - 4);
        }
    });
}

// =========================
// 4. BUCLE PRINCIPAL (RENDER LOOP)
// =========================

initSteam();

function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const floatY = Math.sin(Date.now() / 1000) * 3;

    drawCup(floatY);
    drawLiquid(floatY);
    updateAndDrawSteam(floatY);

    requestAnimationFrame(loop);
}

loop();
setInterval(updateLogic, 1000);
