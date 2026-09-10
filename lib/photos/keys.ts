import { randomUUID } from "node:crypto";

/**
 * Storage key shapes.
 *
 * Three namespaces, and the separation between them is a content-integrity
 * measure rather than tidiness:
 *
 *   pending/{userId}/{uuid}   an upload that has been signed for but not
 *                             confirmed. The R2 lifecycle rule deletes anything
 *                             under this prefix after a day, which is what
 *                             replaces an orphan-cleanup cron (P20).
 *   photos/{userId}/{uuid}    a confirmed Photo — the community's work, owned
 *                             by a person.
 *   labs/{labId}/{uuid}       a lab's atmosphere photo — venue documentation,
 *                             owned by a place.
 *
 * **A community photo's key never contains a lab id, and a lab photo's key
 * never contains a user id.** The rule that a scan is never attributed to the
 * lab that developed it is enforced in the database by the absence of a
 * `photos.lab_id` column; the key namespace is the same rule applied to
 * storage, so the object path cannot become the attribution link that the
 * column was removed to prevent. A key is a public string — it appears in the
 * `src` of every image — so this is not a theoretical channel.
 *
 * `labs/{labId}/` also means an object stays findable by prefix after its row
 * is gone: `lab_photos` cascades when a lab is deleted, but R2 objects do not
 * follow a foreign key.
 *
 * Pure and server-agnostic apart from `randomUUID`. No SQL, no storage calls —
 * which is what lets the parsing rules be tested without a bucket.
 */

/** The one prefix the R2 lifecycle rule is configured against. Do not rename. */
export const PENDING_PREFIX = "pending";
export const PHOTO_PREFIX = "photos";
export const LAB_PHOTO_PREFIX = "labs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PendingKey = {
  /** Who the signature was issued to. */
  userId: string;
  /** Carried through the move, so an object keeps one identity end to end. */
  id: string;
};

/** Where a signed upload lands before anyone has said what it is. */
export function pendingKey(userId: string, id: string = randomUUID()): string {
  return `${PENDING_PREFIX}/${userId}/${id}`;
}

export function photoKey(userId: string, id: string): string {
  return `${PHOTO_PREFIX}/${userId}/${id}`;
}

export function labPhotoKey(labId: string, id: string): string {
  return `${LAB_PHOTO_PREFIX}/${labId}/${id}`;
}

/**
 * Read a pending key, or null if it is not one.
 *
 * The key that arrives at `confirmPhoto` came from the browser, so it is an
 * argument and not a fact. Everything about its shape is checked here — three
 * segments, the right prefix, a real uuid — and the caller then checks the one
 * thing this cannot know: that the `userId` in it is the caller's own. A
 * signature only ever granted one key, so a confirm naming a different one is
 * either a bug or an attempt to adopt somebody else's object.
 */
export function parsePendingKey(key: string): PendingKey | null {
  const segments = key.split("/");
  if (segments.length !== 3) return null;

  const [prefix, userId, id] = segments;
  if (prefix !== PENDING_PREFIX) return null;
  if (!UUID.test(userId) || !UUID.test(id)) return null;

  return { userId, id };
}
