import { describe, expect, it } from "vitest";
import { buildHistoricalIndicators } from "./historical-indicators";
import type { DetailedPerformances } from "./pmu";

function pastRace(date: number, place: number | null, discipline = "ATTELE", distance = 2_700) {
  return {
    date, timezoneOffset: 0, hippodrome: "Vincennes", nomPrix: "Prix test", discipline,
    allocation: 20_000, distance, nbParticipants: 10, tempsDuPremier: null,
    participants: [{ numPmu: null, place: { place, rawValue: null, statusArrivee: place ? "PLACE" : "DISQUALIFIE" }, nomCheval: "TEST", nomJockey: null, poidsJockey: null, corde: null, distanceAvecPrecedent: null, itsHim: true, reductionKilometrique: null, distanceParcourue: distance, oeillere: null }],
  };
}

describe("indicateurs historiques", () => {
  it("ignore strictement une course postérieure au départ", () => {
    const start = Date.parse("2026-08-29T14:00:00Z");
    const details: DetailedPerformances = { allure: "TROT", participants: [{ numPmu: 4, nomCheval: "TEST", coursesCourues: [pastRace(start + 1_000, 1), pastRace(start - 86_400_000, 2)] }] };
    const indicator = buildHistoricalIndicators(details, { scheduledAt: start, discipline: "ATTELE", distance: 2_700, hippodrome: "Hippodrome de Paris-Vincennes" }).get(4);
    expect(indicator?.races).toBe(1);
    expect(indicator?.formScore).toBe(89);
  });

  it("mesure l’aptitude au contexte et les disqualifications", () => {
    const start = Date.parse("2026-08-29T14:00:00Z");
    const details: DetailedPerformances = { allure: "TROT", participants: [{ numPmu: 2, nomCheval: "TEST", coursesCourues: [pastRace(start - 1_000, 1), pastRace(start - 2_000, null), pastRace(start - 3_000, 3), pastRace(start - 4_000, 2)] }] };
    const indicator = buildHistoricalIndicators(details, { scheduledAt: start, discipline: "ATTELE", distance: 2_700, hippodrome: "Vincennes" }).get(2);
    expect(indicator?.discipline.races).toBe(4);
    expect(indicator?.distance.races).toBe(4);
    expect(indicator?.hippodrome.races).toBe(4);
    expect(indicator?.disqualificationPercent).toBe(25);
    expect(indicator?.confidence).toBe("Moyenne");
  });
});
