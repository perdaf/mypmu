import { assertPmuDate } from "../lib/date";
import { initializeDatabase } from "../lib/db";
import { createHash } from "node:crypto";
import { type DetailedPerformances, type FinalReports, type Participant, type Programme } from "../lib/pmu";
import { pmuProvider } from "../lib/providers";
import { geocodeVenue, getRaceWeather, type RaceWeather, type VenueCoordinates } from "../lib/weather";
import { classifyCollectorError, updateCollectorStatus } from "../lib/collector-status";
import { trainAndPromoteModel } from "../lib/model-training";

const cliArguments = process.argv.slice(2);
const activeOnly = cliArguments.includes("--active");
const quinteOnly = cliArguments.includes("--quinte");
const refreshOnly = cliArguments.includes("--refresh");
const [dateArgument, reunionArgument, courseArgument] = cliArguments.filter((argument) => !argument.startsWith("--"));
if (!dateArgument) {
  console.error("Usage : npm run collect -- JJMMAAAA [réunion] [course]");
  process.exit(1);
}

const programmeDate = assertPmuDate(dateArgument);
const reunionFilter = reunionArgument ? Number(reunionArgument) : undefined;
const courseFilter = courseArgument ? Number(courseArgument) : undefined;
if ((reunionFilter !== undefined && !Number.isInteger(reunionFilter)) || (courseFilter !== undefined && !Number.isInteger(courseFilter))) {
  throw new Error("Les numéros de réunion et de course doivent être des entiers.");
}

const database = initializeDatabase();
const now = () => new Date().toISOString();

function raceId(reunion: number, course: number) {
  return `${programmeDate}-R${reunion}-C${course}`;
}

function horseId(participant: Participant) {
  return participant.idCheval ?? `NAME:${participant.nom.trim().toLocaleUpperCase("fr-FR")}`;
}

function completeness(participant: Participant) {
  const fields = {
    musique: participant.musique,
    nombreCourses: participant.nombreCourses,
    nombreVictoires: participant.nombreVictoires,
    nombrePlaces: participant.nombrePlaces,
    cote: participant.dernierRapportDirect?.rapport,
    entraineur: participant.entraineur,
    jockeyDriver: participant.jockey ?? participant.driver,
  };
  const missing = Object.entries(fields).filter(([, value]) => value === undefined || value === null || value === "").map(([key]) => key);
  return { missing, ratio: (Object.keys(fields).length - missing.length) / Object.keys(fields).length };
}

function performanceId(horse: string, racedAt: number, hippodrome: string | null | undefined, raceName: string | null | undefined) {
  return createHash("sha256")
    .update([horse, racedAt, hippodrome ?? "", raceName ?? ""].join("|"))
    .digest("hex")
    .slice(0, 32);
}

