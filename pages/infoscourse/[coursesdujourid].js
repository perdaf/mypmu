export default function coursesdujour({ date }) {
  return (
    <div>
      <h1>test</h1>
      <div>affichage des infos</div>
    </div>
  );
}

export const getServerSideProps = async ({ params }) => {
  /* const res = await fetch(
    "https://online.turfinfo.api.pmu.fr/rest/client/62/programme/05052022?meteo=true&specialisation=OFFLINE"
  ).then((data) => data.json()); */
  //   console.log(res.programme);
  console.log("params = ", params);
  return {
    props: {},
  };
};
