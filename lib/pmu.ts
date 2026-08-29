import { z } from "zod";
import { assertPmuDate } from "./date";

const API_ROOT = "https://online.turfinfo.api.pmu.fr/rest/client/62/programme";

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

export type Programme = z.infer<typeof programmeSchema>["programme"];
export type Reunion = z.infer<typeof reunionSchema>;
export type Course = z.infer<typeof courseSchema>;
export type Participant = z.infer<typeof participantSchema>;
export type AvailableBet = z.infer<typeof availableBetSchema>;
export type DetailedPronostics = z.infer<typeof pronosticsSchema>;
export type FinalReports = z.infer<typeof finalReportsSchema>;

export class PmuApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PmuApiError";
  }
}

async function request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_ROOT}/${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new PmuApiError(`L’API PMU a répondu ${response.status}.`, response.status);
  }

  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    console.error("Réponse PMU invalide", parsed.error.flatten());
    throw new PmuApiError("Le format des données PMU a changé.");
  }
  return parsed.data;
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

export function findCourse(programme: Programme, reunionNumber: number, courseNumber: number) {
  return programme.reunions
    .find((reunion) => reunion.numOfficiel === reunionNumber)
    ?.courses.find((course) => course.numOrdre === courseNumber);
}
