import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

/**
 * SQL lives only in lib/queries — this is the whole layering rule, and it
 * starts being true here rather than at the first real feature.
 */
export async function pingDatabase(): Promise<{
  now: string;
  postgis: string | null;
}> {
  const rows = await db.execute<{ now: string; postgis: string | null }>(sql`
    select
      now() as now,
      (select extversion from pg_extension where extname = 'postgis') as postgis
  `);

  const row = rows[0];
  return {
    now: String(row?.now ?? ""),
    postgis: row?.postgis ?? null,
  };
}
