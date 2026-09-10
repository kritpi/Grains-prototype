/**
 * Photobook slugs — the `/u/@someone/bangkok-overcast` half of the URL.
 *
 * Pure, and with no imports, so the rules can be tested without a database.
 *
 * **Non-ASCII is kept, not folded.** "Café" slugs to `café` and a Thai title
 * stays in Thai. The obvious alternative — NFKD then strip combining marks —
 * is the standard trick for turning é into e, and it quietly destroys Thai:
 * Thai vowel signs *are* combining marks, so `แล็บของแอมป์` would come back as
 * a row of consonants. This is a bilingual product, so the rule that works for
 * both scripts wins over the one that produces prettier English URLs. Browsers
 * percent-encode it and display it decoded.
 */

/** Long enough to stay readable, short enough not to wrap in a link. */
const MAX_LENGTH = 60;

/** When a title has nothing a slug can be built from — "..." or "???". */
export const FALLBACK_SLUG = "book";

/**
 * A title reduced to a slug, or the empty string if there is nothing to reduce.
 *
 * The caller decides what an empty one means; `uniqueSlug` turns it into
 * `book`, `book-2` and so on.
 */
export function slugify(title: string): string {
  return (
    title
      .normalize("NFC")
      .toLowerCase()
      // Letters, numbers and marks survive; everything else becomes a
      // separator. Marks are in the keep set for the reason above.
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_LENGTH)
      // The slice can land mid-separator.
      .replace(/-+$/g, "")
  );
}

/**
 * The first slug in the `base`, `base-2`, `base-3` … series that is free.
 *
 * `taken` is the set of slugs the owner already has that could collide — a
 * *hint*, not a guarantee, because it was read a moment before the insert.
 * `(owner_id, slug)` is UNIQUE and remains the actual arbiter; the caller
 * retries when the database disagrees.
 *
 * Numbering starts at 2 rather than 1, because the unsuffixed slug is the
 * first: "bangkok-overcast" and "bangkok-overcast-2" read as a pair in a way
 * that "-1" and "-2" do not.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = base === "" ? FALLBACK_SLUG : base;

  if (!used.has(root)) return root;

  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`;
    if (!used.has(candidate)) return candidate;
  }

  // A thousand books under one title is not a case worth a nicer answer than
  // "it is unique and you can rename it".
  return `${root}-${Date.now().toString(36)}`;
}
