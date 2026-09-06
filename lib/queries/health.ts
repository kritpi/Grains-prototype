import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * SQL lives only in lib/queries — this is the whole layering rule, and it
 * starts being true here rather than at the first real feature.
 */
export async function pingDatabase(): Promise<{ now: string }> {
  const rows = await db.execute<{ now: string }>(sql`select now() as now`);
  return { now: String(rows[0]?.now ?? "") };
}
