/**
 * Bilingual UI copy (P22).
 *
 * A hand-rolled dictionary rather than a library. The whole surface is a few
 * hundred strings in two languages that never negotiate, there are no plurals
 * that Thai distinguishes, and no formatting beyond interpolation — next-intl
 * or i18next would each add a provider, a message loader and a build step to
 * replace the object below.
 *
 * **The Thai is the designer's, not a translation.** Every string here that
 * appears in `docs/design/grains-prototype.html` is copied from its own
 * `data-l="th"` span rather than translated from the English. Thai copy written
 * by someone reading the English is how "ร้านล้างฟิล์ม" becomes a literal
 * rendering of "film developing shop" that nobody says. Anything added later
 * should come from the prototype where the prototype has it.
 *
 * **Nothing here touches `next/headers`.** Reading the cookie lives in
 * `lib/i18n-server.ts`, because this module is imported by Client Components —
 * `site-nav.tsx` and the error boundary both call `t` — and a `next/headers`
 * import anywhere in that graph makes every one of them fail to render: a 500
 * on every page, not a warning. It is the same split, for the same reason, as
 * `lib/storage.ts` (server-only) against `lib/image-loader.ts` (isomorphic).
 *
 * This is the mechanism and the shell's strings. The page-level copy — the lab
 * detail table, the forms, the photobook surfaces — is still English-only in
 * the components; the schema has carried `name_th` since migration 0000, and
 * moving each page's copy in here is per-page work, not part of standing this
 * up.
 */

export type Lang = "en" | "th";

export const LANGS: readonly Lang[] = ["en", "th"] as const;

/**
 * Where the choice lives.
 *
 * A cookie rather than a path prefix (`/th/labs`), because a lab has one URL
 * and one set of Thai and English names in the same row — two URLs per lab
 * would split every share link and every sitemap entry in half for a site whose
 * whole job is being findable.
 */
export const LANG_COOKIE = "grains_lang";

/** A year: the choice is a preference, not a session. */
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "th";
}

/**
 * The address of the current page in the other language.
 *
 * `?lang=` on top of the query string that is already there — not instead of
 * it. The toggle used to link to the bare string `?lang=th`, and a relative
 * reference beginning with `?` replaces the whole query: switching language on
 * `/labs?lat=13.7&lng=100.5&process=c41` arrived at `/labs`, dropping somebody
 * mid-search back to the location prompt. `proxy.ts` preserves whatever it is
 * given and always did; the link was giving it nothing.
 *
 * Pure, and takes the search string rather than reading it, so it is testable
 * without a router — which is the assertion `tests/i18n.test.ts` believed it
 * was making against the proxy.
 */
export function langHref(pathname: string, search: string, lang: Lang): string {
  const params = new URLSearchParams(search);
  params.set("lang", lang);
  return `${pathname}?${params.toString()}`;
}

/**
 * The strings.
 *
 * Keyed by where they appear rather than by their English text, so changing the
 * English wording is not a rename across the codebase — and so a missing Thai
 * translation is a type error rather than a silent fallback to English.
 */
const STRINGS = {
  "nav.labs": { en: "Labs", th: "ร้านล้างฟิล์ม" },
  "nav.films": { en: "Film stocks", th: "ฟิล์ม" },
  "nav.sections": { en: "Sections", th: "หมวด" },
  "auth.signIn": { en: "Sign in", th: "เข้าสู่ระบบ" },
  "auth.signOut": { en: "Sign out", th: "ออกจากระบบ" },
  "auth.chooseUsername": { en: "Choose a username", th: "ตั้งชื่อผู้ใช้" },

  "lang.label": { en: "Language", th: "ภาษา" },

  "notFound.title": { en: "This page isn't here", th: "ไม่พบหน้านี้" },
  "notFound.body": {
    en: "It may have been removed, or the address may be wrong. Nothing is lost on your side.",
    th: "อาจถูกลบไปแล้ว หรือที่อยู่ไม่ถูกต้อง ไม่มีอะไรหายไปจากฝั่งคุณ",
  },
  "notFound.findLab": { en: "Find a lab", th: "หาร้านล้างฟิล์ม" },
  "notFound.browseFilms": { en: "Browse film stocks", th: "ดูฟิล์มทั้งหมด" },

  "error.title": { en: "Something went wrong", th: "เกิดข้อผิดพลาด" },
  "error.body": {
    en: "This one is on us, not on you. Trying again often works — the database pauses when the site has been quiet.",
    th: "เป็นปัญหาฝั่งเรา ไม่ใช่ฝั่งคุณ ลองอีกครั้งมักได้ผล — ฐานข้อมูลจะพักเมื่อเว็บไม่มีคนใช้สักพัก",
  },
  "error.retry": { en: "Try again", th: "ลองอีกครั้ง" },
  "error.reference": { en: "Reference", th: "รหัสอ้างอิง" },
} as const;

export type StringKey = keyof typeof STRINGS;

/**
 * One string.
 *
 * A function taking the language rather than a hook or a context, because every
 * caller in a Server Component already has to `await currentLang()` for
 * `<html lang>` anyway, and a context would force each of them to become a
 * Client Component to read it.
 */
export function t(lang: Lang, key: StringKey): string {
  return STRINGS[key][lang];
}

/** Curried, for a component that reads more than one or two. */
export function translator(lang: Lang): (key: StringKey) => string {
  return (key) => t(lang, key);
}
