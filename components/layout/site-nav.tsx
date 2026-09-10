"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { t, type Lang, type StringKey } from "@/lib/i18n";

/**
 * The section nav that sits beside the wordmark.
 *
 * Until this existed there was no way to reach `/labs` or `/films` from the
 * chrome at all: the header carried the wordmark, the profile link and sign-in,
 * and nothing else. Both sections were reachable only by typing the URL.
 *
 * A client component purely because the active section is the pathname, which a
 * Server Component cannot read. It is a leaf, so `SiteHeader` stays a Server
 * Component and keeps doing its `currentUser()` read and its sign-out action on
 * the server.
 *
 * Two deviations from the prototype's chrome, both deliberate:
 *
 * 1. **No "Photobooks" tab.** The prototype's desktop bar carries three —
 *    Labs · Film stocks · Photobooks — but that predates PRD D #9, which makes
 *    the Connection graph the *only* discovery path between people's work.
 *    There is deliberately no global photobook index for a tab to open, and the
 *    one photobook surface a person does have (their own) is already the
 *    `@username` link on the right. A third tab would have to invent the page
 *    it links to.
 * 2. **Inline at every width.** The prototype shows this row on desktop only,
 *    because its mobile layout puts `Labs · Films · + · Profile` in a bottom tab
 *    bar. That bar is not built. Hiding the links below 768px to match the
 *    prototype would reproduce exactly the bug this replaces, so they stay
 *    inline. When the bottom bar is built, this is what moves into it.
 *
 *    Two short items do fit a 375px frame beside the wordmark, but only
 *    because `site-header.tsx` now truncates the handle: signed in with a
 *    30-character username — the maximum `lib/username.ts` allows — the page
 *    measured 395px against a 375px viewport before that, which is horizontal
 *    scroll on every screen of the site. Anything added to this row has to be
 *    measured at 375px signed *in*, not signed out.
 *
 * The TH/EN segmented control the prototype puts beside these is `LangToggle`,
 * on the other side of the header with the profile — it is a preference, not a
 * section.
 */
const SECTIONS: { href: string; label: StringKey }[] = [
  { href: "/labs", label: "nav.labs" },
  { href: "/films", label: "nav.films" },
];

/**
 * `lang` is a prop rather than a `currentLang()` call because this is a Client
 * Component — `cookies()` is server-only — and because the header above it has
 * already read it for `<html lang>`.
 */
export function SiteNav({ lang }: { lang: Lang }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={t(lang, "nav.sections")}
      className="flex items-center gap-5"
    >
      {SECTIONS.map((section) => {
        // `/films` is active on `/films/[id]` too — a stock's detail page is
        // still the Films section — but a prefix test alone would light "Labs"
        // up on a hypothetical `/labsomething`, so the boundary is explicit.
        const active =
          pathname === section.href || pathname.startsWith(`${section.href}/`);

        return (
          <Link
            key={section.href}
            href={section.href}
            // The design system's own state vocabulary, so a reviewer can grep
            // `data-tabon` and find both the CSS and the markup:
            // `[data-tabon] { color: faint }`, `[data-tabon="true"] { ink }`.
            data-tabon={active}
            aria-current={active ? "page" : undefined}
            className="font-sans text-[13px] font-bold text-ring transition-colors hover:text-foreground data-[tabon=true]:text-foreground"
          >
            {t(lang, section.label)}
          </Link>
        );
      })}
    </nav>
  );
}
