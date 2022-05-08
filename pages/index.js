import { useState, useEffect } from "react";
import Link from "next/link";
import Head from "next/head";
import Image from "next/image";
import moment from "moment";
import styles from "../styles/Home.module.css";

export default function Home() {
  const [date, setDate] = useState();

  return (
    <div className={styles.container}>
      <Head>
        <title>Create Next App</title>
        <meta name="description" content="app pour annalyse pmu" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>PMU ANALYTIQUE</h1>

        <p className={styles.description}>select the race day :</p>
        <form>
          <input
            type="date"
            onChange={(e) => setDate(moment(e.target.value).format("DDMMYYYY"))}
            className={styles.inputdate}
          />
        </form>
        <p>la valeur de la date est :{date ? date : "pas de date defini"}</p>
        <Link href={`/infosreuniondate/${date}`} className={styles.btn__info}>
          <a>course du jour</a>
        </Link>
      </main>

      {/* <footer className={styles.footer}>
        <a
          href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          Powered by{" "}
          <span className={styles.logo}>
            <Image src="/vercel.svg" alt="Vercel Logo" width={72} height={16} />
          </span>
        </a>
      </footer> */}
    </div>
  );
}
