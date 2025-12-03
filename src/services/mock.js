/**
 * Mock de un pomodoro de 25 minutos.
 * Más adelante este archivo será reemplazado por llamadas al backend Go.
 */
export function getMockSession() {
    return {
        id: "mock123",
        duration_seconds: 60,      // total = 1 minuto
        remaining_seconds: 60,     // arranca en 1 minuto
        status: "running"
    };
}
