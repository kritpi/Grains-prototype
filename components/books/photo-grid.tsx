import Image from "next/image";
import Link from "next/link";

import { publicUrl } from "@/lib/image-loader";

export type GridPhoto = {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  frameSize: string | null;
  format: string | null;
  /** Set only for a Connection — an own Photo carries no credit line. */
  credit: string | null;
};

/**
 * The true-aspect grid — the core visual promise of the feature.
 *
 * One full-width column on mobile so every frame keeps its ratio at maximum
 * size; a two-column masonry on desktop, deliberately ragged. **Nothing is
 * cropped and nothing is a uniform tile** (gap plan K2), which is why each
 * image carries the stored `width` and `height` and never `object-fit: cover`.
 * Those dimensions also reserve the right box before the image loads, so a
 * photobook does not reflow as it fills in.
 *
 * Two lines under each frame, in this order: the label ("3:2 · 135") and, only
 * for a Connection, the credit. An own Photo shows no credit at all — labelling
 * everything "via @someone" was the prototype's bug (K3), and a credit under a
 * photo the owner took reads as a denial of authorship.
 */
export function PhotoGrid({
  photos,
  hrefFor,
  density = "book",
  creditWord = "via",
}: {
  photos: GridPhoto[];
  hrefFor: (photo: GridPhoto) => string;
  /**
   * How wide the columns want to be.
   *
   * `book` is two columns of large frames — a photobook is a small set shown
   * as one thing. `gallery` is the film stock's inspiration grid, which the
   * prototype sets at `columns: 200px`: many frames from many people, read as
   * a wall rather than a sequence. Same component because the rule that
   * matters — true aspect ratio, nothing cropped — is identical in both.
   */
  density?: "book" | "gallery";
  /**
   * The word before the handle.
   *
   * "via" is right in a Photobook, where a credit only ever appears on a
   * Connection and means *this is someone else's frame, filed here*. It is
   * wrong in a film stock's gallery, where every frame is by the person named
   * and nothing has been re-filed — calling that "via" is the soft version of
   * exactly the authorship problem gap plan K3 raised.
   */
  creditWord?: "via" | "by";
}) {
  return (
    <div className="grains-photo-grid" data-density={density}>
      {photos.map((photo, index) => {
        const label = [photo.frameSize, photo.format]
          .filter(Boolean)
          .join(" · ");

        return (
          <Link
            key={photo.id}
            href={hrefFor(photo)}
            className="grains-frame"
            prefetch={false}
          >
            <Image
              src={publicUrl(photo.storageKey)}
              width={photo.width}
              height={photo.height}
              // There is no alt-text field, so it is composed from what is
              // known — honest about being a photograph rather than empty,
              // since these are the content and not decoration.
              alt={label ? `Photograph — ${label}` : "Photograph"}
              sizes={
                density === "gallery"
                  ? "(min-width: 768px) 220px, 50vw"
                  : "(min-width: 768px) 45vw, 100vw"
              }
              priority={index === 0}
            />
            {label ? <div className="grains-frame-label">{label}</div> : null}
            {photo.credit ? (
              <div className="grains-frame-credit">
                {creditWord} @{photo.credit}
              </div>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
