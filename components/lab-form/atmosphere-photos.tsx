"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { confirmLabPhoto, requestUploadUrl } from "@/app/photos/actions";
import { putObject, readDimensions } from "@/components/upload/browser-upload";
import { ALLOWED_CONTENT_TYPES } from "@/lib/photos/limits";

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
 */
export function AtmospherePhotos({
  labId,
  count,
}: {
  /** Absent while creating a lab, because the lab has no id yet. */
  labId?: string;
  count: number;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function upload(file: File) {
    setProblem(null);
    setProgress(0);

    let objectUrl: string | null = null;
    try {
      const measured = await readDimensions(file);
      objectUrl = measured.url;

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

      await putObject(signed.url, file, setProgress);

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

      // The lab page and this form both read `lab_photos`; the server action
      // has already revalidated the former.
      router.refresh();
    } catch (error) {
      setProblem(
        error instanceof Error && error.message === "not a readable image"
          ? "That file is not an image this browser can read."
          : "The upload did not finish. Try again.",
      );
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  const busy = progress !== null;

  return (
    <section>
      <div className="grains-form-label">
        ATMOSPHERE PHOTOS{count > 0 ? ` · ${count}` : ""}
      </div>

      <div className="grains-chips">
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
          disabled={labId === undefined || busy}
          aria-label="Add an atmosphere photo"
          onClick={() => input.current?.click()}
        >
          {busy ? `${Math.round(progress * 100)}%` : "+"}
        </button>
      </div>

      <p className="grains-hours-closed">
        Venue documentation only — sample scans are never attached to a lab.
        {labId === undefined
          ? " Photographs can be added once the lab has been published."
          : null}
      </p>

      {problem ? <div className="grains-problem">{problem}</div> : null}
    </section>
  );
}
