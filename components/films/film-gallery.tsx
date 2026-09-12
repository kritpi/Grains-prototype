import Link from "next/link";

import { PhotoGrid, type GridPhoto } from "@/components/books/photo-grid";
import { listGalleryPhotos } from "@/lib/queries/photos";

/**
 * The inspiration gallery on a film stock's page (PRD B #3).
 *
 * Composition, not new work: `listGalleryPhotos` is the query and `PhotoGrid`
 * is the grid. What this adds is the framing — a stock's gallery is *derived*
 * from Photos that happen to be tagged with it, and nothing is ever uploaded
 * to a stock directly. That is why the empty state explains the mechanism
 * rather than offering an upload here.
 *
 * **No lab appears anywhere in this component and none can.** A Photo carries
 * a film stock, a camera and a scanner model, never the lab that developed it,
 * and `listGalleryPhotos` has no way to reach one. The content-integrity rule
 * holds here by construction rather than by remembering.
 *
 * Two deviations from the prototype's version of this section, both recorded
 * rather than quietly resolved:
 *
 * 1. **No format/scanner filter chips.** The prototype draws them above the
 *    grid. `listGalleryPhotos` takes a stock and a cursor and nothing else, so
 *    they need a query change; that is a Track C change and its own task.
 * 2. **There is no "Add a sample" action.** There was one, and it linked to the
 *    reader's own profile — no anchor, so it landed above an UPLOAD section
 *    that is the last block on that page, and no stock id, so the stock they
 *    had just been looking at was not preselected. A button that navigates away
 *    from what you were doing and then abandons you is worse than no button.
 *    The upload surface stays where PRD D #10 put it, next to the cap meter
 *    that constrains it; the empty state below explains the actual mechanism,
 *    which is that a photo arrives here by being tagged with this stock.
 */
export async function FilmGallery({
  filmStockId,
  stockName,
  sampleCount,
  cursor,
}: {
  filmStockId: string;
  stockName: string;
  sampleCount: number;
  cursor?: string;
}) {
  const { photos, nextCursor } = await listGalleryPhotos(
    filmStockId,
    cursor ?? null,
  );

  return (
    <section className="grains-stock-section">
      <div className="grains-gallery-head">
        <div className="grains-stock-label">
          INSPIRATION GALLERY · {sampleCount}
        </div>
      </div>

      {photos.length === 0 ? (
        // The design system's `.empty`: dashed frame, 44px ring, 34ch of copy.
        // It says how a photo gets here, because "upload one tagged with this
        // stock" is genuinely the whole mechanism and is not guessable.
        <div className="grains-gallery-empty">
          <div className="grains-gallery-ring" aria-hidden="true" />
          <h3>No sample photos yet</h3>
          <p>
            Upload a photo tagged {stockName} and it lands here automatically.
            Nothing is uploaded to a film stock directly.
          </p>
        </div>
      ) : (
        <>
          <PhotoGrid
            photos={photos.map((photo): GridPhoto => ({
              id: photo.id,
              storageKey: photo.storageKey,
              width: photo.width,
              height: photo.height,
              frameSize: photo.frameSize,
              format: photo.format,
              // Every frame here is somebody's, and the viewer is never its
              // owner, so the handle always shows — and it shows as "by",
              // not "via". See PhotoGrid's `creditWord`.
              credit: photo.uploaderUsername,
            }))}
            density="gallery"
            creditWord="by"
            // `-` is the photo route's "in no photobook" slug. It is right
            // even for a frame that *is* filed: this gallery is not a
            // photobook, so entering from here should not claim it was.
            hrefFor={(photo) => `/u/${photo.credit}/-/${photo.id}`}
          />

          <p className="grains-gallery-note">
            Each frame keeps the ratio it was shot in — 3:2, 1:1, 6:7. Nothing
            is cropped to square up a grid.
          </p>

          {nextCursor ? (
            // A link rather than a button: pagination stays in the URL, the
            // page stays a Server Component, and a crawler can walk the whole
            // gallery. The sitemap only lists the stock itself.
            <Link
              href={`?after=${encodeURIComponent(nextCursor)}`}
              className="grains-facet"
            >
              Show more
            </Link>
          ) : null}
        </>
      )}
    </section>
  );
}
