export const MODEL_TARGETS = ["win", "top3", "top4", "top5"] as const;
export type ModelTarget = typeof MODEL_TARGETS[number];

export type TrainingExample = {
  raceId: string;
  raceDate: string;
  pmuNumber: number;
  features: number[];
  finishPosition: number | null;
};

export type Normalization = { means: number[]; scales: number[] };
export type TrainedTarget = { coefficients: number[]; brier: number; logLoss: number };
export type RankingMetrics = {
  winnerHitRate: number;
  top5Recall: number;
  exactTop5Rate: number;
  pairwiseOrderAccuracy: number;
  ndcgAt5: number;
};

export function labelFor(target: ModelTarget, finishPosition: number | null) {
  if (!finishPosition) return 0;
  const limit = target === "win" ? 1 : Number(target.slice(3));
  return finishPosition <= limit ? 1 : 0;
}

export function fitNormalization(rows: number[][]): Normalization {
  const width = rows[0]?.length ?? 0;
  const means = Array.from({ length: width }, (_, column) => rows.reduce((sum, row) => sum + row[column], 0) / rows.length);
  const scales = means.map((mean, column) => {
    const variance = rows.reduce((sum, row) => sum + (row[column] - mean) ** 2, 0) / Math.max(1, rows.length - 1);
    return Math.sqrt(variance) || 1;
  });
  return { means, scales };
}

export function normalizeFeatures(features: number[], normalization: Normalization) {
  return features.map((value, index) => (value - normalization.means[index]) / normalization.scales[index]);
}

export function sigmoid(value: number) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

export function predictProbability(coefficients: number[], features: number[], normalization: Normalization) {
  const normalized = normalizeFeatures(features, normalization);
  return sigmoid(coefficients[0] + normalized.reduce((sum, value, index) => sum + value * coefficients[index + 1], 0));
}

export function trainLogisticRegression(
  examples: TrainingExample[], target: ModelTarget, normalization: Normalization,
  options: { iterations?: number; learningRate?: number; l2?: number } = {},
) {
  const width = examples[0]?.features.length ?? 0;
  const coefficients = Array(width + 1).fill(0) as number[];
  const iterations = options.iterations ?? 1_400;
  const learningRate = options.learningRate ?? 0.08;
  const l2 = options.l2 ?? 0.01;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradient = Array(width + 1).fill(0) as number[];
    for (const example of examples) {
      const features = normalizeFeatures(example.features, normalization);
      const error = predictProbability(coefficients, example.features, normalization) - labelFor(target, example.finishPosition);
      gradient[0] += error;
      features.forEach((value, index) => { gradient[index + 1] += error * value; });
    }
    coefficients[0] -= learningRate * gradient[0] / examples.length;
    for (let index = 1; index < coefficients.length; index += 1) {
      coefficients[index] -= learningRate * (gradient[index] / examples.length + l2 * coefficients[index]);
    }
  }
  return coefficients;
}

export function evaluateModel(examples: TrainingExample[], target: ModelTarget, coefficients: number[], normalization: Normalization) {
  const probabilities = normalizeRaceProbabilities(
    examples,
    target,
    (example) => predictProbability(coefficients, example.features, normalization),
  );
  return evaluateProbabilities(examples, target, probabilities);
}

export function normalizeRaceProbabilities(
  examples: TrainingExample[],
  target: ModelTarget,
  predictor: (example: TrainingExample) => number,
) {
  const probabilities = Array(examples.length).fill(0) as number[];
  const raceIndexes = new Map<string, number[]>();
  examples.forEach((example, index) => raceIndexes.set(example.raceId, [...(raceIndexes.get(example.raceId) ?? []), index]));
  const expectedPlaces = target === "win" ? 1 : Number(target.slice(3));
  for (const indexes of raceIndexes.values()) {
    const raw = indexes.map((index) => Math.max(0, predictor(examples[index])));
    const sum = raw.reduce((total, value) => total + value, 0);
    indexes.forEach((exampleIndex, raceIndex) => {
      probabilities[exampleIndex] = Math.min(1, raw[raceIndex] * expectedPlaces / Math.max(1e-9, sum));
    });
  }
  return probabilities;
}

