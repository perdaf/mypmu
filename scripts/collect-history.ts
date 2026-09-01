import { initializeDatabase } from "../lib/db";
import { formatPmuDate } from "../lib/date";
import { formatDuration, pmuDateRange } from "../lib/history-collection";
import { runCollector } from "./collector-runner";

const args = process.argv.slice(2);
const positional = args.filter((argument) => !argument.startsWith("--"));
const [startDate, endDate = startDate] = positional;
if (!startDate) {
  console.error("Usage : npm run collect:history -- JJMMAAAA [JJMMAAAA] [--force] [--dry-run] [--attempts=2] [--delay-ms=2000]");
  process.exit(1);
}

const force = args.includes("--force");
const dryRun = args.includes("--dry-run");
const valueOf = (name: string, fallback: number) => {
  const raw = args.find((argument) => argument.startsWith(`--${name}=`))?.split("=")[1];
  return raw === undefined ? fallback : Number(raw);
};
const maximumAttempts = valueOf("attempts", 2);
const delayMs = valueOf("delay-ms", 2_000);
if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > 5) throw new Error("--attempts doit être compris entre 1 et 5.");
if (!Number.isFinite(delayMs) || delayMs < 1_000 || delayMs > 60_000) throw new Error("--delay-ms doit être compris entre 1000 et 60000.");

const dates = pmuDateRange(startDate, endDate);
const database = initializeDatabase();
let stopped = false;
let activeController: AbortController | null = null;

function stop() {
  if (stopped) return;
  stopped = true;
  console.log("\nArrêt demandé : la journée en cours sera reprise au prochain lancement.");
  activeController?.abort();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const sleep = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));
const isCompleted = database.prepare("SELECT 1 FROM historical_collection_days WHERE programme_date = ? AND status = 'completed'");
const startDay = database.prepare(`
  INSERT INTO historical_collection_days (programme_date, status, attempts, started_at, finished_at, error_message, updated_at)
  VALUES (?, 'running', 1, ?, NULL, NULL, ?)
  ON CONFLICT(programme_date) DO UPDATE SET status='running', attempts=historical_collection_days.attempts + 1, started_at=excluded.started_at, finished_at=NULL, error_message=NULL, updated_at=excluded.updated_at
`);
const completeDay = database.prepare(`
  UPDATE historical_collection_days SET status='completed', races_collected=?, entries_collected=?, finished_at=?, duration_ms=?, error_message=NULL, updated_at=? WHERE programme_date=?
`);
const failDay = database.prepare(`
  UPDATE historical_collection_days SET status=?, finished_at=?, duration_ms=?, error_message=?, updated_at=? WHERE programme_date=?
`);

async function main() {
  const planned = dates.filter((date) => force || !isCompleted.get(date));
  console.log(`${dates.length} journée(s) dans la plage · ${planned.length} à collecter · ${dates.length - planned.length} déjà terminée(s).`);
  if (dryRun) {
    planned.forEach((date) => console.log(`À collecter : ${formatPmuDate(date)}`));
    return;
  }

  const durations: number[] = [];
  let succeeded = 0;
  let failed = 0;
  for (let index = 0; index < planned.length && !stopped; index += 1) {
    const date = planned[index];
    const startedAt = Date.now();
    let errorMessage = "Erreur inconnue";
    let success = false;
    for (let attempt = 1; attempt <= maximumAttempts && !stopped; attempt += 1) {
      const timestamp = new Date().toISOString();
      startDay.run(date, timestamp, timestamp);
      console.log(`\n[${index + 1}/${planned.length}] ${formatPmuDate(date)} · tentative ${attempt}/${maximumAttempts}`);
      activeController = new AbortController();
      try {
        await runCollector(date, false, {
          signal: activeController.signal,
          env: { MYPMU_REQUEST_DELAY_MS: process.env.MYPMU_REQUEST_DELAY_MS ?? "500" },
        });
        success = true;
        break;
      } catch (error) {
        const ingestionFailure = database.prepare(`
          SELECT error_message AS errorMessage FROM ingestion_runs
          WHERE programme_date = ? AND status = 'failed'
          ORDER BY id DESC LIMIT 1
        `).get(date) as { errorMessage: string | null } | undefined;
        errorMessage = ingestionFailure?.errorMessage ?? (error instanceof Error ? error.message : String(error));
        if (!stopped && attempt < maximumAttempts) {
          const retryDelay = delayMs * attempt;
          console.warn(`Échec : ${errorMessage}. Nouvelle tentative dans ${formatDuration(retryDelay)}.`);
          await sleep(retryDelay);
        }
      } finally {
        activeController = null;
      }
    }

    const duration = Date.now() - startedAt;
    const timestamp = new Date().toISOString();
    if (success) {
      const counts = database.prepare("SELECT COUNT(*) AS races, COALESCE(SUM((SELECT COUNT(*) FROM race_entries entries WHERE entries.race_id = races.id)), 0) AS entries FROM races WHERE programme_date = ?").get(date) as { races: number; entries: number };
      completeDay.run(counts.races, counts.entries, timestamp, duration, timestamp, date);
      durations.push(duration);
      succeeded += 1;
    } else {
      failDay.run(stopped ? "pending" : "failed", timestamp, duration, stopped ? "Collecte interrompue" : errorMessage, timestamp, date);
      if (!stopped) failed += 1;
    }

    const remaining = planned.length - index - 1;
    const average = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : duration;
    console.log(`Progression : ${index + 1}/${planned.length} · succès ${succeeded} · échecs ${failed} · reste estimé ${formatDuration(average * remaining)}`);
    if (!stopped && remaining > 0) await sleep(delayMs);
  }

  console.log(`\nCollecte historique terminée : ${succeeded} succès, ${failed} échec(s)${stopped ? ", interrompue proprement" : ""}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => database.close());
