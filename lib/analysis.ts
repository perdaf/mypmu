import { calculateTicket } from "./bets";
import type { AvailableBet, DetailedPronostics, Participant } from "./pmu";

export type HorseAnalysis = {
  numPmu: number;
  nom: string;
  score: number;
  cote?: number;
  profile: "Base" | "Chance régulière" | "Outsider de valeur" | "Second choix";
  reasons: string[];
  confidence: "Élevée" | "Moyenne" | "Faible";
  missingData: string[];
};

export type TicketProposal = {
  id: string;
  role: "Sécurité" | "Couverture" | "Objectif Quinté+";
  betCode: string;
  horseNumbers: number[];
  flexi: number;
  costCents: number;
  combinations: number;
  explanation: string;
};

export type RaceRecommendation = {
  ranking: HorseAnalysis[];
  tickets: TicketProposal[];
  commentary?: string;
  dataQuality: { completenessPercent: number; lowConfidenceHorses: number; recommendationAllowed: boolean; warning?: string };
};

type Metrics = { market: number; press: number; form: number; career: number; synthesis: number };

function recentForm(music?: string): number | null {
  if (!music) return null;
  const cleaned = music.replace(/\(\d{2,4}\)/g, "");
  const tokens = cleaned.match(/(?:\d+|D|A|T)[a-zA-Z]?/g)?.slice(0, 6) ?? [];
  if (tokens.length === 0) return null;
  const weights = [1, 0.86, 0.72, 0.6, 0.5, 0.42];
  const points = tokens.map((token) => {
    const place = Number.parseInt(token, 10);
    if (!Number.isFinite(place) || place === 0) return 0;
    return Math.max(0, 1 - (place - 1) / 9);
  });
  return points.reduce((sum, point, index) => sum + point * weights[index], 0) /
    weights.slice(0, points.length).reduce((sum, weight) => sum + weight, 0);
}

function normalize(values: Map<number, number>): Map<number, number> {
  const maximum = Math.max(...values.values(), 0);
  return new Map([...values].map(([key, value]) => [key, maximum > 0 ? value / maximum : 0]));
}

function pressScores(pronostics: DetailedPronostics) {
  const raw = new Map<number, number>();
  for (const opinion of pronostics.avis) {
    opinion.pronostics.forEach((horse, index) => raw.set(horse.numPmu, (raw.get(horse.numPmu) ?? 0) + 1 / (index + 1)));
  }
  return normalize(raw);
}

function synthesisScores(pronostics: DetailedPronostics) {
  const raw = new Map<number, number>();
  for (const synthesis of pronostics.syntheses) {
    synthesis.classement.forEach((horse, index) => {
      const citations = horse.nbFoisCite ?? 1;
      raw.set(horse.numPmu, (raw.get(horse.numPmu) ?? 0) + citations / (index + 1));
    });
  }
  return normalize(raw);
}

function findBet(bets: AvailableBet[], codes: string[]) {
  return codes.map((code) => bets.find((bet) => bet.typePari === code)).find(Boolean);
}

function makeTicket(
  id: string,
  role: TicketProposal["role"],
  bet: AvailableBet | undefined,
  horseNumbers: number[],
  preferredFlexi: number,
  explanation: string,
): TicketProposal | null {
  if (!bet) return null;
  const flexi = bet.valeursFlexiAutorisees.includes(preferredFlexi) ? preferredFlexi : 100;
  try {
    const calculation = calculateTicket(bet, horseNumbers.length, flexi);
    return { id, role, betCode: bet.typePari, horseNumbers, flexi, costCents: calculation.costCents, combinations: calculation.combinations, explanation };
  } catch {
    return null;
  }
}

