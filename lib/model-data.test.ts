import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { loadModelExamples } from "./model-data";

describe("données temporelles du modèle", () => {
  const databases: Database.Database[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.close()));

  it("ignore les statistiques et les cotes observées après le départ", () => {
    const database = new Database(":memory:");
    databases.push(database);
    database.exec(`
      CREATE TABLE races (id TEXT PRIMARY KEY, programme_date TEXT, scheduled_at INTEGER, reunion_number INTEGER, course_number INTEGER, discipline TEXT, distance INTEGER, hippodrome TEXT);
      CREATE TABLE race_entry_snapshots (race_id TEXT, pmu_number INTEGER, observed_at TEXT, status TEXT, career_races INTEGER, career_wins INTEGER, career_places INTEGER, data_completeness REAL);
      CREATE TABLE odds_snapshots (race_id TEXT, pmu_number INTEGER, odds REAL, observed_at TEXT);
      CREATE TABLE race_results (race_id TEXT, pmu_number INTEGER, finishing_position INTEGER);
      CREATE TABLE race_entry_performance_snapshots (target_race_id TEXT, pmu_number INTEGER, performance_id TEXT);
      CREATE TABLE horse_performances (id TEXT, finish_position INTEGER, runners INTEGER, discipline TEXT, distance INTEGER, hippodrome TEXT, raced_at INTEGER, finish_status TEXT);
    `);
    const start = Date.UTC(2026, 8, 22, 12);
    database.prepare("INSERT INTO races VALUES (?,?,?,?,?,?,?,?)").run("R1", "22092026", start, 1, 1, "PLAT", 2000, "TEST");
    const insertSnapshot = database.prepare("INSERT INTO race_entry_snapshots VALUES (?,?,?,?,?,?,?,?)");
    insertSnapshot.run("R1", 1, "2026-09-22T11:50:00.000Z", null, 10, 1, 3, 1);
    insertSnapshot.run("R1", 1, "2026-09-22T12:10:00.000Z", null, 11, 2, 4, 1);
    insertSnapshot.run("R1", 2, "2026-09-22T11:50:00.000Z", null, 10, 0, 2, 1);
    insertSnapshot.run("R1", 2, "2026-09-22T12:10:00.000Z", null, 11, 1, 3, 1);
    const insertOdds = database.prepare("INSERT INTO odds_snapshots VALUES (?,?,?,?)");
    insertOdds.run("R1", 1, 5, "2026-09-22T11:55:00.000Z");
    insertOdds.run("R1", 1, 1.5, "2026-09-22T12:05:00.000Z");
    insertOdds.run("R1", 2, 10, "2026-09-22T11:55:00.000Z");
    insertOdds.run("R1", 2, 2, "2026-09-22T12:05:00.000Z");
    const insertResult = database.prepare("INSERT INTO race_results VALUES (?,?,?)");
    for (let position = 1; position <= 5; position += 1) insertResult.run("R1", position, position);

    const examples = loadModelExamples(database);
    const first = examples.find((example) => example.pmuNumber === 1)!;
    expect(examples).toHaveLength(2);
    expect(first.features[0]).toBeCloseTo(0.2);
    expect(first.features[3]).toBeCloseTo(0.1);
    expect(first.features[19]).toBeCloseTo(0.1);
  });
});
