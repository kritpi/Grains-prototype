"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  confirmLabPhoto,
  deleteLabPhoto,
  requestUploadUrl,
} from "@/app/photos/actions";
import { putObject, readDimensions } from "@/components/upload/browser-upload";
import { ALLOWED_CONTENT_TYPES, checkUpload } from "@/lib/photos/limits";

/**
 * Atmosphere photos on the lab form — venue documentation, and nothing else.
 *
 * **This is the one photo surface in the product that attaches to a lab, and
 * it is a different table for that reason.** `lab_photos` is where a shopfront
 * or a counter goes; `photos` is somebody's work and has no `lab_id` column and
 * never will. A sample scan must never arrive here, which is what the copy
 * below is for — the rule is enforced by the schema, but a contributor has to
 * be told which of the two they are looking at.
 *
 * These do not count against anyone's upload cap. A cap exists to bound
 * personal storage and push toward "best shots only" (PRD D #5); a photograph
 * of a shopfront is neither.
 *
 * **Only available when editing.** A key is `labs/{labId}/{uuid}`, so an object
 * cannot be placed before the lab it documents has an id. On `/labs/new` the
 * control stays disabled and says so, rather than being hidden — an absent
 * affordance reads as "never" instead of "not yet".
 *
 * **The tiles are the prototype's, and they are what this section was missing.**
 * It used to render the *number* of photographs and a "+", so a contributor
 * could add one but never see it, check it, or take it down — a one-way door
 * with no way to correct a mistake, and no way to tell whether the upload had
 * worked at all. Now: the photographs that are there, a preview of the one
 * landing, and a ✕ on each.
 *
 * **Nothing here is part of the draft the Save button diffs**, and that is not
 * an oversight to be fixed by adding photos to `LabDraft`. An upload commits at
 * the moment it finishes and a removal at the moment it is confirmed; both are
 * live before Save is pressed and survive Cancel. What the form owes the reader
 * is to say so, which is what the outcome line under the tiles is for — "Nothing
 * changed yet." sitting under a photograph that had just been saved was the
 * whole of the reported bug.
 */

/** What the page hands over: the rows, already resolved to public URLs. */
export type LabFormPhoto = {
  id: string;
  url: string;
  width: number;
  height: number;
};

/** The one being uploaded right now — a local object URL, not a row. */
type Pending = { url: string; progress: number };

