# TaskWorker

A [TaskChampion](https://github.com/GothenburgBitFactory/taskchampion) sync server implementation built on Cloudflare Workers and D1.

## What is This?

This is a sync server for [Taskwarrior 3.0+](https://taskwarrior.org/), implementing the [TaskChampion sync protocol](https://gothenburgbitfactory.org/taskchampion/http.html). It allows you to synchronize tasks between multiple devices.

## Why?

As a general TUI fanboy, I've come to love Taskwarrior. But one of its main pitfalls is hosting the server, so much so that many derivatives have spun up simply because they make the hosting story easier.
As a Cloudflare-ain (who has worked on Workers) I knew what needed to be done :)

## Architecture

Understanding how TaskChampion sync works is key to understanding this project.

### The Two Pieces

```text
┌────────────────────────────────────────────────────────────────┐
│                        YOUR DEVICES                            │
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

## Deployment

```bash
# Install dependencies
npm install

# Create the D1 database
wrangler d1 create taskchampion-sync

# Apply database migrations
wrangler d1 migrations apply taskchampion-sync --remote

# Deploy to Cloudflare Workers
npm run deploy
```

Your server will be available at `https://taskworker.<your-subdomain>.workers.dev`.

## Usage with Taskwarrior

### Prerequisites

- [Taskwarrior 3.0+](https://taskwarrior.org/download/) (uses TaskChampion sync protocol)
- A deployed TaskWorker instance (see Deployment above)

### Configuration

1. **Generate a client ID** (UUID shared across all your devices):

   ```bash
   uuidgen
   # Example output: a1b2c3d4-e5f6-7890-abcd-ef1234567890
   ```

2. **Generate an encryption secret** (keeps your data private):

   ```bash
   openssl rand -hex 32
   # Example output: 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
   ```

3. **Configure Taskwarrior** by adding to `~/.taskrc`:

   ```ini
   # Sync server URL (replace with your deployed URL)
   sync.server.url=https://taskworker.your-subdomain.workers.dev

   # Client ID (same UUID on all your devices)
   sync.server.client_id=a1b2c3d4-e5f6-7890-abcd-ef1234567890

   # Encryption secret (same secret on all your devices - keep this private!)
   sync.encryption_secret=1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
   ```

   > **Important:** Use the same `client_id` and `encryption_secret` on all devices you want to sync.

### Syncing

```bash
# Sync your tasks
task sync

# First sync on a new device
task sync init
```

### Example Workflow

```bash
# On your laptop
task add "Write README" project:docs
task sync

# On your desktop (after initial setup with same credentials)
task sync
task list
# You'll see "Write README" synced from your laptop
```

## Access Control

By default, TaskWorker runs in **open mode** - any client with a valid UUID can sync. For personal/production use, you should restrict access to only your devices.

### Client ID Allowlist

Set the `ALLOWED_CLIENT_IDS` environment variable to restrict which clients can access your server:

```bash
# Using wrangler secret (recommended for production)
wrangler secret put ALLOWED_CLIENT_IDS
# Enter: a1b2c3d4-e5f6-7890-abcd-ef1234567890

# Or for multiple clients (comma-separated)
# Enter: a1b2c3d4-e5f6-7890-abcd-ef1234567890,11111111-2222-3333-4444-555555555555
```

Alternatively, set it in `wrangler.jsonc` for development:

```jsonc
{
  "vars": {
    "ALLOWED_CLIENT_IDS": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

When the allowlist is configured:
- Requests from listed client IDs proceed normally
- Requests from unlisted client IDs receive `403 Forbidden`
- The health check endpoint (`/`) remains accessible

### Security Notes

- **Data is encrypted**: Even without access control, your task data is end-to-end encrypted. The server only sees opaque blobs.
- **Client ID as shared secret**: Your client ID acts as a weak form of authentication. Keep it private.
- **HTTPS required**: Always deploy behind HTTPS (Cloudflare Workers does this automatically).

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Apply database migrations (local)
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
