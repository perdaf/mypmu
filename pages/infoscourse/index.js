import Link from "next/link";
import { useRouter } from "next/router";
import styles from "../../styles/Home.module.css";

import { poidMusique } from "../librairies/calcule";
import { afficheInfosParticipant } from "../components/afficheinfosparticipant";

export default function coursesdujour(res) {
  console.log(res.infoparticipant.participants);
  console.log(res.infopronostique);
  console.log(res.infocourse);

  const participants = res.infoparticipant.participants;

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Infos sur la course</h1>
        <div className={styles.badgecontainer}>
          <p className={styles.badge}>
            Nom : <b>{res.infocourse.libelle}</b>
          </p>
          <p className={styles.badge}>
            Discipline : <b>{res.infocourse.discipline}</b>
          </p>
          <p className={styles.badge}>
            corde : <b>{res.infocourse.corde}</b>
          </p>
          <p className={styles.badge}>
            distance : <b>{res.infocourse.distance} métres</b>
          </p>
          <p className={styles.badge}>
            Nb partant : <b>{res.infocourse.nombreDeclaresPartants}</b>
          </p>
        </div>
        <div>
          <h1 className={styles.title}>Infos sur les participants</h1>
          {poidMusique("test")}
          {afficheInfosParticipant(participants)}
        </div>
      </main>
    </div>
  );
}

// ------------------------------------------------
export const getServerSideProps = async (params) => {
  const date = params.query.date;
  const reunion = params.query.numReunion;
  const course = params.query.numCourse;
  const infocourse = JSON.parse(params.query.infosCourse);

  const infoparticipant = await fetch(
    `https://online.turfinfo.api.pmu.fr/rest/client/62/programme/${date}/R${reunion}/C${course}/participants?specialisation=OFFLINE`
  ).then((data) => data.json());

  const infopronostique = await fetch(
    `https://online.turfinfo.api.pmu.fr/rest/client/62/programme/${date}/R${reunion}/C${course}/pronostics-detailles`
  ).then((data) => data.json());

  return {
    props: {
      infoparticipant,
      infopronostique,
      infocourse,
    },
  };
};
