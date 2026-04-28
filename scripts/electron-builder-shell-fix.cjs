"use strict";

const childProcess = require("node:child_process");
const path = require("node:path");

const originalSpawn = childProcess.spawn;

function isNpmCommand(command) {
  if (typeof command !== "string" || command.length === 0) {
    return false;
  }

  const base = path.basename(command, path.extname(command)).toLowerCase();
  return base === "npm";
}

childProcess.spawn = function patchedSpawn(command, args, options) {
  if (options && options.shell === true && isNpmCommand(command)) {
    return originalSpawn.call(this, command, args, {
      ...options,
      shell: false,
    });
  }

  return originalSpawn.call(this, command, args, options);
};

try {
  const { Lazy } = require("lazy-val");
  const collectorIndex = require("app-builder-lib/out/node-module-collector");
  const originalDeterminePackageManagerEnv = collectorIndex.determinePackageManagerEnv;

  collectorIndex.determinePackageManagerEnv = function patchedDeterminePackageManagerEnv(args) {
    const lazy = originalDeterminePackageManagerEnv(args);

    return new Lazy(async () => {
      const resolved = await lazy.value;
      if (resolved?.pm === collectorIndex.PM.NPM) {
        return {
          ...resolved,
          pm: collectorIndex.PM.TRAVERSAL,
        };
      }
      return resolved;
    });
  };

  const nodeModulesCollectorPath = require.resolve(
    "app-builder-lib/out/node-module-collector/nodeModulesCollector.js"
  );
  const { NodeModulesCollector } = require(nodeModulesCollectorPath);

  NodeModulesCollector.prototype.streamCollectorCommandToFile = async function patchedCollector(
    command,
    args,
    cwd,
    tempOutputFile
  ) {
    const fsExtra = require("fs-extra");
    const { createWriteStream } = require("fs-extra");

    await new Promise((resolve, reject) => {
      const outStream = createWriteStream(tempOutputFile);
      const child = childProcess.spawn(command, args, {
        cwd,
        env: { COREPACK_ENABLE_STRICT: "0", ...process.env },
        shell: isNpmCommand(command) ? false : true,
      });

      let stderr = "";

      child.stdout.pipe(outStream);
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        reject(new Error(`Node module collector spawn failed: ${error.message}`));
      });
      child.on("close", (code) => {
        outStream.close();
        const shouldIgnore = code === 1 && isNpmCommand(command) && args.includes("list");

        if (shouldIgnore) {
          resolve();
          return;
        }

        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`Node module collector process exited with code ${code}:\n${stderr}`));
      });
    });
  };
} catch (_error) {
  // Si electron-builder cambia sus rutas internas, dejamos vivo al parche de spawn como fallback.
}
