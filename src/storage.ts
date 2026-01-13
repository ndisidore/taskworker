/**
 * D1 Storage Layer for TaskChampion Sync Server
 *
 * Implements the storage operations needed by the sync protocol handlers.
 */

import type {
  AddVersionResult,
  Client,
  ClientId,
  GetSnapshotResult,
  GetVersionResult,
  HistorySegment,
  SnapshotData,
  SnapshotUrgency,
  VersionId,
} from "./types";
import { NIL_VERSION_ID } from "./types";

/** Number of versions before requesting a snapshot */
const SNAPSHOT_VERSION_THRESHOLD = 100;

export class Storage {
  constructor(private db: D1Database) {}

  /**
   * Get or create a client record.
   * Creates the client if it doesn't exist.
   */
  async getOrCreateClient(clientId: ClientId): Promise<Client> {
    const now = Date.now();

    // Try to get existing client
    const existing = await this.db
      .prepare("SELECT * FROM clients WHERE client_id = ?")
      .bind(clientId)
      .first<{
        client_id: string;
        latest_version_id: string | null;
        created_at: number;
        updated_at: number;
      }>();

    if (existing) {
      return {
        clientId: existing.client_id,
        latestVersionId: existing.latest_version_id,
        createdAt: existing.created_at,
        updatedAt: existing.updated_at,
      };
    }

    // Create new client
    await this.db
      .prepare(
        "INSERT INTO clients (client_id, latest_version_id, created_at, updated_at) VALUES (?, NULL, ?, ?)",
      )
      .bind(clientId, now, now)
      .run();

    return {
      clientId,
      latestVersionId: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Add a new version to the chain.
   *
   * Returns success with the new version ID if the parent matches,
   * or failure with the expected parent if there's a conflict.
   */
  async addVersion(
    clientId: ClientId,
    parentVersionId: VersionId,
    historySegment: HistorySegment,
  ): Promise<AddVersionResult> {
    const client = await this.getOrCreateClient(clientId);

    // Check if the parent version matches the client's latest version
    const expectedParent = client.latestVersionId ?? NIL_VERSION_ID;
    if (parentVersionId !== expectedParent) {
      return {
        success: false,
        expectedParentVersionId: expectedParent,
      };
    }

    // Generate new version ID
    const versionId = crypto.randomUUID();
    const now = Date.now();

    // Insert the new version and update client atomically using a batch
    await this.db.batch([
      this.db
        .prepare(
          "INSERT INTO versions (version_id, client_id, parent_version_id, history_segment, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(
          versionId,
          clientId,
          parentVersionId === NIL_VERSION_ID ? null : parentVersionId,
          historySegment,
          now,
        ),
      this.db
        .prepare(
          "UPDATE clients SET latest_version_id = ?, updated_at = ? WHERE client_id = ?",
        )
        .bind(versionId, now, clientId),
    ]);

    // Determine if we should request a snapshot
    const snapshotUrgency = await this.calculateSnapshotUrgency(clientId);

    return {
      success: true,
      versionId,
      snapshotUrgency,
    };
  }

  /**
   * Get the child version of a given parent version.
   *
   * Returns the version if found, or not found status.
   * Returns "gone" if the version was pruned (snapshot exists but version doesn't).
   */
  async getChildVersion(
    clientId: ClientId,
    parentVersionId: VersionId,
  ): Promise<GetVersionResult> {
    // Find version with this parent
    const version = await this.db
      .prepare(
        "SELECT * FROM versions WHERE client_id = ? AND (parent_version_id = ? OR (parent_version_id IS NULL AND ? = ?))",
      )
      .bind(
        clientId,
        parentVersionId === NIL_VERSION_ID ? null : parentVersionId,
        parentVersionId,
        NIL_VERSION_ID,
      )
      .first<{
        version_id: string;
        client_id: string;
        parent_version_id: string | null;
        history_segment: ArrayBuffer;
        created_at: number;
      }>();

    if (version) {
      return {
        found: true,
        versionId: version.version_id,
        parentVersionId: version.parent_version_id ?? NIL_VERSION_ID,
        historySegment: version.history_segment,
      };
    }

    // Check if the client has any data at all
    const client = await this.db
      .prepare("SELECT latest_version_id FROM clients WHERE client_id = ?")
      .bind(clientId)
      .first<{ latest_version_id: string | null }>();

    if (!client || !client.latest_version_id) {
      // Client has no versions - parent is up to date
      return { found: false };
    }

    // Client has versions but we couldn't find the child of the requested parent
    // This could mean:
    // 1. The requested parent IS the latest version (client is up to date)
    // 2. The version was pruned (gone)

    if (client.latest_version_id === parentVersionId) {
      // Client is up to date
      return { found: false };
    }

    // Check if a snapshot exists beyond this point (indicating pruning)
    const snapshot = await this.db
      .prepare(
        "SELECT 1 FROM snapshots WHERE client_id = ? AND version_id != ? LIMIT 1",
      )
      .bind(clientId, parentVersionId)
      .first();

    if (snapshot) {
      // Versions were likely pruned
      return { found: false, gone: true };
    }

    // No child version exists
    return { found: false };
  }

  /**
   * Add a snapshot at a specific version.
   *
   * Returns true if successful, false if the version doesn't exist.
   */
  async addSnapshot(
    clientId: ClientId,
    versionId: VersionId,
    snapshotData: SnapshotData,
  ): Promise<boolean> {
    // Verify the version exists and belongs to this client
    const version = await this.db
      .prepare("SELECT 1 FROM versions WHERE version_id = ? AND client_id = ?")
      .bind(versionId, clientId)
      .first();

    if (!version) {
      return false;
    }

    const now = Date.now();

    // Delete any existing snapshot for this client and insert new one
    await this.db.batch([
      this.db
        .prepare("DELETE FROM snapshots WHERE client_id = ?")
        .bind(clientId),
      this.db
        .prepare(
          "INSERT INTO snapshots (client_id, version_id, snapshot_data, created_at) VALUES (?, ?, ?, ?)",
        )
        .bind(clientId, versionId, snapshotData, now),
    ]);

    return true;
  }

  /**
   * Get the latest snapshot for a client.
   */
  async getSnapshot(clientId: ClientId): Promise<GetSnapshotResult> {
    const snapshot = await this.db
      .prepare(
        "SELECT version_id, snapshot_data FROM snapshots WHERE client_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .bind(clientId)
      .first<{
        version_id: string;
        snapshot_data: ArrayBuffer;
      }>();

    if (!snapshot) {
      return { found: false };
    }

    return {
      found: true,
      versionId: snapshot.version_id,
      snapshotData: snapshot.snapshot_data,
    };
  }

  /**
   * Calculate if and how urgently we need a snapshot.
   *
   * Returns undefined if no snapshot needed, or urgency level.
   */
  private async calculateSnapshotUrgency(
    clientId: ClientId,
  ): Promise<SnapshotUrgency | undefined> {
    // Get the latest snapshot version
    const snapshot = await this.db
      .prepare(
        "SELECT version_id FROM snapshots WHERE client_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .bind(clientId)
      .first<{ version_id: string }>();

    // Count versions since the snapshot (or all versions if no snapshot)
    let versionCount: number;

    if (snapshot) {
      const result = await this.db
        .prepare(
          "SELECT COUNT(*) as count FROM versions WHERE client_id = ? AND created_at > (SELECT created_at FROM versions WHERE version_id = ?)",
        )
        .bind(clientId, snapshot.version_id)
        .first<{ count: number }>();
      versionCount = result?.count ?? 0;
    } else {
      const result = await this.db
        .prepare("SELECT COUNT(*) as count FROM versions WHERE client_id = ?")
        .bind(clientId)
        .first<{ count: number }>();
      versionCount = result?.count ?? 0;
    }

    if (versionCount >= SNAPSHOT_VERSION_THRESHOLD * 2) {
      return "high";
    }
    if (versionCount >= SNAPSHOT_VERSION_THRESHOLD) {
      return "low";
    }

    return undefined;
  }
}
