"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { fileIntoPhotobook, removeFromPhotobook } from "@/app/u/actions";
import { publicUrl } from "@/lib/image-loader";

/**
 * The owner's way of putting their own photographs into their own photobook.
 *
 * **This is the half of the curation model that was never built.** A Photo
 * uploaded from the profile landed unfiled, and the only affordance on it was a
 * link to its own page, which offered Edit and Delete. `connectPhoto` refuses
 * your own Photo by design — connecting something you already own is a no-op
 * under the reference model — and nothing called `appendPhotobookItem` except
 * the upload path. So the loop closed with the photograph outside every book
 * and no way in. PRD D #10 asks for exactly this: "an add-photo affordance
 * inside a Photobook the user owns".
 *
 * Toggles rather than only adds, and applies each row on its own, for the
 * reasons `ConnectSheet` gives: an action with no cancel should not let a tick
 * sit there looking committed while a later failure quietly drops it.
 *
 * Only the owner's own Photos are listed. Somebody else's frame is Connected
 * from its own page, where the credit line and the reference model are visible
 * — offering it here as one more tile would make a Connection look like filing.
 */

export type PickablePhoto = {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  frameSize: string | null;
  format: string | null;
  inBook: boolean;
};

export function AddToBook({
  photobookId,
  photos,
  uploadHref,
}: {
  photobookId: string;
  photos: PickablePhoto[];
  /** The owner's profile, where the uploader and the cap meter live. */
  uploadHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(photos);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(photo: PickablePhoto) {
    setProblem(null);
    startTransition(async () => {
      const result = photo.inBook
        ? await removeFromPhotobook(photobookId, photo.id)
        : await fileIntoPhotobook(photobookId, photo.id);

      if (!result.ok) {
        setProblem(
          result.reason === "invalid"
            ? result.issues.join(" · ")
            : result.message,
        );
        return;
      }

      setState((current) =>
        current.map((row) =>
          row.id === photo.id ? { ...row, inBook: !row.inBook } : row,
        ),
      );
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="grains-photo-actions">
        <button
          type="button"
          className="grains-action"
          onClick={() => setOpen(true)}
        >
          Add photographs
        </button>
      </div>
    );
  }

  return (
    <div className="grains-sheet">
      <div className="grains-section-label">YOUR PHOTOGRAPHS</div>

      {state.length === 0 ? (
        <p className="grains-sheet-note">
          You have not uploaded anything yet.{" "}
          <Link href={uploadHref} className="grains-photo-by">
            Upload a photograph
          </Link>{" "}
          and it can be filed here.
        </p>
      ) : (
        <div className="grains-pick-grid">
          {state.map((photo) => (
            <button
              key={photo.id}
              type="button"
              className="grains-pick"
              data-on={photo.inBook}
              disabled={pending}
              aria-pressed={photo.inBook}
              aria-label={
                photo.inBook
                  ? "Take this photograph out of the photobook"
                  : "Put this photograph in the photobook"
              }
              onClick={() => toggle(photo)}
            >
              <Image
                src={publicUrl(photo.storageKey)}
                alt=""
                width={92}
                height={92}
                // A 92px tile, whatever the stored frame is: `sizes` is what
                // stops Cloudflare billing a full-width variant for a picker.
                sizes="92px"
              />
              <span className="grains-pick-tick" aria-hidden="true">
                {photo.inBook ? "✓" : "+"}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="grains-sheet-note">
        Filing does not copy anything — one photograph can sit in several of
        your photobooks at once.
      </p>

      <div className="grains-photo-actions">
        <button
          type="button"
          className="grains-confirm-cancel"
          onClick={() => setOpen(false)}
        >
          Done
        </button>
      </div>

      {problem ? <div className="grains-problem">{problem}</div> : null}
    </div>
  );
}
