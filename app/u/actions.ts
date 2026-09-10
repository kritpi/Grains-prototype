"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { slugify, uniqueSlug } from "@/lib/books/slug";
import {
  describeConstraint,
  isUniqueViolation,
} from "@/lib/constraint-messages";
import { getDb } from "@/lib/db";
import {
  connectPhoto,
  deletePhotobook as deletePhotobookRow,
  insertPhotobook,
  removePhotobookItem,
  reorderPhotobookItems,
  slugsStartingWith,
  updatePhotobook as writePhotobook,
} from "@/lib/queries/books";

/**
 * Photobook writes — curation, and the Connection.
 *
 * Thin on purpose. Every rule that decides whether a write is allowed already
 * lives in `lib/queries/books.ts`, expressed as a WHERE clause rather than as a
 * check these functions perform: ownership, self-connection, "is this photo
 * actually in this book". What is left here is what only a request can know —
 * who is asking, what they sent, and which pages to invalidate afterwards.
 *
 * That division is why none of these read a row to decide something and then
 * write. The one exception is minting a slug, which cannot be done without
 * looking, and which the database refuses if the look was stale.
 */

export type BookResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; reason: "invalid"; issues: string[] }
  | { ok: false; reason: "rejected"; message: string };

export type WriteResult =
  | { ok: true }
  | { ok: false; reason: "invalid"; issues: string[] }
  | { ok: false; reason: "rejected"; message: string };

/**
 * An artist's note is 2–3 lines shown once for the whole collection (PRD D #7)
 * — not a caption under every frame, which is what the fine-art direction is
 * protecting against. 300 characters is that, generously.
 *
 * PROPOSED: the PRD says "2–3 lines" and no number, so this is an
 * interpretation. It is the only place the length is enforced.
 */
const MAX_NOTE = 300;

const bookSchema = z.object({
  title: z.string().trim().min(1, "a photobook needs a title").max(120),
  artistNote: z
    .string()
    .trim()
    .max(MAX_NOTE, `an artist's note runs to ${MAX_NOTE} characters`)
    .nullable()
    .default(null)
    // An empty box means "no note", not an empty note.
    .transform((value) => (value === "" ? null : value)),
});

/**
 * Create a Photobook.
 *
 * The slug is minted from the title, and then **never changes.** Renaming a
 * Photobook leaves its address alone, which is the trade this product wants:
 * a profile is something people share, and a slug that follows the title turns
 * every rename into a dead link for whoever already has the old one. The cost
 * is a book whose address can drift from its name, which is visible only to its
 * owner and fixable by making a new one.
 *
 * PROPOSED — the alternative is a redirect table, and that is not MVP work.
 * `updatePhotobook` in the query layer does take a slug, so the capability
 * exists the day a "change address" affordance is worth building.
 */
export async function createPhotobook(input: unknown): Promise<BookResult> {
  const user = await requireUser();

  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", issues: issuesOf(parsed.error) };
  }

  const { title, artistNote } = parsed.data;
  const base = slugify(title);

  let created: BookResult;
  try {
    created = await mint(user.id, base, artistNote, title);
  } catch (error) {
    if (!isUniqueViolation(error)) return rejectedOrThrow(error);

    // Somebody else's insert won the race between choosing the slug and using
    // it. One retry, with a suffix that cannot collide — the window is
    // microseconds, so a second collision would mean something other than
    // concurrency, and a loop would hide it.
    try {
      created = await mint(
        user.id,
        `${base || "book"}-${Date.now().toString(36)}`,
        artistNote,
        title,
      );
    } catch (retry) {
      return rejectedOrThrow(retry);
    }
  }

  revalidatePath(`/u/${user.username}`);
  return created;
}

async function mint(
  ownerId: string,
  base: string,
  artistNote: string | null,
  title: string,
): Promise<BookResult> {
  return getDb().transaction(async (tx) => {
    const taken = await slugsStartingWith(tx, ownerId, base);
    const slug = uniqueSlug(base, taken);
    const id = await insertPhotobook(tx, { ownerId, title, slug, artistNote });
    return { ok: true, id, slug };
  });
}

/**
 * Rename a Photobook, or rewrite its note. The slug is carried through
 * unchanged — see `createPhotobook` for why.
 */
export async function updatePhotobook(
  photobookId: string,
  slug: string,
  input: unknown,
): Promise<WriteResult> {
  const user = await requireUser();

  const id = z.uuid().safeParse(photobookId);
  const parsed = bookSchema.safeParse(input);
  if (!id.success || !parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      issues: parsed.success ? ["No such photobook."] : issuesOf(parsed.error),
    };
  }

  try {
    const updated = await getDb().transaction((tx) =>
      writePhotobook(tx, id.data, user.id, {
        title: parsed.data.title,
        slug,
        artistNote: parsed.data.artistNote,
      }),
    );
    if (!updated) return notYours("photobook");

    revalidatePath(`/u/${user.username}`);
    revalidatePath(`/u/${user.username}/${slug}`);
    return { ok: true };
  } catch (error) {
    const message = describeConstraint(error);
    if (message === null) throw error;
    return { ok: false, reason: "rejected", message };
  }
}

/**
 * Delete a Photobook.
 *
 * Its items go with it and **no Photo does** — not the owner's own, and
 * certainly not the ones Connected from other people. Deleting the shelf does
 * not burn the books. Deleting a Photo is `deletePhoto` in
 * `app/photos/actions.ts`, and that one does cascade everywhere.
 */
