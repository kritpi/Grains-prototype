"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryStates } from "nuqs";

import { LabMap } from "@/components/map/lab-map";
import type {
  FilterOptions,
  LabArea,
  LabCard as LabCardData,
} from "@/lib/queries/labs";
import { FilterPanel } from "./filter-panel";
import { LabCard } from "./lab-card";
import { LabCardSkeleton } from "@/components/layout/skeleton";

import { NoLabsNearby, NoMatches } from "./empty-state";
import { LocationPrompt } from "./location-prompt";
import {
  hasActiveFilters,
  labSearchParsers,
  toApiQuery,
  type LabSearchState,
} from "./search-state";

type Results = { labs: LabCardData[]; total: number };

type LabSearchProps = {
  options: FilterOptions;
  areas: LabArea[];
  /**
   * The page the server already rendered, and the query it answers. Passing
   * the query too is what stops the client refetching on mount: without it,
   * every server-rendered search would be thrown away and requested again the
   * moment React hydrated.
   */
  initial: Results | null;
  initialQuery: string | null;
  /**
   * The film stock the reverse-search filter names, resolved server-side.
   *
   * The URL carries `?stock=<uuid>` because that is what the join needs, and
   * this client has no way to reach the catalog — so the label is passed in.
   * Null when nothing is filtered, and also when the id matches nothing.
   */
  stockLabel?: string | null;
  /**
   * Where the server searched, when the URL says it by name rather than by
   * number — `/labs?area=Bang+Rak` carries no coordinates. Resolving it here
   * instead of redirecting to lat/lng keeps that URL a real page with results
   * in its HTML, which is the whole reason the area form exists.
   */
  initialCenter: { lat: number; lng: number } | null;
};

