-- Anonymous "can I still claim it?" feedback.
-- No account, no raw IP, no free-text comment: only a vote and short-lived hashes.
CREATE TABLE IF NOT EXISTS deal_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('works', 'expired', 'unknown')),
  browser_hash TEXT NOT NULL,
  network_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'kept', 'held', 'hidden')),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT
);

-- One vote per browser per deal terms version: retries stay idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_once_per_version
  ON deal_feedback(deal_id, terms_version, browser_hash);

-- Aggregate window + review queries.
CREATE INDEX IF NOT EXISTS idx_feedback_deal_window
  ON deal_feedback(deal_id, terms_version, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_browser_window
  ON deal_feedback(browser_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_created
  ON deal_feedback(created_at);
