//
// coffee.js - V2.0 (Mejorada)
// Sistema gráfico para el Pomodoro pixel-art en Canvas.
//

// =========================
// MOCK LOCAL
// =========================
function getMockSession() {
    return {
        focus_duration: 60,     // 1 minuto para pruebas
        break_duration: 15,     // 15 segundos de descanso (ejemplo)
        state: "focus",         // Estado inicial
        remaining_seconds: 60
    };
}


// =========================
// CONFIGURACIÓN PRINCIPAL
// =========================

let session = getMockSession();
let state = session.state;

let remaining = session.remaining_seconds;
let totalSeconds = session.focus_duration; // inicia en focus


const canvas = document.getElementById("coffeeCanvas");
const ctx = canvas.getContext("2d");
const timerLabel = document.getElementById("timer");

const STATE = {
    FOCUS: "focus",
    BREAK: "break"
};


// Aumentamos el tamaño del pixel para que se vea más retro
const PIXEL = 5; 

// Colores
const C_WHITE = "#eeeeee";  // Blanco suave
const C_BG    = "#111111";  // Fondo oscuro (asegúrate que tu CSS coincida o usa clearRect)
const C_COFFEE= "#6f4e37";  // Café
const C_DARK  = "#4a332a";  // Café más oscuro (para profundidad)
const C_STEAM = "rgba(255, 255, 255, 0.4)"; // Vapor semi-transparente

// Dimensiones de la taza (en bloques PIXEL)
const cupWidth = 24;  
const cupHeight = 32; 

// Calcular posición para CENTRAR la taza en el canvas
const startX = Math.floor((canvas.width - (cupWidth * PIXEL)) / 2);
const startY = Math.floor((canvas.height - (cupHeight * PIXEL)) / 2) + 20;

let coffeeLevel = 1.0;

// Sistema de partículas para el humo
let steamParticles = [];

function startBreak() {
    state = STATE.BREAK;
    totalSeconds = session.break_duration;
    remaining = totalSeconds;
    coffeeLevel = 0; // comienza vacío
}

function startFocus() {
    state = STATE.FOCUS;
    totalSeconds = session.focus_duration;
    remaining = totalSeconds;
    coffeeLevel = 1; // comienza lleno
}


// =========================
// UTILIDADES DE DIBUJO
// =========================

// Dibuja un rectángulo en coordenadas de grilla (no pixeles reales)
function drawRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(startX + x * PIXEL, startY + y * PIXEL, w * PIXEL, h * PIXEL);
}

// =========================
// DIBUJO DE LA TAZA
// =========================

function drawCupStructure() {
    // 1. Cuerpo principal (blanco)
    // Dejamos hueco arriba y abajo para redondear
    drawRect(0, 0, cupWidth, cupHeight - 2, C_WHITE); 
    drawRect(1, cupHeight - 2, cupWidth - 2, 1, C_WHITE); // Borde redondeado abajo 1
    drawRect(2, cupHeight - 1, cupWidth - 4, 1, C_WHITE); // Borde redondeado abajo 2

    // 2. Interior oscuro (el hueco de la taza)
    drawRect(2, 0, cupWidth - 4, cupHeight - 2, C_BG); 
}

function drawHandle() {
    // El asa va a la derecha
    const handleX = cupWidth;
    const handleY = 6;
    
    // Parte superior del asa
    drawRect(handleX, handleY, 4, 3, C_WHITE);
    // Parte vertical derecha
    drawRect(handleX + 4, handleY + 2, 3, 10, C_WHITE);
    // Parte inferior del asa
    drawRect(handleX, handleY + 10, 4, 3, C_WHITE);
    
    // Conexión suave (pixel extra para que no se vea flotando)
    drawRect(handleX - 1, handleY + 1, 1, 2, C_WHITE);
    drawRect(handleX - 1, handleY + 10, 1, 2, C_WHITE);
}

