"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { describeConstraint } from "@/lib/constraint-messages";
import { toggleBadgeVote } from "@/lib/queries/lab-badges";

/**
 * Endorsing a lab, from its own page.
 *
 * Lives beside the page it serves rather than in `app/labs/actions.ts`, which is
 * Track B's file for lab *edits* — creating, updating, status changes, all of
 * which carry a version and write an `edit_history` row. A badge vote does none
 * of that: it is one row in a join table, owned by one user, and retracting it
 * is a delete rather than a correction. Putting it in B's file would mean two
 * worktrees editing one file for two unrelated features.
 *
 * `requireUser()` first, as every write does (CLAUDE.md). It redirects a
 * signed-out caller to sign-in rather than throwing, which is why the button is
 * rendered as a link for signed-out readers — arriving at sign-in should be a
 * choice they made, not the result of a click that looked like it would do
 * something else.
 */
export type BadgeToggleResult =
  | { ok: true; endorsed: boolean }
  /** Said in words, for a chip that has to explain itself in one line. */
  | { ok: false; message: string };

export async function toggleLabBadge(
  labId: string,
  badgeKey: string,
): Promise<BadgeToggleResult> {
  // Outside the try: `requireUser` redirects a signed-out caller by throwing,
  // and catching that would turn a sign-in into a failed vote.
  const user = await requireUser(`/labs/${labId}`);

  let endorsed: boolean;
  try {
    ({ endorsed } = await toggleBadgeVote(labId, badgeKey, user.id));
  } catch (error) {
    // The vote is optimistic on the client, so a thrown error used to revert
    // the chip with nothing said — indistinguishable from a mis-click. A
    // result the caller can read is the whole point of this shape.
    const known = describeConstraint(error);
    if (known !== null) return { ok: false, message: known };

    // A badge key that is not in the catalog is the only other way this
    // fails, and it means the page is stale rather than the reader wrong.
    console.error("toggleLabBadge failed", { labId, badgeKey, error });
    return {
      ok: false,
      message: "That endorsement did not save. Reload the page and try again.",
    };
  }

  // The count is rendered on the lab page and on every card in a search that
  // includes this lab, so the path is revalidated rather than the component.
  revalidatePath(`/labs/${labId}`);

  return { ok: true, endorsed };
}
