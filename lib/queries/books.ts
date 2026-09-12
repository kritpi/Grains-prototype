import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import type { FilmFormat } from "@/lib/labs/paths";
import type { LabTx } from "@/lib/queries/lab-edits";

/**
 * Photobooks and their items.
 *
 * The one idea to hold on to: **an item whose photo belongs to someone other
 * than the photobook's owner is a Connection.** There is no second table and no
 * `is_connection` flag — it is a fact about who owns what, derived at read time
 * by comparing two owner ids. Anything here that stores that relationship
 * rather than deriving it has misunderstood the model, and would drift the
 * moment a Photo is deleted.
 *
 * That is also why the cascade does the hard part for free: deleting a Photo
 * removes every pointer to it, in every other person's Photobook, with no
 * tombstone (PRD D #8).
 */

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type PhotobookCard = {
  id: string;
  title: string;
  slug: string;
  artistNote: string | null;
  /** Every item, own and connected. The wireframe's "14 Photos". */
  itemCount: number;
  /** Of those, how many are somebody else's work. The "· 5 connected". */
  connectedCount: number;
  /**
   * The first three items, in order. A cover is a 3-up mosaic rather than one
   * cropped frame, because a Photobook is a set and mixed aspect ratios are
   * what it actually looks like (gap plan J7).
   */
  cover: { storageKey: string; width: number; height: number }[];
};

export type Profile = {
  id: string;
  username: string;
  name: string | null;
  image: string | null;
  photobooks: PhotobookCard[];
};

/**
 * A public profile — `/u/@username`.
 *
 * Photobooks only. A Photo belonging to no Photobook is live and
 * Gallery-eligible (PRD D #4) but has nowhere to surface here; that is a known
 * open question rather than an omission (gap plan J11, PRD D #10's open
 * sub-question), and this function will need a second list when it is settled.
 *
 * There is no bio: `users` has `name` and `image` and nothing else, so the
 * prototype's bio line has no column behind it.
 *
 * No viewer parameter, deliberately. Visitor and owner see the same Photobooks
 * — what differs is the cap meter and the edit affordances, which are the
 * caller's to add from `countOriginals` and the session. Nothing here is
 * private, so nothing here needs to know who is asking.
 */
export async function getProfile(username: string): Promise<Profile | null> {
  const owners = await getDb().execute<{
    id: string;
    username: string;
    name: string | null;
    image: string | null;
  }>(sql`
    select id, username, name, image
      from users
     where lower(username) = lower(${username})
  `);

  const owner = owners[0];
  if (!owner) return null;

  const books = await getDb().execute<{
    id: string;
    title: string;
    slug: string;
    artist_note: string | null;
    item_count: number;
    connected_count: number;
  }>(sql`
    select b.id, b.title, b.slug, b.artist_note,
           (select count(*)::int
              from photobook_items i
             where i.photobook_id = b.id) as item_count,
           -- A Connection is an item whose photo is not the book owner's.
           (select count(*)::int
              from photobook_items i
              join photos p on p.id = i.photo_id
             where i.photobook_id = b.id
               and p.owner_id <> b.owner_id) as connected_count
      from photobooks b
     where b.owner_id = ${owner.id}
     order by b.position, b.created_at
  `);

  const cover = await coversFor(books.map((book) => book.id));

  return {
    id: owner.id,
    username: owner.username,
    name: owner.name,
    image: owner.image,
    photobooks: books.map((book) => ({
      id: book.id,
      title: book.title,
      slug: book.slug,
      artistNote: book.artist_note,
      itemCount: book.item_count,
      connectedCount: book.connected_count,
      cover: cover.get(book.id) ?? [],
    })),
  };
}

/**
 * The first three photos of each book, in one statement.
 *
 * `row_number()` rather than `position < 3`: positions are not contiguous once
 * anything has been removed, so the first three *items* and positions 0–2 are
 * different sets. One query for every book rather than one per book, because
 * the pool is five connections and a profile with eight Photobooks would
 * otherwise fan out into eight.
 */
async function coversFor(
  photobookIds: string[],
): Promise<
  Map<string, { storageKey: string; width: number; height: number }[]>
