/**
 * Mock de un pomodoro de 25 minutos.
 * Más adelante este archivo será reemplazado por llamadas al backend Go.
 */
function getMockSession() {
    return {
        focus_duration: 60,     // 1 minuto para pruebas
        break_duration: 15,     // 15 segundos de descanso (ejemplo)
        state: "focus",         // Estado inicial
        remaining_seconds: 60
    };
}
