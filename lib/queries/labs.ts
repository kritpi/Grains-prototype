import { sql, type SQL } from "drizzle-orm";

import { getDb } from "@/lib/db";
import type { chemProcess, contactChannel, labStatus } from "@/lib/db/schema";

export type ChemProcess = (typeof chemProcess.enumValues)[number];
export type LabStatus = (typeof labStatus.enumValues)[number];
export type ContactChannel = (typeof contactChannel.enumValues)[number];
export type FilmFormat = "135" | "120";

/**
 * 5 km, and the same 5 km everywhere a radius is used — the initial search, the
 * "widen radius" prompt, and reverse search from a film page (PRD A).
 */
export const DEFAULT_RADIUS_M = 5000;

/** One page of results. The map and the list render the same page, so this is
 *  also the cap on how many pins a single search can drop. */
export const DEFAULT_LIMIT = 50;

export type LabSearchInput = {
  lat: number;
  lng: number;
  radiusM?: number;
  /** AND across values: a lab must offer every process asked for. */
  process?: ChemProcess[];
  /** OR within: any one of these scanner models qualifies. */
  scanner?: string[];
  /**
   * Curated `service_catalog` keys only, AND across values. Contributor
   * freeform services are deliberately unindexed and can never reach here —
   * "custom entries display but never filter" (PRD A, Decision Ledger #2).
   */
  service?: string[];
  /** Reverse search from a film's detail page. */
  filmStockId?: string;
  openNow?: boolean;
  limit?: number;
  offset?: number;
};

export type LabCard = {
  id: string;
  nameEn: string;
  nameTh: string | null;
  areaEn: string | null;
  areaTh: string | null;
  lat: number;
  lng: number;
  distanceM: number;
  status: LabStatus;
  openNow: boolean;
  processes: ChemProcess[];
  scanners: string[];
  priceFromThb: number | null;
  badgeCounts: Record<string, number>;
  completeness: number;
};

/**
 * The origin of a search, as a geography point.
 *
 * Longitude first: `ST_MakePoint` takes (x, y), and getting that backwards
 * puts Bangkok in Somalia without erroring.
 */
function origin(lat: number, lng: number): SQL {
  return sql`st_setsrid(st_makepoint(${lng}, ${lat}), 4326)::geography`;
}

/**
 * "Open now", evaluated by the database in Asia/Bangkok.
 *
 * It belongs in SQL rather than in the caller because it is also a filter: a
 * JavaScript answer could not be part of the same statement, and computing it
 * from the server's clock would make the result depend on where the function
 * happened to run.
 *
 * `hours` is a 7-element array with index 0 = Sunday, which is exactly what
 * `extract(dow)` returns. A row with no hours entered is not "open" — absent
 * data is not a claim that the doors are open — and neither is a lab whose
 * status says otherwise, however inviting its weekly schedule looks.
 */
const OPEN_NOW = sql`
  case
    when l.status <> 'open' then false
    when jsonb_array_length(l.hours) <> 7 then false
    when coalesce((l.hours -> bkk.dow ->> 'closed')::boolean, false) then false
    when (l.hours -> bkk.dow ->> 'open') is null
      or (l.hours -> bkk.dow ->> 'close') is null then false
    -- A closing time at or before the opening time means the shift crosses
    -- midnight, so the window is a union rather than a range.
    when (l.hours -> bkk.dow ->> 'close')::time
       <= (l.hours -> bkk.dow ->> 'open')::time then
      bkk.clock >= (l.hours -> bkk.dow ->> 'open')::time
      or bkk.clock < (l.hours -> bkk.dow ->> 'close')::time
    else
      bkk.clock >= (l.hours -> bkk.dow ->> 'open')::time
      and bkk.clock < (l.hours -> bkk.dow ->> 'close')::time
  end
`;

/** Bangkok wall-clock, computed once per statement and joined in. */
const BANGKOK_NOW = sql`
  (
    select
      extract(dow from n)::int as dow,
      n::time                  as clock
    from (select (now() at time zone 'Asia/Bangkok') as n) t
  ) bkk
`;

