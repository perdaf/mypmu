import { describe, expect, it } from "vitest";
import { analyseRace } from "./analysis";
import type { AvailableBet, DetailedPronostics, Participant } from "./pmu";

const participants: Participant[] = [
  { numPmu: 1, nom: "BASE A", statut: "PARTANT", musique: "1a2a1a3a", nombreCourses: 10, nombreVictoires: 4, nombrePlaces: 5, dernierRapportDirect: { rapport: 3 } },
  { numPmu: 2, nom: "BASE B", statut: "PARTANT", musique: "2a1a3a2a", nombreCourses: 10, nombreVictoires: 3, nombrePlaces: 6, dernierRapportDirect: { rapport: 4 } },
  { numPmu: 3, nom: "REGULIER", statut: "PARTANT", musique: "3a3a4a2a", nombreCourses: 12, nombreVictoires: 2, nombrePlaces: 8, dernierRapportDirect: { rapport: 7 } },
  { numPmu: 4, nom: "OUTSIDER", statut: "PARTANT", musique: "2a4a3a5a", nombreCourses: 12, nombreVictoires: 2, nombrePlaces: 7, dernierRapportDirect: { rapport: 20 } },
  { numPmu: 5, nom: "CHANCE", statut: "PARTANT", musique: "5a4a6a3a", nombreCourses: 14, nombreVictoires: 2, nombrePlaces: 6, dernierRapportDirect: { rapport: 12 } },
  { numPmu: 6, nom: "SECOND", statut: "PARTANT", musique: "8a7a6a5a", nombreCourses: 15, nombreVictoires: 1, nombrePlaces: 4, dernierRapportDirect: { rapport: 30 } },
  { numPmu: 7, nom: "INEDIT SANS DONNEES", statut: "PARTANT" },
];

const pronostics: DetailedPronostics = {
  syntheses: [],
  cribles: [],
  avis: [
    { societe: "A", pronostics: [1, 2, 4, 3, 5].map((numPmu) => ({ numPmu })) },
    { societe: "B", pronostics: [2, 1, 4, 3, 5].map((numPmu) => ({ numPmu })) },
  ],
};

function bet(typePari: string, miseBase: number, horses: number, risks: number[] = []): AvailableBet {
  return { typePari, codePari: typePari, miseBase, enVente: true, nbChevauxReglementaire: horses, ordre: false, combine: true, valeursFlexiAutorisees: [25, 50], valeursRisqueAutorisees: risks };
}

describe("analyseRace", () => {
  it("propose trois niveaux de jeu et conserve un outsider soutenu", () => {
    const recommendation = analyseRace(participants, pronostics, [
      bet("DEUX_SUR_QUATRE", 300, 2),
      bet("MINI_MULTI", 300, 4, [4, 5, 6]),
      bet("QUINTE_PLUS", 200, 5),
    ]);

    expect(recommendation.tickets).toHaveLength(3);
    expect(recommendation.ranking.find((horse) => horse.numPmu === 4)?.profile).toBe("Outsider de valeur");
    expect(recommendation.tickets.every((ticket) => ticket.flexi === 25)).toBe(true);
    expect(recommendation.tickets.find((ticket) => ticket.role === "Objectif Quinté+")?.horseNumbers).toContain(4);
    const incomplete = recommendation.ranking.find((horse) => horse.numPmu === 7);
    expect(incomplete?.confidence).toBe("Faible");
    expect(incomplete?.missingData).toContain("musique");
    expect(incomplete?.score).toBeGreaterThan(0);
  });

  it("s’abstient lorsque la majorité des partants est sans données", () => {
    const sparse = Array.from({ length: 6 }, (_, index) => ({ numPmu: index + 1, nom: `INCONNU ${index + 1}`, statut: "PARTANT" } satisfies Participant));
    const recommendation = analyseRace(sparse, null, [bet("DEUX_SUR_QUATRE", 300, 2)]);
    expect(recommendation.dataQuality.recommendationAllowed).toBe(false);
    expect(recommendation.tickets).toHaveLength(0);
  });
});
