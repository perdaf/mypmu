import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { readCollectorStatus, updateCollectorStatus } from "@/lib/collector-status";

export const runtime = "nodejs";

export function POST() {
  const current = readCollectorStatus();
  const recentlyStarted = ["starting", "collecting"].includes(current.status)
    && Date.now() - new Date(current.updatedAt).getTime() < 10 * 60_000;
  if (recentlyStarted) return NextResponse.json({ message: "Une collecte est déjà en cours." }, { status: 409 });

  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(command, ["run", "collect:quinte"], {
    cwd: process.cwd(), detached: false, stdio: "ignore",
  });
  child.once("error", (error) => updateCollectorStatus({
    status: "error", errorKind: "unknown", errorMessage: error.message, processId: null,
  }));
  child.unref();
  updateCollectorStatus({
    status: "starting", lastAttemptAt: new Date().toISOString(), nextAttemptAt: null,
    errorKind: null, errorMessage: null, processId: child.pid ?? null,
  });
  return NextResponse.json({ message: "Collecte Quinté+ lancée." }, { status: 202 });
}
