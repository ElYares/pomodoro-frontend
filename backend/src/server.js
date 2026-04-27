import crypto from "node:crypto";
import cors from "cors";
import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import { config } from "./config.js";
import { query, withTransaction } from "./db.js";
import { parseTasksFromMarkdown } from "./markdown.js";
import { calculateCycleProgress, calculateNextPomodoro } from "./pomodoro.js";
import { ensureSchema } from "./schema.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const ACTIVE_SESSION_STATUSES = ["STARTED", "PAUSED"];

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) {
    return false;
  }

  const [salt, storedDerived] = storedHash.split(":");
  if (!salt || !storedDerived) {
    return false;
  }

  const inputDerived = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(storedDerived, "hex"), Buffer.from(inputDerived, "hex"));
}

function issueToken() {
  return crypto.randomBytes(32).toString("hex");
}

function normalizeTimestamp(value) {
  if (typeof value !== "string") {
    return value;
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value)) {
    return `${value.replace(" ", "T")}Z`;
  }

  return value;
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === "1";
}

function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    created_at: normalizeTimestamp(row.created_at),
  };
}

function mapTask(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    description: row.description,
    project_id: row.project_id,
    status: row.status,
    completed: normalizeBoolean(row.completed),
    pomodoros_completed: row.pomodoros_completed,
    total_focus_minutes: row.total_focus_minutes,
    created_at: normalizeTimestamp(row.created_at),
    updated_at: normalizeTimestamp(row.updated_at),
  };
}

function computeRemainingSeconds(row) {
  if (row.status !== "STARTED") {
    return row.remaining_seconds;
  }

  if (!row.last_started_at) {
    return row.remaining_seconds;
  }

  const lastStartedAt = normalizeTimestamp(row.last_started_at);
  const elapsed = Math.floor((Date.now() - new Date(lastStartedAt).getTime()) / 1000);
  return Math.max(row.remaining_seconds - elapsed, 0);
}

function mapSession(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    task_id: row.task_id,
    status: row.status,
    cycle_number: row.cycle_number,
    pomodoro_index: row.pomodoro_index,
    focus_minutes: row.focus_minutes,
    break_minutes: row.break_minutes,
    remaining_seconds: computeRemainingSeconds(row),
    started_at: normalizeTimestamp(row.started_at),
    last_started_at: normalizeTimestamp(row.last_started_at),
    paused_at: normalizeTimestamp(row.paused_at),
    resumed_at: normalizeTimestamp(row.resumed_at),
    finished_at: normalizeTimestamp(row.finished_at),
    created_at: normalizeTimestamp(row.created_at),
    updated_at: normalizeTimestamp(row.updated_at),
  };
}

async function getTaskById(taskId, client = null) {
  const executor = client ?? { query };
  const result = await executor.query(
    `
      SELECT *
      FROM tasks
      WHERE id = $1
      LIMIT 1;
    `,
    [taskId]
  );
  return result.rows[0] || null;
}

async function getUserByEmail(email, client = null) {
  const executor = client ?? { query };
  const result = await executor.query(
    `
      SELECT *
      FROM users
      WHERE email = $1
      LIMIT 1;
    `,
    [email]
  );
  return result.rows[0] || null;
}

async function createAuthToken(userId, client = null) {
  const executor = client ?? { query };
  const token = issueToken();
  await executor.query(
    `
      INSERT INTO auth_tokens (token, user_id)
      VALUES ($1, $2);
    `,
    [token, userId]
  );
  return token;
}

async function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [, token] = authHeader.match(/^Bearer (.+)$/i) || [];

  if (!token) {
    return sendError(res, 401, "authorization token is required");
  }

  const result = await query(
    `
      SELECT u.*
      FROM auth_tokens t
      JOIN users u ON u.id = t.user_id
      WHERE t.token = $1
      LIMIT 1;
    `,
    [token]
  );

  if (!result.rowCount) {
    return sendError(res, 401, "invalid auth token");
  }

  req.authUser = result.rows[0];
  req.authToken = token;
  next();
}

app.get("/api/v1/health", async (_req, res) => {
  const dbResult = await query("SELECT CURRENT_TIMESTAMP AS now");
  res.json({ ok: true, now: dbResult.rows[0].now });
});

