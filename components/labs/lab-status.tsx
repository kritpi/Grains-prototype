import { closingTime, nextOpening } from "@/lib/labs/hours";
import type { LabDetail } from "@/lib/queries/labs";

/**
 * Open or closed, as a dot and a word beside the title.
 *
 * The prototype puts this at the top right of the heading row rather than under
 * it, and gives it three visual states rather than four: `open` in ink with a
 * filled dot, `caution` in italic ash for a manual override, `closed` in faint
 * grey for a lab that has shut for good. A lab that is merely closed for the
 * night is still `open` — it is operating, and nothing about the page is
 * degraded — which is why the dot is hollow rather than the colour changing.
 */

type StatusProps = Pick<
  LabDetail,
  "status" | "statusNote" | "openNow" | "hours"
>;

function visualState(status: LabDetail["status"]) {
  if (status === "permanently_closed") return "closed";
  if (status === "temporarily_closed") return "caution";
  return "open";
}

export function LabStatus({ status, openNow }: StatusProps) {
  const label =
    status === "permanently_closed"
      ? "Closed"
      : status === "temporarily_closed"
        ? "Temporarily closed"
        : openNow
          ? "Open now"
          : "Closed now";

  return (
    <span
      className="grains-status"
      data-status={visualState(status)}
      // The dot alone carries no meaning for a screen reader, and "Open now"
      // beside a lab's name is ambiguous without it.
      aria-label={`Status: ${label}`}
    >
      <i aria-hidden="true" />
      <span aria-hidden="true">{label}</span>
    </span>
  );
}

/**
 * The line under the title: where it is, and when it shuts.
 *
 * The prototype leads this with a distance ("1.2 km · Phra Khanong · closes
 * 19:00"), which the detail page cannot know — distance is a property of a
 * search, and this page is reachable by direct link from anywhere. The area and
 * the closing time are what remain true without a search behind them.
 */
export function LabMetaLine({
  areaEn,
  status,
  openNow,
  hours,
}: Pick<LabDetail, "areaEn" | "status" | "openNow" | "hours">) {
  const parts: string[] = [];
  if (areaEn) parts.push(areaEn);

  if (status === "open" && hours !== null) {
    if (openNow) {
      const closes = closingTime(hours);
      if (closes) parts.push(`closes ${closes}`);
    } else {
      const next = nextOpening(hours);
      if (next) parts.push(`opens ${next.dayLabel} ${next.time}`);
    }
  }

  if (parts.length === 0) return null;

  return (
    <p className="font-sans text-xs text-muted-foreground">
      {parts.join(" · ")}
    </p>
  );
}

/**
 * The banner for a lab that is closed, above the title.
 *
 * Only for the two states somebody asserted. A lab closed for the evening gets
 * no banner: that is a clock reading, not a claim, and burying the page under a
 * notice every night would be false urgency.
 */
export function LabStatusBanner({ status, statusNote }: StatusProps) {
  if (status === "open") return null;

  return (
    <div className="border border-destructive px-5 py-3">
      <p className="font-sans text-[10px] font-bold tracking-[0.12em] text-destructive uppercase">
        {status === "temporarily_closed"
          ? "Temporarily closed"
          : "Permanently closed"}
      </p>
      <p className="mt-1 font-sans text-[13px] leading-relaxed">
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
