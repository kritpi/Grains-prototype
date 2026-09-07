import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";

/**
 * The curated rosters the contribution form offers.
 *
 * Read from the catalog tables rather than hard-coded in the component, for the
 * same reason `listFilterOptions` is: 00_BACKLOG calls these rosters
 * "expandable without a migration", so they are content. A form offering a
 * scanner nobody stocks — or missing one added last week — is the failure that
 * hard-coding produces.
 *
 * Supplies are why this exists rather than reusing `listFilterOptions`: that
 * function answers what a *filter* may offer, and supplies never filter (they
 * are display-only, PRD A #2). Different question, different function.
 */

export type FormCatalog = {
  scanners: string[];
  services: { key: string; labelEn: string; labelTh: string }[];
  supplies: { key: string; labelEn: string; labelTh: string }[];
};

export async function listFormCatalog(): Promise<FormCatalog> {
  // One statement rather than three in parallel. The pool is small
  // (lib/db/index.ts caps it at 5) and a page that fans out per section is how
  // two overlapping renders end up each holding a connection the other wants.
  const rows = await getDb().execute<{
    kind: "scanner" | "service" | "supply";
    key: string;
    label_en: string | null;
    label_th: string | null;
    sort_order: number;
  }>(sql`
      select 'scanner' as kind, model as key, null as label_en, null as label_th,
             sort_order
        from scanner_models
    union all
      select 'service', key, label_en, label_th, sort_order from service_catalog
    union all
      select 'supply', key, label_en, label_th, sort_order from supply_catalog
    order by kind, sort_order, key
  `);

  return {
    scanners: rows.filter((r) => r.kind === "scanner").map((r) => r.key),
    services: rows.filter((r) => r.kind === "service").map(toEntry),
    supplies: rows.filter((r) => r.kind === "supply").map(toEntry),
  };
}

function toEntry(row: {
  key: string;
  label_en: string | null;
  label_th: string | null;
}) {
  return {
    key: row.key,
    labelEn: row.label_en ?? row.key,
    labelTh: row.label_th ?? row.key,
  };
}
