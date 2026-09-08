"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { describeConstraint } from "@/lib/constraint-messages";
import { getDb } from "@/lib/db";
import { FILM_FORMATS } from "@/lib/labs/paths";
import {
  labPhotoKey,
  parsePendingKey,
  pendingKey,
  photoKey,
} from "@/lib/photos/keys";
import { checkUpload, UPLOAD_CAP } from "@/lib/photos/limits";
import { appendPhotobookItem } from "@/lib/queries/books";
import {
  countOriginals,
  deletePhoto as deletePhotoRow,
  insertLabPhoto,
  insertPhoto,
  updatePhotoMetadata as writePhotoMetadata,
  type PhotoMetadata,
} from "@/lib/queries/photos";
import {
  createSignedUpload,
  deleteObject,
  headObject,
  moveObject,
} from "@/lib/storage";

/**
 * The upload path.
 *
 * Three round trips, and the shape is forced by one rule: photos never transit
 * the app server.
 *
 *   1. requestUploadUrl  — the server checks the session and the cap, then
 *                          signs a PUT for one key under `pending/`
 *   2. the browser PUTs the bytes straight to R2
 *   3. confirmPhoto      — the server inspects what actually landed, moves it
 *                          to its permanent key and writes the row
 *
 * Step 1 has to be here because it is the only place that can see the session,
 * and handing the browser unmediated bucket access would let anyone store
 * anything. Step 3 has to be here because R2 enforces nothing: the type and
 * size checks the bucket used to perform are now `headObject` plus P19's rule,
 * and an object that fails them is deleted before any row exists.
 *
 * An upload that is never confirmed — somebody closes the tab between 2 and 3 —
 * leaves an object under `pending/`, which the R2 lifecycle rule removes within
 * a day. That is the whole orphan story; there is no cleanup job.
 */

export type UploadKind = "photo" | "lab_atmosphere";

export type RequestUploadResult =
  | { ok: true; url: string; key: string; expiresIn: number }
  | { ok: false; reason: "rejected"; message: string }
  | { ok: false; reason: "cap"; cap: number; used: number };

const requestSchema = z.object({
  kind: z.enum(["photo", "lab_atmosphere"]),
  contentType: z.string().min(1).max(120),
  bytes: z.number().int().positive(),
});

/**
 * Sign a PUT for one key, after checking the caller is allowed to make it.
 *
 * The key is built here from the session's user id and a fresh uuid, and never
 * from anything the caller sent. That is the entire access-control story for
 * the upload itself: a signature grants writing exactly one key for ten
 * minutes, so the worst a caller can do with it is overwrite their own pending
 * object.
 *
 * `bytes` and `contentType` are what the browser claims, and are checked here
 * only so an obviously-doomed upload is refused before it starts. They are not
 * trusted — `confirmPhoto` measures the object rather than believing this.
 */
export async function requestUploadUrl(
  input: unknown,
): Promise<RequestUploadResult> {
  const user = await requireUser();

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "rejected",
      message: "That file cannot be uploaded.",
    };
  }

  const allowed = checkUpload({
    contentType: parsed.data.contentType,
    bytes: parsed.data.bytes,
  });
  if (!allowed.ok) {
    return { ok: false, reason: "rejected", message: allowed.message };
  }

  // Lab atmosphere photos are venue documentation, not anybody's work, so they
  // are not counted against a personal cap (PRD D #5).
  if (parsed.data.kind === "photo") {
    const used = await countOriginals(user.id);
    if (used >= UPLOAD_CAP) {
      return { ok: false, reason: "cap", cap: UPLOAD_CAP, used };
    }
  }

  const signed = await createSignedUpload(pendingKey(user.id));
  return { ok: true, ...signed };
}

export type ConfirmResult =
  | { ok: true; id: string }
  | { ok: false; reason: "rejected"; message: string }
  | { ok: false; reason: "cap"; cap: number; used: number };

/** Dimensions are read in the browser; they are display data, not a control. */
const dimensions = {
  width: z.number().int().positive().max(60_000),
  height: z.number().int().positive().max(60_000),
};

const metadataSchema = z.object({
  filmStockId: z.uuid().nullable().default(null),
  format: z.enum(FILM_FORMATS).nullable().default(null),
  frameSize: z.string().trim().max(40).nullable().default(null),
  camera: z.string().trim().max(120).nullable().default(null),
  scannerModel: z.string().trim().max(120).nullable().default(null),
  chemistry: z.string().trim().max(120).nullable().default(null),
});

