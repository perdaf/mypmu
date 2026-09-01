import { z } from "zod";
import { assertPmuDate } from "./date";

const DEFAULT_API_ROOTS = [
  "https://online.turfinfo.api.pmu.fr/rest/client/62/programme",
  "https://offline.turfinfo.api.pmu.fr/rest/client/7/programme",
  "https://online.turfinfo.api.pmu.fr/rest/client/61/programme",
];

function apiRoots() {
  const configured = process.env.MYPMU_PMU_API_ROOTS?.split(",").map((value) => value.trim()).filter(Boolean);
  return configured?.length ? configured : DEFAULT_API_ROOTS;
}

let lastRequestAt = 0;

const betSchema = z.object({
  codePari: z.string(),
  course: z.object({
    numReunion: z.number(),
    numOrdre: z.number(),
  }),
});

const availableBetSchema = z.object({
  typePari: z.string(),
  codePari: z.string(),
  miseBase: z.number().int().positive(),
  enVente: z.boolean(),
  nbChevauxReglementaire: z.number().int().positive(),
  ordre: z.boolean().default(false),
  combine: z.boolean().default(false),
  valeursFlexiAutorisees: z.array(z.number().int().positive()).default([]),
  valeursRisqueAutorisees: z.array(z.number().int().positive()).default([]),
});

const availableBetsSchema = z.array(z.unknown()).transform((items) =>
  items.flatMap((item) => {
    const result = availableBetSchema.safeParse(item);
    return result.success ? [result.data] : [];
  }),
);

const courseSchema = z.object({
  numReunion: z.number(),
  numOrdre: z.number(),
  heureDepart: z.number().optional(),
  libelle: z.string(),
  discipline: z.string().optional(),
  specialite: z.string().optional(),
  distance: z.number().optional(),
  corde: z.string().optional(),
  nombreDeclaresPartants: z.number().optional(),
  statut: z.string().optional(),
  ordreArrivee: z.array(z.array(z.number())).optional(),
  rapportsDefinitifsDisponibles: z.boolean().optional(),
  paris: availableBetsSchema.default([]),
});

const reunionSchema = z.object({
  numOfficiel: z.number(),
  nature: z.string().optional(),
  hippodrome: z.object({ libelleCourt: z.string().optional(), libelleLong: z.string().optional() }).optional(),
  courses: z.array(courseSchema).default([]),
  parisEvenement: z.array(betSchema).default([]),
});

const programmeSchema = z.object({
  programme: z.object({ reunions: z.array(reunionSchema) }),
});

const participantSchema = z.object({
  idCheval: z.string().optional(),
  nom: z.string(),
  numPmu: z.number(),
  age: z.number().optional(),
  sexe: z.string().optional(),
  race: z.string().optional(),
  statut: z.string().optional(),
  placeCorde: z.number().optional(),
  entraineur: z.string().optional(),
  driver: z.string().optional(),
  jockey: z.string().optional(),
  musique: z.string().optional(),
  nombreCourses: z.number().optional(),
  nombreVictoires: z.number().optional(),
  nombrePlaces: z.number().optional(),
  handicapPoids: z.number().optional(),
  handicapDistance: z.number().optional(),
  gainsParticipant: z.object({ gainsCarriere: z.number().optional() }).optional(),
  dernierRapportDirect: z.object({ rapport: z.number().optional(), favoris: z.boolean().optional() }).optional(),
  avisEntraineur: z.string().optional(),
  nomPere: z.string().optional(),
  nomMere: z.string().optional(),
});

const participantsSchema = z.object({ participants: z.array(participantSchema) });
const rankedHorseSchema = z.object({ numPmu: z.number(), nom: z.string().optional(), nbFoisCite: z.number().optional() });
const pronosticsSchema = z.object({
  commentaire: z.object({ texte: z.string(), source: z.string().optional() }).optional(),
  syntheses: z.array(z.object({ intitule: z.string(), classement: z.array(rankedHorseSchema) })).default([]),
  avis: z.array(z.object({ societe: z.string(), journaliste: z.string().optional(), pronostics: z.array(rankedHorseSchema) })).default([]),
  cribles: z.array(z.object({ numPmu: z.number(), nom: z.string(), commentaire: z.string(), partant: z.boolean().default(true) })).default([]),
});

const finalReportsSchema = z.array(z.object({
  typePari: z.string(),
  miseBase: z.number().optional(),
  rembourse: z.boolean().default(false),
  rapports: z.array(z.object({
    libelle: z.string(),
    dividende: z.number(),
    dividendePourUnEuro: z.number().optional(),
    combinaison: z.string(),
    nombreGagnants: z.number().optional(),
    dividendePourUneMiseDeBase: z.number().optional(),
    dividendeUnite: z.string().optional(),
  })).default([]),
}));

