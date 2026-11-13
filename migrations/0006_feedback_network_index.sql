-- Speed up the network-layer feedback rate limit added after PR #6.
CREATE INDEX IF NOT EXISTS idx_feedback_network_window
  ON deal_feedback(network_hash, created_at);
