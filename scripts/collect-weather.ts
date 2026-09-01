import { initializeDatabase } from "../lib/db";
import { geocodeVenue, getRaceWeather, type VenueCoordinates } from "../lib/weather";

const dateFilter = process.argv[2];
if (dateFilter && !/^\d{8}$/.test(dateFilter)) {
  console.error("Usage : npm run collect:weather -- [JJMMAAAA]");
  process.exit(1);
}

const database = initializeDatabase();
const now = () => new Date().toISOString();

type RaceRow = { id: string; hippodrome: string; scheduledAt: number };

async function main() {
  const races = database.prepare(`
    SELECT id, hippodrome, scheduled_at AS scheduledAt
    FROM races
    WHERE hippodrome IS NOT NULL AND scheduled_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM race_weather weather WHERE weather.race_id = races.id)
      AND (? IS NULL OR programme_date = ?)
    ORDER BY programme_date, reunion_number, course_number
  `).all(dateFilter ?? null, dateFilter ?? null) as RaceRow[];

  let collected = 0;
  let lastGeocodingAt = 0;
  for (const race of races) {
    let coordinates = database.prepare("SELECT resolved_name AS resolvedName, latitude, longitude, timezone, country FROM venues WHERE name = ?").get(race.hippodrome) as VenueCoordinates | undefined;
    if (!coordinates) {
      const remainingDelay = 1_100 - (Date.now() - lastGeocodingAt);
      if (remainingDelay > 0) await new Promise((resolve) => setTimeout(resolve, remainingDelay));
      coordinates = await geocodeVenue(race.hippodrome) ?? undefined;
      lastGeocodingAt = Date.now();
      if (!coordinates) {
        console.warn(`Hippodrome non géocodé : ${race.hippodrome}`);
        continue;
      }
      database.prepare(`
        INSERT INTO venues (name, resolved_name, latitude, longitude, timezone, country, source, resolved_at)
        VALUES (?, ?, ?, ?, ?, ?, 'OSM_NOMINATIM', ?)
      `).run(race.hippodrome, coordinates.resolvedName, coordinates.latitude, coordinates.longitude, coordinates.timezone, coordinates.country ?? null, now());
    }

    try {
      const weather = await getRaceWeather(coordinates, race.scheduledAt);
      database.prepare(`
        INSERT INTO race_weather (race_id, venue_name, observed_for, temperature_c, relative_humidity_percent, precipitation_mm, weather_code, wind_speed_kmh, wind_gusts_kmh, soil_moisture, source, raw_json, collected_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(race.id, race.hippodrome, weather.observedFor, weather.temperature, weather.humidity, weather.precipitation, weather.weatherCode, weather.windSpeed, weather.windGusts, weather.soilMoisture, weather.source, weather.rawJson, now());
      collected += 1;
      console.log(`Météo collectée ${race.id} (${coordinates.resolvedName})`);
    } catch (error) {
      console.warn(`Météo indisponible ${race.id}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(`Collecte météo terminée : ${collected}/${races.length} courses.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => database.close());
