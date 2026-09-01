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
  let brier = 0;
  let logLoss = 0;
  for (const example of examples) {
    const expected = labelFor(target, example.finishPosition);
    const probability = Math.min(1 - 1e-9, Math.max(1e-9, predictProbability(coefficients, example.features, normalization)));
    brier += (probability - expected) ** 2;
    logLoss += -(expected * Math.log(probability) + (1 - expected) * Math.log(1 - probability));
  }
  return { brier: brier / examples.length, logLoss: logLoss / examples.length };
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
