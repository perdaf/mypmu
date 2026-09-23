import { describe, expect, it } from "vitest";
import { expandArrivalOrder } from "./race-results";

describe("ordre d'arrivée", () => {
  it("décale les rangs suivants après des ex æquo", () => {
    expect(expandArrivalOrder([[4, 11], [8], [9], [7, 16], [12]])).toEqual([
      { finishingPosition: 1, pmuNumber: 4, deadHeatGroup: 1 },
      { finishingPosition: 1, pmuNumber: 11, deadHeatGroup: 1 },
      { finishingPosition: 3, pmuNumber: 8, deadHeatGroup: 0 },
      { finishingPosition: 4, pmuNumber: 9, deadHeatGroup: 0 },
      { finishingPosition: 5, pmuNumber: 7, deadHeatGroup: 5 },
      { finishingPosition: 5, pmuNumber: 16, deadHeatGroup: 5 },
      { finishingPosition: 7, pmuNumber: 12, deadHeatGroup: 0 },
    ]);
  });
});
