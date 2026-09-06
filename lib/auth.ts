import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { cache } from "react";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db";
import { accounts, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { getUserById, type User } from "@/lib/queries/users";

/**
 * Auth.js v5, Google only.
 *
 * Identity lives in our own `users` table rather than in a provider's, so
 * `photos.owner_id` and `edit_history.editor_id` point at rows we control.
 * The adapter is given only `users` and `accounts`: with a JWT session and a
 * single OAuth provider, Auth.js never writes `sessions` or
 * `verification_tokens`, so those tables are not created.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  // Read inside the factory so importing this module does not require the
  // environment — `next build` and the health check both do that.
  const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET } = env();

  return {
    adapter: DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
    }),
    providers: [
      Google({ clientId: AUTH_GOOGLE_ID, clientSecret: AUTH_GOOGLE_SECRET }),
    ],
    secret: AUTH_SECRET,
    session: { strategy: "jwt" },
    pages: { signIn: "/sign-in" },
    callbacks: {
      /**
       * The token carries the user id and nothing else.
       *
       * Copying the username in would freeze it at sign-in: claiming one, or
       * any later change, would not appear until the token was reissued. The
       * id is the only fact about a user that cannot go stale.
       */
      jwt({ token, user }) {
        if (user?.id) token.sub = user.id;
        return token;
      },
      session({ session, token }) {
        if (token.sub) session.user.id = token.sub;
        return session;
      },
    },
  };
});

/**
 * The signed-in user's row, or null.
 *
 * Cached per request, so several Server Components can call it during one
 * render and pay for a single indexed lookup. Reading the row rather than the
 * token is what keeps `username` current — see the jwt callback above.
 */
export const currentUser = cache(async (): Promise<User | null> => {
  const session = await auth();
  const id = session?.user?.id;
  return id ? getUserById(id) : null;
});

/**
 * Guard for Server Actions and owner-only pages.
 *
 * Returns a user who is signed in *and* has claimed a username, so callers
 * never have to handle the half-registered state: everything that writes
 * depends on a complete user row existing.
 */
export async function requireUser(next?: string): Promise<User> {
  const user = await currentUser();

  if (!user) {
    const target = next
      ? `/sign-in?next=${encodeURIComponent(next)}`
      : "/sign-in";
    redirect(target);
  }
  if (!user.username) {
    redirect(next ? `/welcome?next=${encodeURIComponent(next)}` : "/welcome");
  }

  return user;
}
