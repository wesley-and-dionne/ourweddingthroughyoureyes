CREATE TABLE IF NOT EXISTS moments (
  id TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL UNIQUE,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
  caption TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL CHECK (language IN ('en', 'zh')),
  duration_seconds REAL,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'stored' CHECK (status IN ('stored', 'deleted'))
);

CREATE INDEX IF NOT EXISTS moments_received_at_idx
ON moments(received_at DESC);

CREATE TABLE IF NOT EXISTS storage_totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_bytes INTEGER NOT NULL DEFAULT 0,
  upload_count INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO storage_totals (id, total_bytes, upload_count)
VALUES (1, 0, 0);
