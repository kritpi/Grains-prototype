import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPhotobook, getProfile } from "@/lib/queries/books";
import { alsoAppearsIn, listGalleryPhotos } from "@/lib/queries/photos";
import { hasDatabase, testClient } from "../db/client";

/**
 * The read side — a profile, a Photobook, a film stock's gallery.
 *
 * These use committed fixtures and clean up afterwards rather than the
 * rolled-back transaction the write tests use, because the functions under test
 * read through the app's own client (`getDb()`) and so cannot see rows held
 * inside somebody else's transaction. Deleting the users at the end takes the
 * photos, photobooks and items with them through the cascade.
 */
describe.skipIf(!hasDatabase)("profile and gallery reads", () => {
  let sql: postgres.Sql;
  const TAG = `grains-test-profile-${randomUUID().slice(0, 8)}`;

  let uploader: string;
  let connector: string;
  let uploaderName: string;
  let connectorName: string;
  let filmStockId: string;
  const photos: string[] = [];
  let ownBook: string;
  let mixedBook: string;

  async function makeUser(who: string) {
    const handle = `${TAG}_${who}`.replace(/-/g, "_");
    const [row] = await sql<{ id: string }[]>`
      insert into users (email, name, username)
      values (${`${TAG}-${who}@grains.invalid`}, ${who}, ${handle})
      returning id
    `;
    return { id: row.id, username: handle };
  }

  async function makePhoto(ownerId: string, stock: string | null) {
    const [row] = await sql<{ id: string }[]>`
      insert into photos (owner_id, storage_key, width, height,
                          film_stock_id, format, frame_size)
      values (${ownerId}, ${`photos/${ownerId}/${randomUUID()}`}, 3000, 2000,
              ${stock}, '135'::film_format, '3:2')
      returning id
    `;
    return row.id;
  }

  async function makeBook(ownerId: string, title: string, position: number) {
    const [row] = await sql<{ id: string }[]>`
      insert into photobooks (owner_id, title, slug, artist_note, position)
      values (${ownerId}, ${title}, ${title.toLowerCase().replace(/\s+/g, "-")},
              ${`Note for ${title}.`}, ${position})
      returning id
    `;
    return row.id;
  }

  async function addItem(bookId: string, photoId: string, position: number) {
    await sql`
      insert into photobook_items (photobook_id, photo_id, position)
      values (${bookId}, ${photoId}, ${position})
    `;
  }

  beforeAll(async () => {
    sql = testClient();

    const a = await makeUser("uploader");
    const b = await makeUser("connector");
    uploader = a.id;
    uploaderName = a.username;
    connector = b.id;
    connectorName = b.username;

    const [stock] = await sql<{ id: string }[]>`
      insert into film_stocks (name, iso, formats, created_by)
      values (${`${TAG} Film`}, 400, '{135}'::film_format[], ${uploader})
      returning id
    `;
    filmStockId = stock.id;

    // Five of the uploader's photos on the stock, created in a known order so
    // the gallery's "newest first" is actually assertable.
    for (let n = 0; n < 5; n++) {
      const id = await makePhoto(uploader, filmStockId);
      // make_interval rather than string concatenation: the driver sends a
      // typed parameter, and `int || text` would depend on how it types it.
      await sql`
        update photos
           set created_at = now() - make_interval(mins => ${5 - n})
         where id = ${id}
      `;
      photos.push(id);
    }

    // Book one: four of the uploader's own, then the first removed, so the
    // cover has to come from row_number() rather than positions 0-2.
    ownBook = await makeBook(uploader, "Own Book", 0);
    await addItem(ownBook, photos[0], 0);
    await addItem(ownBook, photos[1], 1);
    await addItem(ownBook, photos[2], 2);
    await addItem(ownBook, photos[3], 3);
    await sql`
      delete from photobook_items
       where photobook_id = ${ownBook} and photo_id = ${photos[0]}
    `;

    // Book two belongs to the connector and holds one of their own plus two
    // Connections — the mixed case the card counts have to get right.
    const theirOwn = await makePhoto(connector, null);
    mixedBook = await makeBook(connector, "Mixed Book", 0);
    await addItem(mixedBook, theirOwn, 0);
    await addItem(mixedBook, photos[4], 1);
    await addItem(mixedBook, photos[3], 2);
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from film_stocks where name like ${`${TAG}%`}`;
    await sql`delete from users where email like ${`${TAG}%`}`;
    await sql.end();
  });

  describe("getProfile", () => {
    it("is null for a username nobody has claimed", async () => {
      expect(await getProfile(`${TAG}-nobody`)).toBeNull();
    });

    it("finds a profile regardless of the case typed", async () => {
      const found = await getProfile(uploaderName.toUpperCase());
      expect(found?.id).toBe(uploader);
    });

    it("counts every item, and how many are somebody else's", async () => {
      const profile = await getProfile(connectorName);
      const card = profile!.photobooks.find((b) => b.id === mixedBook)!;

      expect(card.itemCount).toBe(3);
      // Their own one does not count as connected; the uploader's two do.
      expect(card.connectedCount).toBe(2);
      expect(card.artistNote).toBe("Note for Mixed Book.");
    });

    it("takes the first three items as the cover, not positions 0-2", async () => {
      // Position 0 was removed, so a `position < 3` cover would return two
      // frames and put a hole in the mosaic.
      const profile = await getProfile(uploaderName);
      const card = profile!.photobooks.find((b) => b.id === ownBook)!;

      expect(card.itemCount).toBe(3);
      expect(card.cover).toHaveLength(3);
      expect(card.cover[0].width).toBe(3000);
    });

    it("lists a person with no photobooks as empty rather than missing", async () => {
      const lonely = await makeUser("lonely");
      const profile = await getProfile(lonely.username);
      expect(profile).not.toBeNull();
      expect(profile!.photobooks).toEqual([]);
    });
  });

  describe("getPhotobook", () => {
    it("is null when either half of the URL is wrong", async () => {
      expect(await getPhotobook(uploaderName, "no-such-slug")).toBeNull();
      expect(await getPhotobook(`${TAG}-nobody`, "mixed-book")).toBeNull();
      // The slug exists, but under a different owner.
      expect(await getPhotobook(uploaderName, "mixed-book")).toBeNull();
    });

    it("marks somebody else's Photos as connected and its own as not", async () => {
      const found = await getPhotobook(connectorName, "mixed-book");
      expect(found!.items).toHaveLength(3);

      const connected = found!.items.filter((item) => item.connected);
      expect(connected).toHaveLength(2);
      // The credit line is the uploader's handle, never the book owner's.
      expect(connected.every((i) => i.uploaderUsername === uploaderName)).toBe(
        true,
      );
      expect(found!.items.filter((i) => !i.connected)[0].uploaderUsername).toBe(
        connectorName,
      );
    });

    it("returns items in position order with their caption fields", async () => {
      const found = await getPhotobook(connectorName, "mixed-book");
      expect(found!.items.map((i) => i.position)).toEqual([0, 1, 2]);
      expect(found!.items[0].frameSize).toBe("3:2");
      expect(found!.items[0].format).toBe("135");
    });
  });

  describe("listGalleryPhotos", () => {
    it("is newest first", async () => {
      const page = await listGalleryPhotos(filmStockId);
      expect(page.photos).toHaveLength(5);
      // photos[] was created oldest-first, so the gallery reverses it.
      expect(page.photos.map((p) => p.id)).toEqual([...photos].reverse());
      expect(page.nextCursor).toBeNull();
    });

    it("pages without repeating or skipping a photo", async () => {
      const first = await listGalleryPhotos(filmStockId, null, 2);
      expect(first.photos).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      const second = await listGalleryPhotos(filmStockId, first.nextCursor, 2);
      const third = await listGalleryPhotos(filmStockId, second.nextCursor, 2);

      const seen = [...first.photos, ...second.photos, ...third.photos].map(
        (p) => p.id,
      );
      expect(seen).toEqual([...photos].reverse());
      expect(new Set(seen).size).toBe(5);
      expect(third.nextCursor).toBeNull();
    });

    it("treats a corrupted cursor as no cursor", async () => {
      // The honest answer to a mangled scroll position is the first page.
      const page = await listGalleryPhotos(filmStockId, "not-a-cursor");
      expect(page.photos).toHaveLength(5);
    });

    it("carries the uploader's handle for the credit line", async () => {
      const page = await listGalleryPhotos(filmStockId, null, 1);
      expect(page.photos[0].uploaderUsername).toBe(uploaderName);
    });
  });

  describe("alsoAppearsIn", () => {
    it("counts across users, not just the viewer's own books", async () => {
      // photos[3] is in the uploader's own book and in the connector's.
      // Deriving this from one viewer's connections would print 1.
      expect(await alsoAppearsIn(photos[3])).toBe(2);
      expect(await alsoAppearsIn(photos[4])).toBe(1);
      expect(await alsoAppearsIn(photos[0])).toBe(0);
    });
  });
});
