import { and, desc, eq, gte, lt } from "drizzle-orm";
import { attendance } from "../../drizzle/schema";
import { muscatMonthUtcRangeExclusiveEnd } from "@shared/attendanceMuscatTime";
import { getDb } from "../db.client";

export async function getAttendance(companyId: number, month?: string, employeeId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(attendance.companyId, companyId)];
  if (employeeId != null) conditions.push(eq(attendance.employeeId, employeeId));
  if (month) {
    const [year, mon] = month.split("-").map(Number);
    const { startUtc, endExclusiveUtc } = muscatMonthUtcRangeExclusiveEnd(year, mon);
    conditions.push(gte(attendance.date, startUtc));
    conditions.push(lt(attendance.date, endExclusiveUtc));
  }
  return db
    .select()
    .from(attendance)
    .where(and(...conditions))
    .orderBy(desc(attendance.date));
}

export type AttendanceLegacyInsert = {
  companyId: number;
  employeeId: number;
  date: Date;
  checkIn?: Date;
  checkOut?: Date;
  status: "present" | "absent" | "late" | "half_day" | "remote";
  notes?: string;
};

type AttendanceTableInsertClient = {
  insert: (t: typeof attendance) => {
    values: (v: typeof attendance.$inferInsert) => Promise<unknown>;
  };
};

/** Use inside `db.transaction` so HR attendance + audit commit atomically. */
export async function createAttendanceRecordTx(
  tx: AttendanceTableInsertClient,
  data: AttendanceLegacyInsert,
): Promise<number> {
  const [result] = (await tx.insert(attendance).values(data)) as unknown as [{ insertId?: number }];
  const insertId = Number(result?.insertId ?? 0);
  if (!insertId) throw new Error("Failed to resolve attendance insert id");
  return insertId;
}

export async function createAttendanceRecord(data: AttendanceLegacyInsert): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return createAttendanceRecordTx(db, data);
}

export async function getAttendanceStats(companyId: number, month?: string) {
  const db = await getDb();
  if (!db) {
    return {
      present: 0,
      absent: 0,
      late: 0,
      half_day: 0,
      remote: 0,
      byDay: [] as { day: string; present: number; absent: number; late: number }[],
    };
  }
  const records = await getAttendance(companyId, month);
  const counts = { present: 0, absent: 0, late: 0, half_day: 0, remote: 0 };
  const dayMap: Record<string, { present: number; absent: number; late: number }> = {};
  for (const r of records) {
    const s = r.status as keyof typeof counts;
    if (s in counts) counts[s]++;
    const d = new Date(r.date);
    const dayKey = d.toLocaleDateString("en-US", { weekday: "short" });
    if (!dayMap[dayKey]) dayMap[dayKey] = { present: 0, absent: 0, late: 0 };
    if (r.status === "present" || r.status === "remote" || r.status === "half_day") dayMap[dayKey].present++;
    else if (r.status === "absent") dayMap[dayKey].absent++;
    else if (r.status === "late") dayMap[dayKey].late++;
  }
  const byDay = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => ({
    day,
    ...(dayMap[day] ?? { present: 0, absent: 0, late: 0 }),
  }));
  return { ...counts, byDay };
}

export async function updateAttendanceRecord(
  id: number,
  data: Partial<{
    status: "present" | "absent" | "late" | "half_day" | "remote";
    checkIn: Date;
    checkOut: Date;
    notes: string;
  }>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(attendance).set(data).where(eq(attendance.id, id));
}

export async function deleteAttendanceRecord(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(attendance).where(eq(attendance.id, id));
}
