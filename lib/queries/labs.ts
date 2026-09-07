import { sql, type SQL } from "drizzle-orm";

import { getDb } from "@/lib/db";
import type { contactChannel, labStatus } from "@/lib/db/schema";

// Re-exported so server callers have one import for the whole search contract.
// They live in lib/labs/search-params.ts because the browser needs them too,
// and importing them from here would pull the database driver into the client
// bundle — see the comment in that file.
export {
  CHEM_PROCESSES,
  DEFAULT_LIMIT,
  DEFAULT_RADIUS_M,
  type ChemProcess,
} from "@/lib/labs/search-params";

import { DEFAULT_LIMIT, DEFAULT_RADIUS_M } from "@/lib/labs/search-params";
import type { ChemProcess } from "@/lib/labs/search-params";

export type LabStatus = (typeof labStatus.enumValues)[number];
export type ContactChannel = (typeof contactChannel.enumValues)[number];
export type FilmFormat = "135" | "120";

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

export type FilterOptions = {
  scanners: string[];
  services: { key: string; labelEn: string; labelTh: string }[];
};

/**
 * The values the filter control may offer.
 *
 * Read from the catalog tables rather than hard-coded in the component,
 * because those rosters are content: 00_BACKLOG calls them "expandable without
 * a migration", and a filter listing a scanner nobody stocks — or missing one
 * that was just added — is the failure that hard-coding produces.
 *
 * Services are the curated set only. That is not a filter over `lab_services`:
 * a contributor's freeform entry has no catalog key, is unindexed, and must
 * never appear here (PRD A, Decision Ledger #2).
 */
export async function listFilterOptions(): Promise<FilterOptions> {
  // One statement, not two in parallel. The app runs on a small transaction
  // pool (lib/db/index.ts caps it at 5), and /labs already needs a connection
  // for the areas, one for the search, and one for the header's user lookup.
  // Fanning two more out per request is how two overlapping renders end up
  // each holding connections the other is waiting for.
  const rows = await getDb().execute<{
    kind: "scanner" | "service";
    key: string;
    label_en: string | null;
    label_th: string | null;
  }>(sql`
    select 'scanner' as kind, model as key,
           null as label_en, null as label_th, sort_order
    from scanner_models
    union all
    select 'service', key, label_en, label_th, sort_order
    from service_catalog
    order by kind, sort_order, key
  `);

  return {
    scanners: rows.filter((r) => r.kind === "scanner").map((r) => r.key),
    services: rows
      .filter((r) => r.kind === "service")
      .map((r) => ({
        key: r.key,
        labelEn: r.label_en ?? r.key,
        labelTh: r.label_th ?? r.key,
      })),
  };
}

export type LabArea = {
  nameEn: string;
  nameTh: string | null;
  lat: number;
  lng: number;
  labCount: number;
};

/**
 * The named areas labs are listed in, with a centre to search from.
 *
 * There is no gazetteer and no geocoder: an area is whatever contributors have
 * typed into `area_en`, and its location is the centroid of the labs in it.
 * That is circular by construction — the area exists because labs are there —
 * but it is exactly right for what it feeds, which is a crawlable
 * `/labs?area=Phaya+Thai` entry point and a starting viewport for someone who
 * declines to share their location.
 *
 * The centroid is computed on the planar cast rather than on the geography.
 * Areas span a neighbourhood, and over a few kilometres at Bangkok's latitude
 * the difference is metres — far below the precision of "somewhere around
 * here", and not worth a spheroid mean.
 */
export async function listAreas(): Promise<LabArea[]> {
  const rows = await getDb().execute<{
    name_en: string;
    name_th: string | null;
    lat: number;
    lng: number;
    lab_count: number;
  }>(sql`
    select
      l.area_en                                        as name_en,
      max(l.area_th)                                   as name_th,
      st_y(st_centroid(st_collect(l.location::geometry))) as lat,
      st_x(st_centroid(st_collect(l.location::geometry))) as lng,
      count(*)::int                                    as lab_count
    from labs l
    where l.status <> 'permanently_closed'
      and l.area_en is not null
      and l.area_en <> ''
    group by l.area_en
    order by lab_count desc, l.area_en
  `);

  return rows.map((r) => ({
    nameEn: r.name_en,
    nameTh: r.name_th,
    lat: Number(r.lat),
    lng: Number(r.lng),
    labCount: r.lab_count,
  }));
}

/**
 * One named area out of an already-loaded list, matched case-insensitively so
 * a URL somebody typed still resolves.
 *
 * Takes the areas rather than fetching them because every caller already has
 * them — /labs renders the list and resolves one from it, and querying twice
 * for the same aggregate is a second round trip for an answer in hand.
 * Returns null for an unknown name, which the page turns into a 404 rather
 * than a silent search of somewhere else.
 */
