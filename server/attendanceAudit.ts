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

type AuditInsertClient = {
  insert: (t: typeof attendanceAudit) => {
    values: (v: InsertAttendanceAudit) => Promise<unknown>;
  };
};

/**
 * Inserts one row using the given DB or transaction client.
 * In production, a missing client throws (audit must not silently vanish when the app claims to be live).
 */
export async function insertAttendanceAuditRow(
  client: AuditInsertClient | null | undefined,
  row: InsertAttendanceAudit,
): Promise<void> {
  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Attendance audit: database client unavailable");
    }
    return;
  }
  await client.insert(attendanceAudit).values(row);
}

/**
 * Structural attendance audit using the pooled connection (non-transactional).
 */
export async function logAttendanceAudit(row: InsertAttendanceAudit): Promise<void> {
  await insertAttendanceAuditRow(await getDb(), row);
}

/**
 * Best-effort audit for **deny / supplemental** paths where the primary outcome is still a normal TRPC error.
 * Insert failures are logged only; they never replace policy errors.
 */
export async function logAttendanceAuditSafe(row: InsertAttendanceAudit): Promise<void> {
  try {
    await logAttendanceAudit(row);
  } catch (err) {
    console.error("[attendanceAudit] logAttendanceAuditSafe failed (best-effort)", err);
  }
}
