"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { describeConstraint } from "@/lib/constraint-messages";
import { getDb } from "@/lib/db";
import { diffFilmStock, filmChangesSchema, filmPath } from "@/lib/films/paths";
import { FILM_FORMATS } from "@/lib/labs/paths";
import { appendEditHistory } from "@/lib/queries/lab-edits";
import {
  applyFilmChanges,
  insertFilmStock,
  readFilmStock,
} from "@/lib/queries/film-edits";

/**
 * Film stock writes.
 *
 * The same four steps as every lab write — `requireUser()`, one transaction,
 * exactly one `edit_history` row, `revalidatePath` — because the catalog uses
 * the same trust-by-default model as labs (PRD B #1). There is no separate
 * moderation path for the catalog and there is not meant to be one.
 */

export type FilmActionResult =
  | { ok: true; id: string; name: string }
  | { ok: false; reason: "invalid"; issues: string[] }
  | { ok: false; reason: "unchanged" }
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "rejected"; message: string };

const newFilmStockSchema = z.object({
  name: z.string().trim().min(1, "a stock needs a name").max(120),
  iso: z.coerce.number().int().min(6).max(12800),
  formats: z
    .array(z.enum(FILM_FORMATS))
    .min(1, "pick at least one format")
    .refine((v) => new Set(v).size === v.length, "formats are repeated"),
});

export type NewFilmStockInput = z.input<typeof newFilmStockSchema>;

/**
 * Add a stock to the catalog.
 *
 * Reached from `/films` and, more often, from inside the Add Lab form: a
 * contributor listing what a shop carries hits a stock nobody has entered yet,
 * and the alternative to adding it inline is abandoning the edit (PRD A #3).
 * So this returns the new stock's name as well as its id — the caller is
 * usually a picker that has to show what it just created.
 *
 * A duplicate is refused by `film_stocks_identity_idx` rather than by a lookup
 * here, which is what makes it correct under two people adding "Portra 400" at
 * the same moment.
 */
export async function createFilmStock(
  input: unknown,
): Promise<FilmActionResult> {
  const user = await requireUser("/films");

  const parsed = newFilmStockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", issues: issuesOf(parsed.error) };
  }

  try {
    const { name, iso, formats } = parsed.data;
    const id = await getDb().transaction(async (tx) => {
      const stockId = await insertFilmStock(tx, {
        name,
        iso,
        formats,
        createdBy: user.id,
      });
      // One entry, saying the stock appeared — the same convention the lab
      // seeds and `createLab` use.
      await appendEditHistory(tx, {
        entity: "film_stock",
        entityId: stockId,
        editorId: user.id,
        changes: [{ path: filmPath.name(), from: null, to: name }],
      });
      return stockId;
    });

    revalidatePath("/films");
    return { ok: true, id, name };
  } catch (error) {
    const message = describeConstraint(error);
    if (message === null) throw error;
    return { ok: false, reason: "rejected", message };
  }
}

/**
 * Edit a stock, under optimistic concurrency.
 *
 * Takes the whole stock rather than a diff, unlike `updateLab`: three fields on
 * one row are a document small enough that a person edits all of it at once,
 * and the diff is computed here against the row read inside the transaction.
 * The leaf changes it produces are the same shape a lab's are, so one log
 * renders both.
 */
export async function updateFilmStock(
  id: string,
  version: number,
  input: unknown,
  note?: string,
): Promise<FilmActionResult> {
  const user = await requireUser(`/films/${id}`);

  const parsed = newFilmStockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", issues: issuesOf(parsed.error) };
  }

  try {
    return await getDb().transaction(async (tx): Promise<FilmActionResult> => {
      const current = await readFilmStock(tx, id);
      if (!current) {
        return {
          ok: false,
          reason: "invalid",
          issues: ["No such film stock."],
        };
      }

      const changes = diffFilmStock(current, parsed.data);
      if (changes.length === 0) return { ok: false, reason: "unchanged" };

      const validated = filmChangesSchema.safeParse(changes);
      if (!validated.success) {
        return {
          ok: false,
          reason: "invalid",
          issues: issuesOf(validated.error),
        };
      }

      const applied = await applyFilmChanges(tx, id, version, changes);
      if (!applied.ok) return { ok: false, reason: "conflict" };

      await appendEditHistory(tx, {
        entity: "film_stock",
        entityId: id,
        editorId: user.id,
        note: note?.trim() || null,
        changes,
      });

      revalidatePath(`/films/${id}`);
      revalidatePath("/films");
      return { ok: true, id, name: parsed.data.name };
    });
  } catch (error) {
    const message = describeConstraint(error);
    if (message === null) throw error;
    return { ok: false, reason: "rejected", message };
  }
}

function issuesOf(error: {
  issues: { path: PropertyKey[]; message: string }[];
}) {
  return error.issues.map((issue) =>
    issue.path.length > 0
      ? `${issue.path.join(".")}: ${issue.message}`
      : issue.message,
  );
}
