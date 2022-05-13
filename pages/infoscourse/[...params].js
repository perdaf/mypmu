import Link from "next/link";
import { useRouter } from "next/router";
// import styles from "../../styles/Home.module.css";

export default function coursesdujour() {
  const router = useRouter();
  const { params } = router.query;

  console.log(params);

  return <h1>test infos course</h1>;
}

export const getServerSideProps = async ({ params }) => {
  /* const res = await fetch(
    `https://online.turfinfo.api.pmu.fr/rest/client/62/programme/${date}/R1/C1/participants?specialisation=OFFLINE`
  ).then((data) => data.json());*/
  return {
    props: {},
  };
};