// =========================
// DIBUJO DEL LÍQUIDO
// =========================

function drawCoffee() {
    if (coffeeLevel <= 0) return;

    // Altura máxima del líquido dentro de la taza
    const maxLiquidHeight = cupHeight - 4; 
    
    // Altura actual basada en el tiempo
    let currentLiquidH = Math.floor(coffeeLevel * maxLiquidHeight);
    
    // Coordenadas base dentro de la taza
    const liquidX = 2;
    const liquidBaseY = cupHeight - 3; // Justo encima del fondo de la taza

    // Dibujar el líquido desde abajo hacia arriba
    // Color principal
    drawRect(liquidX, liquidBaseY - currentLiquidH + 1, cupWidth - 4, currentLiquidH, C_COFFEE);
    
    // Un poco de "brillo" o superficie más clara arriba del todo si hay café
    if (currentLiquidH > 0) {
        drawRect(liquidX + 2, liquidBaseY - currentLiquidH + 1, cupWidth - 8, 1, "#8a624a");
    }
}

// =========================
// ANIMACIÓN DE VAPOR (STEAM)
// =========================

function initSteam() {
    // Crear algunas partículas iniciales
    for(let i=0; i<3; i++) {
        steamParticles.push({
            x: cupWidth / 2 + (Math.random() * 6 - 3), // Aleatorio en el centro
            y: -5 - (Math.random() * 10),              // Arriba de la taza
            speed: 0.05 + Math.random() * 0.05,
            size: 1 + Math.random() * 2 // Tamaño en bloques
        });
    }
}

function updateAndDrawSteam() {
    // Solo dibujar vapor si hay café y está caliente (nivel > 0)
    if (coffeeLevel <= 0) return;

    ctx.fillStyle = C_STEAM;

    steamParticles.forEach(p => {
        // Mover hacia arriba
        p.y -= p.speed;
        
        // Oscilación lateral (viento suave)
        p.x += Math.sin(Date.now() / 500) * 0.02;

        // Dibujar partícula
        // UsamosfillRect directo con coordenadas flotantes para suavidad
        ctx.fillRect(
            startX + p.x * PIXEL, 
            startY + p.y * PIXEL, 
            p.size * PIXEL, 
            p.size * PIXEL
        );

        // Resetear si sube mucho (loop del humo)
        if (p.y < -15) {
            p.y = 0;
            p.x = cupWidth / 2 + (Math.random() * 8 - 4);
        }
    });
}

// =========================
// LÓGICA DEL TIMER
// =========================

function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
}

// =========================
// LÓGICA DEL POMODORO
// =========================

function updateCoffeeLevel() {
    remaining -= 1;

    if (remaining < 0) remaining = 0;

    // Actualizar timer
    timerLabel.textContent = formatTime(remaining);

    if (state === STATE.FOCUS) {
        coffeeLevel = remaining / totalSeconds;

        if (remaining <= 0) {
            // Avisar al backend: focus terminado
            if (window.currentSessionId) {
                finishSession(window.currentSessionId);
            }

            startBreak();
        }
    }


    else if (state === STATE.BREAK) {
        coffeeLevel = 1 - (remaining / totalSeconds);

        // Cuando descanso termina → vuelve a focus
        if (remaining <= 0) {
            startFocus();
        }
    }
}


// =========================
// LOOP PRINCIPAL
// =========================

initSteam();

function loop() {
    // Limpiar pantalla
    ctx.fillStyle = "#111"; // Fondo negro/gris oscuro
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawCupStructure();
    drawCoffee();
    drawHandle(); // El asa se dibuja al final para tapar imperfecciones si las hubiera
    updateAndDrawSteam();

    requestAnimationFrame(loop);
}

loop();

// Reducir el nivel cada 1 segundo (Simulación)
// Nota: En una app real, usa Date.now() para calcular el tiempo real transcurrido
setInterval(updateCoffeeLevel, 1000);