import { closingTime, nextOpening } from "@/lib/labs/hours";
import type { LabDetail } from "@/lib/queries/labs";
import { cn } from "@/lib/utils";

/**
 * The four ways a lab's door can be described, per the PRD's status model.
 *
 *   A  open      · open now      — computed from the weekly schedule
 *   B  open      · closed now    — computed; the lab is operating, just shut
 *   C  temporarily closed        — a manual override, outranking the schedule
 *   D  permanently closed        — a flag, never a delete
 *
 * B is the case worth stating: a lab that is closed this minute is not a
 * degraded page. Its hours, prices and contacts are exactly as useful as they
 * were an hour ago, so nothing is hidden and no action is disabled — the pill
 * simply outlines instead of filling, and says when the doors open next.
 *
 * C and D additionally get a banner above the title, because they are claims
 * somebody made rather than a clock reading, and a reader deciding whether to
 * travel needs to see them before the name.
 */

type StatusProps = Pick<
  LabDetail,
  "status" | "statusNote" | "openNow" | "hours"
>;

/** Case C and D only. Rendered above the title; returns nothing otherwise. */
export function LabStatusBanner({ status, statusNote }: StatusProps) {
  if (status === "open") return null;

  return (
    <div className="border border-destructive px-4 py-3">
      <p className="font-sans text-xs font-semibold tracking-[0.08em] text-destructive uppercase">
        {status === "temporarily_closed"
          ? "Temporarily closed"
          : "Permanently closed"}
      </p>
      <p className="mt-1 font-sans text-sm text-foreground">
        {status === "temporarily_closed"
          ? // The note is the whole point of the override — "Renovating until
            // October" is the information, and the flag alone is not.
            (statusNote ??
            "A contributor has marked this lab temporarily closed.")
          : "This lab is hidden from search results. You reached it by direct link — its prices, hours and history are kept rather than deleted."}
      </p>
    </div>
  );
}

/** The pill and its one-line tail: "Open now · closes 19:00". */
export function LabStatusLine({
  status,
  statusNote,
  openNow,
  hours,
}: StatusProps) {
  const label =
    status === "permanently_closed"
      ? "Closed permanently"
      : status === "temporarily_closed"
        ? "Temporarily closed"
        : openNow
          ? "Open now"
          : "Closed now";

  // Filled for the one state that means "you can go there right now".
  const filled = status === "open" && openNow;

  const tail = statusTail({ status, statusNote, openNow, hours });

  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span
        className={cn(
          "inline-flex items-center border px-2 py-1 font-sans text-[11px] font-semibold tracking-[0.08em] uppercase",
          filled
            ? "border-foreground bg-foreground text-background"
            : status === "open"
              ? "border-foreground text-foreground"
              : "border-destructive text-destructive",
        )}
      >
        {label}
      </span>
      {tail ? (
        <span className="font-sans text-xs text-muted-foreground">{tail}</span>
      ) : null}
    </p>
  );
}

/**
 * What follows the pill, and nothing when there is nothing true to say.
 *
 * "Open now" without a closing time is still useful; "open now · closes
 * undefined" is not, so an unreadable schedule produces no tail at all.
 */
function statusTail({ status, openNow, hours }: StatusProps): string | null {
  if (status !== "open" || hours === null) return null;

  if (openNow) {
    const closes = closingTime(hours);
    return closes ? `closes ${closes}` : null;
  }

  const next = nextOpening(hours);
  return next ? `opens ${next.dayLabel} ${next.time}` : null;
}
