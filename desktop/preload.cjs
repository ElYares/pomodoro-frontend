const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("pomodoroDesktop", {
  apiBase: process.env.POMODORO_API_BASE || null,
  environment: process.env.POMODORO_DESKTOP_ENV || "desktop",
  isDesktop: true,
});
