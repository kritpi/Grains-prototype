import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { FilmGallery } from "@/components/films/film-gallery";
import { NearbyLabs } from "@/components/films/nearby-labs";
import { BackLink } from "@/components/layout/back-link";
import { getFilmStock } from "@/lib/queries/films";

import "@/components/films/films.css";
import "@/components/labs/lab-detail.css";
// PhotoGrid's own rules. The grid is shared with the photobook pages, so its
// stylesheet is shared too rather than duplicated under a films- prefix.
import "@/components/books/photobook.css";

/**
 * Per request, not at build. Same reason as `/films`: prerendering makes
 * `next build` query Postgres, and a Supabase project that has paused after 7
 * idle days then fails the deployment rather than the request.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Film stock · Grains" };

  const stock = await getFilmStock(id);
  return stock
    ? {
        title: `${stock.name} · Grains`,
        description: `${stock.name}, ISO ${stock.iso}, in ${stock.formats.join(" and ")} — and the Bangkok labs that carry it.`,
      }
    : { title: "Film stock · Grains" };
}

/**
 * One film stock.
 *
 * All three parts are here now: the catalog entry, the inspiration gallery
 * that Phase 3 composed from Track C's grid and query, and the reverse search
 * that is the reason a stock links to labs at all.
 *
 * `?after=` is the gallery's cursor and the only search param this page reads.
 */
export default async function FilmStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ after?: string | string[] }>;
}) {
  const { id } = await params;
  const { after } = await searchParams;
  if (!UUID.test(id)) notFound();

  const stock = await getFilmStock(id);
  if (!stock) notFound();

  return (
    <main>
      <BackLink href="/films" label="Film stocks" />

      <div className="grains-stock">
        <div className="grains-stock-hero">
          {/* Hueless: `film_stocks` records no chemical process, and the tile
              is keyed by one in the design. Recorded in the design doc rather
              than guessed from the stock's name. */}
          <span className="grains-duo" data-duo="bw" data-ratio="3/2" />

          <div className="grains-stock-facts">
            <h1>{stock.name}</h1>
            <div className="grains-facet-row">
              <span className="grains-spec">ISO {stock.iso}</span>
              {stock.formats.map((format) => (
                <span key={format} className="grains-spec">
                  {format}
                </span>
              ))}
            </div>
            <p className="grains-stock-empty">
              {stock.sampleCount === 0
                ? "No sample photos yet."
                : `${stock.sampleCount} sample photo${stock.sampleCount === 1 ? "" : "s"}.`}{" "}
              {stock.lastEditorUsername
                ? `Last edited by @${stock.lastEditorUsername} · ${stock.editCount} edit${stock.editCount === 1 ? "" : "s"}.`
                : null}
            </p>
            <Link href={`/films/${stock.id}/edit`} className="grains-facet">
              Suggest an edit
            </Link>
          </div>
        </div>

        <FilmGallery
          filmStockId={stock.id}
          stockName={stock.name}
          sampleCount={stock.sampleCount}
          cursor={Array.isArray(after) ? after[0] : after}
        />

        <NearbyLabs filmStockId={stock.id} />
      </div>
    </main>
  );
}
