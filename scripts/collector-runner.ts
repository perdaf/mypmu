import { spawn } from "node:child_process";

export function currentPmuDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("day")}${value("month")}${value("year")}`;
}

export function runCollector(date: string, activeOnly = false, options: { signal?: AbortSignal; env?: Record<string, string | undefined>; quinteOnly?: boolean; refreshOnly?: boolean } = {}) {
  return new Promise<void>((resolve, reject) => {
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const argumentsList = ["run", "collect", "--", date, ...(activeOnly ? ["--active"] : []), ...(options.quinteOnly ? ["--quinte"] : []), ...(options.refreshOnly ? ["--refresh"] : [])];
    const child = spawn(command, argumentsList, { cwd: process.cwd(), stdio: "inherit", signal: options.signal, env: { ...process.env, ...options.env } });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Le collecteur s’est arrêté avec le code ${code}.`)));
  });
}
