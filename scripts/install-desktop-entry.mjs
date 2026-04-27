import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const releaseDir = path.join(projectRoot, "release");
const appImageName = "Pomodoro Pixel-0.0.1.AppImage";
const appImagePath = path.join(releaseDir, appImageName);
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

async function writeReleaseDesktopEntry() {
  await fs.writeFile(desktopEntryPath, desktopEntry(appImagePath, iconPath), "utf8");
  await fs.chmod(desktopEntryPath, 0o755);
}

async function installUserDesktopEntry() {
  await fs.mkdir(userApplicationsDir, { recursive: true });
  await fs.writeFile(userDesktopEntryPath, desktopEntry(appImagePath, iconPath), "utf8");
  await fs.chmod(userDesktopEntryPath, 0o755);
}

async function main() {
  const shouldInstall = process.argv.includes("--install");

  await ensureAppImageExists();
  await fs.chmod(appImagePath, 0o755);
  await writeReleaseDesktopEntry();

  if (shouldInstall) {
    await installUserDesktopEntry();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
