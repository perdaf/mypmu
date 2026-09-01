import { openDatabase } from "./db";
import { providerCatalog, type ProviderDescriptor } from "./providers";

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
  quinteRaces: number;
  returningHorses: number;
  averageCompletenessPercent: number;
  usableForBacktest: number;
  programmeDates: number;
  firstDate: string | null;
  lastDate: string | null;
  recentRaces: HistoryRace[];
  model: {
    status: string;
    activeVersion: string | null;
    trainedAt: string | null;
    trainingRaces: number;
    validationRaces: number;
    aggregateBrier: number | null;
    completedRacesAtTraining: number;
    newCompletedRaces: number;
    retrainingRecommended: boolean;
    notes: string | null;
  };
  collection: {
    days: { completed: number; failed: number; running: number; pending: number };
    recentRuns: Array<{
      id: number;
      programmeDate: string;
      startedAt: string;
      finishedAt: string | null;
      status: string;
      racesCollected: number;
      entriesCollected: number;
      errorMessage: string | null;
      source: string;
    }>;
    sources: ProviderDescriptor[];
  };
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
  quinteRaces: number;
  returningHorses: number;
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
        (SELECT COUNT(*) FROM races WHERE is_quinte_plus = 1) AS quinteRaces,
        (SELECT COUNT(*) FROM (SELECT horse_id FROM race_entries GROUP BY horse_id HAVING COUNT(DISTINCT race_id) > 1)) AS returningHorses,
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

    const dayCounts = database.prepare(`
      SELECT
        COALESCE(SUM(status = 'completed'), 0) AS completed,
        COALESCE(SUM(status = 'failed'), 0) AS failed,
        COALESCE(SUM(status = 'running'), 0) AS running,
        COALESCE(SUM(status = 'pending'), 0) AS pending
      FROM historical_collection_days
    `).get() as { completed: number; failed: number; running: number; pending: number };
    const recentRuns = database.prepare(`
      SELECT id, programme_date AS programmeDate, started_at AS startedAt, finished_at AS finishedAt,
        status, races_collected AS racesCollected, entries_collected AS entriesCollected,
        error_message AS errorMessage, source
      FROM ingestion_runs ORDER BY id DESC LIMIT 8
    `).all() as HistoryOverview["collection"]["recentRuns"];
    const latestPmuRun = recentRuns.find((run) => run.source === "PMU");
    const trainingState = database.prepare(`
      SELECT status, active_version AS activeVersion,
        completed_races_at_last_training AS completedRacesAtTraining,
        retraining_recommended AS retrainingRecommended
      FROM model_training_state WHERE id=1
    `).get() as { status: string; activeVersion: string | null; completedRacesAtTraining: number; retrainingRecommended: number } | undefined;
    const activeModel = database.prepare(`
      SELECT version, trained_at AS trainedAt, training_races AS trainingRaces,
        validation_races AS validationRaces, metrics_json AS metricsJson, notes
      FROM model_versions WHERE status='active' ORDER BY promoted_at DESC LIMIT 1
    `).get() as { version: string; trainedAt: string; trainingRaces: number; validationRaces: number; metricsJson: string; notes: string | null } | undefined;
    let aggregateBrier: number | null = null;
    if (activeModel) {
      try { aggregateBrier = (JSON.parse(activeModel.metricsJson) as { aggregateBrier?: number }).aggregateBrier ?? null; } catch { aggregateBrier = null; }
    }
    const newCompletedRaces = Math.max(0, totals.completedRaces - (trainingState?.completedRacesAtTraining ?? 0));
    const sources = providerCatalog().map((source) => {
      if (source.id === "PMU" && latestPmuRun?.status === "failed") {
        return { ...source, usable: false, note: `Dernier appel en échec : ${latestPmuRun.errorMessage ?? "cause inconnue"}. Une relance sera tentée.` };
      }
      if (source.id === "OPEN_METEO" && totals.weatherSnapshots === 0) return { ...source, usable: false, note: "Aucune observation encore enregistrée." };
      return source;
    });

    return {
      ...totals,
      averageCompletenessPercent: Math.round((totals.averageCompleteness ?? 0) * 100),
      recentRaces: recentRaces.map((race) => ({ ...race, completenessPercent: Math.round(race.completenessPercent) })),
      model: {
        status: trainingState?.status ?? "never",
        activeVersion: activeModel?.version ?? trainingState?.activeVersion ?? null,
        trainedAt: activeModel?.trainedAt ?? null,
        trainingRaces: activeModel?.trainingRaces ?? 0,
        validationRaces: activeModel?.validationRaces ?? 0,
        aggregateBrier,
        completedRacesAtTraining: trainingState?.completedRacesAtTraining ?? 0,
        newCompletedRaces,
        retrainingRecommended: Boolean(trainingState?.retrainingRecommended) || newCompletedRaces >= 20,
        notes: activeModel?.notes ?? null,
      },
      collection: { days: dayCounts, recentRuns, sources },
    };
  } finally {
    database.close();
  }
}
