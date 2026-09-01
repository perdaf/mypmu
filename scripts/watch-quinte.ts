import { currentPmuDate, runCollector } from "./collector-runner";

const intervalMs = Math.max(60_000, Number(process.env.MYPMU_QUINTE_INTERVAL_MS ?? 300_000));
let stopped = false;
const wait = (duration: number) => new Promise((resolve) => setTimeout(resolve, duration));

process.once("SIGINT", () => { stopped = true; });
process.once("SIGTERM", () => { stopped = true; });

async function main() {
  console.log("Collecte initiale de la course Quinté+ du jour.");
  await runCollector(currentPmuDate(), false, { quinteOnly: true });
  while (!stopped) {
    await wait(intervalMs);
    if (stopped) break;
    try {
      await runCollector(currentPmuDate(), true, { quinteOnly: true });
    } catch (error) {
      console.error("Échec du relevé Quinté+ :", error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
