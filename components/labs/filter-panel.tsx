"use client";

import { cn } from "@/lib/utils";
import type { ChemProcess, FilterOptions } from "@/lib/queries/labs";
import {
  CHEM_PROCESSES,
  PROCESS_LABELS,
  RADIUS_CHOICES_M,
  hasActiveFilters,
  type LabSearchState,
} from "./search-state";

type FilterPanelProps = {
  state: LabSearchState;
  options: FilterOptions;
  onChange: (patch: Partial<LabSearchState>) => void;
  resultCount: number;
  /** The film stock name behind `state.stock`, resolved by the server. */
  stockLabel: string | null;
};

/** A flat, square toggle — the design has no pills and no rounded corners. */
function Toggle({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "border px-2.5 py-1 font-sans text-xs transition-colors",
        pressed
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-foreground hover:border-foreground",
      )}
    >
      {label}
    </button>
  );
}

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

/**
 * The filter control.
 *
 * Every change goes straight to the URL through the parent, so a filtered
 * search is a link. The counts and the reset are here rather than above the
 * list because this is where someone is when a search stops returning
 * anything — the near-miss states depend on being able to loosen it in place.
 */
export function FilterPanel({
  state,
  options,
  onChange,
  resultCount,
  stockLabel,
}: FilterPanelProps) {
  const active = hasActiveFilters(state);

  return (
    <div className="border-b border-border px-5 py-4">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-sans text-xs tracking-wide text-muted-foreground uppercase">
          {resultCount} {resultCount === 1 ? "lab" : "labs"}
        </p>
        {active ? (
          <button
            type="button"
            onClick={() =>
              onChange({
                process: [],
                scanner: [],
                service: [],
                open: false,
                stock: null,
              })
            }
            className="font-sans text-xs text-muted-foreground underline hover:text-foreground"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {/* Reverse search, arriving from a film stock's page (PROPOSED).
       *
       * Above the fieldsets and shaped differently on purpose: every other
       * filter here is one the reader set by tapping a toggle in this panel,
       * and this one was set by following a link from somewhere else. A person
       * who lands on a pre-filtered search needs to be told what it is filtered
       * by before they read the results, or the short list reads as "there are
       * hardly any labs near me".
       *
       * It removes rather than toggles, because there is nothing here to turn
       * back on — the id came from a page this one does not know about.
       */}
      {state.stock ? (
        <div className="mt-4 flex items-center gap-2 border border-foreground px-2.5 py-1.5">
          <span className="font-sans text-xs tracking-wide text-muted-foreground uppercase">
            Carries
          </span>
          <span className="min-w-0 flex-1 truncate font-sans text-xs">
            {/* An id that resolves to nothing still filters — the search is
                valid, it just names a stock that is no longer in the catalog. */}
            {stockLabel ?? "a stock no longer in the catalog"}
          </span>
          <button
            type="button"
            onClick={() => onChange({ stock: null })}
            className="font-sans text-xs text-muted-foreground hover:text-foreground"
            aria-label={
              stockLabel
                ? `Stop filtering by ${stockLabel}`
                : "Stop filtering by film stock"
            }
          >
            ✕
          </button>
        </div>
      ) : null}

      <fieldset className="mt-4">
        <legend className="font-sans text-xs tracking-wide text-muted-foreground uppercase">
          Process
        </legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CHEM_PROCESSES.map((p: ChemProcess) => (
            <Toggle
              key={p}
              label={PROCESS_LABELS[p]}
              pressed={state.process.includes(p)}
              onClick={() => onChange({ process: toggleIn(state.process, p) })}
            />
          ))}
        </div>
        {/* Said out loud because the two filters below behave differently, and
            a silent difference is the kind that gets reported as a bug. */}
        {state.process.length > 1 ? (
          <p className="mt-1.5 font-sans text-xs text-muted-foreground">
            Showing labs that offer all {state.process.length}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="mt-4">
        <legend className="font-sans text-xs tracking-wide text-muted-foreground uppercase">
          Scanner
        </legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {options.scanners.map((model) => (
            <Toggle
              key={model}
              label={model}
              pressed={state.scanner.includes(model)}
              onClick={() =>
                onChange({ scanner: toggleIn(state.scanner, model) })
              }
            />
          ))}
        </div>
        {state.scanner.length > 1 ? (
          <p className="mt-1.5 font-sans text-xs text-muted-foreground">
            Showing labs with any of these
          </p>
        ) : null}
      </fieldset>

      <fieldset className="mt-4">
        <legend className="font-sans text-xs tracking-wide text-muted-foreground uppercase">
          Service
        </legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {options.services.map((service) => (
            <Toggle
              key={service.key}
              label={service.labelEn}
              pressed={state.service.includes(service.key)}
              onClick={() =>
                onChange({ service: toggleIn(state.service, service.key) })
              }
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <fieldset>
          <legend className="font-sans text-xs tracking-wide text-muted-foreground uppercase">
            Within
          </legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {RADIUS_CHOICES_M.map((metres) => (
              <Toggle
                key={metres}
                label={metres < 1000 ? `${metres} m` : `${metres / 1000} km`}
                pressed={state.r === metres}
                onClick={() => onChange({ r: metres })}
              />
            ))}
          </div>
        </fieldset>

        <Toggle
          label="Open now"
          pressed={state.open}
          onClick={() => onChange({ open: !state.open })}
        />
      </div>
    </div>
  );
}
