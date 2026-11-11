import { spawn } from "node:child_process";

const children = [];

function launch(name, command, args) {
  const proc = spawn(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  proc.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
    }
  });
  children.push(proc);
  return proc;
}

launch("storage-server", process.execPath, ["storage-server/server.mjs"]);
launch("next-web", process.platform === "win32" ? "npx.cmd" : "npx", [
  "next",
  "dev",
  "--hostname",
  "127.0.0.1",
  "--port",
  "5203",
]);

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
