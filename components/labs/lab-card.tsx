import Link from "next/link";

import { cn } from "@/lib/utils";
import type { LabCard as LabCardData } from "@/lib/queries/labs";
import { PROCESS_LABELS } from "./search-state";

function formatDistance(metres: number): string {
  return metres < 950
    ? `${Math.round(metres / 10) * 10} m`
    : `${(metres / 1000).toFixed(1)} km`;
}

type LabCardProps = {
  lab: LabCardData;
  selected: boolean;
  onSelect: (id: string) => void;
};

/**
 * One row of the result list.
 *
 * Information-first, per the editorial split in CLAUDE.md: labs are read for
 * accuracy, so this shows what someone is deciding between — distance, whether
 * it is open, which processes, what it costs from — and nothing decorative.
 * Whole-row selection drives the map, while the name is a real link so the row
 * stays keyboard- and middle-click-navigable.
 */
export function LabCard({ lab, selected, onSelect }: LabCardProps) {
  const processes = lab.processes.map((p) => PROCESS_LABELS[p]).join(" · ");

  return (
    <li
      data-lab-id={lab.id}
      onClick={() => onSelect(lab.id)}
      className={cn(
        // `relative` is load-bearing, not cosmetic. The visually-hidden <dt>
        // labels below are `position:absolute` (that is how Tailwind's sr-only
        // works), so without a positioned ancestor they resolve against the
        // initial containing block — escaping the result list's scroll
        // container and stretching the document itself. The symptom is the
        // whole page scrolling behind a list that was supposed to scroll
        // inside itself, caused by text nobody can see.
        "relative cursor-pointer border-b border-border px-5 py-4 transition-colors",
        selected ? "bg-secondary" : "hover:bg-secondary/60",
      )}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-lg leading-tight">
          <Link
            href={`/labs/${lab.id}`}
            className="hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {lab.nameEn}
          </Link>
        </h3>
        <span className="shrink-0 font-sans text-xs text-muted-foreground tabular-nums">
          {formatDistance(lab.distanceM)}
        </span>
      </div>

      {lab.nameTh ? (
        <p className="mt-0.5 text-sm text-muted-foreground">{lab.nameTh}</p>
      ) : null}

      <dl className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-xs text-muted-foreground">
        {lab.areaEn ? (
          <div>
            <dt className="sr-only">Area</dt>
            <dd>{lab.areaEn}</dd>
          </div>
        ) : null}

        <div>
          <dt className="sr-only">Status</dt>
          <dd
            className={cn(
              lab.status === "temporarily_closed" && "text-destructive",
            )}
          >
            {lab.status === "temporarily_closed"
              ? "Temporarily closed"
              : lab.openNow
                ? "Open now"
                : "Closed now"}
          </dd>
        </div>

        {processes ? (
          <div>
            <dt className="sr-only">Processes</dt>
            <dd>{processes}</dd>
          </div>
        ) : null}

        {/* A blank price is "nobody has filled this in", not "free" — so the
            field is omitted rather than shown as a zero. */}
        {lab.priceFromThb !== null ? (
          <div>
            <dt className="sr-only">Price from</dt>
            <dd>from ฿{lab.priceFromThb}</dd>
          </div>
        ) : null}
      </dl>

      {lab.scanners.length > 0 ? (
        <p className="mt-1 font-sans text-xs text-muted-foreground">
          {lab.scanners.join(" · ")}
        </p>
      ) : null}
    </li>
  );
}
