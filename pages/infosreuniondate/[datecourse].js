import Link from "next/link";
import styles from "../../styles/Home.module.css";

export default function coursesdujour({ date, res }) {
  let infos_reunions = res.programme.reunions;
  let infos_course;

  let infos = infos_reunions.map((res, index) => {
    let si_paris = Object.keys(res.parisEvenement).length;
    if (si_paris > 0) {
      // console.log(infos_reunions);
      return (
        <div className={styles.badge} key={index}>
          <h2>Reunion:{res.numOfficiel}</h2>
          {res.parisEvenement.map((pe, index) => {
            if (pe.codePari == "QUINTE_PLUS") {
              infos_course =
                infos_reunions[pe.course.numReunion - 1].courses[
                  pe.course.numOrdre - 1
                ];
              // console.log(infos_course);
            }
            return (
              <div key={index}>
                <Link
                  href={{
                    pathname: "/infoscourse",
                    query: {
                      date: date,
                      numReunion: pe.course.numReunion,
                      numCourse: pe.course.numOrdre,
                      infosCourse: JSON.stringify(infos_course),
                    },
                  }}
                  className={styles.btn__info}
                >
                  <a>
                    -- <b>{pe.codePari}</b>
                  </a>
                </Link>
                <p>
                  ---- R{pe.course.numReunion} C{pe.course.numOrdre}
                </p>
              </div>
            );
          })}
        </div>
      );
    } else {
      return (
        <div className={styles.badge} key={index}>
          <h2>Reunion:{res.numOfficiel}</h2>
          <h4>pas de code paris</h4>
        </div>
      );
    }
  });

  return (
    <div className={styles.container}>
      <h1>Reunions du {date}</h1>
      <div className={styles.badgecontainer}>{infos}</div>
    </div>
  );
}

//---------------------------------
export const getServerSideProps = async ({ params }) => {
  const date = params.datecourse;
  const res = await fetch(
    `https://online.turfinfo.api.pmu.fr/rest/client/62/programme/${date}?meteo=true&specialisation=OFFLINE`
  ).then((data) => data.json());
  //   console.log(res.programme);
  return {
    props: {
      date,
      res,
    },
  };
};
