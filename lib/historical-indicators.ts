import type { DetailedPerformances } from "./pmu";
import { openDatabase } from "./db";

export type ContextMetric = { score: number; races: number };

export type HistoricalIndicators = {
  races: number;
  formScore: number;
  regularityScore: number;
  discipline: ContextMetric;
  distance: ContextMetric;
  hippodrome: ContextMetric;
  disqualificationPercent: number;
  recoveryDays: number | null;
  trend: "En progression" | "Stable" | "En retrait";
  compositeScore: number;
  confidence: "Élevée" | "Moyenne" | "Faible";
};

type RaceContext = { scheduledAt?: number; discipline?: string; distance?: number; hippodrome?: string };

function normalized(value?: string | null) {
  return value?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/gi, "").toUpperCase() ?? "";
}

function sameVenue(left?: string | null, right?: string | null) {
  const first = normalized(left).replace(/^HIPPODROME(DE|DU|D)?/, "");
  const second = normalized(right).replace(/^HIPPODROME(DE|DU|D)?/, "");
  return first.length >= 4 && second.length >= 4 && (first.includes(second) || second.includes(first));
}

function performanceScore(position: number | null | undefined, runners: number) {
  if (!position || position < 1) return 0;
  if (runners <= 1) return position === 1 ? 1 : 0;
  return Math.max(0, Math.min(1, (runners - position) / (runners - 1)));
}

function weightedAverage(values: number[]) {
  if (values.length === 0) return 0.5;
  const weights = values.map((_, index) => 0.82 ** index);
  return values.reduce((sum, value, index) => sum + value * weights[index], 0) / weights.reduce((sum, value) => sum + value, 0);
}

function contextMetric(scores: number[]): ContextMetric {
  return { score: Math.round(weightedAverage(scores) * 100), races: scores.length };
}

export function buildHistoricalIndicators(details: DetailedPerformances | null, context: RaceContext) {
  const result = new Map<number, HistoricalIndicators>();
  if (!details || !context.scheduledAt) return result;

  for (const horse of details.participants) {
    const races = horse.coursesCourues
      .filter((race) => race.date < context.scheduledAt!)
      .sort((left, right) => right.date - left.date)
      .slice(0, 10)
      .map((race) => {
        const own = race.participants.find((participant) => participant.itsHim)
          ?? race.participants.find((participant) => normalized(participant.nomCheval) === normalized(horse.nomCheval));
        return {
          race,
          own,
          score: performanceScore(own?.place?.place, race.nbParticipants ?? race.participants.length),
        };
      });
    if (races.length === 0) continue;

    const allScores = races.map((item) => item.score);
    const disciplineScores = races.filter(({ race }) => normalized(race.discipline) === normalized(context.discipline)).map((item) => item.score);
    const distanceScores = context.distance
      ? races.filter(({ race }) => race.distance && Math.abs(race.distance - context.distance!) <= Math.max(200, context.distance! * 0.1)).map((item) => item.score)
      : [];
    const venueScores = races.filter(({ race }) => sameVenue(race.hippodrome, context.hippodrome)).map((item) => item.score);
    const completed = races.filter(({ own }) => own?.place?.statusArrivee === "PLACE").length;
    const disqualified = races.filter(({ own }) => own?.place?.statusArrivee === "DISQUALIFIE").length;
    const recent = weightedAverage(allScores.slice(0, 3));
    const older = weightedAverage(allScores.slice(3, 6));
    const trendDifference = allScores.length >= 4 ? recent - older : 0;
    const availableContexts = [
      { metric: contextMetric(allScores), weight: 0.55 },
      ...(disciplineScores.length ? [{ metric: contextMetric(disciplineScores), weight: 0.2 }] : []),
      ...(distanceScores.length ? [{ metric: contextMetric(distanceScores), weight: 0.2 }] : []),
      ...(venueScores.length ? [{ metric: contextMetric(venueScores), weight: 0.05 }] : []),
    ];
    const totalWeight = availableContexts.reduce((sum, item) => sum + item.weight, 0);
    const compositeScore = Math.round(availableContexts.reduce((sum, item) => sum + item.metric.score * item.weight, 0) / totalWeight);

    result.set(horse.numPmu, {
      races: races.length,
      formScore: Math.round(weightedAverage(allScores) * 100),
      regularityScore: Math.round(completed / races.length * 100),
      discipline: contextMetric(disciplineScores),
      distance: contextMetric(distanceScores),
      hippodrome: contextMetric(venueScores),
      disqualificationPercent: Math.round(disqualified / races.length * 100),
      recoveryDays: Math.max(0, Math.floor((context.scheduledAt - races[0].race.date) / 86_400_000)),
      trend: trendDifference > 0.12 ? "En progression" : trendDifference < -0.12 ? "En retrait" : "Stable",
      compositeScore,
      confidence: races.length >= 8 && (disciplineScores.length + distanceScores.length) >= 5 ? "Élevée" : races.length >= 4 ? "Moyenne" : "Faible",
    });
  }
  return result;
}

export function loadStoredHistoricalIndicators(targetRaceId: string, context: RaceContext) {
  const database = openDatabase();
  try {
    const rows = database.prepare(`
      SELECT snapshots.pmu_number AS pmuNumber, horses.name AS horseName, performances.raw_json AS rawJson
      FROM race_entry_performance_snapshots snapshots
      JOIN horse_performances performances ON performances.id = snapshots.performance_id
      JOIN horses ON horses.id = performances.horse_id
      WHERE snapshots.target_race_id = ?
      ORDER BY snapshots.pmu_number, snapshots.recency_rank
    `).all(targetRaceId) as Array<{ pmuNumber: number; horseName: string; rawJson: string }>;
    const grouped = new Map<number, { name: string; races: DetailedPerformances["participants"][number]["coursesCourues"] }>();
    for (const row of rows) {
      const current = grouped.get(row.pmuNumber) ?? { name: row.horseName, races: [] };
      try {
        current.races.push(JSON.parse(row.rawJson) as DetailedPerformances["participants"][number]["coursesCourues"][number]);
      } catch {
        // Une ligne historique corrompue est ignorée sans invalider les autres partants.
      }
      grouped.set(row.pmuNumber, current);
    }
    return buildHistoricalIndicators({
      allure: null,
      participants: [...grouped].map(([numPmu, value]) => ({ numPmu, nomCheval: value.name, coursesCourues: value.races })),
    }, context);
  } finally {
    database.close();
  }
}
