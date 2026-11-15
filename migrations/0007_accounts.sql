CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                 -- random 128-bit, base64url; never the provider id
  display_name TEXT NOT NULL,          -- GitHub login at last sign-in, max 39 chars
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identities (
  provider TEXT NOT NULL CHECK (provider IN ('github', 'passkey', 'email')),
  subject TEXT NOT NULL,               -- github numeric id as text / passkey credential id / sha256(email) later
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key BLOB,                     -- passkey only
  sign_count INTEGER,                  -- passkey only
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider, subject)
);
CREATE INDEX IF NOT EXISTS idx_identities_user ON identities(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,         -- hex sha256(SESSION_PEPPER || token); raw token only in cookie
  prev_hash TEXT,                      -- previous token hash during rotation grace
  prev_valid_until TEXT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  rotated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL             -- sliding, max 30 days from last use
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_prev ON sessions(prev_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,         -- sha256(state)
  code_verifier TEXT NOT NULL,         -- PKCE verifier, server-side only
  return_to TEXT NOT NULL,             -- same-origin path only, validated
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL             -- +10 minutes, single use (DELETE ... RETURNING)
);

CREATE TABLE IF NOT EXISTS user_saved (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deal_id TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (user_id, deal_id)
);

CREATE TABLE IF NOT EXISTS saved_tombstones (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deal_id TEXT NOT NULL,
  removed_at TEXT NOT NULL,            -- purged after 30 days by cron
  PRIMARY KEY (user_id, deal_id)
);

CREATE TABLE IF NOT EXISTS alert_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  prefs_json TEXT NOT NULL,            -- same shape as localStorage dh-preferences + {channels:{site,email,push}}
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deal_id TEXT NOT NULL,
  last_revision TEXT NOT NULL,         -- mirrors dh-alerts-v1 revisions map
  PRIMARY KEY (user_id, deal_id)
);

CREATE TABLE IF NOT EXISTS alert_inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dedupe_key TEXT NOT NULL,            -- 'new:<id>' / 'changed:<id>:<rev>' / 'ending:<id>:<deadline>'
  kind TEXT NOT NULL CHECK (kind IN ('newOffer', 'changed', 'ending')),
  deal_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  day TEXT NOT NULL,                   -- Asia/Shanghai date, as radar.ts alertDay
  read_at TEXT,
  emailed_at TEXT                      -- reserved for the email channel
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_dedupe ON alert_inbox(user_id, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_inbox_user_day ON alert_inbox(user_id, day);

CREATE TABLE IF NOT EXISTS auth_rate (
  bucket TEXT NOT NULL,                -- e.g. 'login:<hash(ip)>', 'write:<user_id>'
  window_start TEXT NOT NULL,
  hits INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
