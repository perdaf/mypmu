import { describe, expect, it } from "vitest";
import {
  nextQuinteDelay,
  QUINTE_FAR_INTERVAL_MS,
  QUINTE_NEAR_INTERVAL_MS,
} from "./quinte-schedule";

describe("nextQuinteDelay", () => {
  const now = Date.UTC(2026, 8, 3, 12);

  it("attend quinze minutes lorsque la course est encore éloignée", () => {
    expect(nextQuinteDelay(now, { scheduledAt: now + 3_600_000, resultsAvailable: false }))
      .toBe(QUINTE_FAR_INTERVAL_MS);
  });

  it("se réveille exactement à l'entrée dans la fenêtre des trente minutes", () => {
    expect(nextQuinteDelay(now, { scheduledAt: now + 35 * 60_000, resultsAvailable: false }))
      .toBe(5 * 60_000);
  });

  it("passe à cinq minutes près du départ et jusqu'aux résultats", () => {
    expect(nextQuinteDelay(now, { scheduledAt: now + 20 * 60_000, resultsAvailable: false }))
      .toBe(QUINTE_NEAR_INTERVAL_MS);
    expect(nextQuinteDelay(now, { scheduledAt: now - 20 * 60_000, resultsAvailable: false }))
      .toBe(QUINTE_NEAR_INTERVAL_MS);
  });

  it("aligne un dernier relevé une minute avant le départ", () => {
    expect(nextQuinteDelay(now, { scheduledAt: now + 3 * 60_000, resultsAvailable: false }))
      .toBe(2 * 60_000);
  });

  it("revient à quinze minutes après obtention des résultats", () => {
    expect(nextQuinteDelay(now, { scheduledAt: now - 20 * 60_000, resultsAvailable: true }))
      .toBe(QUINTE_FAR_INTERVAL_MS);
  });
});
