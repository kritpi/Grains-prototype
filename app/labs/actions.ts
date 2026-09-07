"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { describeConstraint } from "@/lib/constraint-messages";
import { getDb } from "@/lib/db";
import { newLabSchema } from "@/lib/labs/lab-input";
import {
  labChangesSchema,
  labPath,
  toHistoryChanges,
  type HistoryChange,
  type LabStatus,
} from "@/lib/labs/paths";
import {
  appendEditHistory,
  applyLabChanges,
  insertLab,
  readLabStatus,
} from "@/lib/queries/lab-edits";
import { getLab, type LabDetail } from "@/lib/queries/labs";

/**
 * Every write to a lab, as Server Actions.
 *
 * Each one is the same four steps in the same order: `requireUser()`, one
 * transaction, exactly one `edit_history` row, `revalidatePath`. Completeness is
 * recomputed inside the transaction by the query layer, so no caller can forget
 * it and no caller can do it twice.
 *
 * **One mutation writes exactly one history row.** That is the invariant
 * api-surface.md names, and it lives here rather than in lib/queries because
 * only the action knows where a mutation begins and ends: `applyLabChanges` is
 * called once per save, but nothing about the function itself would stop a
 * caller applying two diffs and recording one line about it.
 *
 * Trust is by default and every edit is live immediately — there is no review
 * queue and no moderator (PRD A). What stands in for moderation is that every
 * change is attributed, reversible and visible in the log, which is why the
 * history row is not optional and why a failed write records nothing at all.
 */

// ---------------------------------------------------------------------------

export type LabActionResult =
  | { ok: true; id: string }
  /** The form's own rules: the create gate, a malformed leaf, an empty save. */
  | { ok: false; reason: "invalid"; issues: string[] }
  /** Nothing to write. Not an error — a save that changed nothing. */
  | { ok: false; reason: "unchanged" }
  /** Someone else edited this lab first; `current` is what it looks like now. */
  | { ok: false; reason: "conflict"; current: LabDetail | null }
  /** A dropped process would take pricing with it that the diff never named. */
  | { ok: false; reason: "cascade"; missing: string[] }
  /** A database rule the form should have caught, said in words. */
  | { ok: false; reason: "rejected"; message: string };

/** Runs `fn`, turning a constraint the form should have caught into a message. */
async function catchingConstraints(
  fn: () => Promise<LabActionResult>,
): Promise<LabActionResult> {
  try {
    return await fn();
  } catch (error) {
    const message = describeConstraint(error);
    if (message === null) throw error;
    return { ok: false, reason: "rejected", message };
  }
}

/**
 * The lab page, the search list and any card showing this lab.
 *
 * `/labs` is revalidated as well as the lab's own page because a name, a price
 * or a completeness score changing moves the lab in the results — the edit is
 * not only visible on the page that was edited.
 */
function revalidateLab(labId: string): void {
  revalidatePath(`/labs/${labId}`);
  revalidatePath("/labs");
}

// ---------------------------------------------------------------------------

/**
 * Create a lab.
 *
 * The gate is the schema's: a name, a pin, and at least one process. Everything
 * else is optional because a contributor standing outside a shop knows some of
 * it and not the rest, and a form that demands prices before it accepts a lab
 * gets no labs.
 *
 * The history entry records one change — the name, from null. It means "this
 * lab appeared", which is what the first line of a log is for; replaying forty
 * leaves at creation would bury every real edit that follows under the founding
 * dump. Both seed files already write it this way.
 */
export async function createLab(input: unknown): Promise<LabActionResult> {
  const user = await requireUser("/labs/new");

  const parsed = newLabSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", issues: issuesOf(parsed.error) };
  }

  return catchingConstraints(async () => {
    const labId = await getDb().transaction(async (tx) => {
      const id = await insertLab(tx, { ...parsed.data, createdBy: user.id });
      await appendEditHistory(tx, {
        entity: "lab",
        entityId: id,
        editorId: user.id,
        changes: [
          {
            path: labPath.scalar("name_en"),
            from: null,
            to: parsed.data.nameEn,
          },
        ],
      });
      return id;
    });

    revalidateLab(labId);
    return { ok: true, id: labId };
  });
}

/**
 * Apply a diff to a lab, under optimistic concurrency.
 *
 * `version` is the one the editor's form was rendered from. If the lab has
 * moved since, nothing is written and the caller gets the lab as it now is, so
 * the conflict dialog can show what changed rather than only that something
 * did.
 *
 * The changes are leaf paths, not a form snapshot, and that is the whole point:
 * only the named leaves are written, so an editor who never touched the hours
 * cannot revert somebody else's correction to them.
 */
