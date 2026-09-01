import Link from "next/link";
import { getHistoryOverview, MINIMUM_BACKTEST_RACES } from "@/lib/history";

export const dynamic = "force-dynamic";

function formatPmuDate(value: string | null) {
  if (!value || !/^\d{8}$/.test(value)) return "—";
  return `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
}

export default function HistoryPage() {
  const history = getHistoryOverview();
  const progress = Math.min(100, Math.round(history.usableForBacktest / MINIMUM_BACKTEST_RACES * 100));
  const ready = history.usableForBacktest >= MINIMUM_BACKTEST_RACES;

  return (
    <main>
      <section className="historyHeading">
        <div>
          <p className="eyebrow">Données d’apprentissage</p>
          <h1>Historique & IA</h1>
          <p className="lead">Mesurer la qualité de l’historique avant de laisser un modèle influencer les tickets.</p>
        </div>
        <div className={`readinessCard ${ready ? "ready" : "collecting"}`}>
          <small>État du backtest</small>
          <strong>{ready ? "Prêt à évaluer" : "Collecte en cours"}</strong>
          <div className="progressTrack"><span style={{ width: `${progress}%` }} /></div>
          <p>{history.usableForBacktest} / {MINIMUM_BACKTEST_RACES} courses exploitables</p>
        </div>
      </section>

      <section className="historyMetrics" aria-label="État de la base historique">
        <article><small>Courses</small><strong>{history.races}</strong><span>{history.programmeDates} journée{history.programmeDates > 1 ? "s" : ""}</span></article>
        <article><small>Avec arrivée</small><strong>{history.completedRaces}</strong><span>résultats connus</span></article>
        <article><small>Partants</small><strong>{history.entries}</strong><span>{history.horses} chevaux distincts</span></article>
        <article><small>Relevés de cotes</small><strong>{history.oddsSnapshots}</strong><span>instantanés conservés</span></article>
        <article><small>Complétude</small><strong>{history.averageCompletenessPercent} %</strong><span>données partants</span></article>
        <article><small>Performances passées</small><strong>{history.pastPerformances}</strong><span>{history.entriesWithHistory} partants documentés</span></article>
        <article><small>Météo horaire</small><strong>{history.weatherSnapshots}</strong><span>courses contextualisées</span></article>
        <article><small>Rapports</small><strong>{history.reports}</strong><span>rapports définitifs</span></article>
      </section>

      <section className="dataNotice">
        <strong>{ready ? "Le seuil minimal est atteint." : "Le modèle n’est pas encore entraîné."}</strong>
        <p>
          {ready
            ? "Un backtest chronologique peut maintenant comparer les stratégies sans utiliser les résultats futurs."
            : `Il manque ${Math.max(0, MINIMUM_BACKTEST_RACES - history.usableForBacktest)} courses complètes avant un premier backtest indicatif. Les conseils actuels restent une analyse explicable, pas un modèle statistiquement validé.`}
        </p>
      </section>

      <section className="historyTableSection">
        <div className="sectionHeading">
          <div><p className="eyebrow">Couverture</p><h2>Courses enregistrées</h2></div>
          <p>{formatPmuDate(history.firstDate)} → {formatPmuDate(history.lastDate)}</p>
        </div>
        <div className="tableWrap">
          <table className="historyTable">
            <thead><tr><th>Date</th><th>Course</th><th>Hippodrome</th><th>Partants</th><th>Qualité</th><th>Cotes</th><th>Arrivée (5)</th><th>Rapports</th></tr></thead>
            <tbody>
              {history.recentRaces.map((race) => (
                <tr key={race.id}>
                  <td>{formatPmuDate(race.programmeDate)}</td>
                  <td><Link href={`/course/${race.programmeDate}/${race.reunionNumber}/${race.courseNumber}`}><strong>R{race.reunionNumber} C{race.courseNumber}</strong><small>{race.label}</small></Link></td>
                  <td>{race.hippodrome ?? "—"}</td>
                  <td>{race.runners}</td>
                  <td><span className={race.completenessPercent >= 80 ? "qualityBadge good" : "qualityBadge weak"}>{race.completenessPercent} %</span></td>
                  <td>{race.oddsSnapshots}</td>
                  <td>{race.finish ?? "En attente"}</td>
                  <td>{race.reports}</td>
                </tr>
              ))}
              {history.recentRaces.length === 0 && <tr><td colSpan={8}>Aucune course collectée.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
