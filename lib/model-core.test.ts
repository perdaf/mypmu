import { describe, expect, it } from "vitest";
import { chronologicalSplit, fitNormalization, predictProbability, trainLogisticRegression, type TrainingExample } from "./model-core";

describe("apprentissage chronologique", () => {
  const examples: TrainingExample[] = Array.from({ length: 20 }, (_, index) => ({
    raceId: `R${Math.floor(index / 2)}`, raceDate: String(20260101 + Math.floor(index / 2)), pmuNumber: index,
    features: [index / 20, index % 2], finishPosition: index > 12 ? 1 : 8,
  }));

  it("réserve les dates les plus récentes à la validation", () => {
    const split = chronologicalSplit(examples);
    expect(Math.max(...split.training.map((row) => Number(row.raceDate)))).toBeLessThan(Math.min(...split.validation.map((row) => Number(row.raceDate))));
  });

  it("apprend une probabilité plus haute pour un profil positif", () => {
    const normalization = fitNormalization(examples.map((row) => row.features));
    const coefficients = trainLogisticRegression(examples, "win", normalization, { iterations: 600 });
    expect(predictProbability(coefficients, [0.95, 1], normalization)).toBeGreaterThan(predictProbability(coefficients, [0.05, 0], normalization));
  });
});
