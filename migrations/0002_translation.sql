-- Chinese translations for English deal titles and summaries.
-- NULL zh_status means "not attempted yet". Values: done | skip (already Chinese / empty) | error.
-- The page falls back to the original text whenever zh_title / zh_summary is empty.
ALTER TABLE deals ADD COLUMN zh_title TEXT;
ALTER TABLE deals ADD COLUMN zh_summary TEXT;
ALTER TABLE deals ADD COLUMN zh_status TEXT;
ALTER TABLE deals ADD COLUMN zh_engine TEXT;
ALTER TABLE deals ADD COLUMN zh_at TEXT;
ALTER TABLE deals ADD COLUMN zh_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_deals_zh ON deals (status, zh_status);
