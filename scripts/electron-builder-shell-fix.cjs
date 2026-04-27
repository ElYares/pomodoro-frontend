"use strict";

const childProcess = require("node:child_process");

const originalSpawn = childProcess.spawn;

childProcess.spawn = function patchedSpawn(command, args, options) {
  if (options && options.shell === true && typeof command === "string" && command === "npm") {
    return originalSpawn.call(this, command, args, {
      ...options,
      shell: false,
    });
  }

  return originalSpawn.call(this, command, args, options);
};
