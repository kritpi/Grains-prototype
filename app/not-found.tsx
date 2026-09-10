import Link from "next/link";
import type { Metadata } from "next";

import { Notice } from "@/components/layout/notice";
import { t } from "@/lib/i18n";
import { currentLang } from "@/lib/i18n-server";

export const metadata: Metadata = {
  title: "Not found · Grains",
  // A 404 that gets indexed is worse than one that does not exist.
  robots: { index: false, follow: true },
};

/**
 * The 404, and the one `notFound()` everywhere else lands on.
 *
 * It offers the two sections rather than only a way home, because discovery is
 * the entire product: somebody who followed a dead link to a lab is looking for
 * a lab, and the home page is a wordmark on paper. The links are the same two
 * the header now carries, so the page never contradicts the chrome above it.
 *
 * A dead URL here is usually a real deletion rather than a typo — PRD D #8 says
 * a Photo removed from someone's Photobook goes silently, and a lab or a
 * photobook can be deleted outright — so the copy does not accuse the reader of
 * mistyping.
 */
export default async function NotFound() {
  const lang = await currentLang();

  return (
    <Notice
      title={t(lang, "notFound.title")}
      actions={
        <>
          <Link
            href="/labs"
            className="border border-foreground px-3 py-1.5 font-sans text-xs hover:bg-foreground hover:text-background"
          >
            {t(lang, "notFound.findLab")}
          </Link>
          <Link
            href="/films"
            className="border border-foreground px-3 py-1.5 font-sans text-xs hover:bg-foreground hover:text-background"
          >
            {t(lang, "notFound.browseFilms")}
          </Link>
        </>
      }
    >
      {t(lang, "notFound.body")}
    </Notice>
  );
}
