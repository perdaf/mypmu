import { describe, expect, it } from "vitest";
import { parseDetailedPerformances } from "./pmu";

describe("performances détaillées PMU", () => {
  it("valide une sortie passée et identifie la performance du cheval", () => {
    const parsed = parseDetailedPerformances({
      allure: "TROT",
      participants: [{
        numPmu: 7,
        nomCheval: "CHEVAL TEST",
        coursesCourues: [{
          date: 1_646_521_200_000,
          timezoneOffset: 3_600_000,
          hippodrome: "Strasbourg",
          nomPrix: "PRIX TEST",
          discipline: "ATTELE",
          allocation: 19_000,
          distance: 2_800,
          nbParticipants: 11,
          tempsDuPremier: 21_675,
          participants: [{
            numPmu: null,
            place: { place: 3, rawValue: null, statusArrivee: "PLACE" },
            nomCheval: "CHEVAL TEST",
            nomJockey: "A. DRIVER",
            poidsJockey: null,
            corde: null,
            distanceAvecPrecedent: null,
            itsHim: true,
            reductionKilometrique: 7_740,
            distanceParcourue: 2_800,
            oeillere: null,
          }],
        }],
      }],
    });

    const performance = parsed.participants[0].coursesCourues[0];
    expect(performance.discipline).toBe("ATTELE");
    expect(performance.participants.find((participant) => participant.itsHim)?.place?.place).toBe(3);
  });

  it("rejette une réponse sans date de performance", () => {
    expect(() => parseDetailedPerformances({
      participants: [{ numPmu: 1, nomCheval: "INCOMPLET", coursesCourues: [{ participants: [] }] }],
    })).toThrow();
  });

  it("accepte une distance avec le précédent décrite en longueurs", () => {
    const parsed = parseDetailedPerformances({
      participants: [{
        numPmu: 1, nomCheval: "GALOP TEST", coursesCourues: [{
          date: 1_782_597_600_000, participants: [{
            numPmu: 3, place: { place: 2, rawValue: "DP", statusArrivee: "PLACE" },
            nomCheval: "GALOP TEST", itsHim: true,
            distanceAvecPrecedent: { knownValue: "UNE_LONGUEUR_ET_QUART", rawValue: "1 L 1/4" },
          }],
        }],
      }],
    });
    expect(parsed.participants[0].coursesCourues[0].participants[0].distanceAvecPrecedent).toEqual({ knownValue: "UNE_LONGUEUR_ET_QUART", rawValue: "1 L 1/4" });
  });
});
