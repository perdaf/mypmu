import Link from "next/link";
import { notFound } from "next/navigation";
import { findCourse, getDetailedPerformances, getParticipants, getProgramme, getPronostics } from "@/lib/pmu";
import { BetSimulator } from "@/components/bet-simulator";
import { analyseRace } from "@/lib/analysis";
import { buildHistoricalIndicators, loadStoredHistoricalIndicators } from "@/lib/historical-indicators";

type PageProps = { params: Promise<{ date: string; reunion: string; course: string }> };

function formatMoney(value?: number) {
  if (value === undefined) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value / 100);
}

export default async function CoursePage({ params }: PageProps) {
  const { date, reunion: reunionParam, course: courseParam } = await params;
  const reunion = Number(reunionParam);
  const courseNumber = Number(courseParam);
  if (!Number.isInteger(reunion) || reunion < 1 || !Number.isInteger(courseNumber) || courseNumber < 1) notFound();

  const [programme, participants, pronostics, detailedPerformances] = await Promise.all([
    getProgramme(date),
    getParticipants(date, reunion, courseNumber),
    getPronostics(date, reunion, courseNumber).catch(() => null),
    getDetailedPerformances(date, reunion, courseNumber).catch(() => null),
  ]);
  const course = findCourse(programme, reunion, courseNumber);
  if (!course) notFound();

  const activeParticipants = participants.filter((participant) => participant.statut !== "NON_PARTANT");
  const meeting = programme.reunions.find((item) => item.numOfficiel === reunion);
  const isQuintePlus = meeting?.parisEvenement.some((bet) => bet.course.numOrdre === courseNumber && bet.codePari === "QUINTE_PLUS")
    || course.paris.some((bet) => bet.typePari === "QUINTE_PLUS");
  const raceContext = {
    scheduledAt: course.heureDepart,
    discipline: course.discipline ?? course.specialite,
    distance: course.distance,
    hippodrome: meeting?.hippodrome?.libelleLong ?? meeting?.hippodrome?.libelleCourt,
  };
  const liveHistory = buildHistoricalIndicators(detailedPerformances, raceContext);
  const history = liveHistory.size > 0 ? liveHistory : loadStoredHistoricalIndicators(`${date}-R${reunion}-C${courseNumber}`, raceContext);
  const recommendation = analyseRace(activeParticipants, pronostics, course.paris, history);

  return (
    <main>
      <Link href={`/reunions/${date}`} className="backLink">← Retour au programme</Link>
      <section className="courseHero">
        <p className="eyebrow">R{reunion} · C{courseNumber}{isQuintePlus ? " · Course support Quinté+" : ""}</p>
        <h1>{course.libelle}</h1>
        <div className="facts">
          <span><small>Discipline</small>{course.discipline ?? course.specialite ?? "—"}</span>
          <span><small>Distance</small>{course.distance ? `${course.distance} m` : "—"}</span>
          <span><small>Corde</small>{course.corde?.replaceAll("_", " ") ?? "—"}</span>
          <span><small>Partants</small>{activeParticipants.length}</span>
        </div>
      </section>

      <BetSimulator
        bets={course.paris}
        participants={activeParticipants.map(({ numPmu, nom }) => ({ numPmu, nom }))}
        reunion={reunion}
        course={courseNumber}
        recommendation={recommendation}
      />

      <section className="participantsSection">
        <div className="sectionHeading"><div><p className="eyebrow">Comparatif</p><h2>Les partants</h2></div><p>{activeParticipants.length} chevaux déclarés · pronostics {pronostics ? "disponibles" : "indisponibles"}</p></div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>N°</th><th>Cheval</th><th>Forme récente</th><th>Jockey / Driver</th><th>Entraîneur</th><th>Courses</th><th>Victoires</th><th>Places</th><th>Gains</th><th>Cote</th></tr></thead>
            <tbody>
              {activeParticipants.map((participant) => (
                <tr key={participant.idCheval ?? `${participant.numPmu}-${participant.nom}`}>
                  <td><span className="runnerNumber">{participant.numPmu}</span></td>
                  <td><strong>{participant.nom}</strong><small>{participant.age ? `${participant.age} ans` : ""}{participant.placeCorde ? ` · corde ${participant.placeCorde}` : ""}</small></td>
                  <td><span className="music">{participant.musique ?? "—"}</span></td>
                  <td>{participant.jockey ?? participant.driver ?? "—"}</td>
                  <td>{participant.entraineur ?? "—"}</td>
                  <td>{participant.nombreCourses ?? "—"}</td>
                  <td>{participant.nombreVictoires ?? "—"}</td>
                  <td>{participant.nombrePlaces ?? "—"}</td>
                  <td>{formatMoney(participant.gainsParticipant?.gainsCarriere)}</td>
                  <td>{participant.dernierRapportDirect?.rapport ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
