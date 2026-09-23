import type Database from "better-sqlite3";
import { MODEL_FEATURE_NAMES, loadModelExamples } from "./model-data";
import {
  MODEL_TARGETS, chronologicalSplit, evaluateRaceRanking, fitNormalization,
  normalizeRaceProbabilities, predictProbability, trainLogisticRegression,
  type ModelTarget, type Normalization, type RankingMetrics, type TrainedTarget,
} from "./model-core";

export const MINIMUM_TRAINING_RACES = 40;
export const MINIMUM_VALIDATION_RACES = 15;
export const RETRAIN_AFTER_NEW_RACES = 20;

type Coefficients = Record<ModelTarget, number[]>;
type EvaluationSummary = { aggregateBrier: number; aggregateLogLoss: number; ranking: RankingMetrics };
type Metrics = Record<ModelTarget, TrainedTarget> & EvaluationSummary & { marketBaseline: EvaluationSummary };

type StoredModel = {
  version: string;
  normalizationJson: string;
  coefficientsJson: string;
  metricsJson: string;
  featureNamesJson: string;
};

function productionProbabilities(examples: ReturnType<typeof loadModelExamples>, coefficients: Coefficients, normalization: Normalization) {
  const values = Object.fromEntries(MODEL_TARGETS.map((target) => [target, normalizeRaceProbabilities(
    examples,
    target,
    (example) => predictProbability(coefficients[target], example.features, normalization),
  )])) as Record<ModelTarget, number[]>;
  examples.forEach((_, index) => {
    values.top3[index] = Math.max(values.win[index], values.top3[index]);
    values.top4[index] = Math.max(values.top3[index], values.top4[index]);
    values.top5[index] = Math.max(values.top4[index], values.top5[index]);
  });
  return values;
}

function evaluateStored(model: StoredModel, validation: ReturnType<typeof loadModelExamples>) {
  const normalization = JSON.parse(model.normalizationJson) as Normalization;
  const coefficients = JSON.parse(model.coefficientsJson) as Coefficients;
  const probabilities = productionProbabilities(validation, coefficients, normalization);
  const targetMetrics = Object.fromEntries(MODEL_TARGETS.map((target) => [target, evaluateModelFromProbabilities(validation, target, probabilities[target])])) as Record<ModelTarget, { brier: number; logLoss: number }>;
  return {
    aggregateBrier: MODEL_TARGETS.reduce((sum, target) => sum + targetMetrics[target].brier, 0) / MODEL_TARGETS.length,
    ranking: evaluateRaceRanking(validation, probabilities.win),
  };
}

function marketBaseline(examples: ReturnType<typeof loadModelExamples>): EvaluationSummary {
  const metrics = Object.fromEntries(MODEL_TARGETS.map((target) => {
    const probabilities = normalizeRaceProbabilities(examples, target, (example) => example.features[0]);
    const labels = evaluateModelFromProbabilities(examples, target, probabilities);
    return [target, labels];
  })) as Record<ModelTarget, { brier: number; logLoss: number }>;
  const winProbabilities = normalizeRaceProbabilities(examples, "win", (example) => example.features[0]);
  return {
    aggregateBrier: MODEL_TARGETS.reduce((sum, target) => sum + metrics[target].brier, 0) / MODEL_TARGETS.length,
    aggregateLogLoss: MODEL_TARGETS.reduce((sum, target) => sum + metrics[target].logLoss, 0) / MODEL_TARGETS.length,
    ranking: evaluateRaceRanking(examples, winProbabilities),
  };
}

