"use client";

import Link from "next/link";

import type { LabCard as LabCardData } from "@/lib/queries/labs";
import { RADIUS_CHOICES_M } from "./search-state";

/** The next radius up from the current one, or null at the widest. */
export function nextRadiusUp(current: number): number | null {
  return RADIUS_CHOICES_M.find((r) => r > current) ?? null;
}

function WidenPrompt({
  radiusM,
  onWiden,
}: {
  radiusM: number;
  onWiden: (metres: number) => void;
}) {
  const wider = nextRadiusUp(radiusM);
  if (!wider) return null;

  return (
    <button
      type="button"
      onClick={() => onWiden(wider)}
      className="border border-foreground px-3 py-1.5 font-sans text-xs hover:bg-foreground hover:text-background"
    >
      Search within {wider / 1000} km instead
    </button>
  );
}

/**
 * Nothing here at all — not "nothing matched", but no labs in range.
 *
 * PRD A asks for the invitation to add the first one, because at launch this
 * is the honest state of most of the map rather than an error.
 */
export function NoLabsNearby({
  radiusM,
  onWiden,
}: {
  radiusM: number;
  onWiden: (metres: number) => void;
}) {
  return (
    <div className="px-5 py-10">
      <h2 className="text-xl">No labs listed here yet</h2>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Nothing within {radiusM / 1000} km. Grains is built by the people who
        use it, so an empty map usually means nobody has added this
        neighbourhood — not that there is nothing to find.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <WidenPrompt radiusM={radiusM} onWiden={onWiden} />
        <Link
          href="/labs/new"
          className="border border-foreground bg-foreground px-3 py-1.5 font-sans text-xs text-background hover:bg-transparent hover:text-foreground"
        >
          Add the first lab
        </Link>
      </div>
    </div>
  );
}

/**
 * Labs are here, but none match the filters.
 *
 * PRD A is specific about this one: do not offer to create a new lab, because
 * the lab probably exists and is simply missing a field. Show the actual
 * near-misses so the fix is one click from the thing that needs fixing.
 */
export function NoMatches({
  nearMisses,
  radiusM,
  onWiden,
  onClearFilters,
}: {
  nearMisses: LabCardData[];
  radiusM: number;
  onWiden: (metres: number) => void;
  onClearFilters: () => void;
}) {
  return (
    <div className="px-5 py-10">
      <h2 className="text-xl">No labs match these filters</h2>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        {nearMisses.length > 0
          ? "These labs are nearby but do not list what you filtered for. If you know one of them offers it, its page is the place to say so."
          : "Nothing within this radius matches."}
      </p>

      {nearMisses.length > 0 ? (
        <ul className="mt-5 border-t border-border">
          {nearMisses.slice(0, 5).map((lab) => (
            <li key={lab.id} className="border-b border-border py-3">
              <Link
                href={`/labs/${lab.id}`}
                className="text-base hover:underline"
              >
                {lab.nameEn}
              </Link>
              <p className="mt-0.5 font-sans text-xs text-muted-foreground">
                {[
                  lab.areaEn,
                  `${(lab.distanceM / 1000).toFixed(1)} km`,
                  lab.processes.length > 0
                    ? `lists ${lab.processes.length} process${lab.processes.length === 1 ? "" : "es"}`
                    : "no processes listed",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onClearFilters}
          className="border border-foreground px-3 py-1.5 font-sans text-xs hover:bg-foreground hover:text-background"
        >
          Clear filters
        </button>
        <WidenPrompt radiusM={radiusM} onWiden={onWiden} />
      </div>
    </div>
  );
}
