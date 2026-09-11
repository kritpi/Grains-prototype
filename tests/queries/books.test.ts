import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { photoKey } from "@/lib/photos/keys";
import {
  addOwnPhoto,
  appendPhotobookItem,
  connectPhoto,
  deletePhotobook,
  insertPhotobook,
  removePhotobookItem,
  reorderPhotobookItems,
  updatePhotobook,
} from "@/lib/queries/books";
import type { LabTx } from "@/lib/queries/lab-edits";
import { insertPhoto } from "@/lib/queries/photos";
import { hasDatabase } from "../db/client";
import { testDb, withRollback, type TestDb } from "../db/tx";

/**
 * The Connection, and the rules around it.
 *
 * All of it runs inside a transaction that is rolled back, so three tracks can
 * share one `grains-dev` and a failed test leaves no wreckage.
 */
describe.skipIf(!hasDatabase)("photobook writes", () => {
  let db: TestDb;
  let end: () => Promise<void>;

  beforeAll(() => {
    ({ db, end } = testDb());
  });

  afterAll(async () => {
    if (end) await end();
  });

  async function user(tx: LabTx, who: string): Promise<string> {
    const tag = randomUUID().replace(/-/g, "").slice(0, 12);
    const rows = await tx.execute<{ id: string }>(sql`
      insert into users (email, name, username)
      values (${`${who}-${tag}@grains.test`}, ${who}, ${`${who}_${tag}`})
      returning id
    `);
    return rows[0].id;
  }

  async function photo(tx: LabTx, ownerId: string): Promise<string> {
    return insertPhoto(tx, {
      ownerId,
      storageKey: photoKey(ownerId, randomUUID()),
      width: 3000,
      height: 2000,
      filmStockId: null,
      format: null,
      frameSize: null,
      camera: null,
      scannerModel: null,
      chemistry: null,
    });
  }

  function book(tx: LabTx, ownerId: string, title = "A book") {
    return insertPhotobook(tx, {
      ownerId,
      title,
      slug: randomUUID(),
      artistNote: null,
    });
  }

  async function itemsOf(tx: LabTx, photobookId: string) {
    return tx.execute<{ photo_id: string; position: number }>(sql`
      select photo_id, position from photobook_items
       where photobook_id = ${photobookId}::uuid
       order by position
    `);
  }

  describe("addOwnPhoto", () => {
    it("files your own Photo into your own Photobook", async () => {
      await withRollback(db, async (tx) => {
        const me = await user(tx, "me");
        const mine = await photo(tx, me);
        const shelf = await book(tx, me);

        expect(await addOwnPhoto(tx, shelf, mine, me)).toEqual({ ok: true });

        const items = await itemsOf(tx, shelf);
        expect(items).toHaveLength(1);
        expect(items[0].photo_id).toBe(mine);
      });
    });

    it("refuses the same Photo twice without moving it", async () => {
      await withRollback(db, async (tx) => {
        const me = await user(tx, "me");
        const first = await photo(tx, me);
        const second = await photo(tx, me);
        const shelf = await book(tx, me);

        await addOwnPhoto(tx, shelf, first, me);
        await addOwnPhoto(tx, shelf, second, me);
        expect(await addOwnPhoto(tx, shelf, first, me)).toEqual({
          ok: false,
          reason: "already-there",
        });

        // Position is the curation, so a re-add must not send it to the end.
        const items = await itemsOf(tx, shelf);
        expect(items.map((i) => i.photo_id)).toEqual([first, second]);
      });
    });

    it("refuses somebody else's Photo, and says to connect it", async () => {
      // Not a permission check — anyone may put a public Photo in their book —
      // but a routing one. That path is a Connection, and it carries a credit.
      await withRollback(db, async (tx) => {
        const uploader = await user(tx, "uploader");
        const me = await user(tx, "me");
        const theirs = await photo(tx, uploader);
        const shelf = await book(tx, me);

        expect(await addOwnPhoto(tx, shelf, theirs, me)).toEqual({
          ok: false,
          reason: "not-your-photo",
        });
        expect(await itemsOf(tx, shelf)).toHaveLength(0);
      });
    });

    it("refuses a photobook that is not yours", async () => {
      await withRollback(db, async (tx) => {
        const me = await user(tx, "me");
        const stranger = await user(tx, "stranger");
        const mine = await photo(tx, me);
        const notMine = await book(tx, stranger);

        expect(await addOwnPhoto(tx, notMine, mine, me)).toEqual({
          ok: false,
          reason: "not-your-photobook",
        });
        expect(await itemsOf(tx, notMine)).toHaveLength(0);
      });
    });

    it("refuses a Photo that is not there", async () => {
      await withRollback(db, async (tx) => {
        const me = await user(tx, "me");
        const shelf = await book(tx, me);

        expect(await addOwnPhoto(tx, shelf, randomUUID(), me)).toEqual({
          ok: false,
          reason: "no-such-photo",
        });
      });
    });
  });

  describe("connectPhoto", () => {
    it("connects somebody else's Photo by reference", async () => {
      await withRollback(db, async (tx) => {
        const uploader = await user(tx, "uploader");
        const connector = await user(tx, "connector");
        const theirs = await photo(tx, uploader);
        const mine = await book(tx, connector);

        expect(await connectPhoto(tx, mine, theirs, connector)).toEqual({
          ok: true,
        });

        // By reference: one canonical Photo, a second pointer at it. No copy.
        const photos = await tx.execute<{ count: number }>(sql`
          select count(*)::int as count from photos
        `);
        const items = await itemsOf(tx, mine);
        expect(items).toHaveLength(1);
        expect(items[0].photo_id).toBe(theirs);
        expect(photos[0].count).toBeGreaterThan(0);

        // And it stays the uploader's.
        const owner = await tx.execute<{ owner_id: string }>(sql`
          select owner_id from photos where id = ${theirs}::uuid
        `);
        expect(owner[0].owner_id).toBe(uploader);
      });
    });

    it("refuses a self-connection", async () => {
      // PRD D #12. Connecting your own Photo is a no-op under the reference
      // model — it is already yours — and the surface offers Edit/Delete
      // instead. This is the backstop behind that UI rule.
      await withRollback(db, async (tx) => {
        const me = await user(tx, "me");
        const mine = await photo(tx, me);
        const shelf = await book(tx, me);

        expect(await connectPhoto(tx, shelf, mine, me)).toEqual({
          ok: false,
          reason: "your-own-photo",
        });
        expect(await itemsOf(tx, shelf)).toHaveLength(0);
      });
    });

    it("still lets you curate your own Photo into your own book", async () => {
      // The other half of the rule, and the reason connectPhoto is a separate
      // function rather than appendPhotobookItem with a flag: refusing a
      // self-connection must not refuse ordinary curation.
      await withRollback(db, async (tx) => {
        const me = await user(tx, "me");
        const mine = await photo(tx, me);
        const shelf = await book(tx, me);

        expect(await appendPhotobookItem(tx, shelf, mine, me)).toBe(true);
        expect(await itemsOf(tx, shelf)).toHaveLength(1);
      });
    });

    it("refuses a photobook that is not yours", async () => {
      await withRollback(db, async (tx) => {
        const uploader = await user(tx, "uploader");
        const stranger = await user(tx, "stranger");
        const theirs = await photo(tx, uploader);
        const notMine = await book(tx, uploader);

        expect(await connectPhoto(tx, notMine, theirs, stranger)).toEqual({
          ok: false,
          reason: "not-your-photobook",
        });
      });
    });

    it("gives the same answer for a photobook that does not exist", async () => {
      // So a stranger cannot probe which photobook ids are real.
      await withRollback(db, async (tx) => {
        const connector = await user(tx, "connector");
        expect(
          await connectPhoto(tx, randomUUID(), randomUUID(), connector),
        ).toEqual({ ok: false, reason: "not-your-photobook" });
      });
    });

    it("refuses a photo that does not exist", async () => {
      await withRollback(db, async (tx) => {
        const connector = await user(tx, "connector");
        const mine = await book(tx, connector);

        expect(await connectPhoto(tx, mine, randomUUID(), connector)).toEqual({
          ok: false,
          reason: "no-such-photo",
        });
      });
    });

    it("refuses a second connection of the same photo", async () => {
      await withRollback(db, async (tx) => {
        const uploader = await user(tx, "uploader");
        const connector = await user(tx, "connector");
        const theirs = await photo(tx, uploader);
        const mine = await book(tx, connector);

        expect(await connectPhoto(tx, mine, theirs, connector)).toEqual({
          ok: true,
        });
        expect(await connectPhoto(tx, mine, theirs, connector)).toEqual({
          ok: false,
          reason: "already-connected",
        });
        expect(await itemsOf(tx, mine)).toHaveLength(1);
      });
    });
  });

  describe("removePhotobookItem", () => {
    it("removes the pointer and leaves the Photo alone", async () => {
      // The whole difference between disconnecting and deleting: taking
      // somebody else's work off your shelf must not reach into their profile.
      await withRollback(db, async (tx) => {
        const uploader = await user(tx, "uploader");
        const connector = await user(tx, "connector");
        const theirs = await photo(tx, uploader);
        const mine = await book(tx, connector);
        await connectPhoto(tx, mine, theirs, connector);

        expect(await removePhotobookItem(tx, mine, theirs, connector)).toBe(
          true,
        );
        expect(await itemsOf(tx, mine)).toHaveLength(0);

        const survives = await tx.execute<{ count: number }>(sql`
          select count(*)::int as count from photos where id = ${theirs}::uuid
        `);
        expect(survives[0].count).toBe(1);
      });
    });

    it("will not let a stranger remove from your book", async () => {
      await withRollback(db, async (tx) => {
        const owner = await user(tx, "owner");
        const stranger = await user(tx, "stranger");
        const mine = await photo(tx, owner);
        const shelf = await book(tx, owner);
        await appendPhotobookItem(tx, shelf, mine, owner);

        expect(await removePhotobookItem(tx, shelf, mine, stranger)).toBe(
          false,
        );
        expect(await itemsOf(tx, shelf)).toHaveLength(1);
      });
    });
  });

  describe("reorderPhotobookItems", () => {
    async function threeInABook(tx: LabTx) {
      const owner = await user(tx, "owner");
      const shelf = await book(tx, owner);
      const ids: string[] = [];
      for (let n = 0; n < 3; n++) {
        const id = await photo(tx, owner);
        await appendPhotobookItem(tx, shelf, id, owner);
        ids.push(id);
      }
      return { owner, shelf, ids };
    }

    it("rewrites positions from the order given", async () => {
      await withRollback(db, async (tx) => {
        const { owner, shelf, ids } = await threeInABook(tx);
        expect((await itemsOf(tx, shelf)).map((i) => i.photo_id)).toEqual(ids);

        const reversed = [...ids].reverse();
        expect(await reorderPhotobookItems(tx, shelf, owner, reversed)).toBe(
          true,
        );

        const after = await itemsOf(tx, shelf);
        expect(after.map((i) => i.photo_id)).toEqual(reversed);
        expect(after.map((i) => i.position)).toEqual([0, 1, 2]);
      });
    });

    it("is idempotent — replaying the same order changes nothing", async () => {
      // Which is why it takes the whole order rather than a "move X to N".
      await withRollback(db, async (tx) => {
        const { owner, shelf, ids } = await threeInABook(tx);
        const order = [ids[2], ids[0], ids[1]];

        await reorderPhotobookItems(tx, shelf, owner, order);
        await reorderPhotobookItems(tx, shelf, owner, order);

        expect((await itemsOf(tx, shelf)).map((i) => i.photo_id)).toEqual(
          order,
        );
      });
    });

    it("refuses a subset — the other frames would collide", async () => {
      await withRollback(db, async (tx) => {
        const { owner, shelf, ids } = await threeInABook(tx);
        expect(
          await reorderPhotobookItems(tx, shelf, owner, [ids[1], ids[0]]),
        ).toBe(false);
      });
    });

    it("refuses a duplicate id", async () => {
      await withRollback(db, async (tx) => {
        const { owner, shelf, ids } = await threeInABook(tx);
        expect(
          await reorderPhotobookItems(tx, shelf, owner, [
            ids[0],
            ids[0],
            ids[1],
          ]),
        ).toBe(false);
      });
    });

    it("refuses a photo that is not in the book", async () => {
      await withRollback(db, async (tx) => {
        const { owner, shelf, ids } = await threeInABook(tx);
        const elsewhere = await photo(tx, owner);
        expect(
          await reorderPhotobookItems(tx, shelf, owner, [
            ids[0],
            ids[1],
            elsewhere,
          ]),
        ).toBe(false);
      });
    });

    it("refuses a stranger, even with an empty list", async () => {
      // The empty list is the case that made the ownership check its own read:
      // folded into the UPDATE, zero rows would have read as success.
      await withRollback(db, async (tx) => {
        const { shelf } = await threeInABook(tx);
        const stranger = await user(tx, "stranger");
        expect(await reorderPhotobookItems(tx, shelf, stranger, [])).toBe(
          false,
        );
      });
    });
  });

  describe("photobook CRUD", () => {
    it("appends each new book to the end of the shelf", async () => {
      await withRollback(db, async (tx) => {
        const owner = await user(tx, "owner");
        const first = await book(tx, owner, "First");
        const second = await book(tx, owner, "Second");

        const rows = await tx.execute<{ id: string; position: number }>(sql`
          select id, position from photobooks
           where owner_id = ${owner} order by position
        `);
        expect(rows.map((r) => r.id)).toEqual([first, second]);
        expect(rows.map((r) => r.position)).toEqual([0, 1]);
      });
    });

    it("refuses a slug the owner already used, but not one somebody else did", async () => {
      await withRollback(db, async (tx) => {
        const owner = await user(tx, "owner");
        const slug = "bangkok-overcast";

        await insertPhotobook(tx, {
          ownerId: owner,
          title: "Bangkok Overcast",
          slug,
          artistNote: null,
        });
        await expect(
          insertPhotobook(tx, {
            ownerId: owner,
            title: "Again",
            slug,
            artistNote: null,
          }),
        ).rejects.toThrow();
      });

      // A separate transaction, because the failed insert above aborted the
      // first one — the same slug under a different owner is fine.
      await withRollback(db, async (tx) => {
        const owner = await user(tx, "owner");
        const other = await user(tx, "other");
        await insertPhotobook(tx, {
          ownerId: owner,
          title: "Bangkok Overcast",
          slug: "bangkok-overcast",
          artistNote: null,
        });
        await expect(
          insertPhotobook(tx, {
            ownerId: other,
            title: "Bangkok Overcast",
            slug: "bangkok-overcast",
            artistNote: null,
          }),
        ).resolves.toBeTruthy();
      });
    });

    it("edits and deletes only for the owner", async () => {
      await withRollback(db, async (tx) => {
        const owner = await user(tx, "owner");
        const stranger = await user(tx, "stranger");
        const shelf = await book(tx, owner);

        const edit = {
          title: "Renamed",
          slug: "renamed",
          artistNote: "Two lines.",
        };
        expect(await updatePhotobook(tx, shelf, stranger, edit)).toBe(false);
        expect(await updatePhotobook(tx, shelf, owner, edit)).toBe(true);
        expect(await deletePhotobook(tx, shelf, stranger)).toBe(false);
        expect(await deletePhotobook(tx, shelf, owner)).toBe(true);
      });
    });

    it("takes its items with it, and nobody's Photos", async () => {
      await withRollback(db, async (tx) => {
        const uploader = await user(tx, "uploader");
        const connector = await user(tx, "connector");
        const theirs = await photo(tx, uploader);
        const shelf = await book(tx, connector);
        await connectPhoto(tx, shelf, theirs, connector);

        expect(await deletePhotobook(tx, shelf, connector)).toBe(true);

        const items = await tx.execute<{ count: number }>(sql`
          select count(*)::int as count from photobook_items
           where photobook_id = ${shelf}::uuid
        `);
        const photos = await tx.execute<{ count: number }>(sql`
          select count(*)::int as count from photos where id = ${theirs}::uuid
        `);
        expect(items[0].count).toBe(0);
        // Deleting the shelf must not burn the books.
        expect(photos[0].count).toBe(1);
      });
    });
  });
});
