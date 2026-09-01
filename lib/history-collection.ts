import { assertPmuDate } from "./date";

function toUtcDate(value: string) {
  assertPmuDate(value);
  return new Date(Date.UTC(Number(value.slice(4)), Number(value.slice(2, 4)) - 1, Number(value.slice(0, 2))));
}

function fromUtcDate(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, "0")}${String(date.getUTCMonth() + 1).padStart(2, "0")}${date.getUTCFullYear()}`;
}

export function pmuDateRange(start: string, end: string, maximumDays = 366) {
  const first = toUtcDate(start);
  const last = toUtcDate(end);
  if (first > last) throw new Error("La date de début doit précéder la date de fin.");
  const count = Math.floor((last.getTime() - first.getTime()) / 86_400_000) + 1;
  if (count > maximumDays) throw new Error(`La plage est limitée à ${maximumDays} jours par lancement.`);
  return Array.from({ length: count }, (_, index) => fromUtcDate(new Date(first.getTime() + index * 86_400_000)));
}

export function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${seconds % 60} s`;
}
