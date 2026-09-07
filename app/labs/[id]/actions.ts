"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
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
export async function toggleLabBadge(labId: string, badgeKey: string) {
  const user = await requireUser(`/labs/${labId}`);

  const { endorsed } = await toggleBadgeVote(labId, badgeKey, user.id);

  // The count is rendered on the lab page and on every card in a search that
  // includes this lab, so the path is revalidated rather than the component.
  revalidatePath(`/labs/${labId}`);

  return { endorsed };
}
