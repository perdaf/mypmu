import { initializeDatabase } from "./db";

export type CollectorState = "stopped" | "starting" | "waiting" | "collecting" | "success" | "error";
export type CollectorErrorKind = "network" | "database" | "api" | "unknown";

export type CollectorStatus = {
  collectorId: string;
  status: CollectorState;
  watcherActive: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  nextAttemptAt: string | null;
  racesCollected: number;
  entriesCollected: number;
  errorKind: CollectorErrorKind | null;
  errorMessage: string | null;
  processId: number | null;
  updatedAt: string;
};

type StatusPatch = Partial<Omit<CollectorStatus, "collectorId" | "updatedAt">>;

const defaultStatus = (): CollectorStatus => ({
  collectorId: "quinte",
  status: "stopped",
  watcherActive: false,
  lastAttemptAt: null,
  lastSuccessAt: null,
  nextAttemptAt: null,
  racesCollected: 0,
  entriesCollected: 0,
  errorKind: null,
  errorMessage: null,
  processId: null,
  updatedAt: new Date().toISOString(),
});

export function classifyCollectorError(error: unknown): CollectorErrorKind {
  const message = error instanceof Error ? error.message : String(error);
  if (/SQLITE|database|base de donn/i.test(message)) return "database";
  if (/ECONN|ENET|EAI_AGAIN|fetch failed|socket|timeout|network|réseau/i.test(message)) return "network";
  if (/HTTP|PMU|API|JSON|programme/i.test(message)) return "api";
  return "unknown";
}

export function readCollectorStatus(): CollectorStatus {
  const database = initializeDatabase();
  try {
    const row = database.prepare(`
      SELECT collector_id AS collectorId, status, watcher_active AS watcherActive,
        last_attempt_at AS lastAttemptAt, last_success_at AS lastSuccessAt,
        next_attempt_at AS nextAttemptAt, races_collected AS racesCollected,
        entries_collected AS entriesCollected, error_kind AS errorKind,
        error_message AS errorMessage, process_id AS processId, updated_at AS updatedAt
      FROM collector_status WHERE collector_id = 'quinte'
    `).get() as (Omit<CollectorStatus, "watcherActive"> & { watcherActive: number }) | undefined;
    if (!row) return defaultStatus();
    return { ...row, watcherActive: Boolean(row.watcherActive) };
  } finally {
    database.close();
  }
}

export function updateCollectorStatus(patch: StatusPatch): CollectorStatus {
  const current = readCollectorStatus();
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  const database = initializeDatabase();
  try {
    database.prepare(`
      INSERT INTO collector_status (
        collector_id, status, watcher_active, last_attempt_at, last_success_at,
        next_attempt_at, races_collected, entries_collected, error_kind,
        error_message, process_id, updated_at
      ) VALUES (@collectorId, @status, @watcherActive, @lastAttemptAt, @lastSuccessAt,
        @nextAttemptAt, @racesCollected, @entriesCollected, @errorKind,
        @errorMessage, @processId, @updatedAt)
      ON CONFLICT(collector_id) DO UPDATE SET
        status=excluded.status, watcher_active=excluded.watcher_active,
        last_attempt_at=excluded.last_attempt_at, last_success_at=excluded.last_success_at,
        next_attempt_at=excluded.next_attempt_at, races_collected=excluded.races_collected,
        entries_collected=excluded.entries_collected, error_kind=excluded.error_kind,
        error_message=excluded.error_message, process_id=excluded.process_id,
        updated_at=excluded.updated_at
    `).run({ ...next, watcherActive: next.watcherActive ? 1 : 0 });
    return next;
  } finally {
    database.close();
  }
}
