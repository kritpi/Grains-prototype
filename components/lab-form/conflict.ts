import {
  formatChangePath,
  formatChangeValue,
} from "@/components/labs/edit-log-format";
import type { HistoryChange } from "@/lib/labs/paths";
import type { LabDetail } from "@/lib/queries/labs";

import { diffDraft, draftFromLab, type LabDraft } from "./draft";

/**
 * Three-way merge for a lab edit that lost the race.
 *
 * `updateLab` refuses a stale version and hands back the lab as it now is, so
 * everything a merge needs is already in the room: the baseline the form was
 * rendered from (`initial`), what this editor typed (`draft`), and what the
 * lab became (`server`). Two `diffDraft` calls against the same baseline give
 * both sides of the merge, which is why no new diff engine appears here —
 * `diffDraft` is the engine, and it already emits leaf paths.
 *
 * **Resolution is per slot, not per leaf.** `pricing.c41.135.price_thb` and
 * `pricing.c41.135.turnaround_min_d` are one cell in the form and one decision
 * for a person, so they are one row here. The alternative — a choice per leaf —
 * would let somebody keep their price and take a stranger's turnaround for the
 * same cell, which is a state neither editor intended and no UI would explain.
 *
 * A slot is also the unit that can be *copied* between drafts without
 * inverting the eight diff functions in draft.ts. That is not a coincidence:
 * the grain a person decides at and the grain the data moves at are the same
 * grain, and picking either one separately would have been wrong.
 */

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

/**
 * Which part of a draft a leaf path belongs to.
 *
 * Stringly typed on purpose — it is a map key, a React key and a
 * `Record<string, "mine" | "theirs">` key, and a struct would be converted to
 * a string at all three.
 */
export type SlotKey = string;

/**
 * `pricing.c41.135.price_thb` → `pricing:c41.135`.
 *
 * Unrecognised paths fall back to the whole path as its own slot rather than
 * throwing. A path this function has never seen is a leaf `draft.ts` learned to
 * emit after this file was written; treating it as a slot of one degrades to
 * per-leaf resolution for that field, which is worse UX and still correct.
 * Refusing to merge would be neither.
 */
export function slotOf(path: string): SlotKey {
  const [head, ...rest] = path.split(".");

  switch (head) {
    // Every scalar column is its own slot, including `location`, which
    // diffDraft already emits as a single leaf because half a coordinate pair
    // is a lab in the sea.
    case "name_en":
    case "name_th":
    case "area_en":
    case "area_th":
    case "street":
    case "landmark_note":
    case "status":
    case "status_note":
    case "location":
      return `scalar:${head}`;

    // A weekday is one row in the form: open, close and closed move together.
    case "hours":
      return `hours:${rest[0]}`;

    // `pricing.<process>.<format>.<field>` — the cell, not the field.
    case "pricing":
      return `pricing:${rest[0]}.${rest[1]}`;

    case "processes":
    case "scanners":
    case "supplies":
    case "services":
    case "contacts":
    case "stock":
      return `${head}:${rest[0]}`;

    default:
      return `path:${path}`;
  }
}

/**
 * Copy one slot from one draft into another, in place.
 *
 * `to` is mutated; callers own the clone. Returns nothing because there is
 * nothing useful to return — a slot that does not exist on `from` is a slot
 * being removed, and removing it from `to` is the correct copy.
 */