/**
 * Geospatial lab search — the one statement behind `/labs`, every filter
 * change, every map pan, the "widen radius" prompt and reverse search.
 *
 * `ST_DWithin` on a geography column takes metres and describes a true circle,
 * which is the whole reason PostGIS is here. It is also the only form the GIST
 * index on `labs.location` can serve; a `ST_Distance(...) < r` written the
 * obvious way would be correct and would scan every row.
 *
 * Permanently-closed labs are excluded here and stay reachable at `/labs/[id]`
 * by direct link, so a bookmark or a reverse-search result never 404s.
 */
export async function searchLabs(input: LabSearchInput): Promise<{
  labs: LabCard[];
  total: number;
}> {
  const {
    lat,
    lng,
    radiusM = DEFAULT_RADIUS_M,
    process = [],
    scanner = [],
    service = [],
    filmStockId,
    openNow = false,
    limit = DEFAULT_LIMIT,
    offset = 0,
  } = input;

  const from = origin(lat, lng);
  const where: SQL[] = [
    sql`l.status <> 'permanently_closed'`,
    sql`st_dwithin(l.location, ${from}, ${radiusM})`,
  ];

  // AND semantics, expressed as "matches as many of the asked-for values as
  // were asked for". One clause counting matches beats N stacked EXISTS
  // subqueries: it reads as the rule it implements, and it still uses
  // lab_processes_process_idx.
  if (process.length > 0) {
    where.push(sql`
      (
        select count(*)
        from lab_processes lp
        where lp.lab_id = l.id
          and lp.process = any(${sql.param(process)}::text[]::chem_process[])
      ) = ${process.length}
    `);
  }

  // OR semantics: any one of the named models is a match.
  if (scanner.length > 0) {
    where.push(sql`
      exists (
        select 1 from lab_scanners ls
        where ls.lab_id = l.id and ls.model = any(${sql.param(scanner)}::text[])
      )
    `);
  }

  // `service_key = any(...)` also excludes the freeform rows for free: their
  // service_key is null, and null never matches.
  if (service.length > 0) {
    where.push(sql`
      (
        select count(distinct lsv.service_key)
        from lab_services lsv
        where lsv.lab_id = l.id
          and lsv.service_key = any(${sql.param(service)}::text[])
      ) = ${service.length}
    `);
  }

  if (filmStockId) {
    where.push(sql`
      exists (
        select 1 from lab_stock lst
        where lst.lab_id = l.id and lst.film_stock_id = ${filmStockId}::uuid
      )
    `);
  }

  if (openNow) {
    where.push(sql`${OPEN_NOW}`);
  }

  const rows = await getDb().execute<{
    id: string;
    name_en: string;
    name_th: string | null;
    area_en: string | null;
    area_th: string | null;
    lat: number;
    lng: number;
    distance_m: number;
    status: LabStatus;
    open_now: boolean;
    processes: ChemProcess[];
    scanners: string[];
    price_from_thb: number | null;
    badge_counts: Record<string, number>;
    completeness: number;
    total: string;
  }>(sql`
    select
      l.id,
      l.name_en,
      l.name_th,
      l.area_en,
      l.area_th,
      st_y(l.location::geometry) as lat,
      st_x(l.location::geometry) as lng,
      st_distance(l.location, ${from}) as distance_m,
      l.status,
      ${OPEN_NOW} as open_now,
      (
        select coalesce(array_agg(lp.process order by lp.process), '{}')
        from lab_processes lp where lp.lab_id = l.id
      ) as processes,
      (
        select coalesce(array_agg(ls.model order by sm.sort_order, ls.model), '{}')
        from lab_scanners ls
        join scanner_models sm on sm.model = ls.model
        where ls.lab_id = l.id
      ) as scanners,
      -- "from ฿x" across the whole matrix, not just the filtered processes:
      -- it is the lab's entry price, not a quote for this search.
      (
        select min(lpr.price_thb)::float8
        from lab_pricing lpr where lpr.lab_id = l.id
      ) as price_from_thb,
      (
        select coalesce(jsonb_object_agg(v.badge_key, v.n), '{}'::jsonb)
        from (
          select badge_key, count(*)::int as n
          from lab_badge_votes where lab_id = l.id
          group by badge_key
        ) v
      ) as badge_counts,
      l.completeness,
      count(*) over () as total
    from labs l
    cross join ${BANGKOK_NOW}
    where ${sql.join(where, sql` and `)}
    -- Nearest first, more-complete listings ahead of thin ones at the same
    -- distance. The only order offered: PRD A rules out a "sort by" control.
    order by distance_m asc, l.completeness desc, l.id
    limit ${limit} offset ${offset}
  `);

  return {
    labs: rows.map(toLabCard),
    // count(*) over () is the total before limit/offset, and it is absent
    // rather than zero when the page is empty.
    total: rows.length > 0 ? Number(rows[0].total) : 0,
  };
}