app.post("/api/v1/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    return sendError(res, 400, "name, email and password are required");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await getUserByEmail(normalizedEmail);
  if (existingUser) {
    return sendError(res, 409, "email is already registered");
  }

  const payload = await withTransaction(async (client) => {
    const userId = uuidv4();
    const passwordHash = hashPassword(password.trim());

    const userResult = await client.query(
      `
        INSERT INTO users (id, name, email, password_hash)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `,
      [userId, name.trim(), normalizedEmail, passwordHash]
    );

    const token = await createAuthToken(userId, client);
    return {
      token,
      user: mapUser(userResult.rows[0]),
    };
  });

  res.status(201).json(payload);
});

app.post("/api/v1/auth/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email?.trim() || !password?.trim()) {
    return sendError(res, 400, "email and password are required");
  }

  const user = await getUserByEmail(email.trim().toLowerCase());
  if (!user || !verifyPassword(password.trim(), user.password_hash)) {
    return sendError(res, 401, "invalid credentials");
  }

  const token = await createAuthToken(user.id);
  res.json({
    token,
    user: mapUser(user),
  });
});

app.get("/api/v1/auth/me", authRequired, async (req, res) => {
  res.json({ user: mapUser(req.authUser) });
});

app.post("/api/v1/auth/logout", authRequired, async (req, res) => {
  await query(
    `
      DELETE FROM auth_tokens
      WHERE token = $1;
    `,
    [req.authToken]
  );

  res.json({ ok: true });
});

app.get("/api/v1/tasks/user/:userId", authRequired, async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.authUser.id) {
    return sendError(res, 403, "forbidden");
  }

  const result = await query(
    `
      SELECT *
      FROM tasks
      WHERE user_id = $1
      ORDER BY completed ASC, updated_at DESC, created_at DESC;
    `,
    [userId]
  );

  res.json(result.rows.map(mapTask));
});

app.post("/api/v1/tasks", authRequired, async (req, res) => {
  const {
    title,
    description = "",
    project_id: projectId = "general",
  } = req.body || {};

  if (!title?.trim()) {
    return sendError(res, 400, "title is required");
  }

  const taskId = uuidv4();
  const result = await query(
    `
      INSERT INTO tasks (
        id, user_id, title, description, project_id, status, completed
      )
      VALUES ($1, $2, $3, $4, $5, 'PENDING', FALSE)
      RETURNING *;
    `,
    [taskId, req.authUser.id, title.trim(), description.trim(), projectId.trim() || "general"]
  );

  res.status(201).json(mapTask(result.rows[0]));
});

app.put("/api/v1/tasks/:id", authRequired, async (req, res) => {
  const { id } = req.params;
  const {
    title,
    description = "",
    project_id: projectId = "general",
    status,
    completed,
  } = req.body || {};

  const existingTask = await getTaskById(id);
  if (!existingTask || existingTask.user_id !== req.authUser.id) {
    return sendError(res, 404, "task not found");
  }

  const nextCompleted = typeof completed === "boolean" ? completed : existingTask.completed;
  const nextStatus = nextCompleted ? "COMPLETED" : status || existingTask.status;

  const result = await query(
    `
      UPDATE tasks
      SET
        title = $2,
        description = $3,
        project_id = $4,
        status = $5,
        completed = $6,
        completed_at = CASE WHEN $6 THEN COALESCE(completed_at, NOW()) ELSE NULL END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `,
    [
      id,
      (title ?? existingTask.title).trim(),
      (description ?? existingTask.description).trim(),
      (projectId ?? existingTask.project_id).trim() || "general",
      nextStatus,
      nextCompleted,
    ]
  );

  res.json(mapTask(result.rows[0]));
});

app.delete("/api/v1/tasks/:id", authRequired, async (req, res) => {
  const { id } = req.params;
  const result = await query(
    `
      DELETE FROM tasks
      WHERE id = $1
        AND user_id = $2
      RETURNING id;
    `,
    [id, req.authUser.id]
  );

  if (!result.rowCount) {
    return sendError(res, 404, "task not found");
  }

  res.json({ ok: true, id });
});

app.patch("/api/v1/tasks/:id/complete", authRequired, async (req, res) => {
  const { id } = req.params;
  const result = await query(
    `
      UPDATE tasks
      SET
        status = 'COMPLETED',
        completed = TRUE,
        completed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND user_id = $2
      RETURNING *;
    `,
    [id, req.authUser.id]
  );

  if (!result.rowCount) {
    return sendError(res, 404, "task not found");
  }

  res.json(mapTask(result.rows[0]));
});

