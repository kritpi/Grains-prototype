import { notFound } from "next/navigation";

import { BackLink } from "@/components/layout/back-link";
import { LabSearch } from "@/components/labs/lab-search";
import {
  toApiQuery,
  type LabSearchState,
} from "@/components/labs/search-state";
import { chemProcess } from "@/lib/db/schema";
import {
  DEFAULT_RADIUS_M,
  listAreas,
  listFilterOptions,
  findArea,
  searchLabs,
  type ChemProcess,
} from "@/lib/queries/labs";

/**
 * Search results depend on the caller's coordinates and on the clock, so there
 * is nothing to prerender. The `?area=` form is still rendered on the server
 * with its results in the HTML, which is what makes it worth crawling.
 */
export const dynamic = "force-dynamic";

function asArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  // A repeated parameter arrives as an array; a comma-joined one is what nuqs
  // writes. Both are accepted so a hand-written URL works either way.
  return (Array.isArray(value) ? value : value.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}

function asNumber(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export default async function LabsPage({ searchParams }: PageProps<"/labs">) {
  const params = await searchParams;

  const [options, areas] = await Promise.all([
    listFilterOptions(),
    listAreas(),
  ]);

  const areaName = Array.isArray(params.area) ? params.area[0] : params.area;

  let lat = asNumber(params.lat);
  let lng = asNumber(params.lng);

  // Coordinates win over a name: the client writes lat/lng into the URL as
  // soon as anyone pans or geolocates, and at that point the area is a stale
  // label for a search that has moved on.
  if ((lat === null || lng === null) && areaName) {
    const area = findArea(areas, areaName);
    // An unknown area is a 404 rather than a silent search of somewhere else,
    // which would quietly show a Bangkok result set for a misspelt town.
    if (!area) notFound();
    lat = area.lat;
    lng = area.lng;
  }

  const processValues = new Set<string>(chemProcess.enumValues);
  const state: LabSearchState = {
    lat,
    lng,
    r: asNumber(params.r) ?? DEFAULT_RADIUS_M,
    process: asArray(params.process).filter((p): p is ChemProcess =>
      processValues.has(p),
    ),
    scanner: asArray(params.scanner),
    service: asArray(params.service),
    open: params.open === "true" || params.open === "1",
  };

  // The first page, rendered here rather than fetched after hydration. The
  // query string travels with it so the client can tell it already holds the
  // answer and skip an identical request on mount.
  const located = state.lat !== null && state.lng !== null;
  const initialQuery = located ? toApiQuery(state) : null;
  const initial = located
    ? await searchLabs({
        lat: state.lat!,
        lng: state.lng!,
        radiusM: state.r,
        process: state.process,
        scanner: state.scanner,
        service: state.service,
        openNow: state.open,
      })
    : null;

  return (
    <>
      {/* Track B addition: the search page had no way back to the entry screen.
          Every other page carries one, so this one does too. */}
      <BackLink href="/" label="Grains" />
      <LabSearch
        options={options}
        areas={areas}
        initial={initial}
        initialQuery={initialQuery}
        initialCenter={located ? { lat: state.lat!, lng: state.lng! } : null}
      />
    </>
  );
}