export async function updateLab(
  labId: string,
  version: number,
  changes: unknown,
  note?: string,
): Promise<LabActionResult> {
  const user = await requireUser(`/labs/${labId}/edit`);

  // An empty save is a no-op rather than a validation failure: the contributor
  // opened the form, changed their mind, and pressed save. Nothing is wrong.
  if (Array.isArray(changes) && changes.length === 0) {
    return { ok: false, reason: "unchanged" };
  }

  const parsed = labChangesSchema.safeParse(changes);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", issues: issuesOf(parsed.error) };
  }

  const result = await catchingConstraints(async () => {
    const outcome = await getDb().transaction(
      async (tx): Promise<LabActionResult> => {
        const applied = await applyLabChanges(tx, labId, version, parsed.data);

        if (!applied.ok) {
          return applied.reason === "conflict"
            ? { ok: false, reason: "conflict", current: null }
            : { ok: false, reason: "cascade", missing: applied.missing };
        }

        await appendEditHistory(tx, {
          entity: "lab",
          entityId: labId,
          editorId: user.id,
          note: note?.trim() || null,
          changes: toHistoryChanges(parsed.data),
        });
        return { ok: true, id: labId };
      },
    );

    if (outcome.ok) revalidateLab(labId);
    return outcome;
  });

  // Read after the transaction has closed, so the conflict dialog shows the
  // committed lab rather than this transaction's snapshot of it.
  if (!result.ok && result.reason === "conflict") {
    return { ok: false, reason: "conflict", current: await getLab(labId) };
  }
  return result;
}

/**
 * Set a lab's status — a temporary note, or "permanently closed".
 *
 * A flag, never a delete (PRD A). A closed lab still has a page, still has its
 * history, and still answers the question somebody arrived with; deleting it
 * would turn a useful "this shut in March" into a 404 that reads like a bug.
 *
 * It goes through the same diff path as any other edit rather than writing the
 * columns directly, which is what makes it appear in the log with a `from` and
 * a `to` like everything else, and what gives it the same conflict semantics
 * for free.
 */
export async function setLabStatus(
  labId: string,
  version: number,
  status: LabStatus,
  note?: string | null,
): Promise<LabActionResult> {
  const user = await requireUser(`/labs/${labId}`);

  const result = await catchingConstraints(async () => {
    const outcome = await getDb().transaction(
      async (tx): Promise<LabActionResult> => {
        const current = await readLabStatus(tx, labId);
        if (!current) {
          return { ok: false, reason: "invalid", issues: ["No such lab."] };
        }

        const nextNote = note?.trim() || null;
        const changes: HistoryChange[] = [];
        if (current.status !== status) {
          changes.push({
            path: labPath.scalar("status"),
            from: current.status,
            to: status,
          });
        }
        if (current.statusNote !== nextNote) {
          changes.push({
            path: labPath.scalar("status_note"),
            from: current.statusNote,
            to: nextNote,
          });
        }
        if (changes.length === 0) return { ok: false, reason: "unchanged" };

        const parsed = labChangesSchema.safeParse(changes);
        if (!parsed.success) {
          return {
            ok: false,
            reason: "invalid",
            issues: issuesOf(parsed.error),
          };
        }

        const applied = await applyLabChanges(tx, labId, version, parsed.data);
        if (!applied.ok) {
          return applied.reason === "conflict"
            ? { ok: false, reason: "conflict", current: null }
            : { ok: false, reason: "cascade", missing: applied.missing };
        }

        await appendEditHistory(tx, {
          entity: "lab",
          entityId: labId,
          editorId: user.id,
          changes: toHistoryChanges(parsed.data),
        });
        return { ok: true, id: labId };
      },
    );

    if (outcome.ok) revalidateLab(labId);
    return outcome;
  });

  if (!result.ok && result.reason === "conflict") {
    return { ok: false, reason: "conflict", current: await getLab(labId) };
  }
  return result;
}

/** Zod's issues as sentences, with the path so a form can point at a field. */
function issuesOf(error: {
  issues: { path: PropertyKey[]; message: string }[];
}) {
  return error.issues.map((issue) =>
    issue.path.length > 0
      ? `${issue.path.join(".")}: ${issue.message}`
      : issue.message,
  );
}
