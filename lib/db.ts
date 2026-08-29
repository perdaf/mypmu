import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function databasePath() {
  return process.env.MYPMU_DB_PATH ?? path.join(process.cwd(), "data", "mypmu.sqlite");
}

export function openDatabase() {
  const filename = databasePath();
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const database = new Database(filename);
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  return database;
}

export function initializeDatabase(database = openDatabase()) {
  const schema = fs.readFileSync(path.join(process.cwd(), "data", "schema.sql"), "utf8");
  database.exec(schema);
  const reportColumns = database.prepare("PRAGMA table_info(bet_reports)").all() as Array<{ name: string }>;
  if (reportColumns.length > 0 && !reportColumns.some((column) => column.name === "report_label")) {
    database.exec(`
      ALTER TABLE bet_reports RENAME TO bet_reports_legacy;
      CREATE TABLE bet_reports (
        race_id TEXT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
        bet_code TEXT NOT NULL,
        report_label TEXT NOT NULL,
        winning_combination TEXT NOT NULL,
        report_cents INTEGER NOT NULL,
        report_per_euro_cents INTEGER,
        stake_reference_cents INTEGER,
        winners REAL,
        refunded INTEGER NOT NULL DEFAULT 0,
        raw_json TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        PRIMARY KEY (race_id, bet_code, report_label, winning_combination)
      );
      INSERT INTO bet_reports (race_id, bet_code, report_label, winning_combination, report_cents, stake_reference_cents, raw_json, collected_at)
      SELECT race_id, bet_code, 'Rapport historique', winning_combination, report_cents, stake_reference_cents, '{}', collected_at
      FROM bet_reports_legacy;
      DROP TABLE bet_reports_legacy;
    `);
  }
  return database;
}