export function evaluateProbabilities(examples: TrainingExample[], target: ModelTarget, probabilities: number[]) {
  let brier = 0;
  let logLoss = 0;
  examples.forEach((example, index) => {
    const expected = labelFor(target, example.finishPosition);
    const probability = Math.min(1 - 1e-9, Math.max(1e-9, probabilities[index]));
    brier += (probability - expected) ** 2;
    logLoss += -(expected * Math.log(probability) + (1 - expected) * Math.log(1 - probability));
  });
  return { brier: brier / examples.length, logLoss: logLoss / examples.length };
}

export function evaluateRaceRanking(examples: TrainingExample[], winProbabilities: number[]): RankingMetrics {
  const races = new Map<string, number[]>();
  examples.forEach((example, index) => races.set(example.raceId, [...(races.get(example.raceId) ?? []), index]));
  let winnerHits = 0;
  let top5Recall = 0;
  let exactTop5 = 0;
  let correctPairs = 0;
  let totalPairs = 0;
  let ndcg = 0;
  for (const indexes of races.values()) {
    const predicted = [...indexes].sort((left, right) => winProbabilities[right] - winProbabilities[left]);
    const actual = [...indexes]
      .filter((index) => examples[index].finishPosition !== null)
      .sort((left, right) => examples[left].finishPosition! - examples[right].finishPosition!);
    if (actual.length === 0) continue;
    if (examples[predicted[0]].finishPosition === 1) winnerHits += 1;
    const actualTop5 = actual.filter((index) => examples[index].finishPosition! <= 5).slice(0, 5);
    const predictedTop5 = predicted.slice(0, 5);
    top5Recall += actualTop5.filter((index) => predictedTop5.includes(index)).length / Math.max(1, actualTop5.length);
    if (actualTop5.length === 5 && predictedTop5.every((index, position) =>
      examples[index].finishPosition === examples[actualTop5[position]].finishPosition
    )) exactTop5 += 1;
    for (let left = 0; left < actual.length; left += 1) {
      for (let right = left + 1; right < actual.length; right += 1) {
        const leftPlace = examples[actual[left]].finishPosition!;
        const rightPlace = examples[actual[right]].finishPosition!;
        if (leftPlace === rightPlace) continue;
        totalPairs += 1;
        if (predicted.indexOf(actual[left]) < predicted.indexOf(actual[right])) correctPairs += 1;
      }
    }
    const relevance = (index: number) => Math.max(0, 6 - (examples[index].finishPosition ?? 99));
    const dcg = predictedTop5.reduce((sum, index, position) => sum + (2 ** relevance(index) - 1) / Math.log2(position + 2), 0);
    const ideal = actualTop5.reduce((sum, index, position) => sum + (2 ** relevance(index) - 1) / Math.log2(position + 2), 0);
    ndcg += ideal > 0 ? dcg / ideal : 0;
  }
  const raceCount = Math.max(1, races.size);
  return {
    winnerHitRate: winnerHits / raceCount,
    top5Recall: top5Recall / raceCount,
    exactTop5Rate: exactTop5 / raceCount,
    pairwiseOrderAccuracy: correctPairs / Math.max(1, totalPairs),
    ndcgAt5: ndcg / raceCount,
  };
}

export function chronologicalSplit(examples: TrainingExample[], validationRatio = 0.2) {
  const dates = [...new Set(examples.map((item) => item.raceDate))].sort();
  const validationDates = new Set(dates.slice(Math.max(1, Math.floor(dates.length * (1 - validationRatio)))));
  return {
    training: examples.filter((item) => !validationDates.has(item.raceDate)),
    validation: examples.filter((item) => validationDates.has(item.raceDate)),
    trainingRaces: dates.length - validationDates.size,
    validationRaces: validationDates.size,
  };
}
