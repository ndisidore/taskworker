-- TaskChampion Sync Server D1 Schema
-- This schema implements storage for the TaskChampion sync protocol

-- Clients table: tracks each client and their latest synced version
CREATE TABLE IF NOT EXISTS clients (
  client_id TEXT PRIMARY KEY,
  latest_version_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Versions table: linked list of history segments (encrypted task changes)
-- Each version points to its parent, forming a chain
CREATE TABLE IF NOT EXISTS versions (
  version_id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  parent_version_id TEXT,
  history_segment BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(client_id)
);

CREATE INDEX IF NOT EXISTS idx_versions_client ON versions(client_id);
CREATE INDEX IF NOT EXISTS idx_versions_parent ON versions(parent_version_id);

-- Snapshots table: stores encrypted snapshots for faster sync
-- New clients can download a snapshot instead of replaying all versions
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  snapshot_data BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (client_id) REFERENCES clients(client_id)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_client ON snapshots(client_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_version ON snapshots(version_id);