export function findArea(areas: LabArea[], name: string): LabArea | null {
  const wanted = name.trim().toLowerCase();
  return areas.find((a) => a.nameEn.toLowerCase() === wanted) ?? null;
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

/**
 * One day of the weekly schedule, normalised.
 *
 * The column is jsonb, so the database guarantees only that the array has 0 or
 * 7 entries — not what is inside them. Every reader would otherwise repeat the
 * same shape-checking, and a page that gets it wrong renders "open
 * undefined–undefined" rather than failing, so the checking happens once, here.
 *
 * A single window per day, matching the schema's comment and the `OPEN_NOW`
 * expression above. Split shifts are proposed in the wireframe and are not in
 * the schema; supporting them is a migration, not a display change.
 */
export type LabDayHours =
  { closed: true } | { closed: false; open: string; close: string };

/** Seven days, index 0 = Sunday, matching `extract(dow)`. */
export type LabHours = LabDayHours[];

/** `"09:30:00"` and `"09:30"` both arrive; the page wants the latter. */
function toClockTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

/**
 * The stored schedule as seven known-shaped days, or null when there is none.
 *
 * Null and "closed every day" are different answers and the page shows them
 * differently: nobody has entered hours yet is a prompt to contribute, while a
 * lab that is shut all week is a fact about the lab. A malformed day degrades
 * to closed rather than throwing — one bad row should not take out the page.
 */
function toLabHours(value: unknown): LabHours | null {
  if (!Array.isArray(value) || value.length !== 7) return null;

  return value.map((day): LabDayHours => {
    if (typeof day !== "object" || day === null) return { closed: true };

    const entry = day as Record<string, unknown>;
    if (entry.closed === true) return { closed: true };

    const open = toClockTime(entry.open);
    const close = toClockTime(entry.close);
    if (open === null || close === null) return { closed: true };

    return { closed: false, open, close };
  });
}

/** One row of the fixed badge roster, with this lab's endorsement count. */
export type LabBadge = {
  key: string;
  labelEn: string;
  labelTh: string;
  count: number;
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
  /** Null when nobody has entered a schedule — not the same as closed daily. */
  hours: LabHours | null;
  completeness: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  /**
   * Who last touched this lab, and how many times it has been touched.
   *
   * Read here rather than from the lazily-loaded edit log, because the page
   * states it above the fold ("last edited 3 days ago by @x · 14 edits") and
   * the log itself is fetched only if somebody scrolls to it. It costs no extra
   * round trip: both come off the `labs` select as subqueries.
   */
  editCount: number;
  lastEditedAt: string | null;
  lastEditorUsername: string | null;
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
  /**
   * The whole fixed roster, including badges with no endorsements.
   *
   * A zero stays in the list rather than being dropped: the roster is
   * product-defined and identical for every lab, so a comparable set of rows is
   * the point — and an absent badge would read as "not applicable here" rather
   * than "nobody has said so yet" (PRD C #1).
   */
  badges: LabBadge[];
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
      edit_count: number;
      last_edited_at: string | null;
      last_editor_username: string | null;
    }>(sql`
      select
        l.id, l.name_en, l.name_th, l.area_en, l.area_th,
        l.street, l.landmark_note,
        st_y(l.location::geometry) as lat,
        st_x(l.location::geometry) as lng,
        l.status, l.status_note,
        ${OPEN_NOW} as open_now,
        l.hours, l.completeness, l.version, l.created_at, l.updated_at,
        (
          select count(*)::int from edit_history eh
          where eh.entity = 'lab' and eh.entity_id = l.id
        ) as edit_count,
        last_edit.created_at as last_edited_at,
        last_edit.username   as last_editor_username
      from labs l
      cross join ${BANGKOK_NOW}
      -- Lateral rather than a tenth parallel statement: the contribution line
      -- is rendered with the lab, and the pool is small enough that fanning out
      -- one more query per request has deadlocked this page before.
      left join lateral (
        select eh.created_at, u.username
        from edit_history eh
        join users u on u.id = eh.editor_id
        where eh.entity = 'lab' and eh.entity_id = l.id
        order by eh.id desc
        limit 1
      ) last_edit on true
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

    // Driven from the catalog, not from the votes, so a badge nobody has
    // endorsed still comes back — with a zero — and the roster is the same
    // four rows on every lab.
    db.execute<{
      key: string;
      label_en: string;
      label_th: string;
      n: number;
    }>(sql`
      select bc.key, bc.label_en, bc.label_th, count(v.user_id)::int as n
      from badge_catalog bc
      left join lab_badge_votes v
        on v.badge_key = bc.key and v.lab_id = ${id}::uuid
      group by bc.key, bc.label_en, bc.label_th, bc.sort_order
      order by bc.sort_order, bc.key
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
    hours: toLabHours(lab.hours),
    completeness: lab.completeness,
    version: lab.version,
    createdAt: String(lab.created_at),
    updatedAt: String(lab.updated_at),
    editCount: lab.edit_count,
    lastEditedAt:
      lab.last_edited_at === null ? null : String(lab.last_edited_at),
    lastEditorUsername: lab.last_editor_username,
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
    badges: badgeRows.map((r) => ({
      key: r.key,
      labelEn: r.label_en,
      labelTh: r.label_th,
      count: r.n,
    })),
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
