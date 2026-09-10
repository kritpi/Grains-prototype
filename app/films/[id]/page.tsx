import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { NearbyLabs } from "@/components/films/nearby-labs";
import { BackLink } from "@/components/layout/back-link";
import { getFilmStock } from "@/lib/queries/films";

import "@/components/films/films.css";
import "@/components/labs/lab-detail.css";

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
 * Two of the three things this page will eventually carry are not Track B's.
 * The inspiration gallery is derived from photos (PRD B #3) and photos are
 * Track C, so its slot is drawn and says what it is waiting for rather than
 * being absent — the same rule the lab page follows for its empty sections.
 * Composing the two is Phase 3.
 *
 * What is here is the half that stands alone: the catalog entry, and the
 * reverse search that is the reason a stock links to labs at all.
 */
export default async function FilmStockPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

        <section className="grains-stock-section">
          <div className="grains-stock-label">INSPIRATION</div>
          <p className="grains-stock-empty">
            A stock&apos;s gallery is whatever the community tagged with it —
            nothing is uploaded here directly. It fills in once photos exist.
          </p>
        </section>

        <NearbyLabs filmStockId={stock.id} />
      </div>
    </main>
  );
}
