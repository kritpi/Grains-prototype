"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { FILM_FORMATS, type FilmFormat } from "@/lib/labs/paths";
import type { FilmStockCard } from "@/lib/queries/films";

/**
 * The catalog, filtered in the browser.
 *
 * The whole catalog is a few dozen rows and arrives with the page, so filtering
 * happens here rather than through the URL and a round trip: a chip that
 * responds on the next frame is the difference between browsing and querying,
 * and browsing is what this screen is for (films are inspiration-first).
 *
 * That is the opposite call from `/labs`, deliberately. Lab search is
 * geospatial, paginated and shareable, so its state lives in the URL; a film
 * facet is none of those things.
 */
export function FilmCatalog({ stocks }: { stocks: FilmStockCard[] }) {
  const [query, setQuery] = useState("");
  const [isos, setIsos] = useState<number[]>([]);
  const [formats, setFormats] = useState<FilmFormat[]>([]);

  const isoOptions = useMemo(
    () => [...new Set(stocks.map((s) => s.iso))].sort((a, b) => a - b),
    [stocks],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stocks.filter((stock) => {
      if (q && !stock.name.toLowerCase().includes(q)) return false;
      if (isos.length > 0 && !isos.includes(stock.iso)) return false;
      // Overlap, not containment: a 135-and-120 stock matches a 120 filter.
      if (
        formats.length > 0 &&
        !formats.some((format) => stock.formats.includes(format))
      ) {
        return false;
      }
      return true;
    });
  }, [stocks, query, isos, formats]);

  return (
    <div className="grains-films">
      <div className="grains-films-head">
        <div>
          <h1 className="grains-films-title">Film stocks</h1>
          <p className="grains-films-count">
            {visible.length} of {stocks.length} stocks · anyone can add one
          </p>
        </div>
        <input
          className="grains-films-search"
          value={query}
          placeholder="search a stock"
          aria-label="Search film stocks"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="grains-facets">
        <div className="grains-facet-row">
          {isoOptions.map((iso) => (
            <button
              key={iso}
              type="button"
              className="grains-facet"
              data-on={isos.includes(iso)}
              onClick={() => setIsos(toggle(isos, iso))}
            >
              ISO {iso}
            </button>
          ))}
        </div>
        <div className="grains-facet-row">
          {FILM_FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              className="grains-facet"
              data-on={formats.includes(format)}
              onClick={() => setFormats(toggle(formats, format))}
            >
              {format}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="grains-stock-empty">
          No film stocks match these filters.
        </p>
      ) : (
        <div className="grains-stock-grid">
          {visible.map((stock) => (
            <Link
              key={stock.id}
              href={`/films/${stock.id}`}
              className="grains-stock-tile"
            >
              <span className="grains-stock-art">
                {/* Hueless, because the schema does not record a stock's
                    process — see docs/plans/track-b-design.md. Guessing one
                    from the name would put a colour on data we do not have. */}
                <span className="grains-duo" data-duo="bw" data-ratio="1/1" />
                {stock.sampleCount > 0 && (
                  <span className="grains-stock-count">
                    +{stock.sampleCount}
                  </span>
                )}
              </span>
              <span>
                <span className="grains-stock-name">{stock.name}</span>
                <span className="grains-stock-meta">
                  ISO {stock.iso} · {stock.formats.join(" / ")}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}
