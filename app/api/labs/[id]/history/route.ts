import { z } from "zod";

import { HISTORY_PAGE_SIZE, listLabHistory } from "@/lib/queries/labs";

export const dynamic = "force-dynamic";

/**
 * The cursor is an `edit_history.id`, a bigint. It is kept as a string all the
 * way through: the values outrun Number.MAX_SAFE_INTEGER in principle, and the
 * client only ever echoes back what the previous page returned.
 */
const historyQuery = z.object({
  id: z.uuid(),
  cursor: z
    .string()
    .regex(/^\d+$/, "cursor must be a positive integer")
    .optional(),
  limit: z.coerce.number().int().positive().max(100).default(HISTORY_PAGE_SIZE),
});

/**
 * GET /api/labs/[id]/history — the edit log below the fold on a lab page.
 *
 * Lazily loaded, which is the whole reason it is a Route Handler: the log is
 * long, rarely read, and would otherwise be rendered into every lab page.
 *
 * An unknown lab returns an empty page rather than 404. The log is a view of a
 * lab that the page has already established exists, and proving absence here
 * would cost a second query to answer a question no caller asks.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/labs/[id]/history">,
) {
  const params = new URL(request.url).searchParams;
  const { id } = await ctx.params;

  const parsed = historyQuery.safeParse({
    id,
    cursor: params.get("cursor") ?? undefined,
    limit: params.get("limit") ?? undefined,
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

  const { entries, nextCursor } = await listLabHistory(
    parsed.data.id,
    parsed.data.cursor,
    parsed.data.limit,
  );

  return Response.json({ entries, nextCursor });
}
