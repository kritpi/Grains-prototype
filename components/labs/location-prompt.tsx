"use client";

import { useState } from "react";

import {
  LOCATE_HINT,
  LOCATE_OPTIONS,
  locateFailure,
  locateMessage,
  locateSupport,
  type LocateFailure,
} from "@/lib/geolocation";
import type { LabArea } from "@/lib/queries/labs";

type LocationPromptProps = {
  areas: LabArea[];
  onLocate: (lat: number, lng: number) => void;
};

/**
 * The entry point when the URL carries no coordinates.
 *
 * PRD A is explicit that picking a place by hand is a first-class alternative
 * and not a permission-denied fallback, so the area list is shown alongside the
 * geolocate button from the start rather than appearing only after a refusal.
 * That also means someone who never grants location can still use the product,
 * and the areas below are ordinary links, so each is a crawlable entry point.
 *
 * The button says what it is about to do before it does it, and each way of
 * failing says which one it was. Both were one sentence — "Could not read your
 * location" — which left a reader unable to tell a permission they had blocked
 * from a page that was never allowed to ask. See `lib/geolocation.ts`.
 */
export function LocationPrompt({ areas, onLocate }: LocationPromptProps) {
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "locating" }
    | { kind: "failed"; why: LocateFailure }
  >({ kind: "idle" });

  function locate() {
    const support = locateSupport();
    if (support !== "ok") {
      setStatus({ kind: "failed", why: support });
      return;
    }

    setStatus({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Five decimal places is about a metre, which is more than a radius
        // search needs and considerably less than a raw reading puts in the
        // address bar.
        onLocate(
          Number(position.coords.latitude.toFixed(5)),
          Number(position.coords.longitude.toFixed(5)),
        );
      },
      (error) => setStatus({ kind: "failed", why: locateFailure(error) }),
      LOCATE_OPTIONS,
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-3xl">Find a film lab</h1>
      <p className="mt-3 max-w-prose text-sm text-muted-foreground">
        Search by where you are, or start from a neighbourhood.
      </p>

      <button
        type="button"
        onClick={locate}
        disabled={status.kind === "locating"}
        className="mt-8 border border-foreground bg-foreground px-4 py-2 font-sans text-sm text-background hover:bg-transparent hover:text-foreground disabled:opacity-60"
      >
        {status.kind === "locating" ? "Locating…" : "Use my location"}
      </button>

      <p className="mt-3 font-sans text-xs text-muted-foreground">
        {status.kind === "failed"
          ? `${locateMessage(status.why)} Pick an area below instead.`
          : LOCATE_HINT}
      </p>

      {areas.length > 0 ? (
        <div className="mt-12">
          <h2 className="font-sans text-xs tracking-wide text-muted-foreground uppercase">
            Areas
          </h2>
          <ul className="mt-3 border-t border-border">
            {areas.map((area) => (
              <li key={area.nameEn} className="border-b border-border">
                <a
                  href={`/labs?area=${encodeURIComponent(area.nameEn)}`}
                  className="flex items-baseline justify-between gap-4 py-3 hover:underline"
                >
                  <span className="text-base">
                    {area.nameEn}
                    {area.nameTh ? (
                      <span className="ml-2 text-sm text-muted-foreground">
                        {area.nameTh}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 font-sans text-xs text-muted-foreground tabular-nums">
                    {area.labCount}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-12 font-sans text-xs text-muted-foreground">
          No labs have been added yet.
        </p>
      )}
    </div>
  );
}