function evaluateModelFromProbabilities(examples: ReturnType<typeof loadModelExamples>, target: ModelTarget, probabilities: number[]) {
  let brier = 0;
  let logLoss = 0;
  examples.forEach((example, index) => {
    const limit = target === "win" ? 1 : Number(target.slice(3));
    const expected = example.finishPosition !== null && example.finishPosition <= limit ? 1 : 0;
    const probability = Math.min(1 - 1e-9, Math.max(1e-9, probabilities[index]));
    brier += (probability - expected) ** 2;
    logLoss += -(expected * Math.log(probability) + (1 - expected) * Math.log(1 - probability));
  });
  return { brier: brier / examples.length, logLoss: logLoss / examples.length };
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
  const probabilities = productionProbabilities(predictions, coefficients, normalization);
  predictions.forEach((example, exampleIndex) => {
      const win = probabilities.win[exampleIndex];
      const top3 = probabilities.top3[exampleIndex];
      const top4 = probabilities.top4[exampleIndex];
      const top5 = probabilities.top5[exampleIndex];
    const completeness = example.features[6];
    const historyVolume = example.features[14];
    const confidence = Math.min(1, Math.max(0.15, completeness * (0.55 + 0.45 * historyVolume)));
    insert.run(example.raceId, example.pmuNumber, version, win, top3, top4, top5, confidence, createdAt);
  });
  return predictions.length;
}

