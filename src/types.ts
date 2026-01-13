/**
 * TaskChampion Sync Protocol Types
 *
 * Based on the TaskChampion sync protocol specification:
 * https://gothenburgbitfactory.org/taskchampion/http.html
 */

/** UUID identifying a client (shared across devices for the same user) */
export type ClientId = string;

/** UUID identifying a version in the version chain */
export type VersionId = string;

/** Encrypted history segment containing task changes */
export type HistorySegment = ArrayBuffer;

/** Encrypted snapshot of the full task database */
export type SnapshotData = ArrayBuffer;

/** Special version ID representing "no parent" (base of the chain) */
export const NIL_VERSION_ID = "00000000-0000-0000-0000-000000000000";

/** Content types used by the protocol */
export const ContentType = {
  HISTORY_SEGMENT: "application/vnd.taskchampion.history-segment",
  SNAPSHOT: "application/vnd.taskchampion.snapshot",
} as const;

/** Custom headers used by the protocol */
export const Headers = {
  CLIENT_ID: "X-Client-Id",
  VERSION_ID: "X-Version-Id",
  PARENT_VERSION_ID: "X-Parent-Version-Id",
  SNAPSHOT_REQUEST: "X-Snapshot-Request",
} as const;

/** Snapshot urgency levels for X-Snapshot-Request header */
export type SnapshotUrgency = "low" | "high";

/** Result of adding a new version */
export type AddVersionResult =
  | { success: true; versionId: VersionId; snapshotUrgency?: SnapshotUrgency }
  | { success: false; expectedParentVersionId: VersionId };

/** Result of getting a child version */
export type GetVersionResult =
  | {
      found: true;
      versionId: VersionId;
      parentVersionId: VersionId;
      historySegment: HistorySegment;
    }
  | { found: false; gone?: boolean };

/** Result of getting a snapshot */
export type GetSnapshotResult =
  | { found: true; versionId: VersionId; snapshotData: SnapshotData }
  | { found: false };

/** Client record stored in the database */
export interface Client {
  clientId: ClientId;
  latestVersionId: VersionId | null;
  createdAt: number;
  updatedAt: number;
}

/** Version record stored in the database */
export interface Version {
  versionId: VersionId;
  clientId: ClientId;
  parentVersionId: VersionId | null;
  historySegment: HistorySegment;
  createdAt: number;
}

/** Snapshot record stored in the database */
export interface Snapshot {
  id: number;
  clientId: ClientId;
  versionId: VersionId;
  snapshotData: SnapshotData;
  createdAt: number;
}
