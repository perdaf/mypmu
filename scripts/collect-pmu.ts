import { assertPmuDate } from "../lib/date";
import { initializeDatabase } from "../lib/db";
import { getFinalReports, getParticipants, getProgramme, type FinalReports, type Participant } from "../lib/pmu";

const cliArguments = process.argv.slice(2);
const activeOnly = cliArguments.includes("--active");
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

function persistRace(
  reunion: Awaited<ReturnType<typeof getProgramme>>["reunions"][number],
  course: Awaited<ReturnType<typeof getProgramme>>["reunions"][number]["courses"][number],
  participants: Participant[],
  finalReports: FinalReports,
) {
  const collectedAt = now();
  const id = raceId(reunion.numOfficiel, course.numOrdre);

  database.prepare(`
    INSERT INTO races (id, programme_date, reunion_number, course_number, label, hippodrome, discipline, specialite, distance, corde, scheduled_at, status, declared_runners, results_available, raw_json, first_collected_at, last_collected_at)
    VALUES (@id, @programmeDate, @reunion, @course, @label, @hippodrome, @discipline, @specialite, @distance, @corde, @scheduledAt, @status, @declaredRunners, @resultsAvailable, @rawJson, @collectedAt, @collectedAt)
    ON CONFLICT(id) DO UPDATE SET label=excluded.label, hippodrome=excluded.hippodrome, discipline=excluded.discipline, specialite=excluded.specialite, distance=excluded.distance, corde=excluded.corde, scheduled_at=excluded.scheduled_at, status=excluded.status, declared_runners=excluded.declared_runners, results_available=excluded.results_available, raw_json=excluded.raw_json, last_collected_at=excluded.last_collected_at
  `).run({
    id, programmeDate, reunion: reunion.numOfficiel, course: course.numOrdre, label: course.libelle,
    hippodrome: reunion.hippodrome?.libelleLong ?? reunion.hippodrome?.libelleCourt ?? null,
    discipline: course.discipline ?? null, specialite: course.specialite ?? null, distance: course.distance ?? null,
    corde: course.corde ?? null, scheduledAt: course.heureDepart ?? null, status: course.statut ?? null,
    declaredRunners: course.nombreDeclaresPartants ?? participants.length,
    resultsAvailable: course.rapportsDefinitifsDisponibles ? 1 : 0,
    rawJson: JSON.stringify(course), collectedAt,
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
  runId = database.prepare("INSERT INTO ingestion_runs (programme_date, started_at, status) VALUES (?, ?, 'running')").run(programmeDate, startedAt).lastInsertRowid;
  const programme = await getProgramme(programmeDate);
  const currentTime = Date.now();
  const activeWindowMs = 45 * 60 * 1000;
  const targets = programme.reunions.flatMap((reunion) => reunion.courses
    .filter(() => reunionFilter === undefined || reunion.numOfficiel === reunionFilter)
    .filter((course) => courseFilter === undefined || course.numOrdre === courseFilter)
    .filter((course) => !activeOnly || course.heureDepart === undefined || Math.abs(course.heureDepart - currentTime) <= activeWindowMs)
    .map((course) => ({ reunion, course })));

  let entriesCollected = 0;
  for (const { reunion, course } of targets) {
    const participants = await getParticipants(programmeDate, reunion.numOfficiel, course.numOrdre);
    const finalReports = course.rapportsDefinitifsDisponibles
      ? await getFinalReports(programmeDate, reunion.numOfficiel, course.numOrdre).catch((error) => {
          console.warn(`Rapports indisponibles R${reunion.numOfficiel} C${course.numOrdre}:`, error instanceof Error ? error.message : error);
          return [];
        })
      : [];
    database.transaction(() => persistRace(reunion, course, participants, finalReports))();
    entriesCollected += participants.length;
    console.log(`Collecté R${reunion.numOfficiel} C${course.numOrdre} : ${participants.length} partants`);
  }
  database.prepare("UPDATE ingestion_runs SET finished_at=?, status='completed', races_collected=?, entries_collected=? WHERE id=?").run(now(), targets.length, entriesCollected, runId);
  console.log(`Collecte terminée : ${targets.length} courses, ${entriesCollected} partants.`);
} catch (error) {
  if (runId !== undefined) database.prepare("UPDATE ingestion_runs SET finished_at=?, status='failed', error_message=? WHERE id=?").run(now(), error instanceof Error ? error.message : String(error), runId);
  throw error;
} finally {
  database.close();
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
