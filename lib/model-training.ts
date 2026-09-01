import type Database from "better-sqlite3";
import { MODEL_FEATURE_NAMES, loadModelExamples } from "./model-data";
import {
  MODEL_TARGETS, chronologicalSplit, evaluateModel, fitNormalization, predictProbability,
  trainLogisticRegression, type ModelTarget, type Normalization, type TrainedTarget,
} from "./model-core";

export const MINIMUM_TRAINING_RACES = 40;
export const RETRAIN_AFTER_NEW_RACES = 20;

type Coefficients = Record<ModelTarget, number[]>;
type Metrics = Record<ModelTarget, TrainedTarget> & { aggregateBrier: number; aggregateLogLoss: number };

type StoredModel = {
  version: string;
  normalizationJson: string;
  coefficientsJson: string;
  metricsJson: string;
};

function evaluateStored(model: StoredModel, validation: ReturnType<typeof loadModelExamples>) {
  const normalization = JSON.parse(model.normalizationJson) as Normalization;
  const coefficients = JSON.parse(model.coefficientsJson) as Coefficients;
  const targetMetrics = Object.fromEntries(MODEL_TARGETS.map((target) => [target, evaluateModel(validation, target, coefficients[target], normalization)])) as Record<ModelTarget, { brier: number; logLoss: number }>;
  return MODEL_TARGETS.reduce((sum, target) => sum + targetMetrics[target].brier, 0) / MODEL_TARGETS.length;
}

function savePredictions(database: Database.Database, version: string, normalization: Normalization, coefficients: Coefficients) {
  const predictions = loadModelExamples(database, "prediction");
  const insert = database.prepare(`
    INSERT INTO model_predictions (race_id, pmu_number, model_version, win_probability, top3_probability, top4_probability, top5_probability, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(race_id, pmu_number, model_version) DO UPDATE SET
      win_probability=excluded.win_probability, top3_probability=excluded.top3_probability,
      top4_probability=excluded.top4_probability, top5_probability=excluded.top5_probability,
      confidence=excluded.confidence, created_at=excluded.created_at
  `);
  const createdAt = new Date().toISOString();
  database.prepare(`
    DELETE FROM model_predictions WHERE model_version=? AND race_id IN (
      SELECT r.id FROM races r WHERE r.scheduled_at < ? AND NOT EXISTS (SELECT 1 FROM race_results rr WHERE rr.race_id=r.id)
    ) AND CAST(strftime('%s', created_at) AS INTEGER) * 1000 >= (SELECT scheduled_at FROM races WHERE id=model_predictions.race_id)
  `).run(version, Date.now());
  const rawPredictions = predictions.map((example) => ({
    example,
    values: MODEL_TARGETS.map((target) => predictProbability(coefficients[target], example.features, normalization)),
  }));
  const byRace = new Map<string, typeof rawPredictions>();
  for (const item of rawPredictions) byRace.set(item.example.raceId, [...(byRace.get(item.example.raceId) ?? []), item]);
  for (const race of byRace.values()) {
    const sums = MODEL_TARGETS.map((_, index) => race.reduce((sum, item) => sum + item.values[index], 0));
    for (const { example, values } of race) {
      const normalized = values.map((value, index) => Math.min(1, value * (index === 0 ? 1 : Number(MODEL_TARGETS[index].slice(3))) / Math.max(1e-9, sums[index])));
      const win = normalized[0];
      const top3 = Math.max(win, normalized[1]);
      const top4 = Math.max(top3, normalized[2]);
      const top5 = Math.max(top4, normalized[3]);
    const completeness = example.features[6];
    const historyVolume = example.features[14];
    const confidence = Math.min(1, Math.max(0.15, completeness * (0.55 + 0.45 * historyVolume)));
    insert.run(example.raceId, example.pmuNumber, version, win, top3, top4, top5, confidence, createdAt);
    }
  }
  return predictions.length;
}

