import { initializeDatabase } from "../lib/db";
import { expandArrivalOrder } from "../lib/race-results";

const database = initializeDatabase();
const races = database.prepare(`
  SELECT id, raw_json AS rawJson FROM races
  WHERE EXISTS (SELECT 1 FROM race_results rr WHERE rr.race_id=races.id)
`).all() as Array<{ id: string; rawJson: string }>;
const remove = database.prepare("DELETE FROM race_results WHERE race_id=?");
const insert = database.prepare(`
  INSERT INTO race_results (race_id, finishing_position, pmu_number, dead_heat_group, collected_at)
  VALUES (?, ?, ?, ?, ?)
`);
let repairedRaces = 0;
database.transaction(() => {
  for (const race of races) {
    const raw = JSON.parse(race.rawJson) as { ordreArrivee?: number[][] };
    if (!Array.isArray(raw.ordreArrivee) || raw.ordreArrivee.length === 0) continue;
    const rows = expandArrivalOrder(raw.ordreArrivee);
    remove.run(race.id);
    const collectedAt = new Date().toISOString();
    for (const row of rows) insert.run(race.id, row.finishingPosition, row.pmuNumber, row.deadHeatGroup, collectedAt);
    repairedRaces += 1;
  }
})();
database.close();
console.log(`${repairedRaces} arrivées recalculées depuis les données PMU brutes.`);