const confirmSchema = z.object({
  key: z.string().min(1).max(200),
  ...dimensions,
  metadata: metadataSchema,
  photobookId: z.uuid().optional(),
});

const confirmLabSchema = z.object({
  key: z.string().min(1).max(200),
  labId: z.uuid(),
  ...dimensions,
});

/**
 * A Photo is public and Connectable the moment it is confirmed — there is no
 * draft state and no publish step (PRD D #4).
 *
 * The order of operations is chosen by which failure is worse. The object is
 * moved first and the row written second, so a crash in between leaves an
 * object nobody references: wasted storage, invisible to everyone. The reverse
 * order would leave a row pointing at a key with nothing behind it, which is a
 * permanently broken frame in somebody's photobook. Storage is cheaper than a
 * hole in a page, so the cleanup below is best-effort and the ordering is the
 * real guarantee.
 */
export async function confirmPhoto(input: unknown): Promise<ConfirmResult> {
  const user = await requireUser();

  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "rejected",
      message: "That upload cannot be saved.",
    };
  }

  const landed = await claimPendingObject(parsed.data.key, user.id);
  if (!landed.ok) return landed;

  // Re-checked, because the cap was last read before the bytes were uploaded
  // and a second tab may have used the last slot in between. The object is
  // already deleted by then — refusing here without cleaning up would let
  // somebody past the cap by simply never confirming.
  const used = await countOriginals(user.id);
  if (used >= UPLOAD_CAP) {
    await forget(parsed.data.key);
    return { ok: false, reason: "cap", cap: UPLOAD_CAP, used };
  }

  const destination = photoKey(user.id, landed.id);
  await moveObject(parsed.data.key, destination);

  try {
    const id = await getDb().transaction(async (tx) => {
      const photoId = await insertPhoto(tx, {
        ownerId: user.id,
        storageKey: destination,
        width: parsed.data.width,
        height: parsed.data.height,
        ...(parsed.data.metadata as PhotoMetadata),
      });

      // A Photo uploaded from inside a Photobook joins it. A convenience, not a
      // coupling — the Photo is still independent and may belong to none
      // (PRD D #10). A photobook that is not the caller's appends nothing.
      if (parsed.data.photobookId) {
        await appendPhotobookItem(
          tx,
          parsed.data.photobookId,
          photoId,
          user.id,
        );
      }
      return photoId;
    });

    revalidatePath(`/u/${user.username}`);
    if (parsed.data.metadata.filmStockId) {
      revalidatePath(`/films/${parsed.data.metadata.filmStockId}`);
    }
    return { ok: true, id };
  } catch (error) {
    await forget(destination);
    const message = describeConstraint(error);
    if (message === null) throw error;
    return { ok: false, reason: "rejected", message };
  }
}

/**
 * Venue documentation for a lab.
 *
 * The destination is `labs/{labId}/…`, not `photos/{userId}/…`, and the
 * difference is the point rather than filing. A key is a public string that
 * appears in the `src` of every image, so a community photo whose key contained
 * a lab id would be exactly the attribution that `photos` has no `lab_id`
 * column to prevent. Keeping the namespaces apart keeps the rule true in
 * storage as well as in the schema.
 */
export async function confirmLabPhoto(input: unknown): Promise<ConfirmResult> {
  const user = await requireUser();

  const parsed = confirmLabSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "rejected",
      message: "That upload cannot be saved.",
    };
  }

  const landed = await claimPendingObject(parsed.data.key, user.id);
  if (!landed.ok) return landed;

  const destination = labPhotoKey(parsed.data.labId, landed.id);
  await moveObject(parsed.data.key, destination);

  try {
    const id = await getDb().transaction((tx) =>
      insertLabPhoto(tx, {
        labId: parsed.data.labId,
        storageKey: destination,
        width: parsed.data.width,
        height: parsed.data.height,
        uploadedBy: user.id,
      }),
    );

    revalidatePath(`/labs/${parsed.data.labId}`);
    return { ok: true, id };
  } catch (error) {
    await forget(destination);
    const message = describeConstraint(error);
    if (message === null) throw error;
    return { ok: false, reason: "rejected", message };
  }
}