function toLabCard(row: {
  id: string;
  name_en: string;
  name_th: string | null;
  area_en: string | null;
  area_th: string | null;
  lat: number;
  lng: number;
  distance_m: number;
  status: LabStatus;
  open_now: boolean;
  processes: ChemProcess[];
  scanners: string[];
  price_from_thb: number | null;
  badge_counts: Record<string, number>;
  completeness: number;
}): LabCard {
  return {
    id: row.id,
    nameEn: row.name_en,
    nameTh: row.name_th,
    areaEn: row.area_en,
    areaTh: row.area_th,
    lat: Number(row.lat),
    lng: Number(row.lng),
    distanceM: Number(row.distance_m),
    status: row.status,
    openNow: row.open_now,
    processes: row.processes ?? [],
    scanners: row.scanners ?? [],
    priceFromThb:
      row.price_from_thb === null ? null : Number(row.price_from_thb),
    badgeCounts: row.badge_counts ?? {},
    completeness: row.completeness,
  };
}

export type LabPricingCell = {
  process: ChemProcess;
  format: FilmFormat;
  priceThb: number | null;
  turnaroundMinD: number | null;
  turnaroundMaxD: number | null;
};

export type LabDetail = {
  id: string;
  nameEn: string;
  nameTh: string | null;
  areaEn: string | null;
  areaTh: string | null;
  street: string | null;
  landmarkNote: string | null;
  lat: number;
  lng: number;
  status: LabStatus;
  statusNote: string | null;
  openNow: boolean;
  hours: unknown;
  completeness: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Every process offered — the pricing matrix's column set. */
  processes: ChemProcess[];
  /**
   * Only the cells actually entered. A missing cell is "not entered yet"; a
   * process missing from `processes` is "not offered". PRD A #1 needs those to
   * read differently on the page, so neither is padded out here.
   */
  pricing: LabPricingCell[];
  scanners: string[];
  services: {
    id: string;
    key: string | null;
    labelEn: string | null;
    labelTh: string | null;
    customLabel: string | null;
    note: string | null;
  }[];
  supplies: {
    id: string;
    key: string | null;
    labelEn: string | null;
    labelTh: string | null;
    customLabel: string | null;
  }[];
  contacts: { id: string; channel: ContactChannel; value: string }[];
  stock: {
    filmStockId: string;
    name: string;
    iso: number;
    formats: FilmFormat[];
  }[];
  photos: {
    id: string;
    storageKey: string;
    width: number;
    height: number;
  }[];
  badgeCounts: Record<string, number>;
};

/**
 * One lab, with everything `/labs/[id]` renders.
 *
 * Nine small selects rather than one join: the children are independent
 * one-to-many sets, and joining them in a single statement would multiply rows
 * together and need de-duplicating in JavaScript. They are issued in parallel
 * on one pooled connection, so the page waits for the slowest, not the sum.
 *
 * A permanently-closed lab is returned. It is hidden from search, not deleted —
 * "Mark as Closed" is a status flag that preserves history (PRD A).
 */
