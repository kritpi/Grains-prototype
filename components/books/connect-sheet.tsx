"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  addToPhotobook,
  fileIntoPhotobook,
  removeFromPhotobook,
} from "@/app/u/actions";
import type { ConnectTarget } from "@/lib/queries/books";

/**
 * The Connect sheet — save somebody else's Photo into your own Photobooks.
 *
 * Multi-select across your books, and **disconnect through the same control**.
 * The prototype had a one-shot toggle that hard-coded its target and could
 * never be undone (gap plan L1); the thing that makes the reference model worth
 * having is that one canonical Photo sits in several places at once, so a sheet
 * that could only ever add would hide half of it.
 *
 * Each row is applied on its own rather than diffed and saved at the end. That
 * is the honest shape for an action with no cancel: a tick that has taken
 * effect should not be able to sit there looking committed while a later
 * failure silently drops it.
 *
 * The line under it explains what a Connection costs, at the moment somebody is
 * deciding to make one — PRD D #5 in the place it applies, rather than in a
 * help page nobody opens (gap plan L7).
 *
 * **Two modes, because the same control serves two different acts.** Looking at
 * somebody else's frame, this is the Connection: a reference, a credit line,
 * nothing copied. Looking at your own, it is ordinary filing — and that had no
 * surface at all until now, because an uploader was offered Edit and Delete and
 * the one "add" action the UI could reach refuses your own Photo by design. The
 * component is shared and the two actions are not: which one a row calls is
 * decided here, by the page that already knows whose photograph it is, rather
 * than by a query guessing from the rows it finds.
 */
export function ConnectSheet({
  photoId,
  targets,
  mode = "connect",
}: {
  photoId: string;
  targets: ConnectTarget[];
  /** `file` when the reader owns this Photo: their own work, into their own book. */
  mode?: "connect" | "file";
}) {
  const own = mode === "file";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(targets);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(target: ConnectTarget) {
    setProblem(null);
    startTransition(async () => {
      const result = target.contains
        ? await removeFromPhotobook(target.id, photoId)
        : own
          ? await fileIntoPhotobook(target.id, photoId)
          : await addToPhotobook(target.id, photoId);

      if (!result.ok) {
        setProblem(
          result.reason === "invalid"
            ? result.issues.join(" · ")
            : result.message,
        );
        return;
      }

      setState((current) =>
        current.map((book) =>
          book.id === target.id ? { ...book, contains: !book.contains } : book,
        ),
      );
      router.refresh();
    });
  }

  const connected = state.filter((book) => book.contains).length;

  if (!open) {
    return (
      <div className="grains-photo-actions">
        <button
          type="button"
          className="grains-action"
          onClick={() => setOpen(true)}
        >
          {connected > 0
            ? `${own ? "Filed" : "Connected"} · ${connected}`
            : own
              ? "Add to a photobook"
              : "Connect"}
        </button>
      </div>
    );
  }

  return (
    <div className="grains-sheet">
      <div className="grains-section-label">
        {own ? "FILE INTO" : "CONNECT INTO"}
      </div>

      {state.length === 0 ? (
        <p className="grains-sheet-note">
          You have no photobooks yet. Make one on your profile, then{" "}
          {own ? "file" : "connect"} this photograph into it.
        </p>
      ) : (
        state.map((book) => (
          <button
            key={book.id}
            type="button"
            className="grains-sheet-row"
            data-on={book.contains}
            disabled={pending}
            aria-pressed={book.contains}
            onClick={() => toggle(book)}
          >
            <span className="grains-sheet-box" aria-hidden="true">
              {book.contains ? "✓" : ""}
            </span>
            <span>{book.title}</span>
          </button>
        ))
      )}

      <p className="grains-sheet-note">
        {own
          ? "Nothing is copied — one photograph can sit in several of your photobooks at once, and taking it out of one leaves the others alone."
          : "No re-upload, and it does not count against your upload cap. The photograph stays its author’s."}
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
