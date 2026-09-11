"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

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
 *
 * **A Client Component, for the viewer.** The mosaic shows two photographs and
 * counts the rest; the third tile said "+2 more" and was a `<span>` with nothing
 * behind it, so every photograph past the second was fetched, resolved to a URL
 * and then thrown away. The prototype hangs `viewAllAtmos` off that tile, and
 * this is that: every frame opens a modal carousel at its own index. The markup
 * still renders on the server — this is a Client Component, not a client-side
 * fetch — so the lead photograph keeps `priority` and remains the LCP image.
 */

type LabPhoto = {
  id: string;
  url: string;
  width: number;
  height: number;
};

const CAPTION =
  "Venue documentation only — sample scans are never attached to a lab.";

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
      // as a signpost. The viewer below shows the whole frame, uncropped.
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

  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<number | null>(null);

  const show = useCallback(
    (index: number) => {
      setOpen(index);
      // `showModal` rather than an `open` attribute: it is what gives the
      // backdrop, the focus trap and Esc, none of which are worth hand-rolling.
      dialog.current?.showModal();
    },
    [dialog],
  );

  const step = useCallback(
    (by: number) => {
      setOpen((current) =>
        current === null
          ? current
          : // Wrapping, because a carousel of four with a dead arrow at each
            // end is a carousel that has to be read twice to be understood.
            (current + by + photos.length) % photos.length,
      );
    },
    [photos.length],
  );

  // Arrow keys, on the document while the dialog is open. On the dialog element
  // itself they would only fire while something inside it has focus, and the
  // first thing a reader does in a lightbox is move the mouse.
  useEffect(() => {
    if (open === null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, step]);

  const current = open === null ? null : photos[open];

  return (
    <section aria-label={`Photographs of ${nameEn}`}>
      <div className="flex h-[300px] gap-0.5 sm:h-[360px]">
        {/* The wide frame. `relative` is what `fill` measures against. */}
        <div
          className="relative min-w-0 flex-[2] border border-border"
          data-stripe=""
        >
          {lead ? (
            <>
              <Frame
                photo={lead}
                nameEn={nameEn}
                index={0}
                total={photos.length}
                sizes="(min-width: 1024px) 640px, 66vw"
              />
              <button
                type="button"
                className="grains-photo-open"
                onClick={() => show(0)}
              >
                <span className="sr-only">
                  View photographs of {nameEn}, starting at the first
                </span>
              </button>
            </>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div
            className="relative min-h-0 flex-1 border border-border"
            data-stripe=""
          >
            {second ? (
              <>
                <Frame
                  photo={second}
                  nameEn={nameEn}
                  index={1}
                  total={photos.length}
                  sizes="(min-width: 1024px) 320px, 33vw"
                />
                <button
                  type="button"
                  className="grains-photo-open"
                  onClick={() => show(1)}
                >
                  <span className="sr-only">
                    View photographs of {nameEn}, starting at the second
                  </span>
                </button>
              </>
            ) : null}
          </div>

          {remaining > 0 ? (
            <button
              type="button"
              className="grains-photo-more"
              data-stripe=""
              onClick={() => show(2)}
            >
              +{remaining} more
            </button>
          ) : (
            <div
              className="grid min-h-0 flex-1 place-items-center border border-border font-sans text-[11px] text-muted-foreground"
              data-stripe=""
            >
              {photos.length === 0 ? <span>no photos yet</span> : null}
            </div>
          )}
        </div>
      </div>

      <p className="border-b border-border px-5 py-2.5 font-sans text-[11px] leading-relaxed text-muted-foreground">
        {CAPTION}
      </p>

      <dialog
        ref={dialog}
        className="grains-lightbox"
        aria-label={`Photographs of ${nameEn}`}
        onClose={() => setOpen(null)}
        // Clicking the backdrop closes it. The click lands on the dialog
        // element itself — the panel's own children are what stop it — so
        // comparing target to currentTarget is the whole test.
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        {current ? (
          <div className="grains-lightbox-panel">
            <div className="grains-lightbox-bar">
              <span>
                Atmosphere · {open! + 1} / {photos.length}
              </span>
              <button
                type="button"
                className="grains-lightbox-x"
                aria-label="Close"
                onClick={() => dialog.current?.close()}
              >
                ✕
              </button>
            </div>

            <div className="grains-lightbox-stage">
              <Image
                key={current.id}
                src={current.url}
                width={current.width}
                height={current.height}
                sizes="(min-width: 1100px) 1000px, 92vw"
                alt={`${nameEn} — atmosphere photo ${open! + 1} of ${photos.length}`}
              />
            </div>

            <div className="grains-lightbox-bar">
              <button
                type="button"
                className="grains-lightbox-step"
                aria-label="Previous photograph"
                onClick={() => step(-1)}
              >
                ←
              </button>
              <button
                type="button"
                className="grains-lightbox-step"
                aria-label="Next photograph"
                onClick={() => step(1)}
              >
                →
              </button>
              {/* The rule travels with the picture: somebody who opened this
                  full-screen is exactly the person who might mistake it for a
                  sample scan. */}
              <span className="grains-lightbox-note">{CAPTION}</span>
            </div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
