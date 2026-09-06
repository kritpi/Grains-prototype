import { pingDatabase } from "@/lib/queries/health";

/**
 * Infrastructure check, not product API — the three product Route Handlers are
 * listed in docs/api-surface.md and this is not one of them.
 *
 * It answers two questions that are expensive to get wrong and cheap to
 * verify: are the functions running in Singapore next to the database (a US
 * default costs roughly 400ms per render), and is PostGIS actually installed
 * (every geospatial query depends on it, and its absence would otherwise
 * surface as a confusing error inside a search).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const region = process.env.VERCEL_REGION ?? "local";

  try {
    const { now, postgis } = await pingDatabase();
    return Response.json({
      ok: postgis !== null,
      region,
      db: { ok: true, now, postgis },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        region,
        db: {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
      },
      { status: 503 },
    );
  }
}
