import { and, asc, eq, isNotNull, like, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { SanadCentrePipelineStatus } from "@shared/sanadCentresPipeline";
import { maxPipelineStatus } from "@shared/sanadCentresPipeline";
import * as schema from "../../drizzle/schema";
import { ensureCenterOperations } from "./activation";

type DB = MySql2Database<typeof schema>;

const pipelineUsers = alias(schema.users, "sanad_pipeline_owner");

export async function ensureSanadCentrePipelineRow(db: DB, centerId: number) {
  const [row] = await db
    .select()
    .from(schema.sanadCentresPipeline)
    .where(eq(schema.sanadCentresPipeline.centerId, centerId))
    .limit(1);
  if (row) return row;
  await db.insert(schema.sanadCentresPipeline).values({ centerId });
  const [created] = await db
    .select()
    .from(schema.sanadCentresPipeline)
    .where(eq(schema.sanadCentresPipeline.centerId, centerId))
    .limit(1);
  return created!;
}

export async function promoteSanadCentrePipelineStatus(
  db: DB,
  centerId: number,
  atLeast: SanadCentrePipelineStatus,
) {
  const row = await ensureSanadCentrePipelineRow(db, centerId);
  const next = maxPipelineStatus(row.pipelineStatus as SanadCentrePipelineStatus, atLeast);
  if (next === row.pipelineStatus) return row;
  await db
    .update(schema.sanadCentresPipeline)
    .set({ pipelineStatus: next, updatedAt: new Date() })
    .where(eq(schema.sanadCentresPipeline.centerId, centerId));
  const [updated] = await db
    .select()
    .from(schema.sanadCentresPipeline)
    .where(eq(schema.sanadCentresPipeline.centerId, centerId))
    .limit(1);
  return updated!;
}

export async function patchSanadCentrePipeline(
  db: DB,
  centerId: number,
  patch: {
    pipelineStatus?: SanadCentrePipelineStatus;
    ownerUserId?: number | null;
    lastContactedAt?: Date | null;
    nextAction?: string | null;
  },
) {
  await ensureSanadCentrePipelineRow(db, centerId);
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.pipelineStatus !== undefined) update.pipelineStatus = patch.pipelineStatus;
  if (patch.ownerUserId !== undefined) update.ownerUserId = patch.ownerUserId;
  if (patch.lastContactedAt !== undefined) update.lastContactedAt = patch.lastContactedAt;
  if (patch.nextAction !== undefined) update.nextAction = patch.nextAction;
  await db
    .update(schema.sanadCentresPipeline)
    .set(update as never)
    .where(eq(schema.sanadCentresPipeline.centerId, centerId));
}

/** Suggest tenant companies that may be the same legal entity as the directory centre (name match). */
export async function findCompanyMatchesForCentreName(db: DB, centerName: string) {
  const raw = centerName.trim();
  if (raw.length < 2) return [];
  const lower = raw.toLowerCase();
  const safe = raw.slice(0, 120).replace(/[%_]/g, "");
  const fuzzy = `%${safe.replace(/\s+/g, "%")}%`;
  const rows = await db
    .select({
      id: schema.companies.id,
      name: schema.companies.name,
      nameAr: schema.companies.nameAr,
    })
    .from(schema.companies)
    .where(
      and(
        eq(schema.companies.status, "active"),
        or(
          sql`LOWER(TRIM(${schema.companies.name})) = ${lower}`,
          sql`${schema.companies.nameAr} IS NOT NULL AND LOWER(TRIM(${schema.companies.nameAr})) = ${lower}`,
          like(schema.companies.name, fuzzy),
          and(isNotNull(schema.companies.nameAr), like(schema.companies.nameAr, fuzzy)),
        ),
      ),
    )
    .orderBy(asc(schema.companies.id))
    .limit(8);
  return rows;
}

export async function markSanadCentreContacted(db: DB, centerId: number) {
  const now = new Date();
  await ensureCenterOperations(db, centerId);
  await db
    .update(schema.sanadIntelCenterOperations)
    .set({ lastContactedAt: now })
    .where(eq(schema.sanadIntelCenterOperations.centerId, centerId));
  await ensureSanadCentrePipelineRow(db, centerId);
  await db
    .update(schema.sanadCentresPipeline)
    .set({ lastContactedAt: now, updatedAt: new Date() })
    .where(eq(schema.sanadCentresPipeline.centerId, centerId));
  await promoteSanadCentrePipelineStatus(db, centerId, "contacted");
}

export type SanadPipelineKpis = {
  totalCentres: number;
  contactedPct: number;
  conversionPct: number;
};

export async function computeSanadCentrePipelineKpis(db: DB): Promise<SanadPipelineKpis> {
  const [totalRow] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.sanadIntelCenters);
  const totalCentres = totalRow?.n ?? 0;
  if (totalCentres === 0) {
    return { totalCentres: 0, contactedPct: 0, conversionPct: 0 };
  }
  const [agg] = await db
    .select({
      contacted: sql<number>`sum(case when coalesce(${schema.sanadCentresPipeline.pipelineStatus}, 'imported') in ('contacted','prospect','invited','registered','active') then 1 else 0 end)`.mapWith(
        Number,
      ),
      converted: sql<number>`sum(case when coalesce(${schema.sanadCentresPipeline.pipelineStatus}, 'imported') in ('registered','active') then 1 else 0 end)`.mapWith(
        Number,
      ),
    })
    .from(schema.sanadIntelCenters)
    .leftJoin(
      schema.sanadCentresPipeline,
      eq(schema.sanadCentresPipeline.centerId, schema.sanadIntelCenters.id),
    );
  const contacted = Number(agg?.contacted ?? 0);
  const converted = Number(agg?.converted ?? 0);
  return {
    totalCentres,
    contactedPct: Math.round((contacted / totalCentres) * 1000) / 10,
    conversionPct: Math.round((converted / totalCentres) * 1000) / 10,
  };
}

export async function listDistinctPipelineOwners(db: DB) {
  return db
    .select({
      userId: schema.sanadCentresPipeline.ownerUserId,
      name: pipelineUsers.name,
      email: pipelineUsers.email,
    })
    .from(schema.sanadCentresPipeline)
    .innerJoin(pipelineUsers, eq(pipelineUsers.id, schema.sanadCentresPipeline.ownerUserId))
    .where(isNotNull(schema.sanadCentresPipeline.ownerUserId))
    .groupBy(schema.sanadCentresPipeline.ownerUserId, pipelineUsers.name, pipelineUsers.email)
    .orderBy(asc(pipelineUsers.name));
}
