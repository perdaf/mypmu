"use client";

import { useCallback, useEffect, useState } from "react";

type Status = {
  status: "stopped" | "starting" | "waiting" | "collecting" | "success" | "error";
  watcherActive: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  nextAttemptAt: string | null;
  racesCollected: number;
  entriesCollected: number;
  errorKind: "network" | "database" | "api" | "unknown" | null;
  errorMessage: string | null;
};

const labels: Record<Status["status"], string> = {
  stopped: "Collecteur arrêté", starting: "Démarrage…", waiting: "En attente",
  collecting: "Collecte en cours", success: "Dernière collecte réussie", error: "Collecte en échec",
};

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("fr-FR") : "Jamais";
}

export function CollectorStatusPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/collector/status", { cache: "no-store" });
      if (response.ok) setStatus(await response.json());
    } catch {
      setMessage("Impossible de lire l’état du collecteur.");
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  async function launch() {
    setLaunching(true);
    setMessage(null);
    try {
      const response = await fetch("/api/collector/run", { method: "POST" });
      const result = await response.json() as { message?: string };
      setMessage(result.message ?? (response.ok ? "Collecte lancée." : "Échec du lancement."));
      await refresh();
    } catch {
      setMessage("Le serveur n’a pas pu lancer la collecte.");
    } finally {
      setLaunching(false);
    }
  }

  const networkWarning = status?.status === "error" && ["network", "api"].includes(status.errorKind ?? "");
  return (
    <section className={`collectorPanel collector-${status?.status ?? "loading"}`} aria-live="polite">
      <div className="collectorState">
        <span className="collectorPulse" />
        <div>
          <small>Collecte Quinté+</small>
          <strong>{status ? labels[status.status] : "Lecture du statut…"}</strong>
          <span>{status?.watcherActive ? "Surveillance automatique active" : "Surveillance automatique inactive"}</span>
        </div>
      </div>
      <div className="collectorFacts">
        <span><small>Dernière tentative</small><strong>{dateTime(status?.lastAttemptAt ?? null)}</strong></span>
        <span><small>Dernière réussite</small><strong>{dateTime(status?.lastSuccessAt ?? null)}</strong></span>
        <span><small>Dernier relevé</small><strong>{status ? `${status.racesCollected} course(s) · ${status.entriesCollected} partants` : "—"}</strong></span>
      </div>
      {networkWarning && <p className="collectorWarning"><strong>PMU est actuellement inaccessible.</strong> Vérifiez la connexion réseau et, sur le réseau d’entreprise, que le VPN est actif.</p>}
      {status?.status === "error" && !networkWarning && <p className="collectorWarning"><strong>La collecte a échoué.</strong> {status.errorMessage ?? "Consultez le terminal pour obtenir le détail."}</p>}
      <div className="collectorActions">
        {status?.nextAttemptAt && status.watcherActive && <span>Prochain contrôle : {dateTime(status.nextAttemptAt)}</span>}
        {message && <span>{message}</span>}
        <button type="button" onClick={launch} disabled={launching || status?.status === "collecting" || status?.status === "starting"}>
          {launching ? "Lancement…" : "Relancer maintenant"}
        </button>
      </div>
    </section>
  );
}
