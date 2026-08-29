import type { AvailableBet } from "./pmu";

const MULTI_TYPES = new Set(["MULTI", "MINI_MULTI"]);

export type TicketCalculation = {
  combinations: number;
  coveredOutcomes: number;
  costCents: number;
  flexi: number;
};

export function combinations(total: number, selected: number): number {
  if (!Number.isInteger(total) || !Number.isInteger(selected) || total < 0 || selected < 0) {
    throw new Error("Les valeurs doivent être des entiers positifs.");
  }
  if (selected > total) return 0;
  const size = Math.min(selected, total - selected);
  let result = 1;
  for (let index = 1; index <= size; index += 1) {
    result = (result * (total - size + index)) / index;
  }
  return result;
}

export function allowedFlexis(bet: AvailableBet): number[] {
  return [...new Set([100, ...bet.valeursFlexiAutorisees])].sort((a, b) => b - a);
}

export function selectionRange(bet: AvailableBet, participantCount: number): number[] {
  if (MULTI_TYPES.has(bet.typePari) && bet.valeursRisqueAutorisees.length > 0) {
    return bet.valeursRisqueAutorisees.filter((value) => value <= participantCount);
  }
  const maximum = bet.combine
    ? Math.min(participantCount, bet.nbChevauxReglementaire + 3)
    : bet.nbChevauxReglementaire;
  return Array.from(
    { length: maximum - bet.nbChevauxReglementaire + 1 },
    (_, index) => bet.nbChevauxReglementaire + index,
  );
}

export function calculateTicket(
  bet: AvailableBet,
  selectedHorses: number,
  flexi = 100,
): TicketCalculation {
  if (!allowedFlexis(bet).includes(flexi)) throw new Error("Flexi non autorisé pour ce pari.");
  if (selectedHorses < bet.nbChevauxReglementaire) throw new Error("Nombre de chevaux insuffisant.");

  let unitCombinations: number;
  let coveredOutcomes: number;

  if (MULTI_TYPES.has(bet.typePari)) {
    if (!bet.valeursRisqueAutorisees.includes(selectedHorses)) {
      throw new Error("Cette formule Multi n’est pas disponible.");
    }
    unitCombinations = 1;
    coveredOutcomes = combinations(selectedHorses, 4);
  } else {
    if (selectedHorses > bet.nbChevauxReglementaire && !bet.combine) {
      throw new Error("La formule combinée n’est pas autorisée.");
    }
    unitCombinations = combinations(selectedHorses, bet.nbChevauxReglementaire);
    coveredOutcomes = unitCombinations;
  }

  return {
    combinations: unitCombinations,
    coveredOutcomes,
    costCents: Math.round(bet.miseBase * unitCombinations * (flexi / 100)),
    flexi,
  };
}

export function betLabel(code: string): string {
  const labels: Record<string, string> = {
    SIMPLE_GAGNANT: "Simple gagnant",
    SIMPLE_PLACE: "Simple placé",
    COUPLE_GAGNANT: "Couplé gagnant",
    COUPLE_PLACE: "Couplé placé",
    DEUX_SUR_QUATRE: "2sur4",
    TRIO: "Trio",
    TIERCE: "Tiercé",
    QUARTE_PLUS: "Quarté+",
    QUINTE_PLUS: "Quinté+",
    MINI_MULTI: "Mini-Multi",
    MULTI: "Multi",
  };
  return labels[code] ?? code.replaceAll("_", " ").toLocaleLowerCase("fr-FR");
}

export function betRole(code: string): "Fréquence" | "Équilibre" | "Potentiel" {
  if (["SIMPLE_PLACE", "COUPLE_PLACE", "DEUX_SUR_QUATRE"].includes(code)) return "Fréquence";
  if (["MULTI", "MINI_MULTI", "TRIO"].includes(code)) return "Équilibre";
  return "Potentiel";
}
