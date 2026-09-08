import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { hasDatabase, testClient } from "../db/client";

/**
 * The photobook Server Actions, run for real against grains-dev.
 *
 * These cannot roll back the way the query tests do: an action opens its own
 * transaction, and that is part of what is under test. So the fixtures are
 * created here, committed, and torn down afterwards — deleting the two users
 * takes their photos, photobooks and items with them through the cascade.
 *
 * `requireUser` and `revalidatePath` are the two things an action does that need
 * a request behind them, so they are the two things mocked, exactly as
 * tests/actions/lab-actions.test.ts does it. The transaction, the constraints
 * and every ownership rule are real.
 */

const seeded = { userId: "", username: "" };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({
    id: seeded.userId,
    username: seeded.username,
    name: "Tester",
  })),
}));

const {
  addToPhotobook,
  createPhotobook,
  deletePhotobook,
  removeFromPhotobook,
  reorderPhotobook,
  updatePhotobook,
} = await import("@/app/u/actions");

describe.skipIf(!hasDatabase)("photobook actions", () => {
  let sql: postgres.Sql;
  const TAG = `pbact-${randomUUID().slice(0, 8)}`;

  let strangerId: string;
  const books: string[] = [];

  async function makeUser(who: string) {
    const handle = `${TAG}_${who}`.replace(/-/g, "_");
    const rows = await sql<{ id: string }[]>`
      insert into users (email, name, username)
      values (${`${TAG}-${who}@grains.invalid`}, ${who}, ${handle})
      returning id
    `;
    return { id: rows[0].id, username: handle };
  }

  async function makePhoto(ownerId: string) {
    const rows = await sql<{ id: string }[]>`
      insert into photos (owner_id, storage_key, width, height)
      values (${ownerId}, ${`photos/${ownerId}/${randomUUID()}`}, 3000, 2000)
      returning id
    `;
    return rows[0].id;
  }

  async function create(title: string) {
    const result = await createPhotobook({ title });
    if (!result.ok) throw new Error(`create failed: ${JSON.stringify(result)}`);
    books.push(result.id);
    return result;
  }

  beforeAll(async () => {
    sql = testClient();
    const me = await makeUser("owner");
    seeded.userId = me.id;
    seeded.username = me.username;
    strangerId = (await makeUser("stranger")).id;
  });

  afterEach(async () => {
    if (books.length === 0) return;
    const ids = books.splice(0);
    await sql`delete from photobooks where id in ${sql(ids)}`;
  });

  afterAll(async () => {
    if (sql) {
      await sql`delete from users where email like ${`${TAG}%`}`;
      await sql.end();
    }
  });

  describe("createPhotobook", () => {
    it("mints a slug from the title", async () => {
      const made = await create("Bangkok Overcast");
      expect(made.slug).toBe("bangkok-overcast");
    });

    it("numbers a second book with the same title", async () => {
      await create("Silver Sunday");
      const second = await create("Silver Sunday");
      expect(second.slug).toBe("silver-sunday-2");
    });

    it("refuses a title that is only whitespace", async () => {
      const result = await createPhotobook({ title: "   " });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("invalid");
    });

    it("still produces an address for a title with no letters", async () => {
      const made = await create("!!!");
      expect(made.slug).toBe("book");
    });

    it("stores an empty note as absent rather than as an empty note", async () => {
      const made = await create("With No Note");
      const rows = await sql<{ artist_note: string | null }[]>`
        select artist_note from photobooks where id = ${made.id}
      `;
      expect(rows[0].artist_note).toBeNull();
    });

    it("refuses an artist's note longer than the form allows", async () => {
      const result = await createPhotobook({
        title: "Long Note",
        artistNote: "x".repeat(301),
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("updatePhotobook", () => {
    it("renames without moving the address", async () => {
      // The decision this pins: a profile is something people share, so a
      // rename must not turn every existing link into a 404.
      const made = await create("First Name");
      const result = await updatePhotobook(made.id, made.slug, {
        title: "Second Name",
        artistNote: "Two lines, about the set.",
      });
      expect(result.ok).toBe(true);

      const rows = await sql<{ title: string; slug: string }[]>`
        select title, slug from photobooks where id = ${made.id}
      `;
      expect(rows[0].title).toBe("Second Name");
      expect(rows[0].slug).toBe("first-name");
    });

    it("refuses somebody else's photobook", async () => {
      const rows = await sql<{ id: string }[]>`
        insert into photobooks (owner_id, title, slug)
        values (${strangerId}, 'Theirs', ${randomUUID()}) returning id
      `;
      const result = await updatePhotobook(rows[0].id, "theirs", {
        title: "Mine now",
      });
      expect(result.ok).toBe(false);
      await sql`delete from photobooks where id = ${rows[0].id}`;
    });
  });

  describe("addToPhotobook — the Connection", () => {
    it("connects somebody else's photo, by reference", async () => {
      const made = await create("Connections");
      const theirs = await makePhoto(strangerId);

      expect(await addToPhotobook(made.id, theirs)).toEqual({ ok: true });

      const owner = await sql<{ owner_id: string }[]>`
        select owner_id from photos where id = ${theirs}
      `;
      // The Photo stays theirs; nothing was copied.
      expect(owner[0].owner_id).toBe(strangerId);
    });

    it("says specifically that a photo is already in the book", async () => {
      const made = await create("Twice");
      const theirs = await makePhoto(strangerId);
      await addToPhotobook(made.id, theirs);

      const again = await addToPhotobook(made.id, theirs);
      expect(again.ok).toBe(false);
      if (!again.ok && again.reason === "rejected") {
        expect(again.message).toMatch(/already in this photobook/i);
      }
    });

    it("refuses a self-connection with its own sentence", async () => {
      const made = await create("Mine");
      const mine = await makePhoto(seeded.userId);

      const result = await addToPhotobook(made.id, mine);
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === "rejected") {
        expect(result.message).toMatch(/already yours/i);
      }
    });

    it("refuses a photobook that is not yours", async () => {
      const rows = await sql<{ id: string }[]>`
        insert into photobooks (owner_id, title, slug)
        values (${strangerId}, 'Theirs', ${randomUUID()}) returning id
      `;
      const theirs = await makePhoto(strangerId);
      const result = await addToPhotobook(rows[0].id, theirs);
      expect(result.ok).toBe(false);
      await sql`delete from photobooks where id = ${rows[0].id}`;
    });

    it("rejects a malformed id rather than throwing", async () => {
      const made = await create("Malformed");
      const result = await addToPhotobook(made.id, "not-a-uuid");
      expect(result.ok).toBe(false);
    });
  });

  describe("removeFromPhotobook", () => {
    it("removes the pointer and leaves the photo alone", async () => {
      const made = await create("Remove");
      const theirs = await makePhoto(strangerId);
      await addToPhotobook(made.id, theirs);

      expect(await removeFromPhotobook(made.id, theirs)).toEqual({ ok: true });

      const survives = await sql<{ count: number }[]>`
        select count(*)::int as count from photos where id = ${theirs}
      `;
      expect(survives[0].count).toBe(1);
    });

    it("refuses a photo that was never in the book", async () => {
      const made = await create("Absent");
      const theirs = await makePhoto(strangerId);
      const result = await removeFromPhotobook(made.id, theirs);
      expect(result.ok).toBe(false);
    });
  });

  describe("reorderPhotobook", () => {
    async function bookOfThree() {
      const made = await create("Ordered");
      const ids: string[] = [];
      for (let n = 0; n < 3; n++) {
        const id = await makePhoto(strangerId);
        await addToPhotobook(made.id, id);
        ids.push(id);
      }
      return { made, ids };
    }

    it("applies the order it is given", async () => {
      const { made, ids } = await bookOfThree();
      const reversed = [...ids].reverse();

      expect(await reorderPhotobook(made.id, reversed)).toEqual({ ok: true });

      const rows = await sql<{ photo_id: string }[]>`
        select photo_id from photobook_items
         where photobook_id = ${made.id} order by position
      `;
      expect(rows.map((r) => r.photo_id)).toEqual(reversed);
    });

    it("refuses a partial order and says to reload", async () => {
      const { made, ids } = await bookOfThree();
      const result = await reorderPhotobook(made.id, [ids[0], ids[1]]);
      expect(result.ok).toBe(false);
      if (!result.ok && result.reason === "rejected") {
        expect(result.message).toMatch(/reload/i);
      }
    });

    it("refuses a list that is not uuids at all", async () => {
      const { made } = await bookOfThree();
      const result = await reorderPhotobook(made.id, ["first", "second"]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("invalid");
    });
  });

  describe("deletePhotobook", () => {
    it("takes its items and nobody's photos", async () => {
      const made = await create("Doomed");
      const theirs = await makePhoto(strangerId);
      await addToPhotobook(made.id, theirs);

      expect(await deletePhotobook(made.id)).toEqual({ ok: true });
      books.splice(books.indexOf(made.id), 1);

      const items = await sql<{ count: number }[]>`
        select count(*)::int as count from photobook_items
         where photobook_id = ${made.id}
      `;
      const photo = await sql<{ count: number }[]>`
        select count(*)::int as count from photos where id = ${theirs}
      `;
      expect(items[0].count).toBe(0);
      // Deleting the shelf must not burn the books.
      expect(photo[0].count).toBe(1);
    });

    it("refuses somebody else's", async () => {
      const rows = await sql<{ id: string }[]>`
        insert into photobooks (owner_id, title, slug)
        values (${strangerId}, 'Theirs', ${randomUUID()}) returning id
      `;
      expect((await deletePhotobook(rows[0].id)).ok).toBe(false);
      await sql`delete from photobooks where id = ${rows[0].id}`;
    });
  });
});
