import Image from "next/image";

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
 * `next/image` with `fill`, now that C2's loader exists. The row carries the
 * stored dimensions, but they are not what should be requested: the frames are
 * fixed boxes a fraction of the page wide, and passing a 6000 px intrinsic width
 * would have Cloudflare bill a 6000 px variant to fill a 700 px slot. `sizes`
 * describes the boxes instead, and the parent reserves the space, so nothing
 * shifts on load either way.
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
  sizes,
}: {
  photo: LabPhoto;
  nameEn: string;
  index: number;
  total: number;
  sizes: string;
}) {
  return (
    <Image
      src={photo.url}
      fill
      sizes={sizes}
      // Nobody types alt text for these — there is no field for it — so it is
      // composed from what is known. Not empty: these are content rather than
      // decoration, and "photo 2 of 4" is at least an honest account of what is
      // being skipped.
      alt={`${nameEn} — atmosphere photo ${index + 1} of ${total}`}
      priority={index === 0}
      // object-cover here and only here: these slots are fixed shapes in the
      // layout, and the photo fills them. Frame respect is the rule for a Photo
      // in a photobook — a print — not for a snapshot of a shopfront being used
      // as a signpost.
      className="object-cover"
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
        {/* The wide frame. `relative` is what `fill` measures against. */}
        <div
          className="relative min-w-0 flex-[2] border border-border"
          data-stripe=""
        >
          {lead ? (
            <Frame
              photo={lead}
              nameEn={nameEn}
              index={0}
              total={photos.length}
              sizes="(min-width: 1024px) 640px, 66vw"
            />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div
            className="relative min-h-0 flex-1 border border-border"
            data-stripe=""
          >
            {second ? (
              <Frame
                photo={second}
                nameEn={nameEn}
                index={1}
                total={photos.length}
                sizes="(min-width: 1024px) 320px, 33vw"
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
