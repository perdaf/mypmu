import { describe, expect, it } from "vitest";
import { formatMartiniqueStart, formatRaceCountdown } from "./race-countdown";

describe("formatRaceCountdown", () => {
  const now = Date.UTC(2026, 8, 3, 12, 0, 0);

  it("affiche heures, minutes et secondes avant le départ", () => {
    expect(formatRaceCountdown(now + 3_661_000, now)).toEqual({
      state: "upcoming",
      label: "01 : 01 : 01",
    });
  });

  it("affiche jours, heures et minutes pour une échéance lointaine", () => {
    expect(formatRaceCountdown(now + 93_600_000, now)).toEqual({
      state: "upcoming",
      label: "01 : 02 : 00",
    });
  });

  it("signale un départ imminent puis une course partie", () => {
    expect(formatRaceCountdown(now + 60_000, now)).toEqual({ state: "imminent", label: "Départ imminent" });
    expect(formatRaceCountdown(now, now)).toEqual({ state: "started", label: "Course partie" });
  });
});

describe("formatMartiniqueStart", () => {
  it("convertit explicitement l'instant en heure de Martinique", () => {
    expect(formatMartiniqueStart(Date.UTC(2026, 8, 3, 17, 15))).toBe("13:15");
  });
});
