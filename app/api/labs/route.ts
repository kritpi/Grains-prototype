import { z } from "zod";

import { chemProcess } from "@/lib/db/schema";
import {
  DEFAULT_LIMIT,
  DEFAULT_RADIUS_M,
  searchLabs,
  type LabSearchInput,
} from "@/lib/queries/labs";

/**
 * Every result depends on the caller's coordinates and on the clock (open_now
 * is evaluated per request), so there is nothing here to prerender.
 */
export const dynamic = "force-dynamic";

/**
 * A ceiling on the radius, not a product decision.
 *
 * The PRD's control is 5 km by default and adjustable, and the widen-radius
 * prompt walks it upward; 50 km covers Bangkok and its outskirts several times
 * over. The cap exists so a hand-edited URL cannot ask for a circle that
 * contains the whole table and turns the GIST index into a sequential scan.
 */
const MAX_RADIUS_M = 50_000;

/** One request can't ask for more pins than a map can usefully carry. */
const MAX_LIMIT = 100;

/**
 * Query parameters are snake_case to match docs/api-surface.md, and repeated
 * rather than comma-joined — `?process=c41&process=bw`. Repetition is what
 * URLSearchParams produces natively on both sides, so neither nuqs nor this
 * handler has to invent an escaping rule for a value containing a comma.
 */
const searchQuery = z.object({
  // Coercion turns a missing parameter into NaN rather than reporting it as
  // absent, so both cases share one message that names what the caller has to
  // send instead of describing the coercion that failed.
  lat: z.coerce
    .number({ error: "lat is required, as a number between -90 and 90" })
    .min(-90)
    .max(90),
  lng: z.coerce
    .number({ error: "lng is required, as a number between -180 and 180" })
    .min(-180)
    .max(180),
  radius_m: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_RADIUS_M)
    .default(DEFAULT_RADIUS_M),
  process: z.array(z.enum(chemProcess.enumValues)).default([]),
  scanner: z.array(z.string().min(1)).default([]),
  // Curated catalog keys. An unknown key is not rejected here — it simply
  // matches nothing, which is the same answer the database would give.
  service: z.array(z.string().min(1)).default([]),
  film_stock_id: z.uuid().optional(),
  open_now: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/labs — the workhorse.
 *
 * Backs geolocated search, every filter change, map pans, the widen-radius
 * prompt and reverse search from a film page. It is a Route Handler rather than
 * a Server Component read because the browser refetches it after load; the
 * server-rendered first page for `/labs?area=` calls searchLabs directly.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const parsed = searchQuery.safeParse({
    lat: params.get("lat") ?? undefined,
    lng: params.get("lng") ?? undefined,
    radius_m: params.get("radius_m") ?? undefined,
    process: params.getAll("process"),
    scanner: params.getAll("scanner"),
    service: params.getAll("service"),
    film_stock_id: params.get("film_stock_id") ?? undefined,
    open_now: params.get("open_now") ?? undefined,
    limit: params.get("limit") ?? undefined,
    offset: params.get("offset") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid_query",
        issues: parsed.error.issues.map((issue) => ({
          param: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const q = parsed.data;
  const input: LabSearchInput = {
    lat: q.lat,
    lng: q.lng,
    radiusM: q.radius_m,
    process: q.process,
    scanner: q.scanner,
    service: q.service,
    filmStockId: q.film_stock_id,
    openNow: q.open_now,
    limit: q.limit,
    offset: q.offset,
  };

  const { labs, total } = await searchLabs(input);
  return Response.json({ labs, total });
}