export async function deletePhotobook(
  photobookId: string,
): Promise<WriteResult> {
  const user = await requireUser();

  const id = z.uuid().safeParse(photobookId);
  if (!id.success) return notYours("photobook");

  const deleted = await getDb().transaction((tx) =>
    deletePhotobookRow(tx, id.data, user.id),
  );
  if (!deleted) return notYours("photobook");

  revalidatePath(`/u/${user.username}`);
  revalidatePath("/u/[username]/[slug]", "page");
  return { ok: true };
}

/**
 * The Connection — save somebody else's public Photo into one of your own
 * Photobooks.
 *
 * By reference: one canonical Photo, another pointer at it. Nothing is copied,
 * no storage is used, the Photo stays the uploader's, and it does not count
 * against anybody's upload cap (PRD D #3, #5). There is no consent step, which
 * is a decision rather than an omission — public work is freely reusable and an
 * uploader's recourse is to delete the Photo, which removes it everywhere
 * (PRD D #6).
 *
 * Each refusal gets its own sentence, because the sheet this is called from
 * has to say something specific: "already in that book" and "that is your own
 * photo" are different situations and a single "could not connect" would leave
 * a person clicking again.
 */
export async function addToPhotobook(
  photobookId: string,
  photoId: string,
): Promise<WriteResult> {
  const user = await requireUser();

  const ids = z
    .object({ photobookId: z.uuid(), photoId: z.uuid() })
    .safeParse({ photobookId, photoId });
  if (!ids.success) return notYours("photobook");

  const result = await getDb().transaction((tx) =>
    connectPhoto(tx, ids.data.photobookId, ids.data.photoId, user.id),
  );

  if (!result.ok) {
    return {
      ok: false,
      reason: "rejected",
      message: CONNECT_REFUSALS[result.reason],
    };
  }

  revalidatePath(`/u/${user.username}`);
  revalidatePath("/u/[username]/[slug]", "page");
  return { ok: true };
}

const CONNECT_REFUSALS: Record<string, string> = {
  "not-your-photobook": "That is not one of your photobooks.",
  "no-such-photo": "That photo is no longer here.",
  // The surface should never offer this — an uploader looking at their own
  // Photo gets Edit and Delete instead — so reaching it means the affordance
  // was wrong, and the sentence should say what is true rather than apologise.
  "your-own-photo": "That photo is already yours — connect somebody else's.",
  "already-connected": "That photo is already in this photobook.",
};

/**
 * Take an item out of a Photobook — the disconnect, and the un-curate.
 *
 * Removes the pointer only. Disconnecting somebody else's work from your shelf
 * must not reach into their profile, which is the whole difference between this
 * and deleting a Photo.
 */
export async function removeFromPhotobook(
  photobookId: string,
  photoId: string,
): Promise<WriteResult> {
  const user = await requireUser();

  const ids = z
    .object({ photobookId: z.uuid(), photoId: z.uuid() })
    .safeParse({ photobookId, photoId });
  if (!ids.success) return notYours("photobook");

  const removed = await getDb().transaction((tx) =>
    removePhotobookItem(tx, ids.data.photobookId, ids.data.photoId, user.id),
  );
  if (!removed) {
    return {
      ok: false,
      reason: "rejected",
      message: "That photo is not in this photobook.",
    };
  }

  revalidatePath(`/u/${user.username}`);
  revalidatePath("/u/[username]/[slug]", "page");
  return { ok: true };
}

/** A Photobook is a curated set, not a feed, so this is a bounded list. */
const MAX_ITEMS = 500;

const orderSchema = z
  .array(z.uuid())
  .max(MAX_ITEMS, "that is more photos than a photobook holds");

/**
 * Rewrite the order of a Photobook from the full list of its photo ids.
 *
 * The whole order rather than "move X to N", because curation is done by
 * dragging a grid around and sending the result is the only version that is
 * idempotent — replaying it twice leaves the same order, whereas replaying a
 * move does not. A list that is short, long, or names a Photo from somewhere
 * else is refused whole: applying the part that happens to match would scramble
 * the rest.
 */
export async function reorderPhotobook(
  photobookId: string,
  photoIds: unknown,
): Promise<WriteResult> {
  const user = await requireUser();

  const id = z.uuid().safeParse(photobookId);
  const order = orderSchema.safeParse(photoIds);
  if (!id.success || !order.success) {
    return {
      ok: false,
      reason: "invalid",
      issues: order.success ? ["No such photobook."] : issuesOf(order.error),
    };
  }

  const reordered = await getDb().transaction((tx) =>
    reorderPhotobookItems(tx, id.data, user.id, order.data),
  );
  if (!reordered) {
    return {
      ok: false,
      reason: "rejected",
      message:
        "That order does not match what is in this photobook. Reload it.",
    };
  }

  revalidatePath(`/u/${user.username}`);
  revalidatePath("/u/[username]/[slug]", "page");
  return { ok: true };
}

// ---------------------------------------------------------------------------

/**
 * One sentence for "it is not there" and "it is not yours" together, so a
 * stranger cannot use the difference to find out which photobook ids exist.
 */
function rejectedOrThrow(error: unknown): BookResult {
  const message = describeConstraint(error);
  // Anything unmapped is a defect, and a polite sentence is how it stays one.
  if (message === null) throw error;
  return { ok: false, reason: "rejected", message };
}

function notYours(what: string): WriteResult {
  return {
    ok: false,
    reason: "rejected",
    message: `That is not one of your ${what}s.`,
  };
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