> {
  const covers = new Map<
    string,
    { storageKey: string; width: number; height: number }[]
  >();
  if (photobookIds.length === 0) return covers;

  const rows = await getDb().execute<{
    photobook_id: string;
    storage_key: string;
    width: number;
    height: number;
  }>(sql`
    select photobook_id, storage_key, width, height
      from (
        select i.photobook_id, p.storage_key, p.width, p.height,
               row_number() over (partition by i.photobook_id
                                      order by i.position, i.created_at) as rn
          from photobook_items i
          join photos p on p.id = i.photo_id
         where i.photobook_id = any(${sql.param(photobookIds)}::uuid[])
      ) ranked
     where rn <= 3
     order by photobook_id, rn
  `);

  for (const row of rows) {
    const list = covers.get(row.photobook_id) ?? [];
    list.push({
      storageKey: row.storage_key,
      width: row.width,
      height: row.height,
    });
    covers.set(row.photobook_id, list);
  }
  return covers;
}

export type PhotobookItem = {
  photoId: string;
  position: number;
  storageKey: string;
  width: number;
  height: number;
  /** The two-line caption under each frame: "3:2 · 135". */
  frameSize: string | null;
  format: FilmFormat | null;
  uploaderId: string;
  uploaderUsername: string | null;
  /**
   * Whether this is somebody else's Photo — the "via @uploader" credit.
   *
   * Derived, never stored. An own Photo shows no credit line at all; a
   * Connected one shows the uploader's handle (gap plan K3).
   */
  connected: boolean;
};

export type PhotobookDetail = {
  id: string;
  title: string;
  slug: string;
  artistNote: string | null;
  ownerId: string;
  ownerUsername: string | null;
  items: PhotobookItem[];
};

/**
 * One Photobook, with everything the grid and the in-book photo view need.
 *
 * Addressed by `(username, slug)` rather than by id, because that is the URL —
 * `/u/@someone/bangkok-overcast` — and resolving it in one statement means a
 * wrong username and a wrong slug both 404 the same way instead of leaking
 * which half was right.
 *
 * The items come back in full rather than paginated. A Photobook is a curated
 * set, not a feed: the cap is 50 originals, and the whole point of the artist's
 * note is that a person read the set as one thing.
 */
export async function getPhotobook(
  username: string,
  slug: string,
): Promise<PhotobookDetail | null> {
  const books = await getDb().execute<{
    id: string;
    title: string;
    slug: string;
    artist_note: string | null;
    owner_id: string;
    owner_username: string | null;
  }>(sql`
    select b.id, b.title, b.slug, b.artist_note,
           b.owner_id, u.username as owner_username
      from photobooks b
      join users u on u.id = b.owner_id
     where lower(u.username) = lower(${username})
       and b.slug = ${slug}
  `);

  const book = books[0];
  if (!book) return null;

  const items = await getDb().execute<{
    photo_id: string;
    position: number;
    storage_key: string;
    width: number;
    height: number;
    frame_size: string | null;
    format: FilmFormat | null;
    uploader_id: string;
    uploader_username: string | null;
  }>(sql`
    select i.photo_id, i.position, p.storage_key, p.width, p.height,
           p.frame_size, p.format,
           p.owner_id as uploader_id, u.username as uploader_username
      from photobook_items i
      join photos p on p.id = i.photo_id
      join users u on u.id = p.owner_id
     where i.photobook_id = ${book.id}::uuid
     order by i.position, i.created_at
  `);

  return {
    id: book.id,
    title: book.title,
    slug: book.slug,
    artistNote: book.artist_note,
    ownerId: book.owner_id,
    ownerUsername: book.owner_username,
    items: items.map((row) => ({
      photoId: row.photo_id,
      position: row.position,
      storageKey: row.storage_key,
      width: row.width,
      height: row.height,
      frameSize: row.frame_size,
      format: row.format,
      uploaderId: row.uploader_id,
      uploaderUsername: row.uploader_username,
      connected: row.uploader_id !== book.owner_id,
    })),
  };
}

export type ConnectTarget = {
  id: string;
  title: string;
  slug: string;
  /** Whether this Photo is already in it, so the sheet opens with it ticked. */
  contains: boolean;
};

/**
 * The viewer's own Photobooks, each marked with whether it already holds this
 * Photo — everything the Connect sheet needs in one statement.
 *
 * The sheet is multi-select and disconnects through the same control, so it has
 * to render the current state rather than only offer an action; a sheet that
 * could add but not show what was already there would make "connect" look
 * idempotent and "disconnect" look impossible (gap plan L1).
 */
