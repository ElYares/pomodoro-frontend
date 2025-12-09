const canvas = document.getElementById("coffeeCanvas");
const ctx = canvas.getContext("2d");
const timerLabel = document.getElementById("timer");

const STATE = {
  IDLE: "idle",
  FOCUS: "focus",
  BREAK: "break",
  PAUSED: "paused",
};

let state = STATE.IDLE;
let isRunning = false;
let totalSeconds = 0;
let remaining = 0;
let currentTaskTitle = "Listo";

// IDs actuales (para mandar en eventos)
let currentSessionId = null;
let currentTaskIdForCanvas = null;

// --- Config Visual ---
const PIXEL = 5;
const C_WHITE = "#e4e4e7";
const C_PANEL = "#161616";
const C_COFFEE = "#78350f";
const C_LIQUID_TOP = "#92400e";
const C_STEAM = "rgba(255, 255, 255, 0.3)";

const cupWidth = 24;
const cupHeight = 32;

const startX = Math.floor((canvas.width - cupWidth * PIXEL) / 2);
const baseStartY = Math.floor((canvas.height - cupHeight * PIXEL) / 2) - 10;

let coffeeLevel = 1.0;
let steamParticles = [];

// =========================
// 1. EVENTOS DESDE OUTRO JS
// =========================

// Iniciar timer de tarea (FOCUS)
window.addEventListener("startTaskTimer", (e) => {
  const { minutes, taskTitle, sessionId, taskId, breakMinutes } = e.detail;
  console.log(
    `☕ Coffee: Iniciando timer para "${taskTitle}" (${minutes} min focus${
      breakMinutes ? ` / ${breakMinutes} min break` : ""
    }), sesión ${sessionId}, task ${taskId}`
  );

  currentTaskTitle = taskTitle;
  currentSessionId = sessionId || null;
  currentTaskIdForCanvas = taskId || null;

  totalSeconds = minutes * 60;
  remaining = totalSeconds;

  state = STATE.FOCUS;
  coffeeLevel = 1.0;
  isRunning = true;

  updateTimerDisplay();
});

// Empezar BREAK (minutos vienen desde tasks-client.js
// después de llamar a finishSession en backend)
window.addEventListener("pomodoro:start-break", (e) => {
  const { breakMinutes } = e.detail || {};
  if (!breakMinutes) {
    console.warn("⚠️ pomodoro:start-break sin breakMinutes");
    return;
  }

  console.log(`🟦 Coffee: iniciando BREAK de ${breakMinutes} min`);

  state = STATE.BREAK;
  totalSeconds = breakMinutes * 60;
  remaining = totalSeconds;
  coffeeLevel = 0;
  isRunning = true;

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("¡Pomodoro Completado!", {
      body: "Tómate un descanso ☕",
    });
  }

  updateTimerDisplay();
});

// Reanudar FOCUS manualmente (botón "Continuar")
window.addEventListener("pomodoro:resume", (e) => {
  const { sessionId, taskId } = e.detail || {};
  console.log("▶️ Coffee: reanudar sesión", { sessionId, taskId });

  if (remaining > 0) {
    state = STATE.FOCUS;
    isRunning = true;
    updateTimerDisplay();
  }
});

// Pausa manual
window.addEventListener("pomodoro:pause", (e) => {
  const { sessionId, taskId } = e.detail || {};
  console.log("⏸ Coffee: pausa solicitada", { sessionId, taskId });

  isRunning = false;
  state = STATE.PAUSED;
  updateTimerDisplay();
});

// Sesión completada manualmente (botón "Completar")
window.addEventListener("pomodoro:completed", (e) => {
  const { sessionId, taskId } = e.detail || {};
  console.log("✅ Coffee: sesión completada manualmente", { sessionId, taskId });

  isRunning = false;
  remaining = 0;
  coffeeLevel = 0;
  state = STATE.IDLE;
  updateTimerDisplay();

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Sesión completada", {
      body: `Has completado el Pomodoro de "${currentTaskTitle}".`,
    });
  }
});

if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

// =========================
// 2. LÓGICA DEL TIMER
// =========================

function updateTimerDisplay() {
  if (!timerLabel) return;

  const m = Math.floor(remaining / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(remaining % 60)
    .toString()
    .padStart(2, "0");
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
      // 👉 Termina el FOCUS: avisamos al front para que
      // llame al backend (finishSession) y luego nos diga
      // cuánto debe durar el BREAK.
      console.log("⏰ FOCUS terminado, disparando pomodoro:focus-finished");
      window.dispatchEvent(
        new CustomEvent("pomodoro:focus-finished", {
          detail: {
            sessionId: currentSessionId,
            taskId: currentTaskIdForCanvas,
          },
        })
      );
    } else if (state === STATE.BREAK) {
      // 👉 Termina el BREAK: avisamos para que el front
      // decida si arranca otro pomodoro o termina el ciclo.
      console.log("⏰ BREAK terminado, disparando pomodoro:break-finished");
      window.dispatchEvent(
        new CustomEvent("pomodoro:break-finished", {
          detail: {
            sessionId: currentSessionId,
            taskId: currentTaskIdForCanvas,
          },
        })
      );
      state = STATE.IDLE;
    }
  }

  updateTimerDisplay();

  if (state === STATE.FOCUS) {
    coffeeLevel = totalSeconds > 0 ? remaining / totalSeconds : 0;
  } else if (state === STATE.BREAK) {
    coffeeLevel = totalSeconds > 0 ? 1 - remaining / totalSeconds : 1;
  }
}

// =========================
// 3. PIXEL ART
// =========================

function drawRect(x, y, w, h, color, offsetY = 0) {
  ctx.fillStyle = color;
  ctx.fillRect(
    startX + x * PIXEL,
    baseStartY + offsetY + y * PIXEL,
    w * PIXEL,
    h * PIXEL
  );
}

function drawCup(offsetY) {
  drawRect(0, 0, cupWidth, cupHeight - 2, C_WHITE, offsetY);
  drawRect(1, cupHeight - 2, cupWidth - 2, 1, C_WHITE, offsetY);
  drawRect(2, cupHeight - 1, cupWidth - 4, 1, C_WHITE, offsetY);
  drawRect(2, 0, cupWidth - 4, cupHeight - 2, C_PANEL, offsetY);

  const handleX = cupWidth;
  const handleY = 6;
  drawRect(handleX, handleY, 4, 3, C_WHITE, offsetY);
  drawRect(handleX + 4, handleY + 2, 3, 10, C_WHITE, offsetY);
  drawRect(handleX, handleY + 10, 4, 3, C_WHITE, offsetY);
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

  drawRect(
    liquidX,
    liquidBaseY - currentLiquidH + 1,
    cupWidth - 4,
    currentLiquidH,
    C_COFFEE,
    offsetY
  );

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

function initSteam() {
  for (let i = 0; i < 4; i++) {
    steamParticles.push({
      x: cupWidth / 2 + (Math.random() * 6 - 3),
      y: -5 - Math.random() * 10,
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
      baseStartY + globalOffsetY + p.y * PIXEL,
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
// 4. LOOP
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
updateTimerDisplay();
setInterval(updateLogic, 1000);