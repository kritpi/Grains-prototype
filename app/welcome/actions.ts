"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { currentUser } from "@/lib/auth";
import { claimUsername } from "@/lib/queries/users";
import { usernameSchema } from "@/lib/username";

export type ClaimState = { error: string } | null;

const UNIQUE_VIOLATION = "23505";

/**
 * Claim a username, once, at first sign-in.
 *
 * Deliberately does not use requireUser(): that guard redirects to this very
 * page when a username is missing, which is the state every caller here is in.
 */
export async function claimUsernameAction(
  _previous: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  if (user.username) redirect(`/u/${user.username}`);

  const parsed = usernameSchema.safeParse(formData.get("username"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  let claimed;
  try {
    claimed = await claimUsername(user.id, parsed.data);
  } catch (error) {
    // Two people racing for one name is settled by the unique index, not by a
    // lookup that was already stale when it returned.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === UNIQUE_VIOLATION
    ) {
      return { error: "That name is taken." };
    }
    throw error;
  }

  if (!claimed) {
    return { error: "You already have a username." };
  }

  revalidatePath("/", "layout");
  redirect(`/u/${claimed.username}`);
}
