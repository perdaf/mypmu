import { z } from "zod";

const nominatimSchema = z.array(z.object({
  display_name: z.string(),
  lat: z.string(),
  lon: z.string(),
  address: z.object({ country: z.string().optional() }).optional(),
}));

const weatherSchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number().nullable()),
    relative_humidity_2m: z.array(z.number().nullable()),
    precipitation: z.array(z.number().nullable()),
    weather_code: z.array(z.number().nullable()),
    wind_speed_10m: z.array(z.number().nullable()),
    wind_gusts_10m: z.array(z.number().nullable()),
    soil_moisture_0_to_7cm: z.array(z.number().nullable()),
  }),
});

export type VenueCoordinates = {
  resolvedName: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country?: string;
};

export type RaceWeather = {
  observedFor: number;
  temperature: number | null;
  humidity: number | null;
  precipitation: number | null;
  weatherCode: number | null;
  windSpeed: number | null;
  windGusts: number | null;
  soilMoisture: number | null;
  source: "OPEN_METEO_ARCHIVE" | "OPEN_METEO_FORECAST";
  rawJson: string;
};

async function fetchJson(url: URL) {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Open-Meteo a répondu ${response.status}.`);
  return response.json() as Promise<unknown>;
}

export async function geocodeVenue(name: string): Promise<VenueCoordinates | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", name);
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("format", "jsonv2");
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "MyPMU-Analytique/1.0 (personal research application)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Nominatim a répondu ${response.status}.`);
  const match = nominatimSchema.parse(await response.json())[0];
  if (!match) return null;
  return {
    resolvedName: match.display_name,
    latitude: Number(match.lat),
    longitude: Number(match.lon),
    timezone: "UTC",
    country: match.address?.country,
  };
}

export function closestHourlyIndex(times: string[], scheduledAt: number) {
  if (times.length === 0) return -1;
  return times.reduce((best, time, index) => {
    const distance = Math.abs(Date.parse(`${time}Z`) - scheduledAt);
    const bestDistance = Math.abs(Date.parse(`${times[best]}Z`) - scheduledAt);
    return distance < bestDistance ? index : best;
  }, 0);
}

export async function getRaceWeather(coordinates: VenueCoordinates, scheduledAt: number): Promise<RaceWeather> {
  const isoDate = new Date(scheduledAt).toISOString().slice(0, 10);
  const archiveCutoff = Date.now() - 6 * 24 * 60 * 60 * 1_000;
  const source = scheduledAt < archiveCutoff ? "OPEN_METEO_ARCHIVE" : "OPEN_METEO_FORECAST";
  const endpoint = source === "OPEN_METEO_ARCHIVE" ? "https://archive-api.open-meteo.com/v1/archive" : "https://api.open-meteo.com/v1/forecast";
  const url = new URL(endpoint);
  url.searchParams.set("latitude", String(coordinates.latitude));
  url.searchParams.set("longitude", String(coordinates.longitude));
  url.searchParams.set("start_date", isoDate);
  url.searchParams.set("end_date", isoDate);
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("hourly", "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,soil_moisture_0_to_7cm");
  const raw = await fetchJson(url);
  const parsed = weatherSchema.parse(raw);
  const index = closestHourlyIndex(parsed.hourly.time, scheduledAt);
  if (index < 0) throw new Error("Open-Meteo n’a renvoyé aucune observation horaire.");
  return {
    observedFor: Date.parse(`${parsed.hourly.time[index]}Z`),
    temperature: parsed.hourly.temperature_2m[index] ?? null,
    humidity: parsed.hourly.relative_humidity_2m[index] ?? null,
    precipitation: parsed.hourly.precipitation[index] ?? null,
    weatherCode: parsed.hourly.weather_code[index] ?? null,
    windSpeed: parsed.hourly.wind_speed_10m[index] ?? null,
    windGusts: parsed.hourly.wind_gusts_10m[index] ?? null,
    soilMoisture: parsed.hourly.soil_moisture_0_to_7cm[index] ?? null,
    source,
    rawJson: JSON.stringify(raw),
  };
}
