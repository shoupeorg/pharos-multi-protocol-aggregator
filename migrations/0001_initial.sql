CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  captured_at TEXT NOT NULL,
  intent TEXT NOT NULL,
  status TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_captured_at ON runs(captured_at DESC);
