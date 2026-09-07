// From nuqs/server, not nuqs. The parsers exist on both entry points, but the
// root export is the client entry: a Server Component importing it receives a
// client reference rather than the parser, and `.withDefault` is missing at
// runtime with nothing failing at build time. app/labs/page.tsx reads these,
// so this file has to be importable from the server.
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

// Only from lib/labs/search-params — never from lib/queries/labs, which is
// server-only. This module is imported by client components, and a value
// import from the query layer drags the postgres driver into the browser.
import {
  CHEM_PROCESSES,
  DEFAULT_RADIUS_M,
  type ChemProcess,
} from "@/lib/labs/search-params";

export { CHEM_PROCESSES };

/** How each process is written for a person, since the keys are not English. */
export const PROCESS_LABELS: Record<ChemProcess, string> = {
  c41: "C-41",
  ecn2: "ECN-2",
  bw: "B&W",
  e6: "E-6",
};

/** The radii the control offers. 5 km is the PRD's default. */
export const RADIUS_CHOICES_M = [1000, 2000, 5000, 10_000, 25_000] as const;

/**
 * The search lives in the URL, not in React state.
 *
 * That is the point of the whole arrangement: a search can be linked, shared,
 * reloaded and walked back through with the browser's own back button, and the
 * server can render the first page of one it has never seen before. Keys are
 * short because they are user-visible.
 *
 * Array values are comma-joined here, while /api/labs takes repeated
 * parameters. The two serializations are deliberately independent — this one
 * is read by people and kept short; that one never has to escape a comma. The
 * only values that pass through are enum keys and curated catalog entries, so
 * nothing here can contain a separator.
 */
export const labSearchParsers = {
  lat: parseAsFloat,
  lng: parseAsFloat,
  r: parseAsInteger.withDefault(DEFAULT_RADIUS_M),
  process: parseAsArrayOf(parseAsStringLiteral(CHEM_PROCESSES)).withDefault([]),
  scanner: parseAsArrayOf(parseAsString).withDefault([]),
  service: parseAsArrayOf(parseAsString).withDefault([]),
  open: parseAsBoolean.withDefault(false),
};

export type LabSearchState = {
  lat: number | null;
  lng: number | null;
  r: number;
  process: ChemProcess[];
  scanner: string[];
  service: string[];
  open: boolean;
};

/** True when the search is narrowed by anything other than where and how far. */
export function hasActiveFilters(state: LabSearchState): boolean {
  return (
    state.process.length > 0 ||
    state.scanner.length > 0 ||
    state.service.length > 0 ||
    state.open
  );
}

/**
 * The /api/labs query for a given state, with repeated array parameters.
 *
 * Kept next to the parsers above so the two serializations stay in one file:
 * if the URL grows a filter, the place that forwards it to the API is the next
 * function down rather than somewhere in a component.
 */
export function toApiQuery(
  state: LabSearchState,
  options: { ignoreFilters?: boolean } = {},
): string {
  const params = new URLSearchParams();
  params.set("lat", String(state.lat));
  params.set("lng", String(state.lng));
  params.set("radius_m", String(state.r));

  if (!options.ignoreFilters) {
    for (const p of state.process) params.append("process", p);
    for (const s of state.scanner) params.append("scanner", s);
    for (const s of state.service) params.append("service", s);
    if (state.open) params.set("open_now", "true");
  }

  return params.toString();
}
