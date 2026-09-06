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

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:flex-row">
      <div className="order-2 flex w-full flex-col border-border lg:order-1 lg:w-[27rem] lg:shrink-0 lg:border-r">
        <FilterPanel
          state={search}
          options={options}
          onChange={patch}
          resultCount={results?.total ?? 0}
        />

        <div className="lg:h-[calc(100vh-4rem)] lg:overflow-y-auto">
          {error ? (
            <div className="px-5 py-10">
              <h2 className="text-xl">Search failed</h2>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            </div>
          ) : pending && labs.length === 0 ? (
            <p className="px-5 py-10 font-sans text-xs text-muted-foreground">
              Searching…
            </p>
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

      <div className="order-1 h-[45vh] w-full lg:order-2 lg:h-[calc(100vh-4rem)] lg:flex-1">
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
