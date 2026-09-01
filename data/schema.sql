PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  programme_date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  races_collected INTEGER NOT NULL DEFAULT 0,
  entries_collected INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS races (
  id TEXT PRIMARY KEY,
  programme_date TEXT NOT NULL,
  reunion_number INTEGER NOT NULL,
  course_number INTEGER NOT NULL,
  label TEXT NOT NULL,
  hippodrome TEXT,
  discipline TEXT,
  specialite TEXT,
  distance INTEGER,
  corde TEXT,
  scheduled_at INTEGER,
  status TEXT,
  declared_runners INTEGER,
  results_available INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL,
  first_collected_at TEXT NOT NULL,
  last_collected_at TEXT NOT NULL,
  UNIQUE (programme_date, reunion_number, course_number)
);

CREATE TABLE IF NOT EXISTS horses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sex TEXT,
  age INTEGER,
  breed TEXT,
  sire_name TEXT,
  dam_name TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS race_entries (
  race_id TEXT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  horse_id TEXT NOT NULL REFERENCES horses(id),
  pmu_number INTEGER NOT NULL,
  status TEXT,
  music TEXT,
  trainer TEXT,
  jockey_driver TEXT,
  trainer_opinion TEXT,
  career_races INTEGER,
  career_wins INTEGER,
  career_places INTEGER,
  career_earnings_cents INTEGER,
  starting_gate INTEGER,
  handicap_weight INTEGER,
  handicap_distance INTEGER,
  data_completeness REAL NOT NULL,
  missing_fields TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (race_id, pmu_number)
);

CREATE TABLE IF NOT EXISTS odds_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  race_id TEXT NOT NULL,
  pmu_number INTEGER NOT NULL,
  odds REAL NOT NULL,
  source TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  FOREIGN KEY (race_id, pmu_number) REFERENCES race_entries(race_id, pmu_number) ON DELETE CASCADE,
  UNIQUE (race_id, pmu_number, source, observed_at)
);

CREATE TABLE IF NOT EXISTS race_bets (
  race_id TEXT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  bet_code TEXT NOT NULL,
  base_stake_cents INTEGER NOT NULL,
  on_sale INTEGER NOT NULL,
  ordered INTEGER NOT NULL,
  combinable INTEGER NOT NULL,
  required_horses INTEGER NOT NULL,
  flexi_values TEXT NOT NULL,
  risk_values TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (race_id, bet_code)
);

CREATE TABLE IF NOT EXISTS race_results (
  race_id TEXT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  finishing_position INTEGER NOT NULL,
  pmu_number INTEGER NOT NULL,
  dead_heat_group INTEGER NOT NULL DEFAULT 0,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (race_id, finishing_position, pmu_number)
);

CREATE TABLE IF NOT EXISTS bet_reports (
  race_id TEXT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  bet_code TEXT NOT NULL,
  report_label TEXT NOT NULL,
  winning_combination TEXT NOT NULL,
  report_cents INTEGER NOT NULL,
  report_per_euro_cents INTEGER,
  stake_reference_cents INTEGER,
  winners REAL,
  refunded INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (race_id, bet_code, report_label, winning_combination)
);

CREATE TABLE IF NOT EXISTS model_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  race_id TEXT NOT NULL,
  pmu_number INTEGER NOT NULL,
  model_version TEXT NOT NULL,
  win_probability REAL,
  top3_probability REAL,
  top4_probability REAL,
  top5_probability REAL,
  confidence REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (race_id, pmu_number) REFERENCES race_entries(race_id, pmu_number),
  UNIQUE (race_id, pmu_number, model_version)
);

-- Une performance passée est normalisée une seule fois, même si elle apparaît
-- dans l'historique de plusieurs courses cibles collectées à des dates différentes.
CREATE TABLE IF NOT EXISTS horse_performances (
  id TEXT PRIMARY KEY,
  horse_id TEXT NOT NULL REFERENCES horses(id),
  raced_at INTEGER NOT NULL,
  timezone_offset INTEGER,
  hippodrome TEXT,
  race_name TEXT,
  discipline TEXT,
  allocation INTEGER,
  distance INTEGER,
  runners INTEGER,
  winner_time INTEGER,
  finish_position INTEGER,
  finish_status TEXT,
  jockey_driver TEXT,
  jockey_weight INTEGER,
  starting_gate INTEGER,
  distance_behind INTEGER,
  kilometer_reduction INTEGER,
  distance_run INTEGER,
  blinkers TEXT,
  field_json TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  first_collected_at TEXT NOT NULL,
  last_collected_at TEXT NOT NULL,
  UNIQUE (horse_id, raced_at, hippodrome, race_name)
);

-- Ce lien fige les performances qui étaient connues pour un partant avant la
-- course cible. Le recency_rank 1 désigne sa sortie la plus récente.
CREATE TABLE IF NOT EXISTS race_entry_performance_snapshots (
  target_race_id TEXT NOT NULL,
  pmu_number INTEGER NOT NULL,
  performance_id TEXT NOT NULL REFERENCES horse_performances(id),
  recency_rank INTEGER NOT NULL,
  collected_at TEXT NOT NULL,
  PRIMARY KEY (target_race_id, pmu_number, performance_id),
  FOREIGN KEY (target_race_id, pmu_number) REFERENCES race_entries(race_id, pmu_number) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_races_date ON races(programme_date);
CREATE INDEX IF NOT EXISTS idx_entries_horse ON race_entries(horse_id);
CREATE INDEX IF NOT EXISTS idx_odds_race_time ON odds_snapshots(race_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_results_race ON race_results(race_id);
CREATE INDEX IF NOT EXISTS idx_performances_horse_date ON horse_performances(horse_id, raced_at DESC);
CREATE INDEX IF NOT EXISTS idx_performance_snapshots_target ON race_entry_performance_snapshots(target_race_id, pmu_number, recency_rank);
