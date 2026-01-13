import { env } from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { clientAllowlist } from "../src/middleware/auth";
import { Storage } from "../src/storage";
import { addVersion } from "../src/handlers";
import { NIL_VERSION_ID, Headers, ContentType } from "../src/types";

const ALLOWED_CLIENT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BLOCKED_CLIENT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

/**
 * Create a test app with the specified ALLOWED_CLIENT_IDS value.
 */
function createTestApp(allowedClientIds: string) {
  type TestEnv = { DB: D1Database; ALLOWED_CLIENT_IDS: string };
  const app = new Hono<{ Bindings: TestEnv }>();

  app.use("/v1/*", clientAllowlist());

  app.post("/v1/client/add-version/:parentVersionId", async (c) => {
    const storage = new Storage(c.env.DB);
    return addVersion(c, storage);
  });

  // Return a fetch function that injects our custom env
  return (request: Request) => {
    return app.fetch(request, {
      DB: env.DB,
      ALLOWED_CLIENT_IDS: allowedClientIds,
    });
  };
}

describe("Client ID Allowlist", () => {
  describe("when ALLOWED_CLIENT_IDS is set", () => {
    it("allows requests from clients in the allowlist", async () => {
      const fetch = createTestApp(ALLOWED_CLIENT);

      const response = await fetch(
        new Request(
          `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
          {
            method: "POST",
            headers: {
              [Headers.CLIENT_ID]: ALLOWED_CLIENT,
              "Content-Type": ContentType.HISTORY_SEGMENT,
            },
            body: new Uint8Array([1, 2, 3]),
          },
        ),
      );

      // Should succeed (200) not forbidden (403)
      expect(response.status).toBe(200);
    });

    it("blocks requests from clients not in the allowlist", async () => {
      const fetch = createTestApp(ALLOWED_CLIENT);

      const response = await fetch(
        new Request(
          `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
          {
            method: "POST",
            headers: {
              [Headers.CLIENT_ID]: BLOCKED_CLIENT,
              "Content-Type": ContentType.HISTORY_SEGMENT,
            },
            body: new Uint8Array([1, 2, 3]),
          },
        ),
      );

      expect(response.status).toBe(403);
      expect(await response.text()).toContain("not in allowlist");
    });

    it("supports multiple client IDs in allowlist", async () => {
      const anotherAllowed = "cccccccc-cccc-cccc-cccc-cccccccccccc";
      const fetch = createTestApp(`${ALLOWED_CLIENT}, ${anotherAllowed}`);

      // First client should be allowed
      const response1 = await fetch(
        new Request(
          `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
          {
            method: "POST",
            headers: {
              [Headers.CLIENT_ID]: ALLOWED_CLIENT,
              "Content-Type": ContentType.HISTORY_SEGMENT,
            },
            body: new Uint8Array([1, 2, 3]),
          },
        ),
      );
      expect(response1.status).toBe(200);

      // Second client should also be allowed
      const response2 = await fetch(
        new Request(
          `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
          {
            method: "POST",
            headers: {
              [Headers.CLIENT_ID]: anotherAllowed,
              "Content-Type": ContentType.HISTORY_SEGMENT,
            },
            body: new Uint8Array([1, 2, 3]),
          },
        ),
      );
      expect(response2.status).toBe(200);

      // Blocked client should still be blocked
      const response3 = await fetch(
        new Request(
          `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
          {
            method: "POST",
            headers: {
              [Headers.CLIENT_ID]: BLOCKED_CLIENT,
              "Content-Type": ContentType.HISTORY_SEGMENT,
            },
            body: new Uint8Array([1, 2, 3]),
          },
        ),
      );
      expect(response3.status).toBe(403);
    });

    it("is case-insensitive for client IDs", async () => {
      const fetch = createTestApp(ALLOWED_CLIENT.toLowerCase());

      // Request with uppercase should still work
      const response = await fetch(
        new Request(
          `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
          {
            method: "POST",
            headers: {
              [Headers.CLIENT_ID]: ALLOWED_CLIENT.toUpperCase(),
              "Content-Type": ContentType.HISTORY_SEGMENT,
            },
            body: new Uint8Array([1, 2, 3]),
          },
        ),
      );

      expect(response.status).toBe(200);
    });

    it("passes through requests without client ID for handler to reject", async () => {
      const fetch = createTestApp(ALLOWED_CLIENT);

      // Request without client ID should pass middleware (get 400 from handler)
      const response = await fetch(
        new Request(
          `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
          {
            method: "POST",
            headers: {
              "Content-Type": ContentType.HISTORY_SEGMENT,
            },
            body: new Uint8Array([1, 2, 3]),
          },
        ),
      );

      // Should be 400 (from handler), not 403 (from middleware)
      expect(response.status).toBe(400);
    });
  });

  describe("when ALLOWED_CLIENT_IDS is empty", () => {
    it("allows any client ID (open mode)", async () => {
      const fetch = createTestApp("");

      const response = await fetch(
        new Request(
          `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
          {
            method: "POST",
            headers: {
              [Headers.CLIENT_ID]: "dddddddd-dddd-dddd-dddd-dddddddddddd",
              "Content-Type": ContentType.HISTORY_SEGMENT,
            },
            body: new Uint8Array([1, 2, 3]),
          },
        ),
      );

      expect(response.status).toBe(200);
    });
  });
});
