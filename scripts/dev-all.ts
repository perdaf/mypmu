import { spawn, type ChildProcess } from "node:child_process";

const command = process.platform === "win32" ? "npm.cmd" : "npm";
const children: ChildProcess[] = [];
let stopping = false;

function start(script: string) {
  const child = spawn(command, ["run", script], { cwd: process.cwd(), stdio: "inherit" });
  children.push(child);
  child.once("error", (error) => console.error(`Impossible de démarrer ${script} :`, error));
  child.once("exit", (code, signal) => {
    if (!stopping) console.error(`${script} s'est arrêté (${signal ?? `code ${code}`}).`);
    if (script === "dev" && !stopping) shutdown(code ?? 1);
  });
}

function shutdown(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null && child.pid) child.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 1_000).unref();
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

console.log("Démarrage de MyPMU et de la surveillance Quinté+…");
start("dev");
start("collect:quinte:watch");
