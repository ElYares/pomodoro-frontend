import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import pg from "pg";
import initSqlJs from "sql.js";
import { config } from "./config.js";

const { Pool } = pg;
const require = createRequire(import.meta.url);
const SQLITE_MUTATION_REGEX = /^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE|PRAGMA)\b/i;
const SQLITE_ANY_TOKEN_REGEX = /__ANY_(\d+)__|\$(\d+)/g;

export const pool = config.storage.driver === "postgres" ? new Pool(config.db) : null;

let driverPromise = null;

function normalizeSqliteValue(value) {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return value;
}

function normalizeSqlForSqlite(text, params = []) {
  let sql = String(text || "")
    .trim()
    .replace(/\bNOW\(\)/gi, "CURRENT_TIMESTAMP")
    .replace(/=\s*ANY\(\$(\d+)(?:::[^)]+)?\)/gi, (_match, index) => `IN (__ANY_${index}__)`)
    .replace(/::text\[\]/gi, "");

  const boundParams = [];

  sql = sql.replace(SQLITE_ANY_TOKEN_REGEX, (_match, anyIndex, scalarIndex) => {
    const rawIndex = Number(anyIndex ?? scalarIndex) - 1;
    const rawValue = params[rawIndex];

    if (anyIndex) {
      const values = Array.isArray(rawValue) ? rawValue : [rawValue];
      if (!values.length) {
        return "NULL";
      }

      boundParams.push(...values.map(normalizeSqliteValue));
      return values.map(() => "?").join(", ");
    }

    boundParams.push(normalizeSqliteValue(rawValue));
    return "?";
  });

  return {
    sql,
    boundParams,
  };
}

async function createPostgresDriver() {
  return {
    query(text, params = []) {
      return pool.query(text, params);
    },

    async withTransaction(callback) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await callback(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

async function createSqliteDriver() {
  const SQL = await initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`),
  });

  await fs.mkdir(path.dirname(config.storage.sqlitePath), { recursive: true });

  let db;

  try {
    const fileBuffer = await fs.readFile(config.storage.sqlitePath);
    db = new SQL.Database(new Uint8Array(fileBuffer));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    db = new SQL.Database();
  }

  db.run("PRAGMA foreign_keys = ON;");

  let inTransaction = false;
  let hasPendingChanges = false;

  const persist = async () => {
    const data = db.export();
    await fs.writeFile(config.storage.sqlitePath, Buffer.from(data));
    hasPendingChanges = false;
  };

  const execute = async (text, params = []) => {
    const { sql, boundParams } = normalizeSqlForSqlite(text, params);
    const trimmedSql = sql.trim();
    const isSelect = /^(SELECT|WITH)\b/i.test(trimmedSql);
    const hasReturning = /\bRETURNING\b/i.test(trimmedSql);
    const isMutation = SQLITE_MUTATION_REGEX.test(trimmedSql);

    let rows = [];
    let rowCount = 0;

    if (isSelect || hasReturning) {
      const statement = db.prepare(sql);
      try {
        statement.bind(boundParams);
        while (statement.step()) {
          rows.push(statement.getAsObject());
        }
      } finally {
        statement.free();
      }

      rowCount = rows.length;
    } else {
      db.run(sql, boundParams);
      rowCount = db.getRowsModified();
    }

    if (isMutation) {
      hasPendingChanges = true;
      if (!inTransaction) {
        await persist();
      }
    }

    return {
      rows,
      rowCount,
    };
  };

  return {
    query(text, params = []) {
      return execute(text, params);
    },

    async withTransaction(callback) {
      if (inTransaction) {
        throw new Error("Nested sqlite transactions are not supported");
      }

      inTransaction = true;
      db.run("BEGIN");

      try {
        const result = await callback({
          query: (text, params = []) => execute(text, params),
        });

        db.run("COMMIT");
        inTransaction = false;

        if (hasPendingChanges) {
          await persist();
        }

        return result;
      } catch (error) {
        db.run("ROLLBACK");
        inTransaction = false;
        hasPendingChanges = false;
        throw error;
      }
    },
  };
}

async function getDriver() {
  if (!driverPromise) {
    driverPromise =
      config.storage.driver === "sqlite" ? createSqliteDriver() : createPostgresDriver();
  }

  return driverPromise;
}

export async function query(text, params = []) {
  const driver = await getDriver();
  return driver.query(text, params);
}

export async function withTransaction(callback) {
  const driver = await getDriver();
  return driver.withTransaction(callback);
}
