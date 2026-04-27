import path from "node:path";

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  host: process.env.HOST || "0.0.0.0",
  port: toInt(process.env.PORT, 8080),
  storage: {
    driver: process.env.POMODORO_DB_DRIVER || "postgres",
    sqlitePath: path.resolve(
      process.env.POMODORO_SQLITE_PATH || path.join(process.cwd(), ".data", "pomodoro.sqlite")
    ),
  },
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: toInt(process.env.DB_PORT, 5432),
    database: process.env.DB_NAME || "pomodoro",
    user: process.env.DB_USER || "pomodoro",
    password: process.env.DB_PASSWORD || "pomodoro",
  },
  pomodoro: {
    focusMinutes: toInt(process.env.POMODORO_FOCUS_MINUTES, 25),
    shortBreakMinutes: toInt(process.env.POMODORO_SHORT_BREAK_MINUTES, 5),
    longBreakMinutes: toInt(process.env.POMODORO_LONG_BREAK_MINUTES, 15),
    pomodorosPerCycle: toInt(process.env.POMODORO_PER_CYCLE, 4),
  },
  defaultUserId: process.env.DEFAULT_USER_ID || "123",
};