export function trainAndPromoteModel(database: Database.Database, options: { onlyIfNeeded?: boolean } = {}) {
  const attemptedAt = new Date().toISOString();
  const examples = loadModelExamples(database, "training");
  const raceCount = new Set(examples.map((item) => item.raceId)).size;
  if (options.onlyIfNeeded) {
    const state = database.prepare("SELECT active_version AS activeVersion, completed_races_at_last_training AS previousRaces FROM model_training_state WHERE id=1")
      .get() as { activeVersion: string | null; previousRaces: number } | undefined;
    if (state) {
      const previousRaces = Math.min(state.previousRaces, raceCount);
      if (previousRaces !== state.previousRaces) database.prepare("UPDATE model_training_state SET completed_races_at_last_training=? WHERE id=1").run(previousRaces);
      const newRaces = Math.max(0, raceCount - previousRaces);
      if (newRaces < RETRAIN_AFTER_NEW_RACES) {
        const active = state.activeVersion ? database.prepare(`
          SELECT version, normalization_json AS normalizationJson, coefficients_json AS coefficientsJson,
            metrics_json AS metricsJson, feature_names_json AS featureNamesJson
          FROM model_versions WHERE version=? AND status='active' AND temporal_validated=1
        `).get(state.activeVersion) as StoredModel | undefined : undefined;
        if (active && active.featureNamesJson === JSON.stringify(MODEL_FEATURE_NAMES)) {
          savePredictions(database, active.version, JSON.parse(active.normalizationJson) as Normalization, JSON.parse(active.coefficientsJson) as Coefficients);
          database.prepare("UPDATE model_training_state SET retraining_recommended=0 WHERE id=1").run();
        } else if (state.activeVersion) {
          database.prepare(`
            UPDATE model_training_state SET active_version=NULL, status='insufficient', retraining_recommended=0,
              error_message='Le modèle historique reste disponible pour audit mais ne respecte pas le protocole temporel v2.'
            WHERE id=1
          `).run();
        } else {
          database.prepare("UPDATE model_training_state SET status='insufficient', retraining_recommended=0 WHERE id=1").run();
        }
        return { status: "not_needed" as const, raceCount, newRaces };
      }
      database.prepare("UPDATE model_training_state SET retraining_recommended=1 WHERE id=1").run();
    }
  }
  database.prepare(`
    INSERT INTO model_training_state (id, last_attempt_at, status) VALUES (1, ?, 'training')
    ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='training', error_message=NULL
  `).run(attemptedAt);
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
  }
  const probabilities = productionProbabilities(split.validation, coefficients, normalization);
  for (const target of MODEL_TARGETS) metrics[target] = {
    coefficients: coefficients[target],
    ...evaluateModelFromProbabilities(split.validation, target, probabilities[target]),
  };
  const aggregateBrier = MODEL_TARGETS.reduce((sum, target) => sum + metrics[target].brier, 0) / MODEL_TARGETS.length;
  const aggregateLogLoss = MODEL_TARGETS.reduce((sum, target) => sum + metrics[target].logLoss, 0) / MODEL_TARGETS.length;
  const ranking = evaluateRaceRanking(split.validation, probabilities.win);
  const baseline = marketBaseline(split.validation);
  const allMetrics: Metrics = { ...metrics, aggregateBrier, aggregateLogLoss, ranking, marketBaseline: baseline };
  const version = `logistic-v2-${attemptedAt.replace(/[-:.TZ]/g, "").slice(0, 17)}`;
  const active = database.prepare(`
    SELECT version, normalization_json AS normalizationJson, coefficients_json AS coefficientsJson,
      metrics_json AS metricsJson, feature_names_json AS featureNamesJson
    FROM model_versions WHERE status='active' AND temporal_validated=1 ORDER BY promoted_at DESC LIMIT 1
  `).get() as StoredModel | undefined;
  const compatibleActive = active?.featureNamesJson === JSON.stringify(MODEL_FEATURE_NAMES) ? active : null;
  const activeEvaluation = compatibleActive ? evaluateStored(compatibleActive, split.validation) : null;
  const beatsMarket = aggregateBrier < baseline.aggregateBrier * 0.995
    && ranking.ndcgAt5 >= baseline.ranking.ndcgAt5
    && ranking.pairwiseOrderAccuracy >= baseline.ranking.pairwiseOrderAccuracy;
  const beatsActive = !activeEvaluation || aggregateBrier < activeEvaluation.aggregateBrier * 0.995;
  const promoted = split.validationRaces >= MINIMUM_VALIDATION_RACES && beatsMarket && beatsActive;
  const notes = promoted
    ? `Modèle temporel validé : Brier ${aggregateBrier.toFixed(4)} contre marché ${baseline.aggregateBrier.toFixed(4)}, NDCG@5 ${ranking.ndcgAt5.toFixed(3)}.`
    : split.validationRaces < MINIMUM_VALIDATION_RACES
      ? `Candidat conservé pour audit : ${split.validationRaces} courses de validation sur ${MINIMUM_VALIDATION_RACES} requises avant toute promotion.`
      : `Candidat conservé pour audit : Brier ${aggregateBrier.toFixed(4)} contre marché ${baseline.aggregateBrier.toFixed(4)}, ordre par paires ${ranking.pairwiseOrderAccuracy.toFixed(3)} contre ${baseline.ranking.pairwiseOrderAccuracy.toFixed(3)}.`;

  database.transaction(() => {
    if (promoted) database.prepare("UPDATE model_versions SET status='rejected' WHERE status='active'").run();
    database.prepare(`
      INSERT INTO model_versions (version, status, trained_at, promoted_at, training_races, validation_races,
        training_entries, validation_entries, feature_names_json, normalization_json, coefficients_json, metrics_json, notes, temporal_validated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(version, promoted ? "active" : "rejected", attemptedAt, promoted ? attemptedAt : null,
      split.trainingRaces, split.validationRaces, split.training.length, split.validation.length,
      JSON.stringify(MODEL_FEATURE_NAMES), JSON.stringify(normalization), JSON.stringify(coefficients), JSON.stringify(allMetrics), notes);
    if (promoted) savePredictions(database, version, normalization, coefficients);
    database.prepare(`
      UPDATE model_training_state SET last_success_at=?, last_version=?, active_version=COALESCE(?, active_version),
        completed_races_at_last_training=?, status=?, retraining_recommended=0, error_message=NULL WHERE id=1
    `).run(attemptedAt, version, promoted ? version : null, raceCount, promoted ? "active" : "rejected");
  })();
  return { status: promoted ? "active" as const : "rejected" as const, version, raceCount, metrics: allMetrics, activeBrierOnCurrentValidation: activeEvaluation?.aggregateBrier ?? null, notes };
}
