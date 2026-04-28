import { spawn } from "node:child_process";
import { createServer as createHttpServer, get as httpGet } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const preloadPath = path.join(__dirname, "preload.cjs");
const managedChildren = new Set();
let managedStaticServer = null;
let desktopRuntime = null;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function resolveAppPath(...segments) {
  return path.join(app.getAppPath(), ...segments);
}

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

function waitForHttp(url, timeoutMs = 30000) {
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

async function startStaticServer(rootDir, preferredPort) {
  const server = createHttpServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      let relativePath = decodeURIComponent(requestUrl.pathname);

      if (relativePath.endsWith("/")) {
        relativePath = `${relativePath}index.html`;
      }

      let filePath = path.resolve(rootDir, `.${relativePath}`);
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403).end("Forbidden");
        return;
      }

      try {
        const fileStat = await stat(filePath);
        if (fileStat.isDirectory()) {
          filePath = path.join(filePath, "index.html");
        }
      } catch {
        if (!path.extname(filePath)) {
          filePath = path.resolve(rootDir, `.${relativePath}`, "index.html");
        }
      }

      const finalStat = await stat(filePath);
      if (!finalStat.isFile()) {
        throw new Error("Not a file");
      }

      res.setHeader("Content-Type", MIME_TYPES[path.extname(filePath)] || "application/octet-stream");
      createReadStream(filePath).pipe(res);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });

  const port = await getAvailablePort(preferredPort);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

function pipeChildLogs(child, label) {
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });

  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });
}

async function startManagedBackend(preferredPort) {
  const backendPort = await getAvailablePort(preferredPort);
  const backendScript = resolveAppPath("backend", "src", "server.js");
  const backendCwd = resolveAppPath("backend");
  const sqlitePath = path.join(app.getPath("userData"), "data", "pomodoro.sqlite");

  const backend = spawn(process.execPath, [backendScript], {
    cwd: backendCwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(backendPort),
      HOST: "127.0.0.1",
      POMODORO_DB_DRIVER: "sqlite",
      POMODORO_SQLITE_PATH: sqlitePath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  managedChildren.add(backend);
  pipeChildLogs(backend, "backend");

  backend.once("exit", () => {
    managedChildren.delete(backend);
  });

  const healthUrl = `http://127.0.0.1:${backendPort}/api/v1/health`;
  await waitForHttp(healthUrl, 45000);

  return {
    apiBase: `http://127.0.0.1:${backendPort}/api/v1`,
  };
}

async function resolveDesktopRuntime() {
  if (process.env.POMODORO_FRONTEND_URL) {
    return {
      frontendUrl: process.env.POMODORO_FRONTEND_URL,
      apiBase: process.env.POMODORO_API_BASE || "http://127.0.0.1:8080/api/v1",
    };
  }

  const distDir = resolveAppPath("dist");
  try {
    await stat(distDir);
  } catch {
    throw new Error("No existe dist/. Ejecuta `npm run build` antes de abrir la app desktop.");
  }

  const [frontendPort, backendRuntime] = await Promise.all([
    getAvailablePort(4321),
    startManagedBackend(8080),
  ]);

  const staticServer = await startStaticServer(distDir, frontendPort);
  managedStaticServer = staticServer;

  return {
    frontendUrl: staticServer.url,
    apiBase: backendRuntime.apiBase,
  };
}

async function createMainWindow(runtime) {
  process.env.POMODORO_API_BASE = runtime.apiBase;
  process.env.POMODORO_DESKTOP_ENV = process.env.POMODORO_DESKTOP_ENV || "desktop";

  const window = new BrowserWindow({
    width: 1320,
    height: 920,
    minWidth: 720,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: "#101010",
    title: "Pomodoro Pixel Desktop",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  await window.loadURL(runtime.frontendUrl);
  return window;
}

async function stopManagedRuntime() {
  const staticServer = managedStaticServer;
  managedStaticServer = null;

  if (staticServer) {
    await staticServer.close().catch(() => {});
  }

  for (const child of managedChildren) {
    if (child.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
    }
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void stopManagedRuntime();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0 && desktopRuntime) {
    await createMainWindow(desktopRuntime);
  }
});

app.whenReady().then(async () => {
  try {
    desktopRuntime = await resolveDesktopRuntime();
    await createMainWindow(desktopRuntime);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar la app desktop.";
    dialog.showErrorBox("Desktop bootstrap failed", message);
    await stopManagedRuntime();
    app.quit();
  }
});
