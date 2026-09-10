import { cookies } from "next/headers";

import { LANG_COOKIE, isLang, type Lang } from "@/lib/i18n";

/**
 * Reading the language choice — the half only a server can do.
 *
 * Split out of `lib/i18n.ts` so that module stays importable from a Client
 * Component. `site-nav.tsx` and the error boundary both call `t`, and a
 * `next/headers` import anywhere in that module's graph makes them fail to
 * render — which showed up as a 500 on every page, including the 404, with
 * Next's own fallback served in place of ours. The project already draws this
 * line once, between `lib/storage.ts` and `lib/image-loader.ts`.
 */

/**
 * The reader's language, English unless they have chosen otherwise.
 *
 * Deliberately not `Accept-Language`. Grains is a Thai product whose readers
 * are overwhelmingly on phones set to Thai, and guessing from the header would
 * make the *English* copy the one that is hard to reach — while also making
 * every response vary by a header, which is a caching problem for a site that
 * is mostly public pages. The choice is explicit and sticky.
 */
export async function currentLang(): Promise<Lang> {
  const store = await cookies();
  const value = store.get(LANG_COOKIE)?.value;
  return isLang(value) ? value : "en";
}
