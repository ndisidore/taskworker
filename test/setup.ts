import { applyD1Migrations, env } from "cloudflare:test";

// Apply migrations from the migrations folder before all tests
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
