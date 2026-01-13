/**
 * TaskWorker - TaskChampion Sync Server on Cloudflare Workers
 *
 * Implements the TaskChampion sync protocol for Taskwarrior 3.0+
 * https://gothenburgbitfactory.org/taskchampion/http.html
 */

import { Hono } from "hono";
import {
  addSnapshot,
  addVersion,
  getChildVersion,
  getSnapshot,
} from "./handlers";
import { Storage } from "./storage";

const app = new Hono<{ Bindings: Cloudflare.Env }>();

// Health check
app.get("/", (c) => {
  return c.text("TaskWorker - TaskChampion Sync Server");
});

// Sync protocol endpoints
app.post("/v1/client/add-version/:parentVersionId", async (c) => {
  const storage = new Storage(c.env.DB);
  return addVersion(c, storage);
});

app.get("/v1/client/get-child-version/:parentVersionId", async (c) => {
  const storage = new Storage(c.env.DB);
  return getChildVersion(c, storage);
});

app.post("/v1/client/add-snapshot/:versionId", async (c) => {
  const storage = new Storage(c.env.DB);
  return addSnapshot(c, storage);
});

app.get("/v1/client/snapshot", async (c) => {
  const storage = new Storage(c.env.DB);
  return getSnapshot(c, storage);
});

export default app;
