import type { Metadata } from "next";

import { FilmCatalog } from "@/components/films/film-catalog";
import { BackLink } from "@/components/layout/back-link";
import { listFilmStocks } from "@/lib/queries/films";

import "@/components/films/films.css";

export const metadata: Metadata = {
  title: "Film stocks · Grains",
  description:
    "The film stocks Bangkok labs develop and sell, and where to find them.",
};

/**
 * Rendered per request rather than prerendered, and the reason is operational
 * rather than about freshness.
 *
 * Without this the page is generated during `next build`, which means the build
 * queries Postgres. Supabase's free tier pauses a project after 7 idle days, so
 * a deploy after a quiet week failed *at build time* — and surfaced as an
 * invalid-environment error rather than as a paused project, which is the worst
 * possible way to learn it.
 *
 * Nothing is given up. The catalog is still server-rendered with every stock in
 * the HTML, which is what the note below is about; it is composed when somebody
 * asks for it instead of when the site is built.
 */
export const dynamic = "force-dynamic";

/**
 * The Film Stock catalog.
 *
 * Server-rendered because it is one of the SEO-critical pages in
 * docs/api-surface.md: somebody searching for a stock by name should find this
 * page with the stock in the HTML, not an empty shell that fetches it.
 */
export default async function FilmsPage() {
  const stocks = await listFilmStocks();

  return (
    <main>
      <BackLink href="/" label="Grains" />
      <FilmCatalog stocks={stocks} />
    </main>
  );
}
