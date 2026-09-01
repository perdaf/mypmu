import { currentPmuDate, runCollector } from "./collector-runner";
import { classifyCollectorError, updateCollectorStatus } from "../lib/collector-status";

const intervalMs = Math.max(60_000, Number(process.env.MYPMU_QUINTE_INTERVAL_MS ?? 300_000));
let stopped = false;
const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

function stop() {
  stopped = true;
  updateCollectorStatus({ status: "stopped", watcherActive: false, nextAttemptAt: null, processId: null });
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

function scheduleNextAttempt() {
  const nextAttemptAt = new Date(Date.now() + intervalMs).toISOString();
  updateCollectorStatus({ status: "waiting", watcherActive: true, nextAttemptAt, processId: process.pid });
}

async function collect(activeOnly: boolean) {
  try {
    await runCollector(currentPmuDate(), activeOnly, { quinteOnly: true });
  } catch (error) {
    updateCollectorStatus({
      status: "error", watcherActive: true, errorKind: classifyCollectorError(error),
      errorMessage: error instanceof Error ? error.message : String(error), processId: process.pid,
    });
    console.error("Échec du relevé Quinté+ :", error);
  }
}

async function main() {
  updateCollectorStatus({ status: "starting", watcherActive: true, processId: process.pid, errorKind: null, errorMessage: null });
  console.log("Collecte initiale de la course Quinté+ du jour.");
  await collect(false);
  while (!stopped) {
    scheduleNextAttempt();
    await wait(intervalMs);
    if (stopped) break;
    await collect(true);
  }
}

main().catch((error) => {
  updateCollectorStatus({ status: "error", watcherActive: false, errorKind: classifyCollectorError(error), errorMessage: error instanceof Error ? error.message : String(error), processId: null });
  console.error(error);
  process.exitCode = 1;
});
