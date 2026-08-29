import Link from "next/link";
import { DateForm } from "@/components/date-form";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div>
          <p className="eyebrow">Courses hippiques · données PMU</p>
          <h1>Comprendre une course avant de faire un choix.</h1>
          <p className="lead">
            Explorez les réunions, comparez les partants et retrouvez les indicateurs
            essentiels dans une interface claire.
          </p>
        </div>
        <DateForm />
      </section>
      <section className="principles" aria-label="Principes de l’analyse">
        <article><strong>01</strong><h2>Données vérifiées</h2><p>Les réponses PMU sont contrôlées avant affichage.</p></article>
        <article><strong>02</strong><h2>Lecture rapide</h2><p>Forme, expérience, entourage et cote réunis au même endroit.</p></article>
        <article><strong>03</strong><h2>Pas de promesse</h2><p>Une aide probabiliste ne garantit jamais le résultat d’une course.</p></article>
      </section>
      <Link href="/historique" className="historyCallout">
        <span><small>Transparence du modèle</small><strong>Suivre les données disponibles pour l’IA</strong></span>
        <span>Voir l’historique →</span>
      </Link>
    </main>
  );
}
