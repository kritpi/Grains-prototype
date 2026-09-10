import { NextResponse, type NextRequest } from "next/server";

import { LANG_COOKIE, LANG_COOKIE_MAX_AGE, isLang } from "@/lib/i18n";

/**
 * `?lang=th` → cookie → redirect back to the same URL without it (P22).
 *
 * `proxy.ts`, not `middleware.ts`: Next 16 deprecated the middleware file
 * convention and warns on every `next dev` that still uses it. Same signature
 * and same `config.matcher` — the filename and the exported name changed.
 *
 * The whole reason this runs ahead of the request rather than as a Server
 * Action: a layout cannot read `searchParams`, so nothing else in the App
 * Router can honour `?lang=` on *any* URL. Doing it here means the language toggle is two ordinary links —
 * no JavaScript, no action, no client component — and a link shared as
 * `/labs/abc?lang=th` opens in Thai for whoever follows it.
 *
 * The redirect matters as much as the cookie. Leaving `?lang=` in the address
 * would make it part of every URL the reader then copies, and two URLs for one
 * page is exactly what the cookie approach exists to avoid — see `lib/i18n.ts`
 * on why there is no `/th/` prefix.
 *
 * This is the only proxy in the project and should stay that way unless
 * something else genuinely cannot be done in a page: it runs before every
 * matched request, and CLAUDE.md's layering puts reads in Server Components and
 * writes in Server Actions.
 */
export function proxy(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("lang");
  if (!isLang(requested)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.searchParams.delete("lang");

  const response = NextResponse.redirect(url);
  response.cookies.set(LANG_COOKIE, requested, {
    maxAge: LANG_COOKIE_MAX_AGE,
    sameSite: "lax",
    path: "/",
    // Readable by nothing in particular — it is a display preference, not a
    // credential — but there is no reason for script to need it either.
    httpOnly: true,
  });
  return response;
}

export const config = {
  /**
   * Everything except Next's own assets and the files that are not pages.
   *
   * `?lang=` on an image or a sitemap is meaningless, and matching them would
   * put a redirect in front of every static request for no benefit.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api/).*)",
  ],
};
