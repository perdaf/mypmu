import { openDatabase } from "./db";

export type HorsePrediction = {
  modelVersion: string;
  winProbability: number;
  top3Probability: number;
  top4Probability: number;
  top5Probability: number;
  confidence: number;
};

export function loadActivePredictions(raceId: string) {
  const database = openDatabase();
  try {
    const rows = database.prepare(`
      SELECT p.pmu_number AS pmuNumber, p.model_version AS modelVersion,
        p.win_probability AS winProbability, p.top3_probability AS top3Probability,
        p.top4_probability AS top4Probability, p.top5_probability AS top5Probability,
        p.confidence
      FROM model_predictions p
      JOIN model_versions version ON version.version = p.model_version AND version.status = 'active'
      WHERE p.race_id = ?
    `).all(raceId) as Array<HorsePrediction & { pmuNumber: number }>;
    return new Map(rows.map(({ pmuNumber, ...prediction }) => [pmuNumber, prediction]));
  } finally {
    database.close();
  }
}
