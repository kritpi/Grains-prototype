import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";

/**
 * Endorsing a lab, and taking it back.
 *
 * A separate module from `lib/queries/labs.ts` because that one is Track A's
 * *read* surface (P14) and this is a write, and separate from Track B's
 * `lib/queries/lab-edits.ts` because a badge vote is neither a lab edit nor
 * versioned: it writes no `edit_history` row, does not touch `labs.version`, and
 * does not recompute completeness. It is one row in a join table, owned by one
 * user, and the whole feature is its presence or absence.
 */

/**
 * Toggle one user's endorsement of one badge on one lab.
 *
 * Returns whether the badge is endorsed *after* the call, so the caller does not
 * have to read the row back to know what happened.
 *
 * One statement rather than a read followed by a write. The primary key is
 * (lab_id, badge_key, user_id), so two clicks racing each other through a
 * check-then-insert would either raise a duplicate key or silently drop one
 * click depending on the interleaving. Deleting first and inserting only if the
 * delete found nothing makes the toggle decide its own direction inside a single
 * statement, where the row is locked for the duration.
 *
 * An unknown badge key raises 23503 against `badge_catalog`, which is the schema
 * enforcing PRD C #1 — the roster is fixed and product-defined, so there is no
 * such thing as endorsing a badge nobody defined.
 */
export async function toggleBadgeVote(
  labId: string,
  badgeKey: string,
  userId: string,
): Promise<{ endorsed: boolean }> {
  const rows = await getDb().execute<{ inserted: number }>(sql`
    with removed as (
      delete from lab_badge_votes
      where lab_id = ${labId}::uuid
        and badge_key = ${badgeKey}
        and user_id = ${userId}::uuid
      returning 1
    )
    insert into lab_badge_votes (lab_id, badge_key, user_id)
    select ${labId}::uuid, ${badgeKey}, ${userId}::uuid
    where not exists (select 1 from removed)
    returning 1 as inserted
  `);

  // A returned row means the insert ran, so the badge is now endorsed; no row
  // means the delete consumed the click and it is not.
  return { endorsed: rows.length > 0 };
}