app.post("/api/v1/tasks/import-markdown", authRequired, upload.single("file"), async (req, res) => {
  const defaultProject = (req.body?.project_id || "general").trim();
  const rawMarkdown = req.file
    ? req.file.buffer.toString("utf8")
    : req.body?.markdown || "";

  if (!rawMarkdown.trim()) {
    return sendError(res, 400, "markdown content is required");
  }

  const parsedTasks = parseTasksFromMarkdown(rawMarkdown, defaultProject);
  if (!parsedTasks.length) {
    return sendError(res, 400, "no checklist tasks were found in the markdown");
  }

  const insertedTasks = await withTransaction(async (client) => {
    const created = [];

    for (const task of parsedTasks) {
      const result = await client.query(
        `
          INSERT INTO tasks (
            id, user_id, title, description, project_id, status, completed, completed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7 THEN NOW() ELSE NULL END)
          RETURNING *;
        `,
        [
          uuidv4(),
          req.authUser.id,
          task.title,
          task.description,
          task.project_id,
          task.status,
          task.completed,
        ]
      );

      created.push(mapTask(result.rows[0]));
    }

    return created;
  });

  res.status(201).json({
    imported: insertedTasks.length,
    tasks: insertedTasks,
  });
});

app.get("/api/v1/sessions/active/:userId", authRequired, async (req, res) => {
  const { userId } = req.params;
  if (userId !== req.authUser.id) {
    return sendError(res, 403, "forbidden");
  }

  const result = await query(
    `
      SELECT s.*, t.title AS task_title, t.project_id AS task_project_id
      FROM pomodoro_sessions s
      JOIN tasks t ON t.id = s.task_id
      WHERE s.user_id = $1
        AND s.status = ANY($2::text[])
      ORDER BY s.created_at DESC
      LIMIT 1;
    `,
    [userId, ACTIVE_SESSION_STATUSES]
  );

  if (!result.rowCount) {
    return res.json(null);
  }

  const session = mapSession(result.rows[0]);
  res.json({
    ...session,
    task: {
      id: result.rows[0].task_id,
      title: result.rows[0].task_title,
      project_id: result.rows[0].task_project_id,
    },
  });
});

app.post("/api/v1/sessions", authRequired, async (req, res) => {
  const { task_id: taskId } = req.body || {};

  if (!taskId?.trim()) {
    return sendError(res, 400, "task_id is required");
  }

  const session = await withTransaction(async (client) => {
    const task = await getTaskById(taskId, client);
    if (!task || task.user_id !== req.authUser.id) {
      return { status: 404, payload: { error: "task not found" } };
    }

    const activeSession = await client.query(
      `
        SELECT id
        FROM pomodoro_sessions
        WHERE user_id = $1
          AND status = ANY($2::text[])
        ORDER BY created_at DESC
        LIMIT 1;
      `,
      [req.authUser.id, ACTIVE_SESSION_STATUSES]
    );

    if (activeSession.rowCount) {
      return { status: 409, payload: { error: "user already has an active session" } };
    }

    const pomodoroInfo = calculateNextPomodoro(
      task.pomodoros_completed,
      config.pomodoro.pomodorosPerCycle,
      config.pomodoro.shortBreakMinutes,
      config.pomodoro.longBreakMinutes
    );

    const focusSeconds = config.pomodoro.focusMinutes * 60;
    const sessionResult = await client.query(
      `
        INSERT INTO pomodoro_sessions (
          id, user_id, task_id, status, cycle_number, pomodoro_index, focus_minutes, break_minutes,
          remaining_seconds, last_started_at
        )
        VALUES ($1, $2, $3, 'STARTED', $4, $5, $6, $7, $8, NOW())
        RETURNING *;
      `,
      [
        uuidv4(),
        req.authUser.id,
        taskId,
        pomodoroInfo.cycleNumber,
        pomodoroInfo.indexInCycle,
        config.pomodoro.focusMinutes,
        pomodoroInfo.breakMinutes,
        focusSeconds,
      ]
    );

    await client.query(
      `
        UPDATE tasks
        SET status = 'IN_PROGRESS', updated_at = NOW()
        WHERE id = $1;
      `,
      [taskId]
    );

    return { status: 201, payload: mapSession(sessionResult.rows[0]) };
  });

  res.status(session.status).json(session.payload);
});