export function LabSearch({
  options,
  areas,
  initial,
  initialQuery,
  initialCenter,
  stockLabel,
}: LabSearchProps) {
  const [state, setState] = useQueryStates(labSearchParsers, {
    history: "push",
  });

  // The URL wins; the resolved area fills in only what the URL omits. Once
  // anyone geolocates or widens a radius, lat/lng are written and the area is
  // a stale label for a search that has moved.
  const search: LabSearchState = {
    ...(state as LabSearchState),
    lat: state.lat ?? initialCenter?.lat ?? null,
    lng: state.lng ?? initialCenter?.lng ?? null,
  };

  const [results, setResults] = useState<Results | null>(initial);
  // Stored with the query it answers rather than cleared when the search
  // moves: a bare list would have to be emptied from inside an effect, and
  // until that ran the page would be showing one search's near-misses under
  // another search's heading.
  const [nearMiss, setNearMiss] = useState<{
    query: string;
    labs: LabCardData[];
  } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const appliedQuery = useRef(initialQuery);
  const located = search.lat !== null && search.lng !== null;
  const query = located ? toApiQuery(search) : null;

  useEffect(() => {
    if (!query || query === appliedQuery.current) return;

    const controller = new AbortController();
    setPending(true);
    setError(null);

    fetch(`/api/labs?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Search failed (${response.status})`);
        return (await response.json()) as Results;
      })
      .then((data) => {
        appliedQuery.current = query;
        setResults(data);
        setSelectedId(null);
      })
      .catch((cause: unknown) => {
        // An aborted request is this effect superseding itself, not a failure.
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Search failed");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });

    return () => controller.abort();
  }, [query]);

  // The near-miss list behind the filtered empty state: the same search with
  // the filters dropped. Fetched only when it is about to be shown, because
  // most searches never reach that state.
  const filtered = hasActiveFilters(search);
  const noMatches = results !== null && results.labs.length === 0 && filtered;
  const nearMissQuery =
    noMatches && located ? toApiQuery(search, { ignoreFilters: true }) : null;

  useEffect(() => {
    if (!nearMissQuery) return;

    const controller = new AbortController();
    fetch(`/api/labs?${nearMissQuery}`, { signal: controller.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Results>) : null))
      .then(
        (data) =>
          data && setNearMiss({ query: nearMissQuery, labs: data.labs }),
      )
      .catch(() => {
        // A missing near-miss list degrades the empty state; it does not break
        // it, and reporting a second failure over the first helps nobody.
      });
    return () => controller.abort();
  }, [nearMissQuery]);

  const nearMisses = nearMiss?.query === nearMissQuery ? nearMiss.labs : [];

  const patch = useCallback(
    (next: Partial<LabSearchState>) => {
      void setState(next);
    },
    [setState],
  );

  // Selecting a pin scrolls its row into view; the list is the other half of
  // the map and losing your place in it defeats the pairing.
  useEffect(() => {
    if (!selectedId) return;
    document
      .querySelector(`[data-lab-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  if (!located) {
    return (
      <LocationPrompt
        areas={areas}
        onLocate={(lat, lng) => patch({ lat, lng })}
      />
    );
  }

  const center: [number, number] = [search.lng!, search.lat!];
  const labs = results?.labs ?? [];

  /**
   * What a screen reader is told when the result set changes.
   *
   * The list rewrites itself on every chip, every radius step and every map
   * pan, and none of that was announced — `aria-busy` said the list was
   * working and nothing ever said what it found.
   *
   * Deliberately empty while a search is in flight. "Searching…" politely
   * queued behind whatever is being read would arrive after the answer had
   * already replaced it, and `aria-busy` on the list carries "working"
   * without words. So this announces outcomes only: one per landed result
   * set, which also means a burst of filter toggles produces one announcement
   * per real answer rather than one per keystroke.
   */
  const outcome = error
    ? "Search failed."
    : pending
      ? ""
      : labs.length > 0
        ? `${results?.total ?? labs.length} ${(results?.total ?? labs.length) === 1 ? "lab" : "labs"} within ${Math.round(search.r / 1000)} km.`
        : filtered
          ? "No labs match these filters."
          : "No labs found nearby.";

  // On a wide screen this is a fixed viewport frame rather than a scrolling
  // page: the map holds still and the result list scrolls inside itself.
  //
  // That needs the frame's height pinned AND `min-h-0` on the flex children. A
  // flex item defaults to `min-height:auto`, which refuses to shrink below its
  // content, so without it the list pushes the frame taller than the screen and
  // the whole page scrolls — dragging the map out of view, which is the bug this
  // replaced. Below `lg` the two stack and the page scrolls normally, which is
  // what a phone wants.
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:h-[calc(100vh-4rem)] lg:min-h-0 lg:flex-row lg:overflow-hidden">
      <div className="order-2 flex w-full flex-col border-border lg:order-1 lg:h-full lg:min-h-0 lg:w-[27rem] lg:shrink-0 lg:border-r">
        <FilterPanel
          state={search}
          options={options}
          onChange={patch}
          resultCount={results?.total ?? 0}
          stockLabel={stockLabel ?? null}
        />

        {/* Polite and atomic: a result count is not urgent, and it reads as one
            sentence rather than as a diff of the previous one. */}
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {outcome}
        </p>

        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {error ? (
            <div className="px-5 py-10">
              <h2 className="text-xl">Search failed</h2>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            </div>
          ) : pending && labs.length === 0 ? (
            // Rows rather than the word "Searching…": this is the same wait
            // app/labs/loading.tsx covers on a cold navigation, and the two
            // should not look like different states of the same list.
            <ul aria-busy="true">
              <LabCardSkeleton width="76%" />
              <LabCardSkeleton width="54%" />
              <LabCardSkeleton width="68%" />
            </ul>
          ) : labs.length > 0 ? (
            <ul aria-busy={pending}>
              {labs.map((lab) => (
                <LabCard
                  key={lab.id}
                  lab={lab}
                  selected={lab.id === selectedId}
                  onSelect={setSelectedId}
                />
              ))}
            </ul>
          ) : filtered ? (
            <NoMatches
              nearMisses={nearMisses}
              radiusM={search.r}
              onWiden={(r) => patch({ r })}
              onClearFilters={() =>
                patch({ process: [], scanner: [], service: [], open: false })
              }
            />
          ) : (
            <NoLabsNearby radiusM={search.r} onWiden={(r) => patch({ r })} />
          )}
        </div>
      </div>

      <div className="order-1 h-[45vh] w-full lg:order-2 lg:h-full lg:min-h-0 lg:flex-1">
        <LabMap
          labs={labs}
          center={center}
          radiusM={search.r}
          selectedId={selectedId}
          onSelect={setSelectedId}
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
