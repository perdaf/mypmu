import { currentPmuDate, runCollector } from "./collector-runner";

const intervalMs = Math.max(60_000, Number(process.env.MYPMU_COLLECTION_INTERVAL_MS ?? 300_000));
let stopped = false;

async function cycle() {
  const startedAt = new Date();
  console.log(`[${startedAt.toISOString()}] Collecte active ${currentPmuDate(startedAt)}`);
  try {
    await runCollector(currentPmuDate(startedAt), true);
  } catch (error) {
    console.error("Échec du cycle de collecte :", error);
  }
}

async function watch() {
  console.log(`Surveillance PMU active toutes les ${Math.round(intervalMs / 60_000)} minute(s).`);
  while (!stopped) {
    await cycle();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });

watch().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
