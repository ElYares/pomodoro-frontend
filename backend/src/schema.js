import { config } from "./config.js";
import { query } from "./db.js";

async function ensurePostgresSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'User',
      email TEXT UNIQUE,
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email TEXT;
  `);

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_hash TEXT;
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON users(email)
    WHERE email IS NOT NULL;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      project_id TEXT NOT NULL DEFAULT 'general',
      status TEXT NOT NULL DEFAULT 'PENDING',
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      pomodoros_completed INTEGER NOT NULL DEFAULT 0,
      total_focus_minutes INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS pomodoro_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      cycle_number INTEGER NOT NULL,
      pomodoro_index INTEGER NOT NULL,
      focus_minutes INTEGER NOT NULL,
      break_minutes INTEGER NOT NULL,
      remaining_seconds INTEGER NOT NULL DEFAULT 0,
      last_started_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paused_at TIMESTAMPTZ,
      resumed_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    ALTER TABLE pomodoro_sessions
    ADD COLUMN IF NOT EXISTS remaining_seconds INTEGER NOT NULL DEFAULT 0;
  `);

  await query(`
    ALTER TABLE pomodoro_sessions
    ADD COLUMN IF NOT EXISTS last_started_at TIMESTAMPTZ;
  `);

  await query(`
    UPDATE pomodoro_sessions
    SET remaining_seconds = focus_minutes * 60
    WHERE remaining_seconds = 0 AND status IN ('STARTED', 'PAUSED');
  `);

  await query(`
    UPDATE pomodoro_sessions
    SET last_started_at = COALESCE(last_started_at, resumed_at, started_at)
    WHERE status = 'STARTED' AND last_started_at IS NULL;
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_user_id
    ON tasks(user_id);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user_status
    ON pomodoro_sessions(user_id, status);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id
    ON auth_tokens(user_id);
  `);

  await query(
    `
      INSERT INTO users (id, name)
      VALUES ($1, $2)
      ON CONFLICT (id) DO NOTHING;
    `,
    [config.defaultUserId, "Demo User"]
  );
}

async function ensureSqliteSchema() {
  await query("PRAGMA foreign_keys = ON;");

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'User',
      email TEXT UNIQUE,
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON users(email)
    WHERE email IS NOT NULL;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      project_id TEXT NOT NULL DEFAULT 'general',
      status TEXT NOT NULL DEFAULT 'PENDING',
      completed INTEGER NOT NULL DEFAULT 0,
      pomodoros_completed INTEGER NOT NULL DEFAULT 0,
      total_focus_minutes INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS pomodoro_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      cycle_number INTEGER NOT NULL,
      pomodoro_index INTEGER NOT NULL,
      focus_minutes INTEGER NOT NULL,
      break_minutes INTEGER NOT NULL,
      remaining_seconds INTEGER NOT NULL DEFAULT 0,
      last_started_at TEXT,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paused_at TEXT,
      resumed_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    UPDATE pomodoro_sessions
    SET remaining_seconds = focus_minutes * 60
    WHERE remaining_seconds = 0 AND status IN ('STARTED', 'PAUSED');
  `);

  await query(`
    UPDATE pomodoro_sessions
    SET last_started_at = COALESCE(last_started_at, resumed_at, started_at)
    WHERE status = 'STARTED' AND last_started_at IS NULL;
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_user_id
    ON tasks(user_id);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user_status
    ON pomodoro_sessions(user_id, status);
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id
    ON auth_tokens(user_id);
  `);

  await query(
    `
      INSERT OR IGNORE INTO users (id, name)
      VALUES ($1, $2);
    `,
    [config.defaultUserId, "Demo User"]
  );
}

export async function ensureSchema() {
  if (config.storage.driver === "sqlite") {
    return ensureSqliteSchema();
  }

  return ensurePostgresSchema();
}
