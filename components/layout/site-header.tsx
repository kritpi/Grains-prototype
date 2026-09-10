import Link from "next/link";

import { SiteNav } from "@/components/layout/site-nav";
import { Button } from "@/components/ui/button";
import { currentUser, signOut } from "@/lib/auth";

export async function SiteHeader() {
  const user = await currentUser();

  // Sticky, and h-16 rather than padding-derived.
  //
  // /labs is a fixed viewport frame — the map holds still while the result list
  // scrolls inside itself — and it sizes that frame as `calc(100vh-4rem)`. That
  // arithmetic is only correct if the header is exactly 4rem tall, so the height
  // is stated here rather than left to emerge from padding and the line box of
  // whatever happens to be inside.
  //
  // `bg-background` is not decoration: without it the page scrolls through a
  // transparent header.
  return (
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-border bg-background px-6">
      {/* Wordmark and sections read as one group on the left; the prototype
          sets them 14px apart and the sections 20px from each other. */}
      <div className="flex items-center gap-3.5">
        <Link href="/" className="text-xl">
          Grains
        </Link>
        <SiteNav />
      </div>

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
