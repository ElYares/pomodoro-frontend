import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const releaseDir = path.join(projectRoot, "release");
const appImageName = "Pomodoro Pixel-0.0.1.AppImage";
const appImagePath = path.join(releaseDir, appImageName);
const unpackedExecutablePath = path.join(releaseDir, "linux-unpacked", "electron");
const iconPath = path.join(projectRoot, "public", "favicon.svg");
const desktopEntryPath = path.join(releaseDir, "Pomodoro Pixel.desktop");
const userApplicationsDir = path.join(process.env.HOME || "", ".local", "share", "applications");
const userDesktopEntryPath = path.join(userApplicationsDir, "pomodoro-pixel.desktop");

function desktopEntry(execPath, iconFile) {
  return `[Desktop Entry]
Version=1.0
Type=Application
Name=Pomodoro Pixel
Comment=Pomodoro desktop app
Exec=${execPath}
Icon=${iconFile}
Terminal=false
Categories=Office;Productivity;
StartupNotify=true
`;
}

async function ensureAppImageExists() {
  await fs.access(appImagePath);
}

async function getExecutablePath() {
  const candidates = await Promise.allSettled([
    fs.stat(appImagePath),
    fs.stat(unpackedExecutablePath),
  ]);

  const available = [];

  if (candidates[0].status === "fulfilled") {
    available.push({
      path: appImagePath,
      mtimeMs: candidates[0].value.mtimeMs,
    });
  }

  if (candidates[1].status === "fulfilled") {
    available.push({
      path: unpackedExecutablePath,
      mtimeMs: candidates[1].value.mtimeMs,
    });
  }

  if (!available.length) {
    throw new Error("No se encontro ningun artefacto desktop en release/.");
  }

  available.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return available[0].path;
}

async function writeReleaseDesktopEntry(execPath) {
  await fs.writeFile(desktopEntryPath, desktopEntry(execPath, iconPath), "utf8");
  await fs.chmod(desktopEntryPath, 0o755);
}

async function installUserDesktopEntry(execPath) {
  await fs.mkdir(userApplicationsDir, { recursive: true });
  await fs.writeFile(userDesktopEntryPath, desktopEntry(execPath, iconPath), "utf8");
  await fs.chmod(userDesktopEntryPath, 0o755);
}

async function main() {
  const shouldInstall = process.argv.includes("--install");
  const execPath = await getExecutablePath();

  if (execPath === appImagePath) {
    await ensureAppImageExists();
  }

  await fs.chmod(execPath, 0o755);
  await writeReleaseDesktopEntry(execPath);

  if (shouldInstall) {
    await installUserDesktopEntry(execPath);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
