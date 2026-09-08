"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createPhotobook } from "@/app/u/actions";

/**
 * "+ New Photobook", and the two fields behind it.
 *
 * A title and an optional artist's note, and nothing else — there is no
 * visibility control because there is no non-public state (PRD D #12), and
 * showing one would advertise an alternative that does not exist.
 *
 * The address is not offered as a field. It is minted from the title once and
 * then fixed, so that renaming cannot break a link somebody has already shared;
 * asking for it up front would make a permanent decision look like a casual one.
 */
export function NewPhotobook() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setProblem(null);
    startTransition(async () => {
      const result = await createPhotobook({ title, artistNote: note });
      if (result.ok) {
        setOpen(false);
        setTitle("");
        setNote("");
        router.refresh();
        return;
      }
      setProblem(
        result.reason === "invalid"
          ? result.issues.join(" · ")
          : result.message,
      );
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        className="grains-new-book"
        onClick={() => setOpen(true)}
      >
        + New Photobook
      </button>
    );
  }

  return (
    <form
      className="grains-sheet"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim() !== "" && !pending) save();
      }}
    >
      <label className="grains-upload-field">
        <span className="grains-form-label">TITLE</span>
        <input
          className="grains-input-cell"
          value={title}
          autoFocus
          placeholder="Bangkok Overcast"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <label className="grains-upload-field">
        <span className="grains-form-label">ARTIST&rsquo;S NOTE</span>
        <textarea
          className="grains-input-cell"
          value={note}
          rows={3}
          maxLength={300}
          placeholder="Two or three lines about the set."
          onChange={(event) => setNote(event.target.value)}
        />
      </label>

      <div className="grains-photo-actions">
        <button
          type="submit"
          className="grains-action"
          disabled={title.trim() === "" || pending}
        >
          {pending ? "Creating…" : "Create photobook"}
        </button>
        <button
          type="button"
          className="grains-confirm-cancel"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancel
        </button>
      </div>

      {problem ? <div className="grains-problem">{problem}</div> : null}
    </form>
  );
}
