"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";

import { setLabStatus } from "@/app/labs/actions";
import type { LabStatus } from "@/lib/labs/paths";

/**
 * Reporting that a lab has closed — or reopened.
 *
 * `setLabStatus` has existed, conflict-safe and history-writing, with nothing
 * in the app calling it: the whole `lab_status` lifecycle was unreachable, so
 * every lab read "open" forever regardless of reality. This is the control.
 *
 * **Placement and weight come from the prototype**, which puts "Mark as
 * closed" in the CONTRIBUTION block as a plain underlined 12px link stacked
 * under "Edit history" — not a button, and not in the heading row. That is
 * right: the left column is what the lab *is*, and the last line of it is who
 * said so. A status claim is attributed like any other edit.
 *
 * DELIBERATE DEVIATION, recorded per the prototype-fidelity skill: the
 * prototype treats status as one binary and toggles `markClosed` on a click.
 * The schema has three states and a note (`open`, `temporarily_closed`,
 * `permanently_closed` + `status_note`), and the two closures mean different
 * things — one keeps the lab in search results, the other removes it. So the
 * prototype's link and its exact wording are kept as the affordance, and the
 * three-state reality is handled in a disclosure behind it rather than by
 * inventing a third placement.
 *
 * A radio group rather than a menu. There are three mutually exclusive states,
 * one needs a free-text note and one needs confirming — that is a small form.
 * `role="menu"` would also never announce which state is *current*, which is
 * the first thing a screen-reader user needs before changing it.
 */

const CHOICES: { value: LabStatus; label: string; help: string }[] = [
  { value: "open", label: "Open", help: "Operating normally." },
  {
    value: "temporarily_closed",
    label: "Temporarily closed",
    help: "Stays in search results. Add when it reopens, if you know.",
  },
  {
    value: "permanently_closed",
    label: "Permanently closed",
    help: "Removed from search. The page, prices and history are kept.",
  },
];

export function LabStatusControl({
  labId,
  version,
  status,
  statusNote,
  signedIn,
}: {
  labId: string;
  version: number;
  status: LabStatus;
  statusNote: string | null;
  signedIn: boolean;
}) {
  const panelId = useId();
  const groupId = useId();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<LabStatus>(status);
  const [note, setNote] = useState(statusNote ?? "");
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, startTransition] = useTransition();

  // The prototype's own wording, which is accurate for the common direction of
  // travel: a lab that is open gets reported closed, and a closed one reopened.
  const trigger = status === "open" ? "Mark as closed" : "Mark as reopened";

  if (!signedIn) {
    // A link, not a disabled button. Arriving at sign-in should be a choice the
    // reader made — the same reasoning the badge row already follows.
    return (
      <Link
        href={`/sign-in?next=${encodeURIComponent(`/labs/${labId}`)}`}
        className="font-sans text-xs underline underline-offset-2 hover:no-underline"
        title="Sign in to report a status change"
      >
        {trigger}
      </Link>
    );
  }

  function reset() {
    setOpen(false);
    setConfirming(false);
    setProblem(null);
    setChoice(status);
    setNote(statusNote ?? "");
  }

  function submit() {
    // Confirmation is a second press of the same button rather than a dialog:
    // removing a lab from search is worth slowing down, and a modal over a
    // panel this small would be more ceremony than the decision needs.
    if (choice === "permanently_closed" && !confirming) {
      setConfirming(true);
      return;
    }

    setProblem(null);
    startTransition(async () => {
      const result = await setLabStatus(labId, version, choice, note);

      if (result.ok) {
        setAnnouncement(
          `Status saved: ${CHOICES.find((c) => c.value === choice)?.label ?? choice}.`,
        );
        setOpen(false);
        setConfirming(false);
        return;
      }

      setConfirming(false);
      const message =
        result.reason === "conflict"
          ? "Somebody changed this lab while the panel was open. Reload to see where it stands."
          : result.reason === "unchanged"
            ? "That is already the status."
            : result.reason === "rejected"
              ? result.message
              : result.reason === "invalid"
                ? result.issues.join(" · ")
                : "That did not save. Try again.";
      setProblem(message);
      setAnnouncement(message);
    });
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => (open ? reset() : setOpen(true))}
        aria-expanded={open}
        aria-controls={panelId}
        className="font-sans text-xs underline underline-offset-2 hover:no-underline"
      >
        {open ? "Cancel" : trigger}
      </button>

      {/* Polite, and owned by this control: it confirms an action the reader
          just took, so it must not interrupt what they are reading. */}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </p>

      {open && (
        <div id={panelId} className="grains-statusset">
          <div
            role="radiogroup"
            aria-labelledby={groupId}
            className="grains-statusset-group"
          >
            <span id={groupId} className="grains-statusset-legend">
              Report this lab as
            </span>
            {CHOICES.map((option) => (
              <label key={option.value} className="grains-statusset-row">
                <input
                  type="radio"
                  name={`${panelId}-status`}
                  value={option.value}
                  checked={choice === option.value}
                  disabled={pending}
                  onChange={() => {
                    setChoice(option.value);
                    setConfirming(false);
                  }}
                />
                <span>
                  <span className="grains-statusset-label">
                    {option.label}
                    {option.value === status ? " · current" : ""}
                  </span>
                  <span className="grains-statusset-help">{option.help}</span>
                </span>
              </label>
            ))}
          </div>

          {choice === "temporarily_closed" && (
            <label className="grains-statusset-note">
              <span>Why, or until when · optional</span>
              <input
                className="grains-input-cell"
                value={note}
                maxLength={120}
                disabled={pending}
                placeholder="Renovating until 15 Oct"
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          )}

          {confirming && (
            <p className="grains-statusset-confirm">
              This removes the lab from search for everyone. Press again to
              confirm — its page, prices and history are kept either way.
            </p>
          )}

          {problem && (
            <p className="grains-statusset-problem" role="alert">
              {problem}
            </p>
          )}

          <div className="grains-statusset-actions">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              aria-busy={pending}
              className="grains-statusset-save"
              data-danger={choice === "permanently_closed"}
            >
              {pending
                ? "Saving…"
                : confirming
                  ? "Yes, mark it closed"
                  : "Save status"}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={pending}
              className="grains-statusset-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