function persistRace(
  reunion: Programme["reunions"][number],
  course: Programme["reunions"][number]["courses"][number],
  participants: Participant[],
  finalReports: FinalReports,
  detailedPerformances: DetailedPerformances | null,
  weather: { coordinates: VenueCoordinates; value: RaceWeather } | null,
) {
  const collectedAt = now();
  const id = raceId(reunion.numOfficiel, course.numOrdre);
  const isQuintePlus = reunion.parisEvenement.some((bet) => bet.course.numOrdre === course.numOrdre && bet.codePari === "QUINTE_PLUS")
    || course.paris.some((bet) => bet.typePari === "QUINTE_PLUS");

  database.prepare(`
    INSERT INTO races (id, programme_date, reunion_number, course_number, label, hippodrome, discipline, specialite, distance, corde, scheduled_at, status, declared_runners, results_available, raw_json, first_collected_at, last_collected_at, is_quinte_plus)
    VALUES (@id, @programmeDate, @reunion, @course, @label, @hippodrome, @discipline, @specialite, @distance, @corde, @scheduledAt, @status, @declaredRunners, @resultsAvailable, @rawJson, @collectedAt, @collectedAt, @isQuintePlus)
    ON CONFLICT(id) DO UPDATE SET label=excluded.label, hippodrome=excluded.hippodrome, discipline=excluded.discipline, specialite=excluded.specialite, distance=excluded.distance, corde=excluded.corde, scheduled_at=excluded.scheduled_at, status=excluded.status, declared_runners=excluded.declared_runners, results_available=excluded.results_available, raw_json=excluded.raw_json, last_collected_at=excluded.last_collected_at, is_quinte_plus=excluded.is_quinte_plus
  `).run({
    id, programmeDate, reunion: reunion.numOfficiel, course: course.numOrdre, label: course.libelle,
    hippodrome: reunion.hippodrome?.libelleLong ?? reunion.hippodrome?.libelleCourt ?? null,
    discipline: course.discipline ?? null, specialite: course.specialite ?? null, distance: course.distance ?? null,
    corde: course.corde ?? null, scheduledAt: course.heureDepart ?? null, status: course.statut ?? null,
    declaredRunners: course.nombreDeclaresPartants ?? participants.length,
    resultsAvailable: course.rapportsDefinitifsDisponibles ? 1 : 0,
    rawJson: JSON.stringify(course), collectedAt, isQuintePlus: isQuintePlus ? 1 : 0,
  });

  const upsertHorse = database.prepare(`
    INSERT INTO horses (id, name, sex, age, breed, sire_name, dam_name, first_seen_at, last_seen_at)
    VALUES (@id, @name, @sex, @age, @breed, @sire, @dam, @collectedAt, @collectedAt)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, sex=COALESCE(excluded.sex, horses.sex), age=COALESCE(excluded.age, horses.age), breed=COALESCE(excluded.breed, horses.breed), sire_name=COALESCE(excluded.sire_name, horses.sire_name), dam_name=COALESCE(excluded.dam_name, horses.dam_name), last_seen_at=excluded.last_seen_at
  `);
  const upsertEntry = database.prepare(`
    INSERT INTO race_entries (race_id, horse_id, pmu_number, status, music, trainer, jockey_driver, trainer_opinion, career_races, career_wins, career_places, career_earnings_cents, starting_gate, handicap_weight, handicap_distance, data_completeness, missing_fields, raw_json, collected_at)
    VALUES (@raceId, @horseId, @number, @status, @music, @trainer, @jockeyDriver, @trainerOpinion, @careerRaces, @careerWins, @careerPlaces, @earnings, @startingGate, @weight, @handicapDistance, @completeness, @missingFields, @rawJson, @collectedAt)
    ON CONFLICT(race_id, pmu_number) DO UPDATE SET horse_id=excluded.horse_id, status=excluded.status, music=excluded.music, trainer=excluded.trainer, jockey_driver=excluded.jockey_driver, trainer_opinion=excluded.trainer_opinion, career_races=excluded.career_races, career_wins=excluded.career_wins, career_places=excluded.career_places, career_earnings_cents=excluded.career_earnings_cents, starting_gate=excluded.starting_gate, handicap_weight=excluded.handicap_weight, handicap_distance=excluded.handicap_distance, data_completeness=excluded.data_completeness, missing_fields=excluded.missing_fields, raw_json=excluded.raw_json, collected_at=excluded.collected_at
  `);
  const insertOdds = database.prepare("INSERT OR IGNORE INTO odds_snapshots (race_id, pmu_number, odds, source, observed_at) VALUES (?, ?, ?, ?, ?)");

  for (const participant of participants) {
    const idHorse = horseId(participant);
    const quality = completeness(participant);
    upsertHorse.run({ id: idHorse, name: participant.nom, sex: participant.sexe ?? null, age: participant.age ?? null, breed: participant.race ?? null, sire: participant.nomPere ?? null, dam: participant.nomMere ?? null, collectedAt });
    upsertEntry.run({
      raceId: id, horseId: idHorse, number: participant.numPmu, status: participant.statut ?? null,
      music: participant.musique ?? null, trainer: participant.entraineur ?? null,
      jockeyDriver: participant.jockey ?? participant.driver ?? null, trainerOpinion: participant.avisEntraineur ?? null,
      careerRaces: participant.nombreCourses ?? null, careerWins: participant.nombreVictoires ?? null,
      careerPlaces: participant.nombrePlaces ?? null, earnings: participant.gainsParticipant?.gainsCarriere ?? null,
      startingGate: participant.placeCorde ?? null, weight: participant.handicapPoids ?? null,
      handicapDistance: participant.handicapDistance ?? null, completeness: quality.ratio,
      missingFields: JSON.stringify(quality.missing), rawJson: JSON.stringify(participant), collectedAt,
    });
    if (participant.dernierRapportDirect?.rapport) insertOdds.run(id, participant.numPmu, participant.dernierRapportDirect.rapport, "DIRECT", collectedAt);
  }

  if (detailedPerformances) {
    const participantByNumber = new Map(participants.map((participant) => [participant.numPmu, participant]));
    const upsertPerformance = database.prepare(`
      INSERT INTO horse_performances (id, horse_id, raced_at, timezone_offset, hippodrome, race_name, discipline, allocation, distance, runners, winner_time, finish_position, finish_status, jockey_driver, jockey_weight, starting_gate, distance_behind, kilometer_reduction, distance_run, blinkers, field_json, raw_json, first_collected_at, last_collected_at)
      VALUES (@id, @horseId, @racedAt, @timezoneOffset, @hippodrome, @raceName, @discipline, @allocation, @distance, @runners, @winnerTime, @finishPosition, @finishStatus, @jockeyDriver, @jockeyWeight, @startingGate, @distanceBehind, @kilometerReduction, @distanceRun, @blinkers, @fieldJson, @rawJson, @collectedAt, @collectedAt)
      ON CONFLICT(id) DO UPDATE SET finish_position=excluded.finish_position, finish_status=excluded.finish_status, jockey_driver=excluded.jockey_driver, jockey_weight=excluded.jockey_weight, starting_gate=excluded.starting_gate, distance_behind=excluded.distance_behind, kilometer_reduction=excluded.kilometer_reduction, distance_run=excluded.distance_run, blinkers=excluded.blinkers, field_json=excluded.field_json, raw_json=excluded.raw_json, last_collected_at=excluded.last_collected_at
    `);
    const linkPerformance = database.prepare(`
      INSERT INTO race_entry_performance_snapshots (target_race_id, pmu_number, performance_id, recency_rank, collected_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(target_race_id, pmu_number, performance_id) DO UPDATE SET recency_rank=excluded.recency_rank, collected_at=excluded.collected_at
    `);

    for (const history of detailedPerformances.participants) {
      const currentParticipant = participantByNumber.get(history.numPmu);
      if (!currentParticipant) continue;
      const idHorse = horseId(currentParticipant);
      const targetStart = course.heureDepart ?? Number.POSITIVE_INFINITY;
      history.coursesCourues
        .filter((pastRace) => pastRace.date < targetStart)
        .sort((left, right) => right.date - left.date)
        .slice(0, 10)
        .forEach((pastRace, index) => {
          const ownPerformance = pastRace.participants.find((item) => item.itsHim)
            ?? pastRace.participants.find((item) => item.nomCheval === history.nomCheval);
          const idPerformance = performanceId(idHorse, pastRace.date, pastRace.hippodrome, pastRace.nomPrix);
          upsertPerformance.run({
            id: idPerformance, horseId: idHorse, racedAt: pastRace.date,
            timezoneOffset: pastRace.timezoneOffset ?? null, hippodrome: pastRace.hippodrome ?? null,
            raceName: pastRace.nomPrix ?? null, discipline: pastRace.discipline ?? null,
            allocation: pastRace.allocation ?? null, distance: pastRace.distance ?? null,
            runners: pastRace.nbParticipants ?? pastRace.participants.length, winnerTime: pastRace.tempsDuPremier ?? null,
            finishPosition: ownPerformance?.place?.place ?? null,
            finishStatus: ownPerformance?.place?.statusArrivee ?? null,
            jockeyDriver: ownPerformance?.nomJockey ?? null, jockeyWeight: ownPerformance?.poidsJockey ?? null,
            startingGate: ownPerformance?.corde ?? null,
            distanceBehind: typeof ownPerformance?.distanceAvecPrecedent === "number" ? ownPerformance.distanceAvecPrecedent : null,
            kilometerReduction: ownPerformance?.reductionKilometrique ?? null,
            distanceRun: ownPerformance?.distanceParcourue ?? null, blinkers: ownPerformance?.oeillere ?? null,
            fieldJson: JSON.stringify(pastRace.participants), rawJson: JSON.stringify(pastRace), collectedAt,
          });
          linkPerformance.run(id, history.numPmu, idPerformance, index + 1, collectedAt);
        });
    }
  }

  if (weather) {
    database.prepare(`
      INSERT INTO venues (name, resolved_name, latitude, longitude, timezone, country, source, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, 'OSM_NOMINATIM', ?)
      ON CONFLICT(name) DO UPDATE SET resolved_name=excluded.resolved_name, latitude=excluded.latitude, longitude=excluded.longitude, timezone=excluded.timezone, country=excluded.country, resolved_at=excluded.resolved_at
    `).run(reunion.hippodrome?.libelleLong ?? reunion.hippodrome?.libelleCourt, weather.coordinates.resolvedName, weather.coordinates.latitude, weather.coordinates.longitude, weather.coordinates.timezone, weather.coordinates.country ?? null, collectedAt);
    database.prepare(`
      INSERT INTO race_weather (race_id, venue_name, observed_for, temperature_c, relative_humidity_percent, precipitation_mm, weather_code, wind_speed_kmh, wind_gusts_kmh, soil_moisture, source, raw_json, collected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(race_id) DO UPDATE SET observed_for=excluded.observed_for, temperature_c=excluded.temperature_c, relative_humidity_percent=excluded.relative_humidity_percent, precipitation_mm=excluded.precipitation_mm, weather_code=excluded.weather_code, wind_speed_kmh=excluded.wind_speed_kmh, wind_gusts_kmh=excluded.wind_gusts_kmh, soil_moisture=excluded.soil_moisture, source=excluded.source, raw_json=excluded.raw_json, collected_at=excluded.collected_at
    `).run(id, reunion.hippodrome?.libelleLong ?? reunion.hippodrome?.libelleCourt, weather.value.observedFor, weather.value.temperature, weather.value.humidity, weather.value.precipitation, weather.value.weatherCode, weather.value.windSpeed, weather.value.windGusts, weather.value.soilMoisture, weather.value.source, weather.value.rawJson, collectedAt);
  }

  const upsertBet = database.prepare(`
    INSERT INTO race_bets (race_id, bet_code, base_stake_cents, on_sale, ordered, combinable, required_horses, flexi_values, risk_values, collected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(race_id, bet_code) DO UPDATE SET base_stake_cents=excluded.base_stake_cents, on_sale=excluded.on_sale, ordered=excluded.ordered, combinable=excluded.combinable, required_horses=excluded.required_horses, flexi_values=excluded.flexi_values, risk_values=excluded.risk_values, collected_at=excluded.collected_at
  `);
  for (const bet of course.paris) upsertBet.run(id, bet.typePari, bet.miseBase, bet.enVente ? 1 : 0, bet.ordre ? 1 : 0, bet.combine ? 1 : 0, bet.nbChevauxReglementaire, JSON.stringify(bet.valeursFlexiAutorisees), JSON.stringify(bet.valeursRisqueAutorisees), collectedAt);

  database.prepare("DELETE FROM race_results WHERE race_id = ?").run(id);
  const insertResult = database.prepare("INSERT INTO race_results (race_id, finishing_position, pmu_number, dead_heat_group, collected_at) VALUES (?, ?, ?, ?, ?)");
  course.ordreArrivee?.forEach((group, index) => group.forEach((number) => insertResult.run(id, index + 1, number, group.length > 1 ? index + 1 : 0, collectedAt)));

  if (finalReports.length > 0) {
    database.prepare("DELETE FROM bet_reports WHERE race_id = ?").run(id);
    const insertReport = database.prepare(`
      INSERT INTO bet_reports (race_id, bet_code, report_label, winning_combination, report_cents, report_per_euro_cents, stake_reference_cents, winners, refunded, raw_json, collected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const betReport of finalReports) {
      for (const report of betReport.rapports) {
        insertReport.run(
          id, betReport.typePari, report.libelle, report.combinaison, report.dividendePourUneMiseDeBase ?? report.dividende,
          report.dividendePourUnEuro ?? null, betReport.miseBase ?? null,
          report.nombreGagnants ?? null, betReport.rembourse ? 1 : 0, JSON.stringify(report), collectedAt,
        );
      }
    }
  }
}

async function main() {
let runId: number | bigint | undefined;
try {
  const startedAt = now();
  if (quinteOnly) updateCollectorStatus({ status: "collecting", lastAttemptAt: startedAt, errorKind: null, errorMessage: null, processId: process.pid });
  runId = database.prepare("INSERT INTO ingestion_runs (programme_date, started_at, status) VALUES (?, ?, 'running')").run(programmeDate, startedAt).lastInsertRowid;
  const programme = await pmuProvider.getProgramme(programmeDate);
  const currentTime = Date.now();
  const activeWindowMs = 45 * 60 * 1000;
  const targets = programme.reunions.flatMap((reunion) => reunion.courses
    .filter(() => reunionFilter === undefined || reunion.numOfficiel === reunionFilter)
    .filter((course) => courseFilter === undefined || course.numOrdre === courseFilter)
    .filter((course) => !quinteOnly || reunion.parisEvenement.some((bet) => bet.course.numOrdre === course.numOrdre && bet.codePari === "QUINTE_PLUS") || course.paris.some((bet) => bet.typePari === "QUINTE_PLUS"))
    .filter((course) => !activeOnly || course.heureDepart === undefined || Math.abs(course.heureDepart - currentTime) <= activeWindowMs)
    .filter((course) => !refreshOnly || !(database.prepare("SELECT results_available FROM races WHERE id = ?").get(raceId(reunion.numOfficiel, course.numOrdre)) as { results_available: number } | undefined)?.results_available)
    .map((course) => ({ reunion, course })));

  let entriesCollected = 0;
  for (const { reunion, course } of targets) {
    const id = raceId(reunion.numOfficiel, course.numOrdre);
    const participants = await pmuProvider.getParticipants(programmeDate, reunion.numOfficiel, course.numOrdre);
    const finalReports = course.rapportsDefinitifsDisponibles
      ? await pmuProvider.getFinalReports(programmeDate, reunion.numOfficiel, course.numOrdre).catch((error) => {
          console.warn(`Rapports indisponibles R${reunion.numOfficiel} C${course.numOrdre}:`, error instanceof Error ? error.message : error);
          return [];
        })
      : [];
    const hasStoredPerformances = refreshOnly && Boolean(database.prepare("SELECT 1 FROM race_entry_performance_snapshots WHERE target_race_id = ? LIMIT 1").get(id));
    const detailedPerformances = hasStoredPerformances ? null : await pmuProvider.getDetailedPerformances(programmeDate, reunion.numOfficiel, course.numOrdre).catch((error) => {
      console.warn(`Performances détaillées indisponibles R${reunion.numOfficiel} C${course.numOrdre}:`, error instanceof Error ? error.message : error);
      return null;
    });
    const venueName = reunion.hippodrome?.libelleLong ?? reunion.hippodrome?.libelleCourt;
    let weather: { coordinates: VenueCoordinates; value: RaceWeather } | null = null;
    const hasStoredWeather = refreshOnly && Boolean(database.prepare("SELECT 1 FROM race_weather WHERE race_id = ?").get(id));
    if (venueName && course.heureDepart && !hasStoredWeather) {
      const cached = database.prepare("SELECT resolved_name AS resolvedName, latitude, longitude, timezone, country FROM venues WHERE name = ?").get(venueName) as VenueCoordinates | undefined;
      const coordinates = cached ?? await geocodeVenue(venueName).catch(() => null);
      if (coordinates) {
        const value = await getRaceWeather(coordinates, course.heureDepart).catch((error) => {
          console.warn(`Météo indisponible R${reunion.numOfficiel} C${course.numOrdre}:`, error instanceof Error ? error.message : error);
          return null;
        });
        if (value) weather = { coordinates, value };
      } else {
        console.warn(`Hippodrome non géocodé : ${venueName}`);
      }
    }
    database.transaction(() => persistRace(reunion, course, participants, finalReports, detailedPerformances, weather))();
    entriesCollected += participants.length;
    console.log(`Collecté R${reunion.numOfficiel} C${course.numOrdre} : ${participants.length} partants`);
  }
  database.prepare("UPDATE ingestion_runs SET finished_at=?, status='completed', races_collected=?, entries_collected=? WHERE id=?").run(now(), targets.length, entriesCollected, runId);
  if (quinteOnly) updateCollectorStatus({
    status: "success", lastSuccessAt: now(), racesCollected: targets.length,
    entriesCollected, errorKind: null, errorMessage: null, processId: null,
  });
  console.log(`Collecte terminée : ${targets.length} courses, ${entriesCollected} partants.`);
  if (quinteOnly) {
    const training = trainAndPromoteModel(database, { onlyIfNeeded: true });
    if (training.status !== "not_needed") console.log(`Cycle modèle : ${training.status}.`);
  }
} catch (error) {
  if (runId !== undefined) database.prepare("UPDATE ingestion_runs SET finished_at=?, status='failed', error_message=? WHERE id=?").run(now(), error instanceof Error ? error.message : String(error), runId);
  if (quinteOnly) updateCollectorStatus({
    status: "error", errorKind: classifyCollectorError(error),
    errorMessage: error instanceof Error ? error.message : String(error), processId: null,
  });
  throw error;
} finally {
  database.close();
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