export async function getLab(id: string): Promise<LabDetail | null> {
  const db = getDb();

  const [
    labRows,
    processRows,
    pricingRows,
    scannerRows,
    serviceRows,
    supplyRows,
    contactRows,
    stockRows,
    photoRows,
    badgeRows,
  ] = await Promise.all([
    db.execute<{
      id: string;
      name_en: string;
      name_th: string | null;
      area_en: string | null;
      area_th: string | null;
      street: string | null;
      landmark_note: string | null;
      lat: number;
      lng: number;
      status: LabStatus;
      status_note: string | null;
      open_now: boolean;
      hours: unknown;
      completeness: number;
      version: number;
      created_at: string;
      updated_at: string;
    }>(sql`
      select
        l.id, l.name_en, l.name_th, l.area_en, l.area_th,
        l.street, l.landmark_note,
        st_y(l.location::geometry) as lat,
        st_x(l.location::geometry) as lng,
        l.status, l.status_note,
        ${OPEN_NOW} as open_now,
        l.hours, l.completeness, l.version, l.created_at, l.updated_at
      from labs l
      cross join ${BANGKOK_NOW}
      where l.id = ${id}::uuid
    `),

    db.execute<{ process: ChemProcess }>(sql`
      select process from lab_processes
      where lab_id = ${id}::uuid order by process
    `),

    db.execute<{
      process: ChemProcess;
      format: FilmFormat;
      price_thb: string | null;
      turnaround_min_d: number | null;
      turnaround_max_d: number | null;
    }>(sql`
      select process, format, price_thb, turnaround_min_d, turnaround_max_d
      from lab_pricing where lab_id = ${id}::uuid
      order by process, format
    `),

    db.execute<{ model: string }>(sql`
      select ls.model from lab_scanners ls
      join scanner_models sm on sm.model = ls.model
      where ls.lab_id = ${id}::uuid
      order by sm.sort_order, ls.model
    `),

    // Curated rows carry their catalog labels; freeform rows carry the
    // contributor's own text. Ordering puts the curated set first, in catalog
    // order, so the page reads the same way for every lab.
    db.execute<{
      id: string;
      service_key: string | null;
      label_en: string | null;
      label_th: string | null;
      custom_label: string | null;
      note: string | null;
    }>(sql`
      select lsv.id, lsv.service_key, sc.label_en, sc.label_th,
             lsv.custom_label, lsv.note
      from lab_services lsv
      left join service_catalog sc on sc.key = lsv.service_key
      where lsv.lab_id = ${id}::uuid
      order by (lsv.service_key is null), sc.sort_order, lsv.custom_label
    `),

    db.execute<{
      id: string;
      supply_key: string | null;
      label_en: string | null;
      label_th: string | null;
      custom_label: string | null;
    }>(sql`
      select lsp.id, lsp.supply_key, sc.label_en, sc.label_th, lsp.custom_label
      from lab_supplies lsp
      left join supply_catalog sc on sc.key = lsp.supply_key
      where lsp.lab_id = ${id}::uuid
      order by (lsp.supply_key is null), sc.sort_order, lsp.custom_label
    `),

    db.execute<{ id: string; channel: ContactChannel; value: string }>(sql`
      select id, channel, value from lab_contacts
      where lab_id = ${id}::uuid order by position, id
    `),

    db.execute<{
      film_stock_id: string;
      name: string;
      iso: number;
      formats: FilmFormat[];
    }>(sql`
      select lst.film_stock_id, fs.name, fs.iso, lst.formats
      from lab_stock lst
      join film_stocks fs on fs.id = lst.film_stock_id
      where lst.lab_id = ${id}::uuid
      order by fs.name
    `),

    db.execute<{
      id: string;
      storage_key: string;
      width: number;
      height: number;
    }>(sql`
      select id, storage_key, width, height from lab_photos
      where lab_id = ${id}::uuid order by created_at, id
    `),

    db.execute<{ badge_key: string; n: number }>(sql`
      select badge_key, count(*)::int as n from lab_badge_votes
      where lab_id = ${id}::uuid group by badge_key
    `),
  ]);

  const lab = labRows[0];
  if (!lab) return null;

  return {
    id: lab.id,
    nameEn: lab.name_en,
    nameTh: lab.name_th,
    areaEn: lab.area_en,
    areaTh: lab.area_th,
    street: lab.street,
    landmarkNote: lab.landmark_note,
    lat: Number(lab.lat),
    lng: Number(lab.lng),
    status: lab.status,
    statusNote: lab.status_note,
    openNow: lab.open_now,
    hours: lab.hours,
    completeness: lab.completeness,
    version: lab.version,
    createdAt: String(lab.created_at),
    updatedAt: String(lab.updated_at),
    processes: processRows.map((r) => r.process),
    pricing: pricingRows.map((r) => ({
      process: r.process,
      format: r.format,
      priceThb: r.price_thb === null ? null : Number(r.price_thb),
      turnaroundMinD: r.turnaround_min_d,
      turnaroundMaxD: r.turnaround_max_d,
    })),
    scanners: scannerRows.map((r) => r.model),
    services: serviceRows.map((r) => ({
      id: r.id,
      key: r.service_key,
      labelEn: r.label_en,
      labelTh: r.label_th,
      customLabel: r.custom_label,
      note: r.note,
    })),
    supplies: supplyRows.map((r) => ({
      id: r.id,
      key: r.supply_key,
      labelEn: r.label_en,
      labelTh: r.label_th,
      customLabel: r.custom_label,
    })),
    contacts: contactRows.map((r) => ({
      id: r.id,
      channel: r.channel,
      value: r.value,
    })),
    stock: stockRows.map((r) => ({
      filmStockId: r.film_stock_id,
      name: r.name,
      iso: r.iso,
      formats: r.formats ?? [],
    })),
    photos: photoRows.map((r) => ({
      id: r.id,
      storageKey: r.storage_key,
      width: r.width,
      height: r.height,
    })),
    badgeCounts: Object.fromEntries(badgeRows.map((r) => [r.badge_key, r.n])),
  };
}

