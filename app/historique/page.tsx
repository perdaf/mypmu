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
        <article><small>Courses Quinté+</small><strong>{history.quinteRaces}</strong><span>supports identifiés</span></article>
        <article><small>Chevaux récurrents</small><strong>{history.returningHorses}</strong><span>vus dans plusieurs courses</span></article>
      </section>

      <section className="dataNotice">
        <strong>{ready ? "Le seuil minimal est atteint." : "Le modèle n’est pas encore entraîné."}</strong>
        <p>
          {ready
            ? "Un backtest chronologique peut maintenant comparer les stratégies sans utiliser les résultats futurs."
            : `Il manque ${Math.max(0, MINIMUM_BACKTEST_RACES - history.usableForBacktest)} courses complètes avant un premier backtest indicatif. Les conseils actuels restent une analyse explicable, pas un modèle statistiquement validé.`}
        </p>
      </section>

      <section className="collectionSection">
        <div className="sectionHeading">
          <div><p className="eyebrow">Collecte multi-source</p><h2>État opérationnel</h2></div>
          <p>{history.collection.days.completed} terminée(s) · {history.collection.days.failed} en échec · {history.collection.days.pending} en attente</p>
        </div>
        <div className="sourceGrid">
          {history.collection.sources.map((source) => (
            <article key={source.id} className={source.usable ? "sourceCard sourceReady" : "sourceCard sourceUnavailable"}>
              <div><strong>{source.label}</strong><span>{source.usable ? "Disponible" : source.configured ? "À valider" : "Non configuré"}</span></div>
              <p>{source.role}</p><small>{source.note}</small>
            </article>
          ))}
        </div>
        {history.collection.days.failed > 0 && <div className="resumeCommand"><strong>Reprendre les journées échouées</strong><code>npm run collect:history -- JJMMAAAA JJMMAAAA</code><span>Une relance ignore les journées terminées et reprend automatiquement les échecs.</span></div>}
        <div className="tableWrap collectionRuns">
          <table>
            <thead><tr><th>Date du programme</th><th>Source</th><th>Statut</th><th>Courses</th><th>Partants</th><th>Début</th><th>Détail</th></tr></thead>
            <tbody>
              {history.collection.recentRuns.map((run) => (
                <tr key={run.id}>
                  <td>{formatPmuDate(run.programmeDate)}</td><td>{run.source}</td>
                  <td><span className={`runStatus status-${run.status}`}>{run.status}</span></td>
                  <td>{run.racesCollected}</td><td>{run.entriesCollected}</td>
                  <td>{new Date(run.startedAt).toLocaleString("fr-FR")}</td>
                  <td className="runError">{run.errorMessage ?? "—"}</td>
                </tr>
              ))}
              {history.collection.recentRuns.length === 0 && <tr><td colSpan={7}>Aucune exécution enregistrée.</td></tr>}
            </tbody>
          </table>
        </div>
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
