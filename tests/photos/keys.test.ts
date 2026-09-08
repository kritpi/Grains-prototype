import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  labPhotoKey,
  parsePendingKey,
  pendingKey,
  photoKey,
  PENDING_PREFIX,
} from "@/lib/photos/keys";

const USER = randomUUID();
const OTHER = randomUUID();
const LAB = randomUUID();
const ID = randomUUID();

describe("key shapes", () => {
  it("puts a pending upload under the lifecycle rule's prefix", () => {
    // The R2 lifecycle rule is configured against this literal string. If it
    // ever changes, orphaned uploads stop being swept and nothing else fails.
    expect(pendingKey(USER, ID).startsWith(`${PENDING_PREFIX}/`)).toBe(true);
    expect(pendingKey(USER, ID)).toBe(`pending/${USER}/${ID}`);
  });

  it("carries one identity from pending through to permanent", () => {
    const parsed = parsePendingKey(pendingKey(USER, ID));
    expect(parsed).toEqual({ userId: USER, id: ID });
    expect(photoKey(USER, parsed!.id)).toBe(`photos/${USER}/${ID}`);
  });

  it("keeps lab ids out of photo keys and user ids out of lab keys", () => {
    // The content-integrity rule, applied to storage. A key is a public string
    // — it is in the src of every image — so a community photo whose key held a
    // lab id would be exactly the attribution `photos` has no lab_id column to
    // prevent.
    expect(photoKey(USER, ID)).not.toContain(LAB);
    expect(labPhotoKey(LAB, ID)).not.toContain(USER);
    expect(labPhotoKey(LAB, ID)).toBe(`labs/${LAB}/${ID}`);
  });
});

describe("parsePendingKey", () => {
  it("accepts a key it issued", () => {
    expect(parsePendingKey(pendingKey(USER))).not.toBeNull();
  });

  it("refuses a key outside the pending prefix", () => {
    // The confirm path's whole defence. A caller naming an already-confirmed
    // photo could otherwise re-adopt it under a second row.
    expect(parsePendingKey(photoKey(USER, ID))).toBeNull();
    expect(parsePendingKey(labPhotoKey(LAB, ID))).toBeNull();
  });

  it("refuses anything that is not three segments of the right shape", () => {
    expect(parsePendingKey(`pending/${USER}`)).toBeNull();
    expect(parsePendingKey(`pending/${USER}/${ID}/extra`)).toBeNull();
    expect(parsePendingKey(`pending/not-a-uuid/${ID}`)).toBeNull();
    expect(parsePendingKey(`pending/${USER}/not-a-uuid`)).toBeNull();
    expect(parsePendingKey("")).toBeNull();
  });

  it("refuses traversal and absolute-looking keys", () => {
    expect(parsePendingKey(`../pending/${USER}/${ID}`)).toBeNull();
    expect(parsePendingKey(`/pending/${USER}/${ID}`)).toBeNull();
    expect(parsePendingKey(`pending/${USER}/../../${ID}`)).toBeNull();
  });

  it("reports the owner, so the caller can refuse somebody else's", () => {
    // parsePendingKey cannot know who is asking; it reports the id in the key
    // and the action compares it to the session. This is the half that stops
    // one user confirming another's pending object.
    const parsed = parsePendingKey(pendingKey(OTHER, ID));
    expect(parsed?.userId).toBe(OTHER);
    expect(parsed?.userId).not.toBe(USER);
  });
});