export function AtmospherePhotos({
  labId,
  photos,
}: {
  /** Absent while creating a lab, because the lab has no id yet. */
  labId?: string;
  photos: LabFormPhoto[];
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busyRemoving, setBusyRemoving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  // The preview's object URL is the one piece of state here that is not
  // garbage-collected on its own. Revoking it when the component goes rather
  // than only on the happy path means an unmount mid-upload does not leak it.
  const live = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (live.current) URL.revokeObjectURL(live.current);
    };
  }, []);

  function release() {
    if (live.current) {
      URL.revokeObjectURL(live.current);
      live.current = null;
    }
  }

  async function upload(file: File) {
    setProblem(null);
    setOutcome(null);

    // The same check the server will run, run here first. Without it a 40 MB
    // file is pushed all the way to R2 before anything refuses it, which on a
    // phone connection is a minute of upload and then a sentence saying it was
    // never going to work.
    const allowed = checkUpload({ contentType: file.type, bytes: file.size });
    if (!allowed.ok) {
      setProblem(allowed.message);
      if (input.current) input.current.value = "";
      return;
    }

    try {
      const measured = await readDimensions(file);
      // Kept, not revoked: this is the preview. `readDimensions` hands back the
      // URL it made rather than making a second one.
      release();
      live.current = measured.url;
      setPending({ url: measured.url, progress: 0 });

      const signed = await requestUploadUrl({
        kind: "lab_atmosphere",
        contentType: file.type,
        bytes: file.size,
      });
      if (!signed.ok) {
        // `cap` cannot happen for this kind — requestUploadUrl only counts
        // originals for `photo` — but the result type carries the variant, so
        // it is handled rather than cast away.
        setProblem(
          signed.reason === "rejected"
            ? signed.message
            : "That upload was refused.",
        );
        return;
      }

      await putObject(signed.url, file, (progress) =>
        setPending((current) => (current ? { ...current, progress } : current)),
      );

      const saved = await confirmLabPhoto({
        labId,
        key: signed.key,
        width: measured.width,
        height: measured.height,
      });
      if (!saved.ok) {
        // Same shape as the signing result: `cap` is unreachable for a lab
        // photo, and narrowing on `reason` says so rather than asserting it.
        setProblem(
          saved.reason === "rejected"
            ? saved.message
            : "That upload could not be saved.",
        );
        return;
      }

      setOutcome("Photograph added — it is on the lab page now.");
      // The lab page and this form both read `lab_photos`; the server action
      // has already revalidated the former. The refresh is what replaces the
      // local preview with the real row, so the preview is held until it lands.
      router.refresh();
    } catch (error) {
      setProblem(
        error instanceof Error && error.message === "not a readable image"
          ? "That file is not an image this browser can read."
          : "The upload did not finish. Try again.",
      );
    } finally {
      release();
      setPending(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(photoId: string) {
    setProblem(null);
    setOutcome(null);
    setBusyRemoving(true);
    try {
      const result = await deleteLabPhoto(photoId);
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      setRemoving(null);
      setOutcome("Photograph removed — it is off the lab page now.");
      router.refresh();
    } finally {
      setBusyRemoving(false);
    }
  }

  const uploading = pending !== null;
  const count = photos.length;

  return (
    <section>
      <div className="grains-form-label">
        ATMOSPHERE PHOTOS{count > 0 ? ` · ${count}` : ""}
      </div>

      <div className="grains-photo-tiles">
        {photos.map((photo) => (
          <div key={photo.id} className="grains-photo-tile">
            <Image
              src={photo.url}
              alt=""
              width={84}
              height={84}
              // 84px squares at up to 2× — the stored file is a several-megabyte
              // scan and the tile is a thumbnail, so `sizes` is what keeps
              // Cloudflare from billing a full-width variant for a form field.
              sizes="84px"
            />
            <button
              type="button"
              className="grains-photo-remove"
              aria-label="Remove this photograph"
              disabled={busyRemoving || uploading}
              onClick={() => setRemoving(photo.id)}
            >
              ✕
            </button>
          </div>
        ))}

        {pending ? (
          <div className="grains-photo-tile" data-pending="true">
            {/* A local object URL: not on the R2 origin, so next/image's loader
                would pass it through unchanged and Next would still want
                dimensions it cannot have. A plain img is the honest element. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pending.url} alt="" />
          </div>
        ) : null}

        <input
          ref={input}
          type="file"
          accept={ALLOWED_CONTENT_TYPES.join(",")}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <button
          type="button"
          className="grains-photo-add"
          disabled={labId === undefined || uploading || busyRemoving}
          aria-label="Add an atmosphere photo"
          onClick={() => input.current?.click()}
        >
          {uploading ? `${Math.round(pending.progress * 100)}%` : "+"}
        </button>
      </div>

      <p className="grains-hours-closed">
        Venue documentation only — sample scans are never attached to a lab.
        {labId === undefined
          ? " Photographs can be added once the lab has been published."
          : null}
      </p>

      {outcome ? <p className="grains-photo-outcome">{outcome}</p> : null}

      {removing !== null ? (
        <div className="grains-photo-confirm">
          <p>
            This photograph comes off the lab page immediately and its file is
            deleted. Anyone signed in can add another, but this one does not
            come back.
          </p>
          <div className="grains-actions">
            <button
              type="button"
              className="grains-photo-confirm-go"
              disabled={busyRemoving}
              onClick={() => void remove(removing)}
            >
              {busyRemoving ? "Removing…" : "Remove permanently"}
            </button>
            <button
              type="button"
              className="grains-secondary"
              disabled={busyRemoving}
              onClick={() => setRemoving(null)}
            >
              Keep it
            </button>
          </div>
        </div>
      ) : null}

      {problem ? <div className="grains-problem">{problem}</div> : null}
    </section>
  );
}
