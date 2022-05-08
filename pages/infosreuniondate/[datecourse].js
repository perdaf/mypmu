import styles from "../../styles/Home.module.css";

export default function coursesdujour({ date, res }) {
  let infoscourses = res.programme.reunions;
  let infos = infoscourses.map((res) => {
    return (
      <div>
        <p key={res.numofficiel}>parievenement: {res}</p>
      </div>
    );
  });
  return (
    <div className={styles.container}>
      <h1>test</h1>
      <div>affichage des infos</div>
      <p>la date choisi es: {date}</p>
      <p>infos sur les reunions</p>
      {infos}
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
