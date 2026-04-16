import { and, asc, desc, eq, notInArray } from "drizzle-orm";
import { normalizeEmail } from "../../shared/emailNormalize";
import { companyMembers, InsertUser, userAuthIdentities, userProfiles, users } from "../../drizzle/schema";
import { getDb } from "../db.client";

function emailTriple(email: string | null | undefined): {
  email: string | null;
  primaryEmail: string | null;
  emailNormalized: string | null;
} {
  const n = normalizeEmail(email);
  if (!n) return { email: null, primaryEmail: null, emailNormalized: null };
  return { email: n, primaryEmail: n, emailNormalized: n };
}

async function touchAuthIdentity(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  params: { userId: number; openId: string; loginMethod: string | null | undefined; email: string | null },
): Promise<void> {
  const provider = (params.loginMethod && params.loginMethod.trim()) || "oauth";
  await db
    .insert(userAuthIdentities)
    .values({
      userId: params.userId,
      provider,
      providerSubjectId: params.openId,
      providerEmail: params.email,
      isPrimary: true,
      linkedAt: new Date(),
      lastUsedAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        lastUsedAt: new Date(),
        providerEmail: params.email,
      },
    });
}

/** Resolve session subject (OAuth openId) to a canonical `users` row (identity table first, then legacy openId column). */
export async function resolveUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return null;

  const [viaIdentity] = await db
    .select({ userId: userAuthIdentities.userId })
    .from(userAuthIdentities)
    .where(eq(userAuthIdentities.providerSubjectId, openId))
    .limit(1);

  if (viaIdentity) {
    const [u] = await db.select().from(users).where(eq(users.id, viaIdentity.userId)).limit(1);
    return u ?? null;
  }

  const [legacy] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return legacy ?? null;
}

/** @deprecated Use {@link resolveUserByOpenId}. */
export async function getUserByOpenId(openId: string) {
  return resolveUserByOpenId(openId);
}

export async function findActiveUsersByNormalizedEmail(normalized: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.emailNormalized, normalized), notInArray(users.accountStatus, ["merged", "archived"])))
    .orderBy(asc(users.id));
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required");
  const db = await getDb();
  if (!db) return;

  const signedInAt = user.lastSignedIn ?? new Date();
  const triple = emailTriple(user.email ?? null);

  let target = await resolveUserByOpenId(user.openId);

  if (!target && triple.emailNormalized) {
    const candidates = await findActiveUsersByNormalizedEmail(triple.emailNormalized);
    if (candidates.length > 1) {
      console.warn("[users] multiple active users share normalized email; linking OAuth subject to canonical row", {
        emailNormalized: triple.emailNormalized,
        userIds: candidates.map((c) => c.id),
      });
    }
    if (candidates.length >= 1) {
      const canonicalId = candidates[0]!.id;
      const [row] = await db.select().from(users).where(eq(users.id, canonicalId)).limit(1);
      target = row ?? null;
    }
  }

  if (target) {
    const st = target.accountStatus ?? "active";
    if (st === "merged" || st === "archived") {
      console.warn("[users] upsert for inactive accountStatus — skipping mutations", {
        userId: target.id,
        accountStatus: target.accountStatus,
      });
      return;
    }

    const updateSet: Record<string, unknown> = {
      lastSignedIn: signedInAt,
      updatedAt: new Date(),
    };

    if (user.name !== undefined) {
      updateSet.name = user.name;
      updateSet.displayName = user.name;
    }
    if (triple.emailNormalized) {
      updateSet.email = triple.email;
      updateSet.primaryEmail = triple.primaryEmail;
      updateSet.emailNormalized = triple.emailNormalized;
    }
    if (user.loginMethod !== undefined) updateSet.loginMethod = user.loginMethod;

    await db.update(users).set(updateSet).where(eq(users.id, target.id));

    await touchAuthIdentity(db, {
      userId: target.id,
      openId: user.openId,
      loginMethod: user.loginMethod ?? null,
      email: triple.email,
    });

    return;
  }

  const insertValues: InsertUser = {
    openId: user.openId,
    email: triple.email,
    primaryEmail: triple.primaryEmail,
    emailNormalized: triple.emailNormalized,
    name: user.name ?? null,
    displayName: user.name ?? null,
    loginMethod: user.loginMethod ?? null,
    lastSignedIn: signedInAt,
  };

  await db.insert(users).values(insertValues).onDuplicateKeyUpdate({
    set: {
      email: insertValues.email,
      primaryEmail: insertValues.primaryEmail,
      emailNormalized: insertValues.emailNormalized,
      name: user.name ?? null,
      displayName: user.name ?? null,
      loginMethod: user.loginMethod ?? null,
      lastSignedIn: signedInAt,
      updatedAt: new Date(),
    },
  });

  const created = await resolveUserByOpenId(user.openId);
  if (created) {
    await touchAuthIdentity(db, {
      userId: created.id,
      openId: user.openId,
      loginMethod: user.loginMethod ?? null,
      email: triple.email,
    });
    await db.insert(userProfiles).values({ userId: created.id }).onDuplicateKeyUpdate({
      set: { updatedAt: new Date() },
    });
  }
}

export async function getAllUsers(companyId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (companyId) {
    return db
      .select({ user: users, member: companyMembers })
      .from(users)
      .innerJoin(companyMembers, and(eq(companyMembers.userId, users.id), eq(companyMembers.companyId, companyId)))
      .orderBy(desc(users.createdAt));
  }
  return db.select().from(users).orderBy(desc(users.createdAt));
}
