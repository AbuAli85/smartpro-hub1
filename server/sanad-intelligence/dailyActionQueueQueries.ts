import { asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../drizzle/schema";
import type { SanadQueueListSourceRow } from "./sanadQueueRowMapping";

type DB = MySql2Database<typeof schema>;

const listDailyQueuePipeOwner = alias(schema.users, "sanad_daily_queue_pipe_owner");
const sanadDailyQueueOffice = alias(schema.sanadOffices, "sanad_daily_queue_office");

export type { SanadQueueListSourceRow } from "./sanadQueueRowMapping";

/**
 * Loads non-archived directory centres with joined office facts when `linked_sanad_office_id` is set.
 * Ordering is stable; the pure generator applies score ordering and cap.
 */
export async function listSanadCenterRowsForDailyActionQueue(
  db: DB,
  opts: { maxRows?: number } = {},
): Promise<SanadQueueListSourceRow[]> {
  const maxRows = opts.maxRows ?? 5000;

  const rows = await db
    .select({
      center: schema.sanadIntelCenters,
      ops: schema.sanadIntelCenterOperations,
      pipeline: schema.sanadCentresPipeline,
      pipelineOwnerName: listDailyQueuePipeOwner.name,
      pipelineOwnerEmail: listDailyQueuePipeOwner.email,
      linkedOfficeIsPublicListed: sql<number | null>`
        CASE
          WHEN ${schema.sanadIntelCenterOperations.linkedSanadOfficeId} IS NOT NULL
            AND ${sanadDailyQueueOffice.id} IS NOT NULL
          THEN ${sanadDailyQueueOffice.isPublicListed}
          ELSE NULL
        END
      `,
      linkedOfficeHasActiveCatalogue: sql<number | null>`
        CASE
          WHEN ${sanadDailyQueueOffice.id} IS NOT NULL THEN
            CASE WHEN EXISTS (
              SELECT 1 FROM sanad_service_catalogue c
              WHERE c.office_id = ${sanadDailyQueueOffice.id} AND c.is_active = 1
            ) THEN 1 ELSE 0 END
          ELSE NULL
        END
      `,
      rosterSoloOwnerOnly: sql<number | null>`
        CASE
          WHEN ${sanadDailyQueueOffice.id} IS NOT NULL THEN
            (SELECT CASE
              WHEN COUNT(*) = 1 AND SUM(CASE WHEN m.role = 'owner' THEN 1 ELSE 0 END) = 1
              THEN 1 ELSE 0 END
             FROM sanad_office_members m
             WHERE m.sanad_office_id = ${sanadDailyQueueOffice.id})
          ELSE NULL
        END
      `,
    })
    .from(schema.sanadIntelCenters)
    .leftJoin(
      schema.sanadIntelCenterOperations,
      eq(schema.sanadIntelCenterOperations.centerId, schema.sanadIntelCenters.id),
    )
    .leftJoin(
      schema.sanadCentresPipeline,
      eq(schema.sanadCentresPipeline.centerId, schema.sanadIntelCenters.id),
    )
    .leftJoin(
      listDailyQueuePipeOwner,
      eq(listDailyQueuePipeOwner.id, schema.sanadCentresPipeline.ownerUserId),
    )
    .leftJoin(
      sanadDailyQueueOffice,
      eq(sanadDailyQueueOffice.id, schema.sanadIntelCenterOperations.linkedSanadOfficeId),
    )
    .where(sql`coalesce(${schema.sanadCentresPipeline.isArchived}, 0) = 0`)
    .orderBy(asc(schema.sanadIntelCenters.id))
    .limit(maxRows);

  return rows as unknown as SanadQueueListSourceRow[];
}