export async function listPhotobooksForConnect(
  ownerId: string,
  photoId: string,
): Promise<ConnectTarget[]> {
  const rows = await getDb().execute<{
    id: string;
    title: string;
    slug: string;
    contains: boolean;
  }>(sql`
    select b.id, b.title, b.slug,
           exists (select 1 from photobook_items i
                    where i.photobook_id = b.id
                      and i.photo_id = ${photoId}::uuid) as contains
      from photobooks b
     where b.owner_id = ${ownerId}
     order by b.position, b.created_at
  `);
  return rows;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * The owner's slugs that could collide with `base` — `base` itself and anything
 * shaped `base-2`, `base-3`.
 *
 * A read that informs a write, so it takes the caller's transaction: the gap
 * between choosing a slug and inserting it is where a duplicate is born, and
 * keeping both inside one transaction makes that gap as small as it can be
 * without a lock. It does not close it — `(owner_id, slug)` is UNIQUE and stays
 * the arbiter, and the action retries when the database disagrees.
 *
 * `base` comes from `slugify`, which emits only letters, numbers, marks and
 * hyphens, so it can carry no LIKE wildcard. Nothing here escapes one.
 */
export async function slugsStartingWith(
  tx: LabTx,
  ownerId: string,
  base: string,
): Promise<string[]> {
  const rows = await tx.execute<{ slug: string }>(sql`
    select slug from photobooks
     where owner_id = ${ownerId}
       and (slug = ${base} or slug like ${base + "-%"})
  `);
  return rows.map((row) => row.slug);
}

export type NewPhotobook = {
  ownerId: string;
  title: string;
  slug: string;
  artistNote: string | null;
};

/**
 * Create a Photobook at the end of the owner's shelf.
 *
 * The position is computed in the same statement that inserts, so two books
 * created at once cannot both read the same maximum. `(owner_id, slug)` is
 * UNIQUE, which is what refuses a duplicate slug — a check here would race.
 */
export async function insertPhotobook(
  tx: LabTx,
  input: NewPhotobook,
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into photobooks (owner_id, title, slug, artist_note, position)
    values (
      ${input.ownerId}, ${input.title}, ${input.slug}, ${input.artistNote},
      coalesce((select max(position) + 1 from photobooks
                 where owner_id = ${input.ownerId}), 0)
    )
    returning id
  `);
  return rows[0].id;
}

export type PhotobookEdit = {
  title: string;
  slug: string;
  artistNote: string | null;
};

/**
 * Rewrite a Photobook's own fields. Owner only, in the WHERE clause.
 *
 * `updated_at` is set here rather than by a trigger, matching how the rest of
 * the schema is written: the migration declares the column with a default and
 * nothing keeps it current on its own.
 */
export async function updatePhotobook(
  tx: LabTx,
  id: string,
  ownerId: string,
  input: PhotobookEdit,
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update photobooks
       set title = ${input.title},
           slug = ${input.slug},
           artist_note = ${input.artistNote},
           updated_at = now()
     where id = ${id}::uuid and owner_id = ${ownerId}
    returning id
  `);
  return rows.length === 1;
}

/**
 * Delete a Photobook.
 *
 * Its items go with it through the cascade, and **no Photo is touched** — not
 * the owner's own, and certainly not the ones Connected from other people. A
 * Photobook is a curation of pointers; deleting the shelf does not burn the
 * books. Deleting a Photo is the other direction and is `deletePhoto`.
 */
