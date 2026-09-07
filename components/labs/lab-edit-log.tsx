"use client";

import { useCallback, useEffect, useState } from "react";

import type { LabHistoryEntry } from "@/lib/queries/labs";

import {
  formatChangePath,
  formatChangeValue,
  formatEditAge,
} from "./edit-log-format";
import { SectionLabel } from "./lab-section";

/** Asked for from the contribution block, which lives in the other column. */
export const OPEN_EDIT_HISTORY = "grains:open-edit-history";

/**
 * The edit log, behind a disclosure at the foot of the page.
 *
 * Collapsed by default, and fetched the first time it is opened. That is the
 * reason `/api/labs/[id]/history` is a Route Handler at all: the log grows
 * without bound, is read by almost nobody, and rendering it into every lab page
 * would put a query and a payload on every visit to pay for a section most
 * readers never reach.
 *
 * It used to open itself when scrolled into view. A disclosure is better on
 * three counts: a long log no longer pushes the end of the page out for
 * everybody, opening is a decision rather than a side effect of scrolling past,
 * and it is testable — an IntersectionObserver never fires in a browser that is
 * not compositing, so the lazy path could not be exercised by automation at all.
 *
 * Pagination stays cursor-based, because the log grows at the head: an offset
 * would repeat or skip entries when somebody edits the lab while another person
 * is reading its history.
 */
export function LabEditLog({
  labId,
  editCount,
}: {
  labId: string;
  editCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LabHistoryEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );

  // The cursor is passed in rather than read from state, which keeps `load`
  // stable across pages: depending on it would rebuild the callback after every
  // fetch.
  const load = useCallback(
    async (from: string | null) => {
      setState("loading");

      const query = new URLSearchParams();
      if (from) query.set("cursor", from);

      try {
        const response = await fetch(
          `/api/labs/${labId}/history?${query.toString()}`,
        );
        if (!response.ok)
          throw new Error(`history responded ${response.status}`);

        const page = (await response.json()) as {
          entries: LabHistoryEntry[];
          nextCursor: string | null;
        };

        // De-duplicated by id, because "append what arrived" is not idempotent
        // and this is reachable more than once for the same page: React mounts
        // effects twice in development, and a retry after a failed later page
        // would replay one already held. Entry ids are unique, so filtering on
        // them is exact rather than a guess at what looks the same.
        setEntries((current) => {
          const held = new Set(current.map((entry) => entry.id));
          return [
            ...current,
            ...page.entries.filter((entry) => !held.has(entry.id)),
          ];
        });
        setCursor(page.nextCursor);
        setState("ready");
      } catch {
        setState("error");
      }
    },
    [labId],
  );

  function toggle() {
    const next = !open;
    setOpen(next);
    // The first open pays for the fetch; reopening shows what is already held.
    if (next && state === "idle") void load(null);
  }

  // The "Edit history" link in the contribution block is in the other column, so
  // it asks for this section by event rather than by shared state. Listening is
  // an effect; opening happens in the handler, which keeps the state change on
  // an interaction rather than on render — the shape React's rules want, and the
  // reason this is not a hash check on mount.
  useEffect(() => {
    function onRequest() {
      setOpen(true);
      setState((current) => {
        if (current === "idle") void load(null);
        return current;
      });
    }

    window.addEventListener(OPEN_EDIT_HISTORY, onRequest);
    return () => window.removeEventListener(OPEN_EDIT_HISTORY, onRequest);
  }, [load]);

  return (
    <section>
      <SectionLabel
        aside={
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls="edit-history-log"
            className="font-sans text-[10px] underline underline-offset-2 hover:no-underline"
          >
            {open ? "collapse" : editCount > 0 ? `show ${editCount}` : "show"}
          </button>
        }
      >
        Edit history
      </SectionLabel>

      {/* `hidden` rather than unmounting: a reader who collapses and reopens
          should not pay for the fetch twice, and the entries are already held. */}
      <div id="edit-history-log" hidden={!open}>
        {state === "loading" && entries.length === 0 ? (
          <p className="font-sans text-xs text-muted-foreground">
            Loading the edit log…
          </p>
        ) : null}

        {state === "error" ? (
          <p className="font-sans text-xs text-muted-foreground">
            The edit log could not be loaded.{" "}
            <button
              type="button"
              // The cursor, not null: a failure on page three should retry page
              // three. Before the first success the cursor is null anyway.
              onClick={() => void load(cursor)}
              className="underline underline-offset-2 hover:no-underline"
            >
              Try again
            </button>
          </p>
        ) : null}

        {state === "ready" && entries.length === 0 ? (
          <p className="font-sans text-xs text-muted-foreground">
            No edits recorded yet.
          </p>
        ) : null}

        {entries.length > 0 ? (
          <ol className="font-sans text-sm">
            {entries.map((entry) => (
              <li key={entry.id} className="border-b border-border py-3">
                <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                  <span className="text-foreground">
                    {entry.editorUsername
                      ? `@${entry.editorUsername}`
                      : // Every editor has an account, but a username is claimed
                        // separately and can still be null in the row.
                        (entry.editorName ?? "a contributor")}
                  </span>
                  <span>{formatEditAge(entry.createdAt)}</span>
                </p>

                {entry.changes.length > 0 ? (
                  <ul className="mt-1.5">
                    {entry.changes.map((change, index) => (
                      <li
                        key={`${entry.id}-${change.path}-${index}`}
                        className="flex flex-wrap items-baseline gap-x-2 py-0.5"
                      >
                        <span className="text-xs text-muted-foreground">
                          {formatChangePath(change.path)}
                        </span>
                        <span className="text-xs">
                          <span className="line-through opacity-60">
                            {formatChangeValue(change.from)}
                          </span>
                          <span aria-hidden="true"> → </span>
                          <span className="sr-only"> changed to </span>
                          {formatChangeValue(change.to)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {entry.note ? (
                  // The only human explanation anywhere in the system.
                  <p className="mt-1.5 border-l-2 border-border pl-3 text-xs text-muted-foreground italic">
                    {entry.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}

        {cursor ? (
          <button
            type="button"
            onClick={() => void load(cursor)}
            disabled={state === "loading"}
            className="mt-4 border border-foreground px-3 py-1.5 font-sans text-xs hover:bg-foreground hover:text-background disabled:opacity-50"
          >
            {state === "loading"
              ? "Loading…"
              : `Older edits${editCount > entries.length ? ` · ${editCount - entries.length} more` : ""}`}
          </button>
        ) : null}
      </div>
    </section>
  );
}