function copySlot(from: LabDraft, to: LabDraft, slot: SlotKey): void {
  const [kind, id = ""] = splitSlot(slot);

  switch (kind) {
    case "scalar": {
      switch (id) {
        case "name_en":
          to.nameEn = from.nameEn;
          return;
        case "name_th":
          to.nameTh = from.nameTh;
          return;
        case "area_en":
          to.areaEn = from.areaEn;
          return;
        case "area_th":
          to.areaTh = from.areaTh;
          return;
        case "street":
          to.street = from.street;
          return;
        case "landmark_note":
          to.landmarkNote = from.landmarkNote;
          return;
        case "status":
          to.status = from.status;
          return;
        case "status_note":
          to.statusNote = from.statusNote;
          return;
        case "location":
          to.location = from.location;
          return;
        default:
          return;
      }
    }

    case "hours": {
      const day = Number(id);
      if (!Number.isInteger(day) || day < 0 || day > 6) return;
      // A week that exists on one side and not the other is adopted whole:
      // hours is null until somebody enters a schedule, and seven days is the
      // only other shape the column allows.
      if (from.hours === null) {
        to.hours = null;
        return;
      }
      if (to.hours === null) {
        to.hours = structuredClone(from.hours);
        return;
      }
      to.hours[day] = structuredClone(from.hours[day]);
      return;
    }

    case "pricing": {
      const cell = from.pricing[id];
      if (cell === undefined) delete to.pricing[id];
      else to.pricing[id] = { ...cell };
      return;
    }

    case "processes": {
      to.processes[id] = from.processes[id] ?? false;
      return;
    }

    case "scanners": {
      to.scanners[id] = from.scanners[id] ?? false;
      return;
    }

    // Services and supplies are two collections behind one path head: a
    // curated key addresses the catalog record, anything else is a
    // contributor's freeform row addressed by the uuid the form gave it.
    case "services": {
      if (id in from.services || id in to.services) {
        const row = from.services[id];
        if (row === undefined) delete to.services[id];
        else to.services[id] = { ...row };
        return;
      }
      copyCustomRow(from.customServices, to, "customServices", id);
      return;
    }

    case "supplies": {
      if (id in from.supplies || id in to.supplies) {
        to.supplies[id] = from.supplies[id] ?? false;
        return;
      }
      copyCustomRow(from.customSupplies, to, "customSupplies", id);
      return;
    }

    case "contacts": {
      const row = from.contacts.find((c) => c.id === id);
      to.contacts = replaceById(to.contacts, id, row);
      return;
    }

    case "stock": {
      const row = from.stock.find((s) => s.filmStockId === id);
      to.stock = replaceById(to.stock, id, row, "filmStockId");
      return;
    }

    default:
      return;
  }
}

/** `pricing:c41.135` → `["pricing", "c41.135"]`; only the first colon splits. */
function splitSlot(slot: SlotKey): [string, string] {
  const at = slot.indexOf(":");
  return at === -1 ? [slot, ""] : [slot.slice(0, at), slot.slice(at + 1)];
}

function copyCustomRow(
  source: LabDraft["customServices"],
  to: LabDraft,
  key: "customServices" | "customSupplies",
  id: string,
): void {
  const row = source.find((r) => r.id === id);
  to[key] = replaceById(to[key], id, row);
}

/**
 * Insert, replace or remove one row of a keyed list, preserving order.
 *
 * A row absent from `row` is a deletion. A row absent from `list` is an
 * addition and goes on the end, which is the only position that does not
 * reorder somebody else's list as a side effect of a merge.
 */
