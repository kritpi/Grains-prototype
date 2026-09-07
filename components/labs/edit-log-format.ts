import { DAY_LABELS } from "@/lib/labs/hours";

import { PROCESS_LABELS } from "./search-state";

/**
 * Reading Track B's leaf paths back out.
 *
 * `edit_history.changes` is an array of `{path, from, to}`, where the path
 * names one leaf of a lab: `name_en`, `hours.3.open`,
 * `pricing.c41.135.price_thb`, `contacts.<uuid>.value`. The grammar that writes
 * them is `lib/labs/paths.ts` — Track B's B1, and the riskiest artefact in
 * Phase 2. It does not exist yet.
 *
 * So this reads the shape rather than depending on the module: it labels the
 * segments it recognises and humanises the rest. That is deliberate and not a
 * placeholder to rip out. The log has to survive paths written by a version of
 * the grammar this code has never seen — an entry recorded today must still
 * render after B adds a field next month — and a formatter that threw, or
 * printed nothing, on an unknown path would lose history rather than display it
 * imperfectly. Worst case a reader sees the raw leaf name, which is still true.
 */

/** Path heads that name a collection keyed by something opaque. */
const OPAQUE_KEYED = new Set(["contacts", "stock", "photos"]);

const HEAD_LABELS: Record<string, string> = {
  name_en: "Name (EN)",
  name_th: "Name (TH)",
  area_en: "Area (EN)",
  area_th: "Area (TH)",
  street: "Street",
  landmark_note: "Landmark note",
  location: "Location",
  status: "Status",
  status_note: "Status note",
  hours: "Hours",
  pricing: "Pricing",
  processes: "Process",
  scanners: "Scanner",
  services: "Service",
  supplies: "Supplies",
  contacts: "Contact",
  stock: "Film stock",
  photos: "Photo",
};

/**
 * Leaf names whose humanised form is wrong rather than merely plain.
 *
 * `price_thb` becoming "Price thb" is the giveaway: the suffix is a unit the
 * column carries and the reader does not need, and the same goes for the `_d`
 * on the turnaround bounds. Everything else humanises acceptably.
 */
const LEAF_LABELS: Record<string, string> = {
  price_thb: "Price",
  turnaround_min_d: "Turnaround, from",
  turnaround_max_d: "Turnaround, to",
  name_en: "Name (EN)",
  name_th: "Name (TH)",
  custom_label: "Label",
  service_key: "Service",
  supply_key: "Supply",
};

/** `landmark_note` → `Landmark note`; the fallback for anything unrecognised. */
function humanise(segment: string): string {
  const known = LEAF_LABELS[segment];
  if (known) return known;

  const spaced = segment.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isUuid(segment: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    segment,
  );
}

/**
 * A leaf path as something a person can read: "Pricing · C-41 · 135 · Price".
 *
 * Opaque identifiers are dropped rather than printed — a contact's uuid tells a
 * reader nothing, and "Contact · Value" is the whole of what they can use.
 */
export function formatChangePath(path: string): string {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return path;

  const [head, ...rest] = segments;
  const parts: string[] = [HEAD_LABELS[head] ?? humanise(head)];

  for (const segment of rest) {
    if (OPAQUE_KEYED.has(head) && isUuid(segment)) continue;

    // hours.3.open — the index is a weekday, and "3" is not.
    if (head === "hours" && /^[0-6]$/.test(segment)) {
      parts.push(DAY_LABELS[Number(segment)]);
      continue;
    }

    if (segment in PROCESS_LABELS) {
      parts.push(PROCESS_LABELS[segment as keyof typeof PROCESS_LABELS]);
      continue;
    }

    parts.push(humanise(segment));
  }

  return parts.join(" · ");
}

/**
 * One side of a diff, printed.
 *
 * Null and empty string both mean "there was nothing here", and both say so in
 * words: an em dash alone reads as a value in a table of prices, and "" reads
 * as a bug.
 */
export function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "not set";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) {
    return value.length === 0
      ? "none"
      : value.map(formatChangeValue).join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * "3 days ago" — coarse on purpose.
 *
 * The log answers "is this current", not "at what minute", and a relative age
 * survives a reader in any time zone. Anything older than a fortnight gets a
 * real date instead, because "47 days ago" is arithmetic homework.
 */
export function formatEditAge(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days <= 14) return `${days} day${days === 1 ? "" : "s"} ago`;

  return then.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
