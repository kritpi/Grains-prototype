"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { LANGS, langHref, t, type Lang } from "@/lib/i18n";

/**
 * TH / EN, as the prototype's segmented control.
 *
 * Two ordinary links to `?lang=…`, which `proxy.ts` turns into a cookie and a
 * redirect back to the same page. A language choice that survives being shared
 * as a link, and no Server Action.
 *
 * **Plain `<a>`, not `next/link`, and that is the whole fix for P24.** A
 * `<Link>` navigates on the client, and a client navigation to the same route
 * does not re-render the root layout — which is the only thing in the app that
 * calls `currentLang()`. The cookie landed, the redirect happened, and the
 * header went on rendering the old language until somebody reloaded by hand.
 * `<html lang>` is worse than stale: it is written once per document, and
 * `app/error.tsx` reads it back, so nothing short of a document load can move
 * it. A full navigation is not a cost here — it is the mechanism.
 *
 * It also removes a hazard that only existed because of `<Link>`: both links
 * sit in the header of every page, Next prefetches links in the viewport, and a
 * prefetch follows the 307 and applies its `Set-Cookie`. The language could
 * flip without anybody clicking.
 *
 * A Client Component, then, for one reason: the href has to carry the query
 * string the reader is already inside. See `langHref`.
 *
 * The design system treats this as one pattern with the other segmented
 * controls (mobile/desktop, list/map): a 1.5px ink box the buttons sit inside,
 * a hairline between them, 700/10px, and the active one filled rather than
 * merely darker — at this size a colour change alone is not enough to tell
 * which of two two-letter labels is selected.
 *
 * The prototype orders it TH then EN. That is not alphabetical and not an
 * accident: this is a Thai product, and the local language reads first.
 */
export function LangToggle({ lang }: { lang: Lang }) {
  const pathname = usePathname();
  const search = useSearchParams();

  return (
    <Segmented
      lang={lang}
      hrefFor={(option) => langHref(pathname, search.toString(), option)}
    />
  );
}

/**
 * What renders before `useSearchParams()` resolves.
 *
 * `useSearchParams()` in a component the root layout renders needs a Suspense
 * boundary, or every statically prerendered page opts out of prerendering. The
 * fallback is the same control with the same box: it links to `?lang=` without
 * the current query, which is exactly what this component did before — worth
 * having for the fraction of a render it is visible, and never worth a layout
 * shift.
 */
export function LangToggleFallback({ lang }: { lang: Lang }) {
  return <Segmented lang={lang} hrefFor={(option) => `?lang=${option}`} />;
}

function Segmented({
  lang,
  hrefFor,
}: {
  lang: Lang;
  hrefFor: (option: Lang) => string;
}) {
  return (
    <nav
      aria-label={t(lang, "lang.label")}
      className="flex border-[1.5px] border-foreground"
    >
      {[...LANGS].reverse().map((option, index) => {
        const active = option === lang;
        return (
          <a
            key={option}
            href={hrefFor(option)}
            hrefLang={option}
            aria-current={active ? "true" : undefined}
            data-tabon={active}
            className={[
              "px-[7px] py-0.5 font-sans text-[10px] font-bold uppercase",
              index > 0 ? "border-l-[1.5px] border-foreground" : "",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {option}
          </a>
        );
      })}
    </nav>
  );
}