export type PhotoWriteResult =
  { ok: true } | { ok: false; reason: "rejected"; message: string };

/**
 * Rewrite a Photo's metadata. Owner only, enforced in the UPDATE's WHERE clause
 * rather than by a read beforehand.
 */
export async function updatePhotoMetadata(
  photoId: string,
  input: unknown,
): Promise<PhotoWriteResult> {
  const user = await requireUser();

  const id = z.uuid().safeParse(photoId);
  const parsed = metadataSchema.safeParse(input);
  if (!id.success || !parsed.success) {
    return {
      ok: false,
      reason: "rejected",
      message: "That change cannot be saved.",
    };
  }

  try {
    const updated = await getDb().transaction((tx) =>
      writePhotoMetadata(tx, id.data, user.id, parsed.data as PhotoMetadata),
    );
    if (!updated) {
      return {
        ok: false,
        reason: "rejected",
        message: "That photo is not yours.",
      };
    }

    revalidatePath(`/u/${user.username}`);
    if (parsed.data.filmStockId) {
      revalidatePath(`/films/${parsed.data.filmStockId}`);
    }
    return { ok: true };
  } catch (error) {
    const message = describeConstraint(error);
    if (message === null) throw error;
    return { ok: false, reason: "rejected", message };
  }
}

/**
 * Delete a Photo — and, through the cascade, every Connection to it.
 *
 * Silent removal is the decision (PRD D #8): the slot disappears from every
 * Photobook that Connected it and the grid re-flows as though it never existed.
 * No tombstone. This is also an uploader's only recourse over how their work is
 * being reused (PRD D #6), which is why it is deliberately total.
 *
 * The row goes first and the object second, the opposite order from confirming
 * and for the same reason: what must not survive is the row. An object left
 * behind by a failed delete costs storage and is referenced by nothing.
 */
export async function deletePhoto(photoId: string): Promise<PhotoWriteResult> {
  const user = await requireUser();

  const id = z.uuid().safeParse(photoId);
  if (!id.success) {
    return { ok: false, reason: "rejected", message: "No such photo." };
  }

  const storageKey = await getDb().transaction((tx) =>
    deletePhotoRow(tx, id.data, user.id),
  );
  if (storageKey === null) {
    return {
      ok: false,
      reason: "rejected",
      message: "That photo is not yours.",
    };
  }

  await forget(storageKey);
  revalidatePath(`/u/${user.username}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------

type Claim =
  { ok: true; id: string } | { ok: false; reason: "rejected"; message: string };

/**
 * Everything both confirms have to establish about an object before it counts:
 * that the key was one we signed for this caller, that something is actually
 * there, and that what is there is within P19's limits.
 *
 * The key arrived from the browser, so it is an argument rather than a fact.
 * `parsePendingKey` checks its shape and the comparison below checks the one
 * thing shape cannot — that the user id in it is the caller's. Without that,
 * confirming somebody else's pending object would adopt their bytes under your
 * own row.
 *
 * A failed limit check deletes the object. It is refused *and* removed, so a
 * rejected upload cannot be left sitting in the bucket and confirmed again.
 */
async function claimPendingObject(key: string, userId: string): Promise<Claim> {
  const parsed = parsePendingKey(key);
  if (!parsed || parsed.userId !== userId) {
    return {
      ok: false,
      reason: "rejected",
      message: "That upload cannot be saved.",
    };
  }

  const object = await headObject(key);
  if (object === null) {
    return {
      ok: false,
      reason: "rejected",
      message: "That upload expired before it was saved. Try again.",
    };
  }

  const allowed = checkUpload({
    contentType: object.contentType,
    bytes: object.contentLength,
  });
  if (!allowed.ok) {
    await forget(key);
    return { ok: false, reason: "rejected", message: allowed.message };
  }

  return { ok: true, id: parsed.id };
}

/**
 * Best-effort object removal on a path that has already decided its outcome.
 *
 * A throw here would replace a clear answer — "that file is too large" — with a
 * 500, having already refused the upload. The cost of swallowing it is a stray
 * object; under `pending/` the lifecycle rule sweeps it within a day, and
 * elsewhere it is storage nothing points at.
 */
async function forget(key: string): Promise<void> {
  try {
    await deleteObject(key);
  } catch (error) {
    console.error(`could not delete ${key}`, error);
  }
}