export function trainAndPromoteModel(database: Database.Database, options: { onlyIfNeeded?: boolean } = {}) {
  const attemptedAt = new Date().toISOString();
  if (options.onlyIfNeeded) {
    const state = database.prepare("SELECT active_version AS activeVersion, completed_races_at_last_training AS previousRaces FROM model_training_state WHERE id=1")
      .get() as { activeVersion: string | null; previousRaces: number } | undefined;
    if (state?.activeVersion) {
      const completedRaces = (database.prepare("SELECT COUNT(*) AS count FROM races r WHERE (SELECT COUNT(*) FROM race_results rr WHERE rr.race_id=r.id) >= 5").get() as { count: number }).count;
      const newRaces = Math.max(0, completedRaces - state.previousRaces);
      if (newRaces < RETRAIN_AFTER_NEW_RACES) {
        const active = database.prepare(`
          SELECT version, normalization_json AS normalizationJson, coefficients_json AS coefficientsJson, metrics_json AS metricsJson
          FROM model_versions WHERE version=? AND status='active'
        `).get(state.activeVersion) as StoredModel | undefined;
        if (active) savePredictions(database, active.version, JSON.parse(active.normalizationJson) as Normalization, JSON.parse(active.coefficientsJson) as Coefficients);
        database.prepare("UPDATE model_training_state SET retraining_recommended=0 WHERE id=1").run();
        return { status: "not_needed" as const, raceCount: completedRaces, newRaces };
      }
      database.prepare("UPDATE model_training_state SET retraining_recommended=1 WHERE id=1").run();
    }
  }
  database.prepare(`
    INSERT INTO model_training_state (id, last_attempt_at, status) VALUES (1, ?, 'training')
    ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='training', error_message=NULL
  `).run(attemptedAt);
  const examples = loadModelExamples(database, "training");
  const raceCount = new Set(examples.map((item) => item.raceId)).size;
  if (raceCount < MINIMUM_TRAINING_RACES) {
    database.prepare("UPDATE model_training_state SET status='insufficient', completed_races_at_last_training=?, error_message=? WHERE id=1")
      .run(raceCount, `Il faut au moins ${MINIMUM_TRAINING_RACES} courses terminées; ${raceCount} sont disponibles.`);
    return { status: "insufficient" as const, raceCount };
  }

  const split = chronologicalSplit(examples);
  const normalization = fitNormalization(split.training.map((item) => item.features));
  const coefficients = {} as Coefficients;
  const metrics = {} as Record<ModelTarget, TrainedTarget>;
  for (const target of MODEL_TARGETS) {
    const fitted = trainLogisticRegression(split.training, target, normalization);
    coefficients[target] = fitted;
    metrics[target] = { coefficients: fitted, ...evaluateModel(split.validation, target, fitted, normalization) };
  }
  const aggregateBrier = MODEL_TARGETS.reduce((sum, target) => sum + metrics[target].brier, 0) / MODEL_TARGETS.length;
  const aggregateLogLoss = MODEL_TARGETS.reduce((sum, target) => sum + metrics[target].logLoss, 0) / MODEL_TARGETS.length;
  const allMetrics: Metrics = { ...metrics, aggregateBrier, aggregateLogLoss };
  const version = `logistic-v1-${attemptedAt.replace(/[-:.TZ]/g, "").slice(0, 17)}`;
  const active = database.prepare(`
    SELECT version, normalization_json AS normalizationJson, coefficients_json AS coefficientsJson, metrics_json AS metricsJson
    FROM model_versions WHERE status='active' ORDER BY promoted_at DESC LIMIT 1
  `).get() as StoredModel | undefined;
  const activeBrierOnCurrentValidation = active ? evaluateStored(active, split.validation) : null;
  const promoted = !active || aggregateBrier < activeBrierOnCurrentValidation! * 0.995;
  const notes = promoted
    ? active ? `Amélioration du Brier moyen sur la validation courante : ${activeBrierOnCurrentValidation!.toFixed(4)} → ${aggregateBrier.toFixed(4)}.` : "Premier modèle validé chronologiquement."
    : `Candidat conservé pour audit : Brier ${aggregateBrier.toFixed(4)}, modèle actif ${activeBrierOnCurrentValidation!.toFixed(4)} sur la même validation.`;

  database.transaction(() => {
    if (promoted) database.prepare("UPDATE model_versions SET status='rejected' WHERE status='active'").run();
    database.prepare(`
      INSERT INTO model_versions (version, status, trained_at, promoted_at, training_races, validation_races,
        training_entries, validation_entries, feature_names_json, normalization_json, coefficients_json, metrics_json, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(version, promoted ? "active" : "rejected", attemptedAt, promoted ? attemptedAt : null,
      split.trainingRaces, split.validationRaces, split.training.length, split.validation.length,
      JSON.stringify(MODEL_FEATURE_NAMES), JSON.stringify(normalization), JSON.stringify(coefficients), JSON.stringify(allMetrics), notes);
    if (promoted) savePredictions(database, version, normalization, coefficients);
    database.prepare(`
      UPDATE model_training_state SET last_success_at=?, last_version=?, active_version=COALESCE(?, active_version),
        completed_races_at_last_training=?, status=?, retraining_recommended=0, error_message=NULL WHERE id=1
    `).run(attemptedAt, version, promoted ? version : null, raceCount, promoted ? "active" : "rejected");
  })();
  return { status: promoted ? "active" as const : "rejected" as const, version, raceCount, metrics: allMetrics, activeBrierOnCurrentValidation, notes };
}
