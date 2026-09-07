import type { chemProcess } from "@/lib/db/schema";

/**
 * The parts of the search contract that both sides need.
 *
 * This module imports nothing at runtime, and that is its entire job. The
 * client's URL state needs the default radius and the list of processes; the
 * query layer and the Route Handler need the same values. Reaching into
 * lib/queries/labs.ts for them pulls getDb, and through it the postgres
 * driver, into the browser bundle — which fails the build with "Can't resolve
 * 'fs'" only once something actually renders. Neither tsc nor eslint sees it,
 * because a value import that is never called still type-checks perfectly.
 *
 * The import above is type-only and therefore erased, so the schema stays the
 * source of truth without the schema module being loaded.
 */
type SchemaProcess = (typeof chemProcess.enumValues)[number];

/** Written out rather than derived, so no value crosses into the browser. */
export const CHEM_PROCESSES = ["c41", "ecn2", "bw", "e6"] as const;

export type ChemProcess = (typeof CHEM_PROCESSES)[number];

/**
 * Compile-time proof that the list above and the database enum are the same
 * set. If they drift, this assignment stops being `true` and the message in
 * the failing type says which direction went wrong.
 */
type ProcessListCheck = [SchemaProcess] extends [ChemProcess]
  ? [ChemProcess] extends [SchemaProcess]
    ? true
    : ["CHEM_PROCESSES lists a process the schema does not have"]
  : ["CHEM_PROCESSES is missing a process the schema has"];

export const PROCESS_LIST_MATCHES_SCHEMA: ProcessListCheck = true;

/**
 * 5 km, and the same 5 km everywhere a radius is used — the initial search,
 * the "widen radius" prompt, and reverse search from a film page (PRD A).
 */
export const DEFAULT_RADIUS_M = 5000;

/** One page of results. The map and the list render the same page. */
export const DEFAULT_LIMIT = 50;