export function analyseRace(participants: Participant[], pronostics: DetailedPronostics | null, bets: AvailableBet[]): RaceRecommendation {
  const active = participants.filter((participant) => participant.statut !== "NON_PARTANT");
  const press = pronostics ? pressScores(pronostics) : new Map<number, number>();
  const synthesis = pronostics ? synthesisScores(pronostics) : new Map<number, number>();
  const marketRaw = new Map(active.flatMap((horse) => horse.dernierRapportDirect?.rapport ? [[horse.numPmu, 1 / horse.dernierRapportDirect.rapport] as const] : []));
  const market = normalize(marketRaw);

  const metrics = new Map<number, Metrics>();
  const missingByHorse = new Map<number, string[]>();
  const hasPressData = Boolean(pronostics?.avis.length);
  const hasSynthesisData = Boolean(pronostics?.syntheses.length);
  for (const horse of active) {
    const races = horse.nombreCourses ?? 0;
    const form = recentForm(horse.musique);
    const careerAvailable = races > 0 && horse.nombreVictoires !== undefined && horse.nombrePlaces !== undefined;
    const career = careerAvailable ? Math.min(1, ((horse.nombreVictoires ?? 0) * 1.5 + (horse.nombrePlaces ?? 0)) / races) : 0.5;
    const missing: string[] = [];
    if (!horse.dernierRapportDirect?.rapport) missing.push("cote");
    if (form === null) missing.push("musique");
    if (!careerAvailable) missing.push("statistiques de carrière");
    if (!hasPressData) missing.push("pronostics presse");
    missingByHorse.set(horse.numPmu, missing);
    metrics.set(horse.numPmu, {
      market: market.get(horse.numPmu) ?? 0.5,
      press: hasPressData ? press.get(horse.numPmu) ?? 0 : 0.5,
      form: form ?? 0.5,
      career,
      synthesis: hasSynthesisData ? synthesis.get(horse.numPmu) ?? 0 : 0.5,
    });
  }

  const scored = active.map((horse) => {
    const value = metrics.get(horse.numPmu)!;
    const trainerBonus = horse.avisEntraineur === "POSITIF" ? 0.03 : 0;
    const knownRatio = (4 - (missingByHorse.get(horse.numPmu)?.length ?? 0)) / 4;
    const rawScore = 100 * (value.market * 0.27 + value.press * 0.28 + value.form * 0.2 + value.career * 0.12 + value.synthesis * 0.13 + trainerBonus);
    const score = rawScore * (0.85 + 0.15 * Math.max(0, knownRatio));
    return { horse, score, value };
  }).sort((a, b) => b.score - a.score);

  const outsider = [...scored]
    .filter(({ horse }) => (horse.dernierRapportDirect?.rapport ?? 0) >= 10)
    .sort((a, b) => (b.value.press * 0.4 + b.value.form * 0.3 + b.value.career * 0.2 + b.value.synthesis * 0.1 - b.value.market * 0.15) - (a.value.press * 0.4 + a.value.form * 0.3 + a.value.career * 0.2 + a.value.synthesis * 0.1 - a.value.market * 0.15))[0];

  const ranking: HorseAnalysis[] = scored.map(({ horse, score, value }, index) => {
    const isOutsider = outsider?.horse.numPmu === horse.numPmu && index > 1;
    const missingData = missingByHorse.get(horse.numPmu) ?? [];
    const confidenceRatio = (4 - missingData.length) / 4;
    const reasons: string[] = [];
    if (value.press >= 0.65) reasons.push("fort consensus des pronostiqueurs");
    if (value.form >= 0.68) reasons.push("forme récente régulière");
    if (value.career >= 0.65) reasons.push("bilan carrière solide");
    if (value.market <= 0.45 && value.press >= 0.35) reasons.push("cote plus haute que son soutien presse");
    if (horse.avisEntraineur === "POSITIF") reasons.push("avis entraîneur positif");
    return {
      numPmu: horse.numPmu, nom: horse.nom, score: Math.min(100, Math.round(score)), cote: horse.dernierRapportDirect?.rapport,
      profile: index < 2 ? "Base" : isOutsider ? "Outsider de valeur" : index < 6 ? "Chance régulière" : "Second choix",
      reasons: reasons.length > 0 ? reasons.slice(0, 2) : ["profil complémentaire dans cette course"],
      confidence: confidenceRatio >= 0.75 ? "Élevée" : confidenceRatio >= 0.5 ? "Moyenne" : "Faible",
      missingData,
    };
  });

  const ordered = ranking.map((horse) => horse.numPmu);
  const outsiderNumber = outsider?.horse.numPmu;
  const withOutsider = (size: number) => {
    const selection = ordered.slice(0, size);
    if (outsiderNumber && !selection.includes(outsiderNumber) && size > 2) selection[size - 1] = outsiderNumber;
    return selection;
  };

  const lowConfidenceHorses = ranking.filter((horse) => horse.confidence === "Faible").length;
  const completenessPercent = ranking.length === 0 ? 0 : Math.round(ranking.reduce((sum, horse) => sum + (4 - horse.missingData.length) / 4, 0) / ranking.length * 100);
  const recommendationAllowed = ranking.length > 0 && lowConfidenceHorses / ranking.length <= 0.4 && completenessPercent >= 55;
  const tickets = recommendationAllowed ? [
    makeTicket("auto-security", "Sécurité", findBet(bets, ["DEUX_SUR_QUATRE", "COUPLE_PLACE", "SIMPLE_PLACE"]), ordered.slice(0, findBet(bets, ["DEUX_SUR_QUATRE", "COUPLE_PLACE"]) ? 3 : 1), 25, "Cherche un rapport avec les chevaux les plus robustes du classement."),
    makeTicket("auto-coverage", "Couverture", findBet(bets, ["MULTI", "MINI_MULTI", "TRIO"]), withOutsider(findBet(bets, ["MULTI"]) ? 6 : 5), 25, "Couvre le noyau de favoris et conserve un outsider soutenu par les indicateurs."),
    makeTicket("auto-upside", "Objectif Quinté+", findBet(bets, ["QUINTE_PLUS", "QUARTE_PLUS", "TIERCE"]), withOutsider(findBet(bets, ["QUINTE_PLUS"]) ? 6 : 5), 25, "Vise le rapport supérieur en combiné avec une mise fractionnée."),
  ].filter((ticket): ticket is TicketProposal => ticket !== null) : [];

  return {
    ranking,
    tickets,
    commentary: pronostics?.commentaire?.texte,
    dataQuality: {
      completenessPercent,
      lowConfidenceHorses,
      recommendationAllowed,
      warning: recommendationAllowed ? undefined : "Trop de données sont absentes pour construire un ticket avec une confiance acceptable.",
    },
  };
}
