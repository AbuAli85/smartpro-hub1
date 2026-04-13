/**
 * Run startup DDL from server/runPendingMigrations.ts against DATABASE_URL.
 * Use when you need to apply pending columns/indexes/FKs without booting the full server.
 */
import { runPendingMigrations } from "../server/runPendingMigrations";

await runPendingMigrations();
process.exit(0);
