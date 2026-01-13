/**
 * Authentication Middleware
 *
 * Validates client IDs against an optional allowlist.
 * If ALLOWED_CLIENT_IDS is set, only those clients can access the API.
 * If not set, all valid UUIDs are accepted (open mode).
 */

import type { Context, Next } from "hono";
import { Headers } from "../types";

/**
 * Parse the ALLOWED_CLIENT_IDS environment variable.
 * Expects comma-separated UUIDs, with optional whitespace.
 */
function parseAllowlist(allowedClientIds: string | undefined): Set<string> {
  if (!allowedClientIds) return new Set();

  return new Set(
    allowedClientIds
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter((id) => id.length > 0),
  );
}

/**
 * Middleware to enforce client ID allowlist.
 *
 * - If ALLOWED_CLIENT_IDS env var is not set, all requests pass through
 * - If set, only requests with X-Client-Id in the allowlist are allowed
 * - Returns 403 Forbidden for unauthorized clients
 */
export function clientAllowlist() {
  return async (c: Context<{ Bindings: Cloudflare.Env }>, next: Next) => {
    const allowedClientIds = c.env.ALLOWED_CLIENT_IDS;

    // If no allowlist configured, allow all requests (open mode)
    if (!allowedClientIds) return next();

    const allowlist = parseAllowlist(allowedClientIds);
    if (allowlist.size === 0) return next(); // If allowlist is empty after parsing, allow all requests

    const clientId = c.req.header(Headers.CLIENT_ID);
    if (!clientId) return next(); // No client ID provided - let the handler deal with it (returns 400)

    // Check if client ID is in the allowlist
    if (!allowlist.has(clientId.toLowerCase())) {
      return c.text("Forbidden: Client ID not in allowlist", 403);
    }

    return next();
  };
}
