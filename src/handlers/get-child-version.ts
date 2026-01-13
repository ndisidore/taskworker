/**
 * GET /v1/client/get-child-version/:parentVersionId
 *
 * Get the child version of a given parent version.
 *
 * Request:
 *   - Header: X-Client-Id (UUID)
 *   - Path: parentVersionId (UUID, or nil UUID for first version)
 *
 * Response:
 *   - 200 OK: Version found
 *     - Header: X-Version-Id (the version's UUID)
 *     - Header: X-Parent-Version-Id (echoed back)
 *     - Body: History segment (binary)
 *     - Content-Type: application/vnd.taskchampion.history-segment
 *   - 404 NOT FOUND: No child version (client is up-to-date)
 *   - 410 GONE: Version was pruned (client should use snapshot)
 *   - 400 BAD REQUEST: Missing client ID
 */

import type { Context } from "hono";
import type { Storage } from "../storage";
import { ContentType, Headers } from "../types";

export async function getChildVersion(
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

  // Get the child version
  const result = await storage.getChildVersion(clientId, parentVersionId);

  if (!result.found) {
    if (result.gone) {
      // Version was pruned
      return c.text("Version pruned", 410);
    }
    // No child version - client is up to date
    return c.text("Up to date", 404);
  }

  // Return the version
  return new Response(result.historySegment, {
    status: 200,
    headers: {
      "Content-Type": ContentType.HISTORY_SEGMENT,
      [Headers.VERSION_ID]: result.versionId,
      [Headers.PARENT_VERSION_ID]: result.parentVersionId,
    },
  });
}
