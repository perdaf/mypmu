"use client";

import { useEffect, useState } from "react";
import { formatMartiniqueStart, formatRaceCountdown, type RaceCountdown as Countdown } from "@/lib/race-countdown";

type RaceCountdownProps = {
  scheduledAt: number;
  bettingOpen: boolean;
};

export function RaceCountdown({ scheduledAt, bettingOpen }: RaceCountdownProps) {
  const [countdown, setCountdown] = useState<Countdown | null>(null);

  useEffect(() => {
    const update = () => setCountdown(formatRaceCountdown(scheduledAt, Date.now()));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [scheduledAt]);

  const startTime = formatMartiniqueStart(scheduledAt);

  if (!bettingOpen) {
    return (
      <span className="raceCountdown raceCountdown-started">
        <small>Validation du ticket</small>
        <strong>Paris fermés</strong>
        <em>Départ prévu à {startTime} en Martinique</em>
      </span>
    );
  }

  return (
    <span className={`raceCountdown ${countdown ? `raceCountdown-${countdown.state}` : ""}`}>
      <small>Fermeture estimée des paris</small>
      <strong role="timer">{countdown?.label ?? "Calcul…"}</strong>
      <em>Au plus tard au départ · {startTime} en Martinique</em>
    </span>
  );
}