app.patch("/api/v1/sessions/:id/pause", authRequired, async (req, res) => {
  const { id } = req.params;
  const remainingSeconds = Math.max(Number.parseInt(req.body?.remaining_seconds ?? "", 10) || 0, 0);

  const result = await withTransaction(async (client) => {
    const sessionResult = await client.query(
      `
        UPDATE pomodoro_sessions
        SET
          status = 'PAUSED',
          paused_at = NOW(),
          remaining_seconds = $2,
          last_started_at = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND user_id = $3
          AND status = 'STARTED'
        RETURNING *;
      `,
      [id, remainingSeconds, req.authUser.id]
    );

    if (!sessionResult.rowCount) {
      return { status: 404, payload: { error: "active session not found" } };
    }

    await client.query(
      `
        UPDATE tasks
        SET status = 'PAUSED', updated_at = NOW()
        WHERE id = $1;
      `,
      [sessionResult.rows[0].task_id]
    );

    return { status: 200, payload: mapSession(sessionResult.rows[0]) };
  });

  res.status(result.status).json(result.payload);
});

app.patch("/api/v1/sessions/:id/resume", authRequired, async (req, res) => {
  const { id } = req.params;

  const result = await withTransaction(async (client) => {
    const sessionResult = await client.query(
      `
        UPDATE pomodoro_sessions
        SET
          status = 'STARTED',
          resumed_at = NOW(),
          last_started_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
          AND status = 'PAUSED'
        RETURNING *;
      `,
      [id, req.authUser.id]
    );

    if (!sessionResult.rowCount) {
      return { status: 404, payload: { error: "paused session not found" } };
    }

    await client.query(
      `
        UPDATE tasks
        SET status = 'IN_PROGRESS', updated_at = NOW()
        WHERE id = $1;
      `,
      [sessionResult.rows[0].task_id]
    );

    return { status: 200, payload: mapSession(sessionResult.rows[0]) };
  });

  res.status(result.status).json(result.payload);
});

app.patch("/api/v1/sessions/:id/finish", authRequired, async (req, res) => {
  const { id } = req.params;

  const result = await withTransaction(async (client) => {
    const sessionResult = await client.query(
      `
        UPDATE pomodoro_sessions
        SET
          status = 'FINISHED',
          finished_at = NOW(),
          remaining_seconds = 0,
          last_started_at = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
          AND status = ANY($3::text[])
        RETURNING *;
      `,
      [id, req.authUser.id, ACTIVE_SESSION_STATUSES]
    );

    if (!sessionResult.rowCount) {
      return { status: 404, payload: { error: "session not found" } };
    }

    const session = sessionResult.rows[0];
    const taskResult = await client.query(
      `
        UPDATE tasks
        SET
          pomodoros_completed = pomodoros_completed + 1,
          total_focus_minutes = total_focus_minutes + $2,
          status = CASE WHEN completed THEN 'COMPLETED' ELSE 'IN_PROGRESS' END,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `,
      [session.task_id, session.focus_minutes]
    );

    const task = taskResult.rows[0];
    const progress = calculateCycleProgress(
      task.pomodoros_completed,
      config.pomodoro.pomodorosPerCycle,
      config.pomodoro.shortBreakMinutes,
      config.pomodoro.longBreakMinutes
    );

    return {
      status: 200,
      payload: {
        session: mapSession(session),
        total_pomodoros: progress.totalPomodoros,
        index_in_cycle: progress.indexInCycle,
        cycles_done: progress.cyclesDone,
        next_break_minutes: progress.nextBreakMinutes,
        is_cycle_end: progress.isCycleEnd,
      },
    };
  });

  res.status(result.status).json(result.payload);
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "internal server error" });
});

async function bootstrap(retries = 10) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await ensureSchema();
      app.listen(config.port, config.host, () => {
        console.log(`Pomodoro backend listening on ${config.host}:${config.port}`);
      });
      return;
    } catch (error) {
      console.error(`Database bootstrap failed (attempt ${attempt}/${retries})`, error.message);
      if (attempt === retries) {
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

await bootstrap();
