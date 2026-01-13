import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { NIL_VERSION_ID, Headers, ContentType } from "../src/types";

const TEST_CLIENT_ID = "11111111-1111-1111-1111-111111111111";
const TEST_CLIENT_ID_2 = "22222222-2222-2222-2222-222222222222";

describe("TaskWorker Sync Server", () => {
  describe("Health Check", () => {
    it("GET / returns server info", async () => {
      const response = await SELF.fetch("https://example.com/");
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("TaskWorker");
    });
  });

  describe("Add Version", () => {
    it("adds first version with nil parent", async () => {
      const historySegment = new Uint8Array([1, 2, 3, 4, 5]);

      const response = await SELF.fetch(
        `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: TEST_CLIENT_ID,
            "Content-Type": ContentType.HISTORY_SEGMENT,
          },
          body: historySegment,
        },
      );

      expect(response.status).toBe(200);
      const versionId = response.headers.get(Headers.VERSION_ID);
      expect(versionId).toBeTruthy();
      expect(versionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("returns 400 without client ID", async () => {
      const response = await SELF.fetch(
        `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
        {
          method: "POST",
          headers: {
            "Content-Type": ContentType.HISTORY_SEGMENT,
          },
          body: new Uint8Array([1, 2, 3]),
        },
      );

      expect(response.status).toBe(400);
    });

    it("returns 400 with bad content type", async () => {
      const response = await SELF.fetch(
        `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: TEST_CLIENT_ID,
            "Content-Type": "text/plain",
          },
          body: new Uint8Array([1, 2, 3]),
        },
      );

      expect(response.status).toBe(400);
    });

    it("returns 400 with empty body", async () => {
      const response = await SELF.fetch(
        `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: TEST_CLIENT_ID,
            "Content-Type": ContentType.HISTORY_SEGMENT,
          },
          body: new Uint8Array([]),
        },
      );

      expect(response.status).toBe(400);
    });

    it("returns 409 on parent version conflict", async () => {
      // First, add a version
      const firstResponse = await SELF.fetch(
        `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: TEST_CLIENT_ID_2,
            "Content-Type": ContentType.HISTORY_SEGMENT,
          },
          body: new Uint8Array([1, 2, 3]),
        },
      );
      expect(firstResponse.status).toBe(200);
      const firstVersionId = firstResponse.headers.get(Headers.VERSION_ID);

      // Try to add another version with wrong parent (nil instead of firstVersionId)
      const conflictResponse = await SELF.fetch(
        `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: TEST_CLIENT_ID_2,
            "Content-Type": ContentType.HISTORY_SEGMENT,
          },
          body: new Uint8Array([4, 5, 6]),
        },
      );

      expect(conflictResponse.status).toBe(409);
      expect(conflictResponse.headers.get(Headers.PARENT_VERSION_ID)).toBe(
        firstVersionId,
      );
    });
  });

  describe("Get Child Version", () => {
    it("returns 400 without client ID", async () => {
      const response = await SELF.fetch(
        `https://example.com/v1/client/get-child-version/${NIL_VERSION_ID}`,
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(400);
    });

    it("returns 404 when no versions exist", async () => {
      const newClientId = "33333333-3333-3333-3333-333333333333";

      const response = await SELF.fetch(
        `https://example.com/v1/client/get-child-version/${NIL_VERSION_ID}`,
        {
          method: "GET",
          headers: {
            [Headers.CLIENT_ID]: newClientId,
          },
        },
      );

      expect(response.status).toBe(404);
    });

    it("retrieves a version after adding it", async () => {
      const clientId = "44444444-4444-4444-4444-444444444444";
      const historySegment = new Uint8Array([10, 20, 30, 40, 50]);

      // Add a version
      const addResponse = await SELF.fetch(
        `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: clientId,
            "Content-Type": ContentType.HISTORY_SEGMENT,
          },
          body: historySegment,
        },
      );
      expect(addResponse.status).toBe(200);
      const versionId = addResponse.headers.get(Headers.VERSION_ID);

      // Get the version
      const getResponse = await SELF.fetch(
        `https://example.com/v1/client/get-child-version/${NIL_VERSION_ID}`,
        {
          method: "GET",
          headers: {
            [Headers.CLIENT_ID]: clientId,
          },
        },
      );

      expect(getResponse.status).toBe(200);
      expect(getResponse.headers.get(Headers.VERSION_ID)).toBe(versionId);
      expect(getResponse.headers.get(Headers.PARENT_VERSION_ID)).toBe(
        NIL_VERSION_ID,
      );
      expect(getResponse.headers.get("Content-Type")).toContain(
        ContentType.HISTORY_SEGMENT,
      );

      const body = new Uint8Array(await getResponse.arrayBuffer());
      expect(body).toEqual(historySegment);
    });

    it("returns 404 when client is up to date", async () => {
      const clientId = "55555555-5555-5555-5555-555555555555";

      // Add a version
      const addResponse = await SELF.fetch(
        `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: clientId,
            "Content-Type": ContentType.HISTORY_SEGMENT,
          },
          body: new Uint8Array([1, 2, 3]),
        },
      );
      const versionId = addResponse.headers.get(Headers.VERSION_ID);

      // Try to get child of the latest version (should be 404 - up to date)
      const getResponse = await SELF.fetch(
        `https://example.com/v1/client/get-child-version/${versionId}`,
        {
          method: "GET",
          headers: {
            [Headers.CLIENT_ID]: clientId,
          },
        },
      );

      expect(getResponse.status).toBe(404);
    });

    it("returns 410 when version is gone (pruned)", async () => {
      const clientId = "55555555-5555-5555-5555-555555555556";
      const unknownVersionId = "ffffffff-ffff-ffff-ffff-ffffffffffff";

      // Add a version
      const addResponse = await SELF.fetch(
        `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: clientId,
            "Content-Type": ContentType.HISTORY_SEGMENT,
          },
          body: new Uint8Array([1, 2, 3]),
        },
      );
      expect(addResponse.status).toBe(200);
      const versionId = addResponse.headers.get(Headers.VERSION_ID);

      // Add a snapshot at that version
      const snapshotResponse = await SELF.fetch(
        `https://example.com/v1/client/add-snapshot/${versionId}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: clientId,
            "Content-Type": ContentType.SNAPSHOT,
          },
          body: new Uint8Array([100, 101, 102]),
        },
      );
      expect(snapshotResponse.status).toBe(200);

      // Try to get child of an unknown version (simulates pruned history)
      // This should return 410 because a snapshot exists but the version doesn't
      const getResponse = await SELF.fetch(
        `https://example.com/v1/client/get-child-version/${unknownVersionId}`,
        {
          method: "GET",
          headers: {
            [Headers.CLIENT_ID]: clientId,
          },
        },
      );

      expect(getResponse.status).toBe(410);
    });
  });

  describe("Snapshots", () => {
    it("returns 404 when no snapshot exists", async () => {
      const clientId = "66666666-6666-6666-6666-666666666666";

      const response = await SELF.fetch(
        "https://example.com/v1/client/snapshot",
        {
          method: "GET",
          headers: {
            [Headers.CLIENT_ID]: clientId,
          },
        },
      );

      expect(response.status).toBe(404);
    });

    it("adds and retrieves a snapshot", async () => {
      const clientId = "77777777-7777-7777-7777-777777777777";
      const snapshotData = new Uint8Array([100, 101, 102, 103, 104]);

      // First add a version (snapshot must reference a valid version)
      const addVersionResponse = await SELF.fetch(
        `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: clientId,
            "Content-Type": ContentType.HISTORY_SEGMENT,
          },
          body: new Uint8Array([1, 2, 3]),
        },
      );
      expect(addVersionResponse.status).toBe(200);
      const versionId = addVersionResponse.headers.get(Headers.VERSION_ID);

      // Add a snapshot at that version
      const addSnapshotResponse = await SELF.fetch(
        `https://example.com/v1/client/add-snapshot/${versionId}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: clientId,
            "Content-Type": ContentType.SNAPSHOT,
          },
          body: snapshotData,
        },
      );
      expect(addSnapshotResponse.status).toBe(200);

      // Retrieve the snapshot
      const getSnapshotResponse = await SELF.fetch(
        "https://example.com/v1/client/snapshot",
        {
          method: "GET",
          headers: {
            [Headers.CLIENT_ID]: clientId,
          },
        },
      );

      expect(getSnapshotResponse.status).toBe(200);
      expect(getSnapshotResponse.headers.get(Headers.VERSION_ID)).toBe(
        versionId,
      );
      expect(getSnapshotResponse.headers.get("Content-Type")).toContain(
        ContentType.SNAPSHOT,
      );

      const body = new Uint8Array(await getSnapshotResponse.arrayBuffer());
      expect(body).toEqual(snapshotData);
    });

    it("returns 400 for invalid version ID", async () => {
      const clientId = "88888888-8888-8888-8888-888888888888";
      const fakeVersionId = "99999999-9999-9999-9999-999999999999";

      const response = await SELF.fetch(
        `https://example.com/v1/client/add-snapshot/${fakeVersionId}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: clientId,
            "Content-Type": ContentType.SNAPSHOT,
          },
          body: new Uint8Array([1, 2, 3]),
        },
      );

      expect(response.status).toBe(400);
    });

    it("returns 400 without client ID when adding snapshot", async () => {
      const response = await SELF.fetch(
        "https://example.com/v1/client/add-snapshot/00000000-0000-0000-0000-000000000001",
        {
          method: "POST",
          headers: {
            "Content-Type": ContentType.SNAPSHOT,
          },
          body: new Uint8Array([1, 2, 3]),
        },
      );

      expect(response.status).toBe(400);
    });

    it("returns 400 without client ID when getting snapshot", async () => {
      const response = await SELF.fetch(
        "https://example.com/v1/client/snapshot",
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(400);
    });

    it("returns 400 with bad content type when adding snapshot", async () => {
      const clientId = "88888888-8888-8888-8888-888888888889";

      // First add a version
      const addVersionResponse = await SELF.fetch(
        `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: clientId,
            "Content-Type": ContentType.HISTORY_SEGMENT,
          },
          body: new Uint8Array([1, 2, 3]),
        },
      );
      const versionId = addVersionResponse.headers.get(Headers.VERSION_ID);

      // Try to add snapshot with wrong content type
      const response = await SELF.fetch(
        `https://example.com/v1/client/add-snapshot/${versionId}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: clientId,
            "Content-Type": "text/plain",
          },
          body: new Uint8Array([1, 2, 3]),
        },
      );

      expect(response.status).toBe(400);
    });

    it("returns 400 with empty body when adding snapshot", async () => {
      const clientId = "88888888-8888-8888-8888-88888888888a";

      // First add a version
      const addVersionResponse = await SELF.fetch(
        `https://example.com/v1/client/add-version/${NIL_VERSION_ID}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: clientId,
            "Content-Type": ContentType.HISTORY_SEGMENT,
          },
          body: new Uint8Array([1, 2, 3]),
        },
      );
      const versionId = addVersionResponse.headers.get(Headers.VERSION_ID);

      // Try to add snapshot with empty body
      const response = await SELF.fetch(
        `https://example.com/v1/client/add-snapshot/${versionId}`,
        {
          method: "POST",
          headers: {
            [Headers.CLIENT_ID]: clientId,
            "Content-Type": ContentType.SNAPSHOT,
          },
          body: new Uint8Array([]),
        },
      );

      expect(response.status).toBe(400);
    });
  });

  describe("Version Chain", () => {
    it("builds and traverses a version chain", async () => {
      const clientId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
      const versions: string[] = [];

      // Add 3 versions in sequence
      let parentId = NIL_VERSION_ID;
      for (let i = 0; i < 3; i++) {
        const response = await SELF.fetch(
          `https://example.com/v1/client/add-version/${parentId}`,
          {
            method: "POST",
            headers: {
              [Headers.CLIENT_ID]: clientId,
              "Content-Type": ContentType.HISTORY_SEGMENT,
            },
            body: new Uint8Array([i]),
          },
        );
        expect(response.status).toBe(200);
        const versionId = response.headers.get(Headers.VERSION_ID);
        expect(versionId).toBeTruthy();
        parentId = versionId as string;
        versions.push(parentId);
      }

      // Traverse the chain from the beginning
      let currentParent = NIL_VERSION_ID;
      for (let i = 0; i < 3; i++) {
        const response = await SELF.fetch(
          `https://example.com/v1/client/get-child-version/${currentParent}`,
          {
            method: "GET",
            headers: {
              [Headers.CLIENT_ID]: clientId,
            },
          },
        );
        expect(response.status).toBe(200);
        expect(response.headers.get(Headers.VERSION_ID)).toBe(versions[i]);
        currentParent = versions[i];
      }

      // Verify we're at the end
      const finalResponse = await SELF.fetch(
        `https://example.com/v1/client/get-child-version/${currentParent}`,
        {
          method: "GET",
          headers: {
            [Headers.CLIENT_ID]: clientId,
          },
        },
      );
      expect(finalResponse.status).toBe(404);
    });
  });
});
