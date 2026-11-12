CREATE TABLE portal_snapshots (
  snapshot_key TEXT PRIMARY KEY,
  generated_at INTEGER NOT NULL,
  valid_until INTEGER NOT NULL,
  html_gzip BLOB NOT NULL
);