export async function deletePhotobook(
  tx: LabTx,
  id: string,
  ownerId: string,
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    delete from photobooks
     where id = ${id}::uuid and owner_id = ${ownerId}
    returning id
  `);
  return rows.length === 1;
}

/**
 * Append a Photo the caller already owns to a Photobook they own.
 *
 * The upload path's helper: `confirmPhoto` calls it when somebody uploads from
 * inside one of their own Photobooks. It is *not* the Connection — see
 * `connectPhoto`, which is the same insert under a different rule.
 *
 * Ownership is a subquery inside the INSERT rather than a preceding read, so a
 * photobook belonging to somebody else inserts nothing instead of racing a
 * check, and the position is computed in the same statement so two concurrent
 * appends cannot both read the same maximum.
 *
 * `ON CONFLICT DO NOTHING` because the primary key is (photobook_id, photo_id)
 * — a Photo already in this book stays where it is rather than jumping to the
 * end. Returns false for both "not yours" and "already there".
 */
export async function appendPhotobookItem(
  tx: LabTx,
  photobookId: string,
  photoId: string,
  ownerId: string,
): Promise<boolean> {
  const rows = await tx.execute<{ photo_id: string }>(sql`
    insert into photobook_items (photobook_id, photo_id, position)
    select b.id, ${photoId}::uuid,
           coalesce(
             (select max(i.position) + 1
                from photobook_items i
               where i.photobook_id = b.id),
             0)
      from photobooks b
     where b.id = ${photobookId}::uuid and b.owner_id = ${ownerId}
    on conflict (photobook_id, photo_id) do nothing
    returning photo_id
  `);
  return rows.length === 1;
}

export type FileResult =
  | { ok: true }
  | { ok: false; reason: "not-your-photobook" }
  | { ok: false; reason: "no-such-photo" }
  | { ok: false; reason: "not-your-photo" }
  | { ok: false; reason: "already-there" };

/**
 * File your own Photo into your own Photobook — ordinary curation.
 *
 * The sibling of `connectPhoto` below, and the half of the model that had no
 * caller. `appendPhotobookItem` has done this from the start, but its only user
 * is the upload path, so a Photo that was already uploaded could not be put
 * into a book by any route: the one "add" the UI could reach went through
 * `connectPhoto`, which refuses your own Photo by design, and an uploader
 * looking at their own frame was offered Edit and Delete and nothing else. The
 * loop closed with the Photo outside every book.
 *
 * Refusing somebody else's Photo here is not a permission check — anyone may
 * put a public Photo in their book — it is a routing check. That path is a
 * Connection, it carries a credit line and a reference rather than a filing,
 * and the two must not be reachable through one function that guesses which
 * was meant.
 *
 * Reads then writes, for the reason `connectPhoto` gives: the caller needs to
 * know which rule refused it, and neither a Photo's owner nor a Photobook's
 * ever changes, so the two facts this decides on cannot move under it.
 */
export async function addOwnPhoto(
  tx: LabTx,
  photobookId: string,
  photoId: string,
  ownerId: string,
): Promise<FileResult> {
  const rows = await tx.execute<{
    book_owner: string;
    photo_owner: string | null;
  }>(sql`
    select b.owner_id as book_owner, p.owner_id as photo_owner
      from photobooks b
      left join photos p on p.id = ${photoId}::uuid
     where b.id = ${photobookId}::uuid
  `);

  const found = rows[0];
  // One reason for "no such book" and "not yours", as in `connectPhoto`.
  if (!found || found.book_owner !== ownerId) {
    return { ok: false, reason: "not-your-photobook" };
  }
  if (found.photo_owner === null) {
    return { ok: false, reason: "no-such-photo" };
  }
  if (found.photo_owner !== ownerId) {
    return { ok: false, reason: "not-your-photo" };
  }

  const appended = await appendPhotobookItem(tx, photobookId, photoId, ownerId);
  return appended ? { ok: true } : { ok: false, reason: "already-there" };
}

export type ConnectResult =
  | { ok: true }
  | { ok: false; reason: "not-your-photobook" }
  | { ok: false; reason: "no-such-photo" }
  | { ok: false; reason: "your-own-photo" }
  | { ok: false; reason: "already-connected" };

/**
 * The Connection: save somebody else's public Photo into your own Photobook.
 *
 * By reference — one canonical Photo, another pointer at it. Nothing is copied,
 * no storage is used, and the Photo stays the uploader's (PRD D #3). Which is
 * why Connections are not capped: the cap exists to bound storage, and this
 * costs none (PRD D #5).
 *
 * No consent check, and that is a decision rather than an omission: public
 * blocks are freely reusable, and an uploader's recourse is to delete the Photo
 * outright (PRD D #6).
 *
 * **Self-connection is refused** (PRD D #12). Connecting your own Photo is a
 * no-op under the reference model — it is already yours — and the surface never
 * offers it: an uploader looking at their own Photo gets Edit / Delete instead.
 * Refusing it here is the backstop, and it is why this is a separate function
 * from `appendPhotobookItem` rather than the same one with a flag: putting your
 * own Photo into your own book is ordinary curation and stays allowed.
 *
 * Reads then writes, unlike its sibling, because the caller needs to know
 * *which* rule refused it. That is safe rather than racy here for a reason
 * particular to this data: neither a Photo's owner nor a Photobook's ever
 * changes, so the two facts this decides on cannot move under it.
 */
export async function connectPhoto(
  tx: LabTx,
  photobookId: string,
  photoId: string,
  connectorId: string,
): Promise<ConnectResult> {
  const rows = await tx.execute<{
    book_owner: string;
    photo_owner: string | null;
  }>(sql`
    select b.owner_id as book_owner, p.owner_id as photo_owner
      from photobooks b
      left join photos p on p.id = ${photoId}::uuid
     where b.id = ${photobookId}::uuid
  `);

  const found = rows[0];
  if (!found || found.book_owner !== connectorId) {
    // One reason for "no such book" and "not yours", so a stranger cannot probe
    // which photobook ids exist.
    return { ok: false, reason: "not-your-photobook" };
  }
  if (found.photo_owner === null) {
    return { ok: false, reason: "no-such-photo" };
  }
  if (found.photo_owner === connectorId) {
    return { ok: false, reason: "your-own-photo" };
  }

  const inserted = await tx.execute<{ photo_id: string }>(sql`
    insert into photobook_items (photobook_id, photo_id, position)
    values (
      ${photobookId}::uuid, ${photoId}::uuid,
      coalesce((select max(position) + 1 from photobook_items
                 where photobook_id = ${photobookId}::uuid), 0)
    )
    on conflict (photobook_id, photo_id) do nothing
    returning photo_id
  `);

  return inserted.length === 1
    ? { ok: true }
    : { ok: false, reason: "already-connected" };
}

/**
 * Take an item out of a Photobook — the disconnect, and the un-curate.
 *
 * Removes the pointer only. The Photo is untouched, which is the whole
 * difference between this and `deletePhoto`: disconnecting somebody else's work
 * from your shelf must not reach into their profile.
 */
export async function removePhotobookItem(
  tx: LabTx,
  photobookId: string,
  photoId: string,
  ownerId: string,
): Promise<boolean> {
  const rows = await tx.execute<{ photo_id: string }>(sql`
    delete from photobook_items i
     using photobooks b
     where i.photobook_id = b.id
       and b.id = ${photobookId}::uuid
       and b.owner_id = ${ownerId}
       and i.photo_id = ${photoId}::uuid
    returning i.photo_id
  `);
  return rows.length === 1;
}

/**
 * Rewrite the order of a Photobook, from the full list of its photo ids.
 *
 * One statement, using the array's own ordinality as the new positions, so the
 * whole reorder commits or none of it does — a half-applied drag would leave a
 * set of frames in an order nobody chose.
 *
 * Takes the complete order rather than a "move X to N" instruction. Curation is
 * done by dragging a whole grid around, and sending the result is the only
 * version that is idempotent: replaying it twice leaves the same order, whereas
 * replaying a move does not.
 *
 * Returns false unless every id given was in the book — a list that is short,
 * long, or names a Photo from somewhere else is a stale client, and applying
 * the part of it that happens to match would scramble the rest.
 */
export async function reorderPhotobookItems(
  tx: LabTx,
  photobookId: string,
  ownerId: string,
  photoIds: string[],
): Promise<boolean> {
  // Checked before the update rather than inside it. Folding it into the
  // statement's WHERE looks tidier and is wrong for the empty list: zero rows
  // updated would then be indistinguishable from "not your photobook", and the
  // function would report success for a book the caller does not own. Safe to
  // read first because a Photobook's owner never changes.
  const owned = await tx.execute<{ id: string }>(sql`
    select id from photobooks
     where id = ${photobookId}::uuid and owner_id = ${ownerId}
  `);
  if (owned.length !== 1) return false;

  const rows = await tx.execute<{ photo_id: string }>(sql`
    update photobook_items i
       set position = ordered.ord - 1
      from unnest(${sql.param(photoIds)}::uuid[])
             with ordinality as ordered(photo_id, ord)
     where i.photobook_id = ${photobookId}::uuid
       and i.photo_id = ordered.photo_id
    returning i.photo_id
  `);

  // A duplicate id fails here too: the same item cannot be updated twice, so
  // fewer rows come back than were asked for.
  if (rows.length !== photoIds.length) return false;

  // And the list must be the whole book, not a subset of it: reordering three
  // of five frames leaves the other two at positions that now collide.
  const total = await tx.execute<{ count: number }>(sql`
    select count(*)::int as count from photobook_items
     where photobook_id = ${photobookId}::uuid
  `);
  return total[0].count === photoIds.length;
}
