import { describe, expect, it } from "vitest";
import { formatDuration, pmuDateRange } from "./history-collection";

describe("planification de la collecte historique", () => {
  it("construit une plage inclusive en traversant un mois", () => {
    expect(pmuDateRange("30082026", "02092026")).toEqual(["30082026", "31082026", "01092026", "02092026"]);
  });

  it("rejette une plage inversée ou trop longue", () => {
    expect(() => pmuDateRange("02092026", "01092026")).toThrow();
    expect(() => pmuDateRange("01012025", "02012026")).toThrow();
  });

  it("formate une estimation lisible", () => {
    expect(formatDuration(125_000)).toBe("2 min 5 s");
  });
});
