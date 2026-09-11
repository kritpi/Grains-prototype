import type { LabDraft } from "./draft";

/**
 * Keeping a half-finished lab edit on the device.
 *
 * The form is long — a four-by-two pricing matrix, seven days of hours, a
 * contact list — and until now every way of leaving it lost everything: a
 * refresh, a stray back gesture, a closed tab, and in particular the one case
 * the interface actively recommends. A version conflict can only be resolved
 * against the current lab, so the honest instruction is "reload", and without
 * this that instruction ended the contribution.
 *
 * Device-local and never synced. A draft is not a submission — there is no
 * review queue in this product (PRD A), so a server-side draft would be a
 * second kind of pending state with no page to show it on.
 */

export type StoredDraft = {
  /**
   * The lab version the draft was typed against.
   *
   * This is what makes staleness detectable: restoring text typed against
   * version 4 onto a lab that is now version 7 would silently revert whatever
   * happened in between, so the caller compares before offering.
   */
  baseVersion: number;
  draft: LabDraft;
  note: string;
  savedAt: number;
};

/** Long enough to survive a weekend, short enough not to haunt anyone. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Per lab, so two tabs on two labs do not overwrite each other. */
export function draftKey(labId: string | undefined): string {
  return `grains:lab-draft:${labId ?? "new"}`;
}

/**
 * Read a stored draft, or null.
 *
 * Every failure returns null rather than throwing. Storage throws on access in
 * more situations than it is comfortable to enumerate — Safari's private mode,
 * a full quota, site data blocked by policy — and none of them is a reason a
 * contributor cannot use the form. An unparseable or expired entry is removed
 * on the way past so it stops being read.
 */
export function loadDraft(key: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isStored(parsed)) {
      window.localStorage.removeItem(key);
      return null;
    }
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: StoredDraft): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Over quota or storage denied. The form keeps working; only the safety
    // net is gone, and telling somebody mid-sentence that their draft is not
    // being kept would be a worse interruption than the risk it warns about.
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do, and nothing depends on it: a draft left behind is
    // discarded on read once it no longer matches the lab's version.
  }
}

/**
 * Shape check, not validation.
 *
 * The draft itself is trusted to be a draft — it was written by this form and
 * is about to be diffed against a baseline, so a malformed field surfaces as a
 * change nobody made rather than as a crash. What is checked is the envelope,
 * because that is what the staleness and expiry decisions read.
 */
function isStored(value: unknown): value is StoredDraft {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.baseVersion === "number" &&
    typeof candidate.savedAt === "number" &&
    typeof candidate.note === "string" &&
    typeof candidate.draft === "object" &&
    candidate.draft !== null
  );
}
