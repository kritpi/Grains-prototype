import { z } from "zod";

import {
  FILM_FORMATS,
  type FilmFormat,
  type HistoryChange,
} from "@/lib/labs/paths";

/**
 * The leaf-path grammar for a film stock.
 *
 * Three fields, so this is a fraction of lib/labs/paths.ts — but it is the same
 * idea and deliberately the same shape, because both write into one
 * `edit_history` table and one log has to render both. `name`, `iso` and
 * `formats` are heads exactly as `name_en` and `hours` are: a reader of the log
 * sees "Name" and "ISO", not a table and a column.
 *
 * A separate module rather than a branch inside the lab grammar. The two share
 * a storage format and nothing else: a lab's leaves address a graph of nine
 * tables, a stock's address three columns of one row, and folding them together
 * would mean every lab path carrying a check for whether it is really a film.
 */

export const FILM_FIELDS = ["name", "iso", "formats"] as const;
export type FilmField = (typeof FILM_FIELDS)[number];

export const filmPath = {
  name: () => "name",
  iso: () => "iso",
  formats: () => "formats",
} as const;

/**
 * Identity is name + ISO (PRD B #2), and `film_stocks_identity_idx` enforces it
 * on `lower(name)`. Both are therefore editable and both are a rename: changing
 * either can collide with a stock that already exists, which the database
 * refuses and app/films/actions.ts turns into a sentence.
 */
const VALUES: Record<FilmField, z.ZodType> = {
  name: z.string().trim().min(1).max(120),
  // 6 to 12800 covers every stock ever sold and refuses a typo'd 4000000.
  iso: z.number().int().min(6).max(12800),
  formats: z
    .array(z.enum(FILM_FORMATS))
    .min(1, "a stock is sold in at least one format")
    .refine((v) => new Set(v).size === v.length, "formats are repeated"),
};

export function isFilmField(value: string): value is FilmField {
  return (FILM_FIELDS as readonly string[]).includes(value);
}

const filmChangeSchema = z
  .object({ path: z.string(), from: z.unknown(), to: z.unknown() })
  .superRefine((change, ctx) => {
    if (!isFilmField(change.path)) {
      ctx.addIssue({
        code: "custom",
        path: ["path"],
        message: `"${change.path}" is not a field of a film stock`,
      });
      return;
    }

    const schema = VALUES[change.path];
    // `from` admits null for the same reason it does on a lab: null on the way
    // in means the leaf did not exist yet, which is what creation looks like.
    const sides = [
      ["from", schema.nullable()],
      ["to", schema],
    ] as const;

    for (const [side, sideSchema] of sides) {
      const result = sideSchema.safeParse(change[side]);
      if (!result.success) {
        ctx.addIssue({
          code: "custom",
          path: [side],
          message: result.error.issues[0]?.message ?? "invalid value",
        });
      }
    }

    if (JSON.stringify(change.from) === JSON.stringify(change.to)) {
      ctx.addIssue({ code: "custom", message: `${change.path} is unchanged` });
    }
  });

export const filmChangesSchema = z
  .array(filmChangeSchema)
  .min(1, "a save with no changes is not a save")
  .max(FILM_FIELDS.length)
  .superRefine((changes, ctx) => {
    const seen = new Set<string>();
    for (const change of changes) {
      if (seen.has(change.path)) {
        ctx.addIssue({
          code: "custom",
          message: `${change.path} appears more than once`,
        });
      }
      seen.add(change.path);
    }
  });

/** Two versions of a stock in, the leaves that differ out. */
export function diffFilmStock(
  before: { name: string; iso: number; formats: FilmFormat[] },
  after: { name: string; iso: number; formats: FilmFormat[] },
): HistoryChange[] {
  const changes: HistoryChange[] = [];
  const push = (path: string, from: unknown, to: unknown) => {
    if (JSON.stringify(from) !== JSON.stringify(to)) {
      changes.push({ path, from, to });
    }
  };

  push(filmPath.name(), before.name.trim(), after.name.trim());
  push(filmPath.iso(), before.iso, after.iso);
  push(filmPath.formats(), before.formats, after.formats);
  return changes;
}
