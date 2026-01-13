/**
 * POST /v1/client/add-snapshot/:versionId
 *
 * Store an encrypted snapshot at a specific version.
 *
 * Request:
 *   - Header: X-Client-Id (UUID)
 *   - Path: versionId (UUID of the version this snapshot represents)
 *   - Body: Snapshot data (binary)
 *   - Content-Type: application/vnd.taskchampion.snapshot
 *
 * Response:
 *   - 200 OK: Snapshot stored successfully
 *   - 400 BAD REQUEST: Invalid version ID or missing data
 */

import type { Context } from "hono";
import type { Storage } from "../storage";
import { ContentType, Headers } from "../types";

export async function addSnapshot(
  c: Context,
  storage: Storage,
): Promise<Response> {
  // Get client ID from header
  const clientId = c.req.header(Headers.CLIENT_ID);
  if (!clientId) {
    return c.text("Missing X-Client-Id header", 400);
  }

  // Get version ID from path
  const versionId = c.req.param("versionId");
  if (!versionId) {
    return c.text("Missing version ID", 400);
  }

  // Validate content type
  const contentType = c.req.header("Content-Type");
  if (contentType && !contentType.includes(ContentType.SNAPSHOT)) {
    return c.text("Invalid content type", 400);
  }

  // Get snapshot data from body
  const snapshotData = await c.req.arrayBuffer();
  if (!snapshotData || snapshotData.byteLength === 0) {
    return c.text("Missing snapshot data", 400);
  }

  // Try to add the snapshot
  const success = await storage.addSnapshot(clientId, versionId, snapshotData);

  if (!success) {
    return c.text("Invalid version ID", 400);
  }

  return new Response(null, { status: 200 });
}
