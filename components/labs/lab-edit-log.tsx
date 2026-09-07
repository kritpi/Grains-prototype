"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LabHistoryEntry } from "@/lib/queries/labs";

import {
  formatChangePath,
  formatChangeValue,
  formatEditAge,
} from "./edit-log-format";

/**
 * The edit log, fetched when it comes into view.
 *
 * Lazily loaded is the reason `/api/labs/[id]/history` is a Route Handler at
 * all: the log grows without bound, is read by almost nobody, and rendering it
 * into every lab page would put a query and a payload on every visit to pay for
 * a section most readers never scroll to.
 *
 * "In view" rather than "on mount": mounting happens immediately for a section
 * that is a screen and a half down the page, which would make it eager loading
 * with extra steps.
 *
 * Pagination is by cursor, not offset, because the log grows at the head — an
 * offset would repeat or skip entries when somebody edits the lab while another
 * person is reading its history.
 */
export function LabEditLog({
  labId,
  editCount,
}: {
  labId: string;
  editCount: number;
}) {
  const [entries, setEntries] = useState<LabHistoryEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const sentinelRef = useRef<HTMLDivElement>(null);

  // The cursor is passed in rather than read from state, which keeps `load`
  // stable across pages: depending on the cursor would rebuild the callback
  // after every fetch and retrigger the effect that made the first one.
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

        // Appended, never replaced: "load more" adds a page, and the first
        // call appends to an empty list, so one path covers both.
        //
        // De-duplicated by id, because "append what arrived" is not idempotent
        // and this function is reachable more than once for the same page. In
        // development React mounts effects twice and the whole log rendered
        // twice; in production a retry after a failed later page would replay
        // a page already held. Entry ids are unique, so filtering on them is
        // exact rather than a guess at what looks the same.
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

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver((observed) => {
      if (!observed.some((entry) => entry.isIntersecting)) return;
      // One shot. Later pages come from the button, so a reader who scrolls
      // past and back does not refetch the first page.
      observer.disconnect();
      void load(null);
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [load]);

  return (
    <div ref={sentinelRef}>
      {state === "idle" || (state === "loading" && entries.length === 0) ? (
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
            // three. Before the first success the cursor is null anyway, so
            // this is also the right call for a first attempt that failed.
            onClick={() => void load(cursor)}
            className="underline underline-offset-2 hover:no-underline"
          >
            Try again
          </button>
        </p>
      ) : null}

      {state !== "idle" && state !== "error" && entries.length === 0 ? (
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
  );
}
