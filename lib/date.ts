const PMU_DATE_PATTERN = /^\d{8}$/;

export function toPmuDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error("Date invalide");
  return `${match[3]}${match[2]}${match[1]}`;
}

export function assertPmuDate(value: string): string {
  if (!PMU_DATE_PATTERN.test(value)) throw new Error("Date PMU invalide");
  const day = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const year = Number(value.slice(4));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("Date PMU invalide");
  }
  return value;
}

export function formatPmuDate(value: string): string {
  assertPmuDate(value);
  return `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4)}`;
}
