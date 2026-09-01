import type { Metadata } from "next";
import Link from "next/link";
import { formatPmuDate } from "@/lib/date";
import { getProgramme } from "@/lib/pmu";

type PageProps = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { date } = await params;
  return { title: `Programme du ${formatPmuDate(date)}` };
}

export default async function ReunionsPage({ params }: PageProps) {
  const { date } = await params;
  const programme = await getProgramme(date);

  return (
    <main>
      <div className="pageHeading">
        <div><p className="eyebrow">Programme officiel</p><h1>Courses du {formatPmuDate(date)}</h1></div>
        <Link href="/" className="secondaryButton">Changer de date</Link>
      </div>

      <div className="reunionList">
        {programme.reunions.map((reunion) => (
          <section className="reunion" key={reunion.numOfficiel}>
            <header>
              <span className="meetingNumber">R{reunion.numOfficiel}</span>
              <div>
                <h2>{reunion.hippodrome?.libelleLong ?? reunion.hippodrome?.libelleCourt ?? "Hippodrome"}</h2>
                <p>{reunion.courses.length} course{reunion.courses.length > 1 ? "s" : ""}</p>
              </div>
            </header>
            <div className="courseList">
              {reunion.courses.map((course) => {
                const eventBets = reunion.parisEvenement
                  .filter((bet) => bet.course.numOrdre === course.numOrdre)
                  .map((bet) => bet.codePari.replaceAll("_", " "));
                const bettingOpen = course.paris.some((bet) => bet.enVente);
                const isQuintePlus = reunion.parisEvenement.some((bet) => bet.course.numOrdre === course.numOrdre && bet.codePari === "QUINTE_PLUS")
                  || course.paris.some((bet) => bet.typePari === "QUINTE_PLUS");
                return (
                  <Link
                    className={isQuintePlus ? "courseRow quinteCourseRow" : "courseRow"}
                    href={`/course/${date}/${reunion.numOfficiel}/${course.numOrdre}`}
                    key={course.numOrdre}
                  >
                    <span className="courseNumber">C{course.numOrdre}</span>
                    <span className="courseName"><strong>{course.libelle}</strong><small>{course.discipline ?? course.specialite} · {course.distance ? `${course.distance} m` : "distance inconnue"}</small></span>
                    <span className="courseStatuses">
                      {isQuintePlus ? <span className="quinteTag">Quinté+</span> : eventBets.length > 0 && <span className="betTag">{eventBets[0]}</span>}
                      {!bettingOpen && <span className="closedTag">Paris fermés</span>}
                    </span>
                    <span aria-hidden="true" className="arrow">→</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
