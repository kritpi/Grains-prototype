import { sql } from "drizzle-orm";

import type { LabTx } from "@/lib/queries/lab-edits";

/**
 * Photobooks and their items.
 *
 * Started by C3, which needs only one function: a Photo uploaded from inside a
 * Photobook is added to it. C5 owns the rest — CRUD, the Connection, reorder,
 * removal — and this file is where those belong.
 *
 * The thing to keep in mind before adding to it: an item whose photo belongs to
 * someone other than the photobook's owner *is* a Connection. There is no
 * second table and no `is_connection` flag; it is a fact about who owns what,
 * derived at read time. Anything here that special-cases the two has probably
 * misunderstood the model.
 */

/**
 * Append a Photo to the end of a Photobook the caller owns.
 *
 * Ownership is a subquery inside the INSERT rather than a preceding read, so a
 * photobook belonging to somebody else inserts nothing instead of racing a
 * check. The position is computed in the same statement for the same reason:
 * two concurrent appends cannot both read the same maximum.
 *
 * `ON CONFLICT DO NOTHING` because the primary key is (photobook_id, photo_id)
 * — a Photo already in this book stays where it is rather than jumping to the
 * end. Returns false for both "not yours" and "already there"; C3's only caller
 * treats neither as a failure worth undoing an upload for.
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
