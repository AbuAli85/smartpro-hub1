/**
 * Database connection singleton.
 *
 * Centralises pool configuration so every repository module imports
 * `getDb` / `requireDb` from one place, avoiding repeated pool creation.
 */
import { drizzle } from "drizzle-orm/mysql2";
import type { Pool } from "mysql2/promise";
import mysql from "mysql2/promise";

// Explicitly typed with the promise Pool to avoid the dual-resolution TS2322
// that occurs when mysql2 exposes two Pool types (promise vs. typings/mysql).
let _db: ReturnType<typeof drizzle<Record<string, never>, Pool>> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = mysql.createPool({
        uri: process.env.DATABASE_URL,
        connectionLimit: Number(process.env.DB_POOL_SIZE ?? 10),
        waitForConnections: true,
        queueLimit: Number(process.env.DB_QUEUE_LIMIT ?? 50),
        idleTimeout: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 60_000),
        enableKeepAlive: true,
        keepAliveInitialDelay: 10_000,
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Returns the database connection or throws a typed TRPCError.
 * Use this in router procedures instead of the silent `if (!db) return []` pattern.
 */
export async function requireDb() {
  const db = await getDb();
  if (!db) {
    const { TRPCError } = await import("@trpc/server");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable — please try again shortly.",
    });
  }
  return db;
}
