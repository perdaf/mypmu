import Link from "next/link";
// import styles from "../../styles/Home.module.css";

export default function coursesdujour() {
  return <h1>test infos course</h1>;
}

export const getServerSideProps = async ({ params }) => {
  console.log(params);
  /* const res = await fetch(
    `https://online.turfinfo.api.pmu.fr/rest/client/62/programme/${date}?meteo=true&specialisation=OFFLINE`
  ).then((data) => data.json());*/
  return {
    props: {},
  };
};