function replaceById<T extends Record<string, unknown>>(
  list: T[],
  id: string,
  row: T | undefined,
  idKey: string = "id",
): T[] {
  const without = list.filter((item) => item[idKey] !== id);
  return row === undefined ? without : [...without, structuredClone(row)];
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/** One decision a person has to make, with both sides written out. */
export type ConflictRow = {
  slot: SlotKey;
  /** "Pricing · C-41 · 135" — the shared prefix of the leaves in this slot. */
  label: string;
  /** Per-leaf detail, for the slots that hold more than one value. */
  leaves: { label: string; base: string; mine: string; theirs: string }[];
};

export type MergePlan = {
  /** Slots both sides changed. Empty in the common case. */
  contested: ConflictRow[];
  /** Slots only they changed, adopted without asking. */
  autoSlots: SlotKey[];
  /** What the auto-merged slots are called, for the summary line. */
  autoLabels: string[];
  /** Slots only this editor changed, kept as typed. */
  keptSlots: SlotKey[];
};

export type Resolution = Record<SlotKey, "mine" | "theirs">;

function bySlot(changes: HistoryChange[]): Map<SlotKey, HistoryChange[]> {
  const grouped = new Map<SlotKey, HistoryChange[]>();
  for (const change of changes) {
    const slot = slotOf(change.path);
    const existing = grouped.get(slot);
    if (existing) existing.push(change);
    else grouped.set(slot, [change]);
  }
  return grouped;
}

/**
 * What changed on each side, and which of it needs a person.
 *
 * Both diffs are taken against the *same* baseline — the draft the form was
 * rendered from — which is what makes them comparable. Diffing mine against
 * theirs directly would report every field either of us touched as a conflict.
 */
export function planMerge(
  initial: LabDraft,
  draft: LabDraft,
  server: LabDetail,
): MergePlan {
  const mine = bySlot(diffDraft(initial, draft));
  const theirs = bySlot(diffDraft(initial, draftFromLab(server)));

  const contested: ConflictRow[] = [];
  const autoSlots: SlotKey[] = [];
  const autoLabels: string[] = [];

  for (const [slot, theirChanges] of theirs) {
    const myChanges = mine.get(slot);
    if (!myChanges) {
      autoSlots.push(slot);
      autoLabels.push(slotLabel(theirChanges));
      continue;
    }
    contested.push({
      slot,
      label: slotLabel(theirChanges),
      leaves: leavesOf(myChanges, theirChanges),
    });
  }

  const keptSlots = [...mine.keys()].filter((slot) => !theirs.has(slot));
  return { contested, autoSlots, autoLabels, keptSlots };
}

/**
 * A slot's name, taken from the longest prefix its leaves agree on.
 *
 * `Pricing · C-41 · 135 · Price` and `… · Turnaround, from` share three
 * segments, and those three are the cell. Falling back to the first leaf's full
 * label when they share nothing keeps a single-leaf slot reading normally.
 */
function slotLabel(changes: HistoryChange[]): string {
  const parts = changes.map((c) => formatChangePath(c.path).split(" · "));
  const first = parts[0] ?? [];
  let shared = first.length;
  for (const other of parts.slice(1)) {
    let i = 0;
    while (i < shared && i < other.length && other[i] === first[i]) i += 1;
    shared = i;
  }
  return (shared > 0 ? first.slice(0, shared) : first).join(" · ");
}

function leavesOf(
  myChanges: HistoryChange[],
  theirChanges: HistoryChange[],
): ConflictRow["leaves"] {
  const paths = [
    ...new Set([...myChanges, ...theirChanges].map((c) => c.path)),
  ].sort();

  return paths.map((path) => {
    const my = myChanges.find((c) => c.path === path);
    const their = theirChanges.find((c) => c.path === path);
    // `from` is the shared baseline, so either side carries it; where only one
    // side touched this leaf, the other's value *is* the baseline.
    const base = (my ?? their)?.from;
    return {
      label: formatChangePath(path),
      base: formatChangeValue(base),
      mine: formatChangeValue(my ? my.to : base),
      theirs: formatChangeValue(their ? their.to : base),
    };
  });
}

/** Every contested slot defaulting to theirs. See ConflictResolver for why. */
export function defaultResolution(plan: MergePlan): Resolution {
  return Object.fromEntries(
    plan.contested.map((row) => [row.slot, "theirs" as const]),
  );
}

/**
 * The merged draft.
 *
 * Starts from what this editor typed and pulls the other side in, rather than
 * the reverse, because the edits in the form are the ones at risk: they exist
 * only here, while the server's are already saved and recoverable from the log.
 *
 * The caller must also reset the form's baseline to `draftFromLab(server)`. The
 * merged draft is expressed relative to the server's state, so diffing it
 * against the old baseline would re-send leaves that are already committed.
 */
export function applyMerge(
  draft: LabDraft,
  server: LabDetail,
  plan: MergePlan,
  resolution: Resolution,
): LabDraft {
  const theirs = draftFromLab(server);
  const merged = structuredClone(draft);

  for (const slot of plan.autoSlots) copySlot(theirs, merged, slot);

  for (const row of plan.contested) {
    if ((resolution[row.slot] ?? "theirs") === "theirs") {
      copySlot(theirs, merged, row.slot);
    }
  }

  return merged;
}
