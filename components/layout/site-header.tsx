import Link from "next/link";

import { Button } from "@/components/ui/button";
import { currentUser, signOut } from "@/lib/auth";

export async function SiteHeader() {
  const user = await currentUser();

  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <Link href="/" className="text-xl">
        Grains
      </Link>

      <nav className="flex items-center gap-4 text-sm">
        {user ? (
          <>
            {user.username ? (
              <Link href={`/u/${user.username}`} className="hover:underline">
                @{user.username}
              </Link>
            ) : (
              <Link href="/welcome" className="hover:underline">
                Choose a username
              </Link>
            )}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </>
        ) : (
          <Link href="/sign-in" className="hover:underline">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
