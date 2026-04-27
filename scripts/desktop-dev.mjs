import { spawn } from "node:child_process";
import { get as httpGet } from "node:http";
import net from "node:net";
import path from "node:path";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const backendRoot = path.join(projectRoot, "backend");
const sqlitePath = path.join(projectRoot, ".desktop-data", "pomodoro.sqlite");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const electronBinary = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron.cmd" : "electron"
);

const runningChildren = new Set();

function getAvailablePort(preferredPort = 0) {
  const attempt = (port) =>
    new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        const address = server.address();
        const assignedPort = typeof address === "object" && address ? address.port : port;
        server.close(() => resolve(assignedPort));
      });
    });

  if (preferredPort > 0) {
    return attempt(preferredPort).catch(() => attempt(0));
  }

  return attempt(0);
}

function waitForHttp(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = httpGet(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }

        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(probe, 300);
      });

      request.once("error", () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(probe, 300);
      });
    };

    probe();
  });
}

function trackChild(child) {
  runningChildren.add(child);
  child.once("exit", () => {
    runningChildren.delete(child);
  });
  return child;
}

function killChildren() {
  for (const child of runningChildren) {
    if (child.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("exit", killChildren);
process.on("SIGINT", () => {
  killChildren();
  process.exit(130);
});
process.on("SIGTERM", () => {
  killChildren();
  process.exit(143);
});

async function main() {
  await access(electronBinary);

  const frontendPort = await getAvailablePort(4321);
  const backendPort = await getAvailablePort(8080);

  const backend = trackChild(
    spawn(npmCommand, ["run", "dev"], {
      cwd: backendRoot,
      env: {
        ...process.env,
        PORT: String(backendPort),
        HOST: "127.0.0.1",
        POMODORO_DB_DRIVER: "sqlite",
        POMODORO_SQLITE_PATH: sqlitePath,
      },
      stdio: "inherit",
    })
  );

  const frontend = trackChild(
    spawn(npmCommand, ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(frontendPort)], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    })
  );

  const apiBase = `http://127.0.0.1:${backendPort}/api/v1`;
  const frontendUrl = `http://127.0.0.1:${frontendPort}`;

  await Promise.all([
    waitForHttp(`${apiBase}/health`),
    waitForHttp(frontendUrl),
  ]);

  const electron = trackChild(
    spawn(electronBinary, ["."], {
      cwd: projectRoot,
      env: {
        ...process.env,
        POMODORO_API_BASE: apiBase,
        POMODORO_DESKTOP_ENV: "development",
        POMODORO_FRONTEND_URL: frontendUrl,
      },
      stdio: "inherit",
    })
  );

  electron.once("exit", (code) => {
    killChildren();
    process.exit(code ?? 0);
  });

  backend.once("exit", (code) => {
    if (electron.exitCode === null) {
      console.error(`Backend exited early with code ${code ?? "unknown"}.`);
      killChildren();
      process.exit(code ?? 1);
    }
  });

  frontend.once("exit", (code) => {
    if (electron.exitCode === null) {
      console.error(`Frontend exited early with code ${code ?? "unknown"}.`);
      killChildren();
      process.exit(code ?? 1);
    }
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  killChildren();
  process.exit(1);
});
