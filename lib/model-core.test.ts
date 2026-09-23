import { describe, expect, it } from "vitest";
import {
  chronologicalSplit, evaluateRaceRanking, fitNormalization, normalizeRaceProbabilities,
  predictProbability, trainLogisticRegression, type TrainingExample,
} from "./model-core";

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

  it("normalise les probabilités par course selon le nombre de places", () => {
    const probabilities = normalizeRaceProbabilities(examples.slice(0, 4), "win", (row) => row.features[0] + 0.1);
    expect(probabilities.slice(0, 2).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    expect(probabilities.slice(2, 4).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
  });

  it("récompense un classement qui respecte l’ordre exact d’arrivée", () => {
    const ordered: TrainingExample[] = Array.from({ length: 6 }, (_, index) => ({
      raceId: "R-order", raceDate: "20260101", pmuNumber: index + 1,
      features: [0], finishPosition: index + 1,
    }));
    const correct = evaluateRaceRanking(ordered, [1, 0.8, 0.6, 0.4, 0.2, 0.1]);
    const reversed = evaluateRaceRanking(ordered, [0.1, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(correct.winnerHitRate).toBe(1);
    expect(correct.exactTop5Rate).toBe(1);
    expect(correct.pairwiseOrderAccuracy).toBe(1);
    expect(correct.ndcgAt5).toBe(1);
    expect(reversed.pairwiseOrderAccuracy).toBe(0);
    expect(reversed.ndcgAt5).toBeLessThan(correct.ndcgAt5);
  });

  it("accepte l’ordre interne inversé de deux chevaux ex æquo", () => {
    const tied: TrainingExample[] = [1, 1, 3, 4, 5, 6].map((finishPosition, index) => ({
      raceId: "R-tie", raceDate: "20260101", pmuNumber: index + 1,
      features: [0], finishPosition,
    }));
    const ranking = evaluateRaceRanking(tied, [0.8, 1, 0.6, 0.4, 0.2, 0.1]);
    expect(ranking.winnerHitRate).toBe(1);
    expect(ranking.exactTop5Rate).toBe(1);
    expect(ranking.pairwiseOrderAccuracy).toBe(1);
    expect(ranking.ndcgAt5).toBe(1);
  });
});
