import styles from "../../styles/Home.module.css";

export default function coursesdujour({ date, res }) {
  let infos_reunions = res.programme.reunions;

  let infos = infos_reunions.map((res, index) => {
    let si_paris = Object.keys(res.parisEvenement).length;
    if (si_paris > 0) {
      return (
        <div className={styles.badge} key={index}>
          <h2>Reunion:{res.numOfficiel}</h2>
          {res.parisEvenement.map((pe) => {
            return (
              <div>
                <p>
                  -- <b>{pe.codePari}</b>
                </p>
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
