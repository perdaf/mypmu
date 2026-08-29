import { describe, expect, it } from "vitest";
import { calculateTicket, combinations, selectionRange } from "./bets";
import type { AvailableBet } from "./pmu";

const multi: AvailableBet = {
  typePari: "MULTI",
  codePari: "MULTI",
  miseBase: 300,
  enVente: true,
  nbChevauxReglementaire: 4,
  ordre: false,
  combine: true,
  valeursFlexiAutorisees: [25, 50],
  valeursRisqueAutorisees: [4, 5, 6, 7],
};

const quinte: AvailableBet = {
  typePari: "QUINTE_PLUS",
  codePari: "QUINTE_PLUS",
  miseBase: 200,
  enVente: true,
  nbChevauxReglementaire: 5,
  ordre: true,
  combine: true,
  valeursFlexiAutorisees: [25, 50],
  valeursRisqueAutorisees: [],
};

describe("combinations", () => {
  it("calcule les combinaisons sans ordre", () => {
    expect(combinations(7, 4)).toBe(35);
    expect(combinations(7, 5)).toBe(21);
    expect(combinations(2, 4)).toBe(0);
  });
});

describe("calculateTicket", () => {
  it("un Multi en 7 reste un pari unitaire couvrant 35 groupes", () => {
    expect(calculateTicket(multi, 7, 25)).toEqual({
      combinations: 1,
      coveredOutcomes: 35,
      costCents: 75,
      flexi: 25,
    });
  });

  it("un Quinté combiné de 7 chevaux contient 21 combinaisons", () => {
    expect(calculateTicket(quinte, 7, 25)).toEqual({
      combinations: 21,
      coveredOutcomes: 21,
      costCents: 1050,
      flexi: 25,
    });
  });

  it("refuse un Flexi absent des options PMU", () => {
    expect(() => calculateTicket(quinte, 5, 10)).toThrow("Flexi non autorisé");
  });

  it("limite les choix Multi aux risques proposés", () => {
    expect(selectionRange(multi, 6)).toEqual([4, 5, 6]);
    expect(() => calculateTicket(multi, 8, 25)).toThrow("formule Multi");
  });
});
