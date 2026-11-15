CREATE TABLE alert_scan_progress (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  checked_at TEXT NOT NULL
);

CREATE INDEX idx_alert_inbox_created ON alert_inbox(created_at);
CREATE INDEX idx_alert_inbox_user_id ON alert_inbox(user_id, id DESC);
CREATE INDEX idx_alert_inbox_unread ON alert_inbox(user_id, day) WHERE read_at IS NULL;
CREATE INDEX idx_deals_first_seen ON deals(first_seen_at);
CREATE INDEX idx_oauth_states_expires ON oauth_states(expires_at);
CREATE INDEX idx_saved_tombstones_removed ON saved_tombstones(removed_at);
CREATE INDEX idx_auth_rate_window ON auth_rate(window_start);
