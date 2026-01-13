/**
 * GET /v1/client/snapshot
 *
 * Get the latest snapshot for a client.
 *
 * Request:
 *   - Header: X-Client-Id (UUID)
 *
 * Response:
 *   - 200 OK: Snapshot found
 *     - Header: X-Version-Id (the version this snapshot represents)
 *     - Body: Snapshot data (binary)
 *     - Content-Type: application/vnd.taskchampion.snapshot
 *   - 404 NOT FOUND: No snapshot available
 *   - 400 BAD REQUEST: Missing client ID
 */

import type { Context } from "hono";
import type { Storage } from "../storage";
import { ContentType, Headers } from "../types";

export async function getSnapshot(
  c: Context,
  storage: Storage,
): Promise<Response> {
  // Get client ID from header
  const clientId = c.req.header(Headers.CLIENT_ID);
  if (!clientId) {
    return c.text("Missing X-Client-Id header", 400);
  }

  // Get the snapshot
  const result = await storage.getSnapshot(clientId);

  if (!result.found) {
    return c.text("No snapshot available", 404);
  }

  return new Response(result.snapshotData, {
    status: 200,
    headers: {
      "Content-Type": ContentType.SNAPSHOT,
      [Headers.VERSION_ID]: result.versionId,
    },
  });
}
