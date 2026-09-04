import { currentPmuDate, runCollector } from "./collector-runner";
import { classifyCollectorError, updateCollectorStatus } from "../lib/collector-status";
import { initializeDatabase } from "../lib/db";
import { nextQuinteDelay, type QuinteScheduleState } from "../lib/quinte-schedule";

let stopped = false;
const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

function stop() {
  stopped = true;
  updateCollectorStatus({ status: "stopped", watcherActive: false, nextAttemptAt: null, processId: null });
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

function readQuinteSchedule(date: string): QuinteScheduleState | undefined {
  const database = initializeDatabase();
  try {
    const row = database.prepare(`
      SELECT scheduled_at AS scheduledAt, results_available AS resultsAvailable
      FROM races WHERE programme_date = ? AND is_quinte_plus = 1
      ORDER BY scheduled_at LIMIT 1
    `).get(date) as { scheduledAt: number | null; resultsAvailable: number } | undefined;
    return row?.scheduledAt ? { scheduledAt: row.scheduledAt, resultsAvailable: Boolean(row.resultsAvailable) } : undefined;
  } finally {
    database.close();
  }
}

function scheduleNextAttempt(delayMs: number) {
  const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
  updateCollectorStatus({ status: "waiting", watcherActive: true, nextAttemptAt, processId: process.pid });
}

async function collect(refreshOnly: boolean) {
  try {
    await runCollector(currentPmuDate(), false, { quinteOnly: true, refreshOnly });
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
  let collectedDate = currentPmuDate();
  while (!stopped) {
    const delayMs = nextQuinteDelay(Date.now(), readQuinteSchedule(collectedDate));
    scheduleNextAttempt(delayMs);
    await wait(delayMs);
    if (stopped) break;
    const currentDate = currentPmuDate();
    const newDay = currentDate !== collectedDate;
    if (newDay) {
      console.log(`Nouvelle journée PMU ${currentDate} : collecte complète.`);
      collectedDate = currentDate;
    }
    await collect(!newDay);
  }
}

main().catch((error) => {
  updateCollectorStatus({ status: "error", watcherActive: false, errorKind: classifyCollectorError(error), errorMessage: error instanceof Error ? error.message : String(error), processId: null });
  console.error(error);
  process.exitCode = 1;
});
