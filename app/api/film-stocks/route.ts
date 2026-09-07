import { z } from "zod";

import { searchFilmStocks } from "@/lib/queries/films";

/**
 * `GET /api/film-stocks?q=` — the typeahead.
 *
 * One of the three Route Handlers in docs/api-surface.md, and here for the
 * reason that document gives: it is fetched by the browser after the page has
 * loaded. Both callers — the Add Lab form's inventory picker and, later, the
 * photo metadata form — can create a catalog entry inline, so the response
 * carries `exact_match` as well as the matches: the UI needs to know whether
 * what was typed already exists before it offers to add it.
 */
export const dynamic = "force-dynamic";

const MAX_LIMIT = 20;

const query = z.object({
  q: z.string().min(1, "q is required").max(120),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).default(8),
});

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = query.safeParse(params);

  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const { matches, exactMatch } = await searchFilmStocks(
    parsed.data.q,
    parsed.data.limit,
  );

  // snake_case on the wire, matching /api/labs and api-surface.md.
  return Response.json({
    film_stocks: matches.map((stock) => ({
      id: stock.id,
      name: stock.name,
      iso: stock.iso,
      formats: stock.formats,
    })),
    exact_match: exactMatch,
  });
}