export type LabHistoryEntry = {
  id: string;
  editorId: string;
  editorName: string | null;
  editorUsername: string | null;
  note: string | null;
  changes: { path: string; from: unknown; to: unknown }[];
  createdAt: string;
};

/** How many log entries one page of the edit history holds. */
export const HISTORY_PAGE_SIZE = 20;

/**
 * The edit log below the fold on a lab page, newest first.
 *
 * Keyset pagination on the identity column rather than an offset: the log
 * grows at the head while someone is reading it, and an offset would then
 * repeat or skip entries. `id` is monotonic per insert, so it orders the same
 * way `created_at` does and, unlike a timestamp, is unique.
 */
export async function listLabHistory(
  labId: string,
  cursor?: string,
  limit: number = HISTORY_PAGE_SIZE,
): Promise<{ entries: LabHistoryEntry[]; nextCursor: string | null }> {
  const rows = await getDb().execute<{
    id: string;
    editor_id: string;
    editor_name: string | null;
    editor_username: string | null;
    note: string | null;
    changes: { path: string; from: unknown; to: unknown }[];
    created_at: string;
  }>(sql`
    select
      eh.id, eh.editor_id, u.name as editor_name, u.username as editor_username,
      eh.note, eh.changes, eh.created_at
    from edit_history eh
    join users u on u.id = eh.editor_id
    where eh.entity = 'lab'
      and eh.entity_id = ${labId}::uuid
      ${cursor ? sql`and eh.id < ${cursor}::bigint` : sql``}
    order by eh.id desc
    limit ${limit + 1}
  `);

  // One row beyond the page tells us another page exists without a second
  // count query; it is dropped rather than returned.
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    entries: page.map((r) => ({
      id: String(r.id),
      editorId: r.editor_id,
      editorName: r.editor_name,
      editorUsername: r.editor_username,
      note: r.note,
      changes: r.changes ?? [],
      createdAt: String(r.created_at),
    })),
    nextCursor: hasMore ? String(page[page.length - 1].id) : null,
  };
}
