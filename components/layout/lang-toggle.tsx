import Link from "next/link";

import { LANGS, t, type Lang } from "@/lib/i18n";

/**
 * TH / EN, as the prototype's segmented control.
 *
 * Two ordinary links to `?lang=…`, which `middleware.ts` turns into a cookie
 * and a redirect back to the same page. No JavaScript, no client component, no
 * Server Action, and a language choice that survives being shared as a link.
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
  return (
    <nav
      aria-label={t(lang, "lang.label")}
      className="flex border-[1.5px] border-foreground"
    >
      {[...LANGS].reverse().map((option, index) => {
        const active = option === lang;
        return (
          <Link
            key={option}
            href={`?lang=${option}`}
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
          </Link>
        );
      })}
    </nav>
  );
}
