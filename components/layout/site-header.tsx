import Link from "next/link";
import { Suspense } from "react";

import {
  LangToggle,
  LangToggleFallback,
} from "@/components/layout/lang-toggle";
import { SiteNav } from "@/components/layout/site-nav";
import { Button } from "@/components/ui/button";
import { currentUser, signOut } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { currentLang } from "@/lib/i18n-server";

export async function SiteHeader() {
  const [user, lang] = await Promise.all([currentUser(), currentLang()]);

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
      <div className="flex shrink-0 items-center gap-3.5">
        {/* /labs, not / — the landing page is a redirect to it, and a
            wordmark that costs an extra hop is a wordmark nobody clicks. */}
        <Link href="/labs" className="text-xl">
          Grains
        </Link>
        <SiteNav lang={lang} />
      </div>

      <nav className="flex min-w-0 items-center gap-4 text-sm">
        {/* The toggle reads the current query string so switching language
            does not throw away a search, which makes it a Client Component and
            this boundary mandatory: without it every statically prerendered
            page would opt out of prerendering because the root layout reads
            searchParams. */}
        <Suspense fallback={<LangToggleFallback lang={lang} />}>
          <LangToggle lang={lang} />
        </Suspense>
        {user ? (
          <>
            {user.username ? (
              // A username is up to 30 characters (lib/username.ts), and at
              // 375px `@` plus thirty of them pushes the whole page into
              // horizontal scroll — measured at 395px against a 375px
              // viewport. It is the only unbounded thing in the header, so it
              // is the thing that gives. `title` keeps the full handle
              // readable, and it is a link to your own profile, so nobody is
              // being asked to identify a stranger from a truncation.
              <Link
                href={`/u/${user.username}`}
                title={`@${user.username}`}
                className="min-w-0 truncate hover:underline"
              >
                @{user.username}
              </Link>
            ) : (
              <Link href="/welcome" className="hover:underline">
                {t(lang, "auth.chooseUsername")}
              </Link>
            )}
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button type="submit" variant="ghost" size="sm">
                {t(lang, "auth.signOut")}
              </Button>
            </form>
          </>
        ) : (
          <Link href="/sign-in" className="hover:underline">
            {t(lang, "auth.signIn")}
          </Link>
        )}
      </nav>
    </header>
  );
}
