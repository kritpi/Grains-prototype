import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pendingKey, photoKey } from "@/lib/photos/keys";
import { appendPhotobookItem } from "@/lib/queries/books";
import {
  countOriginals,
  deletePhoto,
  insertPhoto,
  updatePhotoMetadata,
} from "@/lib/queries/photos";
import type { LabTx } from "@/lib/queries/lab-edits";
import { hasDatabase } from "../db/client";
import { testDb, withRollback, type TestDb } from "../db/tx";

/**
 * The rules the cap and the Connection model depend on, asserted against a real
 * database rather than a mock — the whole point of PRD D #5 is a count, and a
 * count is exactly the thing a mock cannot get wrong on your behalf.
 *
 * Everything runs inside a transaction that is rolled back, so three tracks can
 * share one `grains-dev` and a failure leaves no wreckage.
 */
describe.skipIf(!hasDatabase)("photos", () => {
  let db: TestDb;
  let end: () => Promise<void>;

  beforeAll(() => {
    ({ db, end } = testDb());
  });

  afterAll(async () => {
    if (end) await end();
  });

  /** Two people, created inside the caller's transaction. */
  async function twoUsers(tx: LabTx) {
    const ids: string[] = [];
    for (const who of ["uploader", "connector"]) {
      const tag = randomUUID().replace(/-/g, "").slice(0, 12);
      const rows = await tx.execute<{ id: string }>(sql`
        insert into users (email, name, username)
        values (${`${who}-${tag}@grains.test`}, ${who}, ${`${who}_${tag}`})
        returning id
      `);
      ids.push(rows[0].id);
    }
    return { uploader: ids[0], connector: ids[1] };
  }

  function newPhoto(ownerId: string) {
    return {
      ownerId,
      storageKey: photoKey(ownerId, randomUUID()),
      width: 2000,
      height: 1333,
      filmStockId: null,
      format: null,
      frameSize: null,
      camera: null,
      scannerModel: null,
      chemistry: null,
    };
  }

  async function newPhotobook(tx: LabTx, ownerId: string) {
    const rows = await tx.execute<{ id: string }>(sql`
      insert into photobooks (owner_id, title, slug)
      values (${ownerId}, 'Test book', ${randomUUID()})
      returning id
    `);
    return rows[0].id;
  }

  it("counts originals only — a Connection is not an upload", async () => {
    await withRollback(db, async (tx) => {
      const { uploader, connector } = await twoUsers(tx);

      await insertPhoto(tx, newPhoto(uploader));
      await insertPhoto(tx, newPhoto(uploader));
      const theirs = await insertPhoto(tx, newPhoto(connector));

      // The connector saves somebody else's Photo into their own Photobook.
      // This is the entire Connection mechanic: a row in photobook_items, no
      // second Photo, no storage.
      const book = await newPhotobook(tx, connector);
      expect(await appendPhotobookItem(tx, book, theirs, connector)).toBe(true);

      // PRD D #5: Connections are pointers and are explicitly not capped.
      expect(await countOriginals(uploader, tx)).toBe(2);
      expect(await countOriginals(connector, tx)).toBe(1);
    });
  });

  it("counts nothing for somebody who has uploaded nothing", async () => {
    await withRollback(db, async (tx) => {
      const { connector } = await twoUsers(tx);
      expect(await countOriginals(connector, tx)).toBe(0);
    });
  });

  it("refuses a second row for the same object", async () => {
    // storage_key is UNIQUE, which is what makes a replayed confirm safe.
    await withRollback(db, async (tx) => {
      const { uploader } = await twoUsers(tx);
      const photo = newPhoto(uploader);

      await insertPhoto(tx, photo);
      await expect(insertPhoto(tx, photo)).rejects.toThrow();
    });
  });

  it("deletes a Photo out of every Photobook that connected it", async () => {
    // PRD D #8, silent removal: the slot disappears everywhere and the grid
    // re-flows as though the Connection never existed. No tombstone.
    await withRollback(db, async (tx) => {
      const { uploader, connector } = await twoUsers(tx);
      const photo = await insertPhoto(tx, newPhoto(uploader));

      const mine = await newPhotobook(tx, uploader);
      const theirs = await newPhotobook(tx, connector);
      await appendPhotobookItem(tx, mine, photo, uploader);
      await appendPhotobookItem(tx, theirs, photo, connector);

      const before = await tx.execute<{ count: number }>(sql`
        select count(*)::int as count from photobook_items
         where photo_id = ${photo}::uuid
      `);
      expect(before[0].count).toBe(2);

      expect(await deletePhoto(tx, photo, uploader)).not.toBeNull();

      const after = await tx.execute<{ count: number }>(sql`
        select count(*)::int as count from photobook_items
         where photo_id = ${photo}::uuid
      `);
      expect(after[0].count).toBe(0);
    });
  });

  it("will not let a non-owner delete or edit a Photo", async () => {
    await withRollback(db, async (tx) => {
      const { uploader, connector } = await twoUsers(tx);
      const photo = await insertPhoto(tx, newPhoto(uploader));

      // Ownership is in the WHERE clause, so a stranger changes zero rows
      // rather than racing a check.
      expect(await deletePhoto(tx, photo, connector)).toBeNull();
      expect(
        await updatePhotoMetadata(tx, photo, connector, {
          filmStockId: null,
          format: "135",
          frameSize: null,
          camera: "not theirs",
          scannerModel: null,
          chemistry: null,
        }),
      ).toBe(false);

      expect(await countOriginals(uploader, tx)).toBe(1);
    });
  });
});

