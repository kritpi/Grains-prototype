import Image from "next/image";
import Link from "next/link";

import { publicUrl } from "@/lib/image-loader";
import type { PhotobookCard as Card } from "@/lib/queries/books";

/**
 * A Photobook on a profile.
 *
 * The cover is a 3-up mosaic of the first three photos rather than one cropped
 * frame, because a Photobook is a *set* and the mosaic previews mixed aspect
 * ratios honestly (gap plan J7). Empty slots are drawn rather than collapsed,
 * for the reason the whole product draws them: a gap somebody could fill beats
 * a row that says nothing.
 *
 * The meta line is "14 Photos · 5 connected", not just a total. That second
 * number is where PRD D #5 becomes visible — Connections are somebody else's
 * work, they cost the curator no upload cap, and a card that hid the split
 * would be the prototype's own bug (gap plan J12/J13).
 *
 * The artist's note renders here as well as inside the book (PRD D #12), which
 * is what makes a shelf of books read as a set of intentions rather than a set
 * of titles.
 */
export function PhotobookCard({
  book,
  username,
}: {
  book: Card;
  username: string;
}) {
  const slots = [0, 1, 2];

  return (
    <Link
      href={`/u/${username}/${book.slug}`}
      className="grains-book-card"
      prefetch={false}
    >
      <div className="grains-cover" aria-hidden="true">
        {slots.map((index) => {
          const photo = book.cover[index];
          return (
            <div key={index} className="grains-cover-slot" data-stripe="">
              {photo ? (
                <Image
                  src={publicUrl(photo.storageKey)}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 230px, 50vw"
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div>
        <div className="grains-book-title">{book.title}</div>
        <div className="grains-book-meta">
          {book.itemCount} {book.itemCount === 1 ? "photo" : "photos"}
          {book.connectedCount > 0
            ? ` · ${book.connectedCount} connected`
            : null}
        </div>
        {book.artistNote ? (
          <div className="grains-book-note">{book.artistNote}</div>
        ) : null}
      </div>
    </Link>
  );
}
