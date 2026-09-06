import { eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export type User = typeof users.$inferSelect;

export async function getUserById(id: string): Promise<User | null> {
  const [row] = await getDb()
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row ?? null;
}

export async function getUserByUsername(
  username: string,
): Promise<User | null> {
  const [row] = await getDb()
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);
  return row ?? null;
}

/**
 * Claim a username, once.
 *
 * The one-shot rule is expressed in the WHERE clause rather than by reading
 * the row first and then writing: a check-then-write is two statements a
 * concurrent request can interleave, while this either updates a row whose
 * username is still null or updates nothing at all.
 *
 * Uniqueness is left to the `lower(username)` unique index, so a race between
 * two people claiming the same name is settled by the database rather than by
 * a lookup that was already stale when it returned.
 */
export async function claimUsername(
  userId: string,
  username: string,
): Promise<User | null> {
  const [row] = await getDb()
    .update(users)
    .set({ username })
    .where(sql`${users.id} = ${userId} AND ${users.username} IS NULL`)
    .returning();
  return row ?? null;
}
