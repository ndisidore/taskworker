/**
 * POST /v1/client/add-version/:parentVersionId
 *
 * Add a new version (history segment) to the client's version chain.
 *
 * Request:
 *   - Header: X-Client-Id (UUID)
 *   - Body: History segment (binary)
 *   - Content-Type: application/vnd.taskchampion.history-segment
 *
 * Response:
 *   - 200 OK: Version added successfully
 *     - Header: X-Version-Id (new version UUID)
 *     - Header: X-Snapshot-Request (optional, urgency=low or urgency=high)
 *   - 409 CONFLICT: Parent version mismatch
 *     - Header: X-Parent-Version-Id (expected parent)
 *   - 400 BAD REQUEST: Missing client ID or invalid request
 */

import type { Context } from "hono";
import type { Storage } from "../storage";
import { ContentType, Headers } from "../types";

export async function addVersion(
  c: Context,
  storage: Storage,
): Promise<Response> {
  // Get client ID from header
  const clientId = c.req.header(Headers.CLIENT_ID);
  if (!clientId) {
    return c.text("Missing X-Client-Id header", 400);
  }

  // Get parent version ID from path
  const parentVersionId = c.req.param("parentVersionId");
  if (!parentVersionId) {
    return c.text("Missing parent version ID", 400);
  }

  // Validate content type
  const contentType = c.req.header("Content-Type");
  if (contentType && !contentType.includes(ContentType.HISTORY_SEGMENT)) {
    return c.text("Invalid content type", 400);
  }

  // Get history segment from body
  const historySegment = await c.req.arrayBuffer();
  if (!historySegment || historySegment.byteLength === 0) {
    return c.text("Missing history segment", 400);
  }

  // Try to add the version
  const result = await storage.addVersion(
    clientId,
    parentVersionId,
    historySegment,
  );

  if (!result.success) {
    // Conflict - parent version doesn't match
    return new Response(null, {
      status: 409,
      headers: {
        [Headers.PARENT_VERSION_ID]: result.expectedParentVersionId,
      },
    });
  }

  // Success
  const headers: Record<string, string> = {
    [Headers.VERSION_ID]: result.versionId,
  };

  if (result.snapshotUrgency) {
    headers[Headers.SNAPSHOT_REQUEST] = `urgency=${result.snapshotUrgency}`;
  }

  return new Response(null, {
    status: 200,
    headers,
  });
}
