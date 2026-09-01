import {
  getDetailedPerformances,
  getFinalReports,
  getParticipants,
  getProgramme,
} from "./pmu";

export type RacingDataProvider = {
  id: string;
  label: string;
  getProgramme: typeof getProgramme;
  getParticipants: typeof getParticipants;
  getDetailedPerformances: typeof getDetailedPerformances;
  getFinalReports: typeof getFinalReports;
};

export const pmuProvider: RacingDataProvider = {
  id: "PMU",
  label: "PMU officiel (passerelles online/offline)",
  getProgramme,
  getParticipants,
  getDetailedPerformances,
  getFinalReports,
};

export type ProviderDescriptor = {
  id: string;
  label: string;
  role: string;
  configured: boolean;
  usable: boolean;
  note: string;
};

export function providerCatalog(): ProviderDescriptor[] {
  const turfBzhKeyDetected = Boolean(process.env.TURF_BZH_API_KEY);
  return [
    { id: "PMU", label: "PMU officiel", role: "Programmes, partants, cotes, résultats et performances", configured: true, usable: true, note: "Trois passerelles essayées automatiquement." },
    { id: "OPEN_METEO", label: "Open-Meteo", role: "Météo horaire historique", configured: true, usable: true, note: "Accès sans clé, séparé de l’état officiel du terrain." },
    { id: "OSM_NOMINATIM", label: "OpenStreetMap", role: "Coordonnées des hippodromes", configured: true, usable: true, note: "Résultats mis en cache dans SQLite." },
    {
      id: "TURF_BZH", label: "Turf.bzh", role: "Historique secondaire optionnel", configured: turfBzhKeyDetected, usable: false,
      note: turfBzhKeyDetected ? "Clé détectée ; adaptation du format restant à valider." : "Non configuré : aucune clé API, le collecteur ne l’appelle pas.",
    },
  ];
}
