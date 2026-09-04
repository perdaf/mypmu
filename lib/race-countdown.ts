export type RaceCountdown =
  | { state: "upcoming"; label: string }
  | { state: "imminent"; label: string }
  | { state: "started"; label: string };

export function formatRaceCountdown(scheduledAt: number, now: number): RaceCountdown {
  const remainingSeconds = Math.ceil((scheduledAt - now) / 1_000);

  if (remainingSeconds <= 0) return { state: "started", label: "Course partie" };
  if (remainingSeconds <= 60) return { state: "imminent", label: "Départ imminent" };

  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  const parts = days > 0 ? [days, hours, minutes] : [hours, minutes, seconds];

  return {
    state: "upcoming",
    label: parts.map((part) => String(part).padStart(2, "0")).join(" : "),
  };
}

export function formatMartiniqueStart(scheduledAt: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "America/Martinique",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(scheduledAt));
}
