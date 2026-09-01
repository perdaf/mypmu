import type Database from "better-sqlite3";
import type { TrainingExample } from "./model-core";

export const MODEL_FEATURE_NAMES = [
  "probabilite_marche", "rang_marche", "cote_absente", "taux_victoires_carriere",
  "taux_places_carriere", "experience", "completude", "forme_10_courses",
  "top3_historique", "top5_historique", "forme_meme_discipline", "forme_distance_proche",
  "forme_meme_hippodrome", "recuperation", "volume_historique", "taux_disqualification",
] as const;

type RawRow = {
  raceId: string; programmeDate: string; scheduledAt: number | null; pmuNumber: number;
  careerRaces: number | null; careerWins: number | null; careerPlaces: number | null;
  completeness: number; odds: number | null; finishPosition: number | null;
  historyRaces: number; historyForm: number | null; historyTop3: number | null;
  historyTop5: number | null; disciplineForm: number | null; distanceForm: number | null;
  venueForm: number | null; latestPastRace: number | null; disqualificationRate: number | null;
};

function performanceExpression(prefix = "hp") {
  return `CASE WHEN ${prefix}.finish_position IS NULL OR ${prefix}.finish_position < 1 THEN 0
    WHEN COALESCE(${prefix}.runners, 0) <= 1 THEN CASE WHEN ${prefix}.finish_position = 1 THEN 1.0 ELSE 0 END
    ELSE MAX(0.0, MIN(1.0, CAST(${prefix}.runners - ${prefix}.finish_position AS REAL) / (${prefix}.runners - 1))) END`;
}

function programmeOrder(programmeDate: string) {
  return `${programmeDate.slice(4, 8)}${programmeDate.slice(2, 4)}${programmeDate.slice(0, 2)}`;
}

export function loadModelExamples(database: Database.Database, mode: "training" | "prediction" = "training"): TrainingExample[] {
  const performance = performanceExpression();
  const rows = database.prepare(`
    SELECT r.id AS raceId, r.programme_date AS programmeDate, r.scheduled_at AS scheduledAt,
      e.pmu_number AS pmuNumber, e.career_races AS careerRaces, e.career_wins AS careerWins,
      e.career_places AS careerPlaces, e.data_completeness AS completeness,
      (SELECT os.odds FROM odds_snapshots os WHERE os.race_id = r.id AND os.pmu_number = e.pmu_number ORDER BY os.observed_at DESC LIMIT 1) AS odds,
      (SELECT rr.finishing_position FROM race_results rr WHERE rr.race_id = r.id AND rr.pmu_number = e.pmu_number ORDER BY rr.finishing_position LIMIT 1) AS finishPosition,
      COUNT(hp.id) AS historyRaces,
      AVG(${performance}) AS historyForm,
      AVG(CASE WHEN hp.finish_position BETWEEN 1 AND 3 THEN 1.0 ELSE 0 END) AS historyTop3,
      AVG(CASE WHEN hp.finish_position BETWEEN 1 AND 5 THEN 1.0 ELSE 0 END) AS historyTop5,
      AVG(CASE WHEN UPPER(COALESCE(hp.discipline, '')) = UPPER(COALESCE(r.discipline, '')) THEN ${performance} END) AS disciplineForm,
      AVG(CASE WHEN hp.distance IS NOT NULL AND r.distance IS NOT NULL AND ABS(hp.distance - r.distance) <= MAX(200, r.distance * 0.1) THEN ${performance} END) AS distanceForm,
      AVG(CASE WHEN UPPER(COALESCE(hp.hippodrome, '')) = UPPER(COALESCE(r.hippodrome, '')) THEN ${performance} END) AS venueForm,
      MAX(hp.raced_at) AS latestPastRace,
      AVG(CASE WHEN UPPER(COALESCE(hp.finish_status, '')) LIKE 'DISQUAL%' THEN 1.0 ELSE 0 END) AS disqualificationRate
    FROM races r
    JOIN race_entries e ON e.race_id = r.id
    LEFT JOIN race_entry_performance_snapshots snapshots ON snapshots.target_race_id = e.race_id AND snapshots.pmu_number = e.pmu_number
    LEFT JOIN horse_performances hp ON hp.id = snapshots.performance_id
    WHERE COALESCE(e.status, '') != 'NON_PARTANT'
      AND (${mode === "training" ? "(SELECT COUNT(*) FROM race_results complete WHERE complete.race_id = r.id) >= 5" : `(SELECT COUNT(*) FROM race_results complete WHERE complete.race_id = r.id) = 0 AND r.scheduled_at >= ${Date.now()}`})
    GROUP BY r.id, e.pmu_number
    ORDER BY COALESCE(r.scheduled_at, 0), r.programme_date, r.reunion_number, r.course_number, e.pmu_number
  `).all() as RawRow[];

  const raceRows = new Map<string, RawRow[]>();
  for (const row of rows) raceRows.set(row.raceId, [...(raceRows.get(row.raceId) ?? []), row]);
  return rows.map((row) => {
    const peers = raceRows.get(row.raceId) ?? [];
    const ranked = peers.filter((item) => item.odds && item.odds > 0).sort((left, right) => left.odds! - right.odds!);
    const rank = row.odds ? ranked.findIndex((item) => item.pmuNumber === row.pmuNumber) : -1;
    const marketRank = rank < 0 ? 0.5 : 1 - rank / Math.max(1, ranked.length - 1);
    const races = row.careerRaces ?? 0;
    const recoveryDays = row.latestPastRace && row.scheduledAt ? Math.max(0, (row.scheduledAt - row.latestPastRace) / 86_400_000) : 45;
    return {
      raceId: row.raceId,
      raceDate: row.scheduledAt ? String(row.scheduledAt).padStart(13, "0") : programmeOrder(row.programmeDate),
      pmuNumber: row.pmuNumber,
      finishPosition: row.finishPosition,
      features: [
        row.odds && row.odds > 0 ? Math.min(1, 1 / row.odds) : 0,
        marketRank,
        row.odds ? 0 : 1,
        races > 0 ? (row.careerWins ?? 0) / races : 0,
        races > 0 ? (row.careerPlaces ?? 0) / races : 0,
        Math.min(1, Math.log1p(races) / Math.log(101)),
        row.completeness,
        row.historyForm ?? 0.5,
        row.historyTop3 ?? 0.3,
        row.historyTop5 ?? 0.5,
        row.disciplineForm ?? 0.5,
        row.distanceForm ?? 0.5,
        row.venueForm ?? 0.5,
        Math.min(1, recoveryDays / 180),
        Math.min(1, row.historyRaces / 10),
        row.disqualificationRate ?? 0,
      ],
    };
  });
}
