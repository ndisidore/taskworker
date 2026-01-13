# TaskWorker

A [TaskChampion](https://github.com/GothenburgBitFactory/taskchampion) sync server implementation built on Cloudflare Workers and D1.

## What is This?

This is a sync server for [Taskwarrior 3.0+](https://taskwarrior.org/), implementing the [TaskChampion sync protocol](https://gothenburgbitfactory.org/taskchampion/http.html). It allows you to synchronize tasks between multiple devices.

## Architecture

Understanding how TaskChampion sync works is key to understanding this project.

### The Two Pieces

```text
┌─────────────────────────────────────────────────────────────────┐
│                        YOUR DEVICES                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Laptop     │    │  Desktop    │    │  Phone      │         │
│  │  ┌───────┐  │    │  ┌───────┐  │    │  ┌───────┐  │         │
│  │  │ Task  │  │    │  │ Task  │  │    │  │ Task  │  │         │
│  │  │Warrior│  │    │  │Warrior│  │    │  │Warrior│  │         │
│  │  └───┬───┘  │    │  └───┬───┘  │    │  └───┬───┘  │         │
│  │      │      │    │      │      │    │      │      │         │
│  │  ┌───┴───┐  │    │  ┌───┴───┐  │    │  ┌───┴───┐  │         │
│  │  │  TC   │  │    │  │  TC   │  │    │  │  TC   │  │         │
│  │  │Library│  │    │  │Library│  │    │  │Library│  │         │
│  │  └───┬───┘  │    │  └───┬───┘  │    │  └───┬───┘  │         │
│  └──────┼──────┘    └──────┼──────┘    └──────┼──────┘         │
│         │ encrypted        │ encrypted        │ encrypted      │
└─────────┼──────────────────┼──────────────────┼────────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                             ▼
                   ┌───────────────────┐
                   │   TaskWorker      │
                   │   (this project)  │
                   │                   │
                   │  Stores encrypted │
                   │  blobs only -     │
                   │  cannot read your │
                   │  task data        │
                   └─────────┬─────────┘
                             │
                             ▼
                   ┌───────────────────┐
                   │   Cloudflare D1   │
                   │   (SQLite)        │
                   └───────────────────┘
```

**TaskChampion Library** (client-side, in Taskwarrior):
- Manages your local task database
- Understands tasks, tags, annotations, dependencies
- Encrypts all data before sending to the server
- Decrypts data received from the server

**TaskWorker / Sync Server** (this project):
- Stores encrypted binary blobs ("history segments" and "snapshots")
- Tracks version chains for sync ordering
- **Cannot read your task data** - it's encrypted end-to-end
- Acts as a relay between your devices

### Why the Server is "Dumb"

This is a security feature. The server never has access to the encryption key, so even if compromised, your task data remains private. The server only sees opaque binary blobs.

This is why our implementation doesn't need `Task`, `Tag`, or `Annotation` types - we literally cannot read them (intentional per the [TaskChampion sync protocol](https://gothenburgbitfactory.org/taskchampion/http.html)).

## Protocol

The sync protocol uses 4 HTTP endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/client/add-version/:parentVersionId` | POST | Submit encrypted changes |
| `/v1/client/get-child-version/:parentVersionId` | GET | Fetch next version |
| `/v1/client/add-snapshot/:versionId` | POST | Store encrypted snapshot |
| `/v1/client/snapshot` | GET | Fetch latest snapshot |

Clients identify themselves via the `X-Client-Id` header (a UUID shared across your devices).

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Apply database migrations
wrangler d1 migrations apply taskchampion-sync --local

# Run tests
npm test

# Lint
npm run lint
```

## Related Projects

- [taskchampion](https://github.com/GothenburgBitFactory/taskchampion) - The client library (used by Taskwarrior)
- [taskchampion-sync-server](https://github.com/GothenburgBitFactory/taskchampion-sync-server) - Official Rust implementation
- [Taskwarrior](https://taskwarrior.org/) - The task management CLI

## License

MIT