const pastRaceParticipantSchema = z.object({
  numPmu: z.number().nullish(),
  place: z.object({
    place: z.number().nullish(),
    rawValue: z.string().nullish(),
    statusArrivee: z.string().nullish(),
  }).nullish(),
  nomCheval: z.string(),
  nomJockey: z.string().nullish(),
  poidsJockey: z.number().nullish(),
  corde: z.number().nullish(),
  distanceAvecPrecedent: z.number().nullish(),
  itsHim: z.boolean().default(false),
  reductionKilometrique: z.number().nullish(),
  distanceParcourue: z.number().nullish(),
  oeillere: z.string().nullish(),
});

const pastRaceSchema = z.object({
  date: z.number(),
  timezoneOffset: z.number().nullish(),
  hippodrome: z.string().nullish(),
  nomPrix: z.string().nullish(),
  discipline: z.string().nullish(),
  allocation: z.number().nullish(),
  distance: z.number().nullish(),
  nbParticipants: z.number().nullish(),
  tempsDuPremier: z.number().nullish(),
  participants: z.array(pastRaceParticipantSchema).default([]),
});

const detailedPerformancesSchema = z.object({
  allure: z.string().nullish(),
  participants: z.array(z.object({
    numPmu: z.number(),
    nomCheval: z.string(),
    coursesCourues: z.array(pastRaceSchema).default([]),
  })).default([]),
});

export type Programme = z.infer<typeof programmeSchema>["programme"];
export type Reunion = z.infer<typeof reunionSchema>;
export type Course = z.infer<typeof courseSchema>;
export type Participant = z.infer<typeof participantSchema>;
export type AvailableBet = z.infer<typeof availableBetSchema>;
export type DetailedPronostics = z.infer<typeof pronosticsSchema>;
export type FinalReports = z.infer<typeof finalReportsSchema>;
export type DetailedPerformances = z.infer<typeof detailedPerformancesSchema>;

export class PmuApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PmuApiError";
  }
}

async function fetchWithRetry(url: string) {
  const delays = [0, 600];
  let lastError: unknown;
  for (const delay of delays) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const requestDelay = Math.max(0, Math.min(10_000, Number(process.env.MYPMU_REQUEST_DELAY_MS ?? 0)));
      const elapsed = Date.now() - lastRequestAt;
      if (requestDelay > elapsed) await new Promise((resolve) => setTimeout(resolve, requestDelay - elapsed));
      lastRequestAt = Date.now();
      return await fetch(url, {
        headers: { Accept: "application/json" },
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let lastError: unknown;
  for (const root of apiRoots()) {
    try {
      const response = await fetchWithRetry(`${root}/${path}`);
      if (!response.ok) {
        lastError = new PmuApiError(`L’API PMU a répondu ${response.status}.`, response.status);
        continue;
      }
      const parsed = schema.safeParse(await response.json());
      if (parsed.success) return parsed.data;
      console.error("Réponse PMU invalide", parsed.error.flatten());
      lastError = new PmuApiError("Le format des données PMU a changé.");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new PmuApiError("Toutes les passerelles PMU sont indisponibles.");
}

export async function getProgramme(date: string): Promise<Programme> {
  const data = await request(
    `${assertPmuDate(date)}?meteo=true&specialisation=OFFLINE`,
    programmeSchema,
  );
  return data.programme;
}

export async function getParticipants(date: string, reunion: number, course: number) {
  const data = await request(
    `${assertPmuDate(date)}/R${reunion}/C${course}/participants?specialisation=OFFLINE`,
    participantsSchema,
  );
  return data.participants;
}

export async function getPronostics(date: string, reunion: number, course: number) {
  return request(
    `${assertPmuDate(date)}/R${reunion}/C${course}/pronostics-detailles`,
    pronosticsSchema,
  );
}

export async function getFinalReports(date: string, reunion: number, course: number) {
  return request(
    `${assertPmuDate(date)}/R${reunion}/C${course}/rapports-definitifs`,
    finalReportsSchema,
  );
}

export async function getDetailedPerformances(date: string, reunion: number, course: number) {
  return request(
    `${assertPmuDate(date)}/R${reunion}/C${course}/performances-detaillees/pretty`,
    detailedPerformancesSchema,
  );
}

export function parseDetailedPerformances(input: unknown): DetailedPerformances {
  return detailedPerformancesSchema.parse(input);
}

export function findCourse(programme: Programme, reunionNumber: number, courseNumber: number) {
  return programme.reunions
    .find((reunion) => reunion.numOfficiel === reunionNumber)
    ?.courses.find((course) => course.numOrdre === courseNumber);
}
