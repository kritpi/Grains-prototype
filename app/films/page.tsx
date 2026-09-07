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
