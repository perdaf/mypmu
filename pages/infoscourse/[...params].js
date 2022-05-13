import Link from "next/link";
import { useRouter } from "next/router";
// import styles from "../../styles/Home.module.css";

export default function coursesdujour(result) {
  console.log(result.res.participants);
  return <h1>test infos course</h1>;
}

export const getServerSideProps = async ({ params }) => {
  const date = Object.values(params)[0][0];
  const reunion = Object.values(params)[0][1];
  const course = Object.values(params)[0][2];

  const res = await fetch(
    `https://online.turfinfo.api.pmu.fr/rest/client/62/programme/${date}/R${reunion}/C${course}/participants?specialisation=OFFLINE`
  ).then((data) => data.json());
  return {
    props: {
      res,
    },
  };
};
