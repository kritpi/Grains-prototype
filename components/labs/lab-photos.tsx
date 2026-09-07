/* eslint-disable @next/next/no-img-element */

/**
 * Lab atmosphere photos — the storefront, so a first-time visitor recognises the
 * door.
 *
 * The prototype leads the page with these: a wide frame on the left and a narrow
 * column on the right holding the second photo and a "+N more" tile. That is the
 * one place on the page where a picture outranks a number, and it earns it —
 * "above the noodle shop, unmarked door" is a sentence, but the door is a photo.
 *
 * The rule this component lives inside, and must never bend: these are venue
 * documentation, and they are *not* Photos in the CONTEXT.md sense. A scan of a
 * developed frame belongs to a film stock's gallery and is never attached to a
 * lab, because a bad scan must not reflect on the lab that developed it. That is
 * why `lab_photos` is a separate table from `photos` rather than a `lab_id`
 * column on it — an invariant the schema tests assert — and why the caption
 * under the mosaic says so in the product rather than only in a comment.
 *
 * The empty slots are drawn rather than collapsed, hatched the way the prototype
 * draws them, for the same reason an unticked service box beats a missing line:
 * a lab with no storefront photo is a gap somebody could fill.
 *
 * Plain `<img>` rather than `next/image`. The custom loader that points at
 * Supabase's image transforms is Track C's `lib/image-loader.ts` (P23) and does
 * not exist yet; configuring `next/image` for a host twice, once here and once
 * properly, would leave the wrong one behind. Width and height come from the
 * row, so the layout reserves the right box and nothing shifts on load.
 */

type LabPhoto = {
  id: string;
  url: string;
  width: number;
  height: number;
};

function Frame({
  photo,
  nameEn,
  index,
  total,
  className,
}: {
  photo: LabPhoto;
  nameEn: string;
  index: number;
  total: number;
  className?: string;
}) {
  return (
    <img
      src={photo.url}
      width={photo.width}
      height={photo.height}
      // Nobody types alt text for these — there is no field for it — so it is
      // composed from what is known. Not empty: these are content rather than
      // decoration, and "photo 2 of 4" is at least an honest account of what is
      // being skipped.
      alt={`${nameEn} — atmosphere photo ${index + 1} of ${total}`}
      loading={index === 0 ? "eager" : "lazy"}
      decoding="async"
      className={className}
    />
  );
}

export function LabPhotos({
  photos,
  nameEn,
}: {
  photos: LabPhoto[];
  nameEn: string;
}) {
  const [lead, second, ...rest] = photos;
  const remaining = rest.length;

  return (
    <section aria-label={`Photographs of ${nameEn}`}>
      <div className="flex h-[300px] gap-0.5 sm:h-[360px]">
        {/* The wide frame. object-cover here and only here: this one slot is a
            fixed shape in the layout, and the photo fills it. Frame respect is
            the rule for a Photo in a photobook — a print — not for a snapshot of
            a shopfront being used as a signpost. */}
        <div className="min-w-0 flex-[2] border border-border" data-stripe="">
          {lead ? (
            <Frame
              photo={lead}
              nameEn={nameEn}
              index={0}
              total={photos.length}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="min-h-0 flex-1 border border-border" data-stripe="">
            {second ? (
              <Frame
                photo={second}
                nameEn={nameEn}
                index={1}
                total={photos.length}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>

          <div
            className="grid min-h-0 flex-1 place-items-center border border-border font-sans text-[11px] text-muted-foreground"
            data-stripe=""
          >
            {remaining > 0 ? (
              <span>+{remaining} more</span>
            ) : photos.length === 0 ? (
              <span>no photos yet</span>
            ) : null}
          </div>
        </div>
      </div>

      <p className="border-b border-border px-5 py-2.5 font-sans text-[11px] leading-relaxed text-muted-foreground">
        Venue documentation only — sample scans are never attached to a lab.
      </p>
    </section>
  );
}