describe.skipIf(!hasDatabase)("appendPhotobookItem", () => {
  let db: TestDb;
  let end: () => Promise<void>;

  beforeAll(() => {
    ({ db, end } = testDb());
  });

  afterAll(async () => {
    if (end) await end();
  });

  it("appends in order, and does not move a photo already there", async () => {
    await withRollback(db, async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        insert into users (email, name, username)
        values (${`owner-${randomUUID()}@grains.test`}, 'owner',
                ${`owner_${randomUUID().replace(/-/g, "").slice(0, 12)}`})
        returning id
      `);
      const owner = rows[0].id;

      const book = await tx.execute<{ id: string }>(sql`
        insert into photobooks (owner_id, title, slug)
        values (${owner}, 'Book', ${randomUUID()}) returning id
      `);
      const bookId = book[0].id;

      const first = await insertPhoto(tx, {
        ownerId: owner,
        storageKey: photoKey(owner, randomUUID()),
        width: 1,
        height: 1,
        filmStockId: null,
        format: null,
        frameSize: null,
        camera: null,
        scannerModel: null,
        chemistry: null,
      });
      const second = await insertPhoto(tx, {
        ownerId: owner,
        storageKey: photoKey(owner, randomUUID()),
        width: 1,
        height: 1,
        filmStockId: null,
        format: null,
        frameSize: null,
        camera: null,
        scannerModel: null,
        chemistry: null,
      });

      expect(await appendPhotobookItem(tx, bookId, first, owner)).toBe(true);
      expect(await appendPhotobookItem(tx, bookId, second, owner)).toBe(true);
      // Already there: left where it is rather than jumping to the end.
      expect(await appendPhotobookItem(tx, bookId, first, owner)).toBe(false);

      const positions = await tx.execute<{
        photo_id: string;
        position: number;
      }>(
        sql`select photo_id, position from photobook_items
             where photobook_id = ${bookId}::uuid order by position`,
      );
      expect(positions.map((r) => r.position)).toEqual([0, 1]);
      expect(positions[0].photo_id).toBe(first);
    });
  });

  it("appends nothing to a photobook that is not yours", async () => {
    await withRollback(db, async (tx) => {
      const made: string[] = [];
      for (const who of ["a", "b"]) {
        const rows = await tx.execute<{ id: string }>(sql`
          insert into users (email, name, username)
          values (${`${who}-${randomUUID()}@grains.test`}, ${who},
                  ${`${who}_${randomUUID().replace(/-/g, "").slice(0, 12)}`})
          returning id
        `);
        made.push(rows[0].id);
      }
      const [owner, stranger] = made;

      const book = await tx.execute<{ id: string }>(sql`
        insert into photobooks (owner_id, title, slug)
        values (${owner}, 'Book', ${randomUUID()}) returning id
      `);
      const photo = await insertPhoto(tx, {
        ownerId: stranger,
        storageKey: pendingKey(stranger),
        width: 1,
        height: 1,
        filmStockId: null,
        format: null,
        frameSize: null,
        camera: null,
        scannerModel: null,
        chemistry: null,
      });

      expect(await appendPhotobookItem(tx, book[0].id, photo, stranger)).toBe(
        false,
      );
    });
  });
});
