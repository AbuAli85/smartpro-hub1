import { attendanceAudit, type InsertAttendanceAudit } from "../drizzle/schema";
import { getDb } from "./db";

/**
 * JSON-safe snapshot for audit payloads (Dates → ISO strings).
 */
export function attendancePayloadJson(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  try {
    return JSON.parse(
      JSON.stringify(value, (_k, v) => (v instanceof Date ? v.toISOString() : v)),
    ) as Record<string, unknown>;
  } catch {
    return { _serializationError: true };
  }
}

/**
 * Writes a structural attendance audit row. No-ops when DB is unavailable (e.g. some unit tests).
 */
export async function logAttendanceAudit(row: InsertAttendanceAudit): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(attendanceAudit).values(row);
}
