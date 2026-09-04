export const QUINTE_FAR_INTERVAL_MS = 15 * 60 * 1_000;
export const QUINTE_NEAR_INTERVAL_MS = 5 * 60 * 1_000;
export const QUINTE_NEAR_WINDOW_MS = 30 * 60 * 1_000;
const MINIMUM_DELAY_MS = 60 * 1_000;
const FINAL_PRE_START_OFFSET_MS = 60 * 1_000;

export type QuinteScheduleState = {
  scheduledAt: number;
  resultsAvailable: boolean;
};

export function nextQuinteDelay(now: number, race?: QuinteScheduleState): number {
  if (!race || race.resultsAvailable) return QUINTE_FAR_INTERVAL_MS;

  const untilNearWindow = race.scheduledAt - now - QUINTE_NEAR_WINDOW_MS;
  if (untilNearWindow > 0) {
    return Math.max(MINIMUM_DELAY_MS, Math.min(QUINTE_FAR_INTERVAL_MS, untilNearWindow));
  }

  const untilFinalPreStartSnapshot = race.scheduledAt - now - FINAL_PRE_START_OFFSET_MS;
  if (untilFinalPreStartSnapshot > 0) {
    return Math.min(QUINTE_NEAR_INTERVAL_MS, untilFinalPreStartSnapshot);
  }

  return QUINTE_NEAR_INTERVAL_MS;
}
