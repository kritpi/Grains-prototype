/* eslint-disable @next/next/no-img-element */

/**
 * Lab atmosphere photos — the storefront, so a first-time visitor recognises
 * the door.
 *
 * The rule this component exists inside, and must never bend: these are venue
 * documentation, and they are *not* Photos in the CONTEXT.md sense. A scan of a
 * developed frame belongs to a film stock's gallery and is never attached to a
 * lab, because a bad scan must not reflect on the lab that developed it. That
 * is why `lab_photos` is a separate table from `photos` rather than a `lab_id`
 * column on it — an invariant the schema tests assert.
 *
 * True aspect ratio, never cropped to a grid: the design direction is frame
 * respect, and a storefront squeezed into a square is the one thing a
 * photography product should not do.
 *
 * Plain `<img>` rather than `next/image`. The custom loader that points at
 * Supabase's image transforms is Track C's `lib/image-loader.ts` (P23) and does
 * not exist yet; configuring `next/image` for a host twice, once here and once
 * properly, would leave the wrong one behind. Width and height come from the
 * row, so the layout still reserves the right box and nothing shifts on load.
 */

type LabPhoto = {
  id: string;
  url: string;
  width: number;
  height: number;
};

export function LabPhotos({
  photos,
  nameEn,
}: {
  photos: LabPhoto[];
  nameEn: string;
}) {
  if (photos.length === 0) return null;

  return (
    <>
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
        {photos.map((photo, index) => (
          <li key={photo.id} className="shrink-0 snap-start">
            <img
              src={photo.url}
              width={photo.width}
              height={photo.height}
              // Nobody types alt text for these — there is no field for it — so
              // it is composed from what is known. Not empty: these are content
              // rather than decoration, and "photo 2 of 4" is at least an
              // honest account of what is being skipped.
              alt={`${nameEn} — atmosphere photo ${index + 1} of ${photos.length}`}
              loading="lazy"
              decoding="async"
              className="h-48 w-auto max-w-none object-contain sm:h-64"
            />
          </li>
        ))}
      </ul>
      <p className="mt-3 font-sans text-[11px] text-muted-foreground">
        Storefront and interior only. Photographs developed here belong to a
        film stock&rsquo;s gallery, never to the lab.
      </p>
    </>
  );
}
