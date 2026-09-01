import { describe, expect, it } from "vitest";
import { closestHourlyIndex } from "./weather";

describe("météo de course", () => {
  it("sélectionne l’observation la plus proche du départ", () => {
    const times = ["2026-08-29T12:00", "2026-08-29T13:00", "2026-08-29T14:00"];
    expect(closestHourlyIndex(times, Date.parse("2026-08-29T13:24:00Z"))).toBe(1);
  });

  it("signale une série horaire vide", () => {
    expect(closestHourlyIndex([], Date.now())).toBe(-1);
  });
});
