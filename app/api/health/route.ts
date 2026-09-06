import { pingDatabase } from "@/lib/queries/health";

/**
 * Infrastructure check, not product API — the three product Route Handlers are
 * listed in docs/api-surface.md and this is not one of them.
 *
 * It exists to answer one question that is expensive to get wrong and cheap to
 * verify: are the functions running in Singapore, next to the database? A US
 * default against a Singapore database costs roughly 400ms per render.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const region = process.env.VERCEL_REGION ?? "local";

  try {
    const { now } = await pingDatabase();
    return Response.json({ ok: true, region, db: { ok: true, now } });
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
