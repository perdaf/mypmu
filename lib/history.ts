import { openDatabase } from "./db";

export const MINIMUM_BACKTEST_RACES = 100;

export type HistoryRace = {
  id: string;
  programmeDate: string;
  reunionNumber: number;
  courseNumber: number;
  label: string;
  hippodrome: string | null;
  runners: number;
  completenessPercent: number;
  oddsSnapshots: number;
  finish: string | null;
  reports: number;
};

export type HistoryOverview = {
  races: number;
  completedRaces: number;
  entries: number;
  horses: number;
  oddsSnapshots: number;
  reports: number;
  pastPerformances: number;
  entriesWithHistory: number;
  weatherSnapshots: number;
  averageCompletenessPercent: number;
  usableForBacktest: number;
  programmeDates: number;
  firstDate: string | null;
  lastDate: string | null;
  recentRaces: HistoryRace[];
};

type TotalsRow = {
  races: number;
  completedRaces: number;
  entries: number;
  horses: number;
  oddsSnapshots: number;
  reports: number;
  pastPerformances: number;
  entriesWithHistory: number;
  weatherSnapshots: number;
  averageCompleteness: number | null;
  usableForBacktest: number;
  programmeDates: number;
  firstDate: string | null;
  lastDate: string | null;
};

export function getHistoryOverview(): HistoryOverview {
  const database = openDatabase();
  try {
    const totals = database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM races) AS races,
        (SELECT COUNT(DISTINCT race_id) FROM race_results) AS completedRaces,
        (SELECT COUNT(*) FROM race_entries) AS entries,
        (SELECT COUNT(*) FROM horses) AS horses,
        (SELECT COUNT(*) FROM odds_snapshots) AS oddsSnapshots,
        (SELECT COUNT(*) FROM bet_reports) AS reports,
        (SELECT COUNT(*) FROM horse_performances) AS pastPerformances,
        (SELECT COUNT(*) FROM race_entries e WHERE EXISTS (
          SELECT 1 FROM race_entry_performance_snapshots s
          WHERE s.target_race_id = e.race_id AND s.pmu_number = e.pmu_number
        )) AS entriesWithHistory,
        (SELECT COUNT(*) FROM race_weather) AS weatherSnapshots,
        (SELECT AVG(data_completeness) FROM race_entries) AS averageCompleteness,
        (
          SELECT COUNT(*) FROM races r
          WHERE (SELECT COUNT(*) FROM race_entries e WHERE e.race_id = r.id AND COALESCE(e.status, '') != 'NON_PARTANT') >= 5
            AND (SELECT COUNT(*) FROM race_results rr WHERE rr.race_id = r.id) >= 5
            AND (SELECT COUNT(*) FROM odds_snapshots os WHERE os.race_id = r.id) >= 5
        ) AS usableForBacktest,
        (SELECT COUNT(DISTINCT programme_date) FROM races) AS programmeDates,
        (SELECT MIN(programme_date) FROM races) AS firstDate,
        (SELECT MAX(programme_date) FROM races) AS lastDate
    `).get() as TotalsRow;

    const recentRaces = database.prepare(`
      SELECT
        r.id,
        r.programme_date AS programmeDate,
        r.reunion_number AS reunionNumber,
        r.course_number AS courseNumber,
        r.label,
        r.hippodrome,
        COUNT(DISTINCT e.pmu_number) AS runners,
        COALESCE(AVG(e.data_completeness), 0) * 100 AS completenessPercent,
        COUNT(DISTINCT os.id) AS oddsSnapshots,
        (
          SELECT GROUP_CONCAT(pmu_number, ' - ')
          FROM (SELECT pmu_number FROM race_results WHERE race_id = r.id ORDER BY finishing_position LIMIT 5)
        ) AS finish,
        (SELECT COUNT(*) FROM bet_reports br WHERE br.race_id = r.id) AS reports
      FROM races r
      LEFT JOIN race_entries e ON e.race_id = r.id
      LEFT JOIN odds_snapshots os ON os.race_id = r.id
      GROUP BY r.id
      ORDER BY r.programme_date DESC, r.reunion_number, r.course_number
      LIMIT 20
    `).all() as HistoryRace[];

    return {
      ...totals,
      averageCompletenessPercent: Math.round((totals.averageCompleteness ?? 0) * 100),
      recentRaces: recentRaces.map((race) => ({ ...race, completenessPercent: Math.round(race.completenessPercent) })),
    };
  } finally {
    database.close();
  }
}
