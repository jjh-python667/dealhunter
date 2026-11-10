-- Local and future remote D1 schema for GLOBAL DEAL HUNTER.
-- Empty strings mean the source did not state that field. The UI shows 待核实.

CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  value_text TEXT NOT NULL DEFAULT '',
  value_amount REAL,
  value_currency TEXT,
  value_tier TEXT NOT NULL,
  conditions TEXT NOT NULL DEFAULT '',
  regions TEXT NOT NULL DEFAULT '',
  starts_at TEXT,
  ends_at TEXT,
  time_text TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '',
  official_url TEXT NOT NULL DEFAULT '',
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_id TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  risk_note TEXT NOT NULL DEFAULT '',
  deal_type TEXT NOT NULL,
  status TEXT NOT NULL,
  published_at TEXT,
  rank_score REAL NOT NULL,
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archive_reason TEXT NOT NULL DEFAULT ''
);

CREATE INDEX idx_deals_status_rank ON deals (status, rank_score DESC);
CREATE INDEX idx_deals_source ON deals (source_id, status);
CREATE INDEX idx_deals_category ON deals (category, status);
CREATE INDEX idx_deals_ends ON deals (status, ends_at);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  cron TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  ok INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  archived_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE source_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  http_status INTEGER,
  ok INTEGER NOT NULL,
  error TEXT,
  items_seen INTEGER NOT NULL DEFAULT 0,
  items_kept INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL
);

CREATE INDEX idx_source_checks_run ON source_checks (run_id);
