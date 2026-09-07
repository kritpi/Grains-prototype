"use client";

import { useEffect, useState, useTransition } from "react";

import { createFilmStock } from "@/app/films/actions";
import type { FilmFormat } from "@/lib/labs/paths";

type Match = { id: string; name: string; iso: number; formats: FilmFormat[] };

type StockPickerProps = {
  /** Already on the lab, so the picker never offers a duplicate. */
  existingIds: string[];
  onPick: (stock: { filmStockId: string; name: string }) => void;
};

/**
 * Finding a film stock, and adding one when it is not there.
 *
 * A lab cannot carry a stock that is not a catalog entry (PRD A #3) — that link
 * is what makes reverse search from a stock's page possible at all. Which means
 * the alternative to adding one inline is abandoning the edit, so the "add it"
 * path lives here rather than sending the contributor to /films and back.
 *
 * `exact_match` from the handler is what decides whether to offer that. Offering
 * "add Portra 400" to somebody who has just typed the name of a stock that
 * exists is how a catalog grows duplicates — and the unique index would refuse
 * it anyway, so the offer would be a lie as well as a mistake.
 */
export function StockPicker({ existingIds, onPick }: StockPickerProps) {
  const [query, setQuery] = useState("");
  const [iso, setIso] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Results carry the query they answer, and are shown only while that is still
   * what the box says.
   *
   * Two problems, one fix. A slow response for "por" can land after a fast one
   * for "portra" and replace it; and clearing the results when the box empties
   * would be a setState during the effect that noticed, which cascades a
   * render. Keying them means a stale result is simply not rendered — no
   * cancellation bookkeeping, and nothing to clear.
   */
  const [results, setResults] = useState<{
    q: string;
    matches: Match[];
    exactMatch: boolean;
  } | null>(null);

  const q = query.trim();
  const current = results?.q === q ? results : null;
  const matches = current?.matches ?? [];
  const exactMatch = current?.exactMatch ?? false;

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2) return;

    const timer = setTimeout(() => {
      void fetch(`/api/film-stocks?q=${encodeURIComponent(search)}`)
        .then((response) =>
          response.ok
            ? response.json()
            : { film_stocks: [], exact_match: false },
        )
        .then((data: { film_stocks: Match[]; exact_match: boolean }) =>
          setResults({
            q: search,
            matches: data.film_stocks,
            exactMatch: data.exact_match,
          }),
        )
        .catch(() => setResults({ q: search, matches: [], exactMatch: false }));
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await createFilmStock({
        name: query.trim(),
        iso,
        // A new entry starts in 135 — the format a contributor is holding when
        // they hit a gap in the catalog. It is editable on the stock's page.
        formats: ["135"],
      });

      if (result.ok) {
        onPick({ filmStockId: result.id, name: result.name });
        setQuery("");
        setIso("");
        return;
      }
      setError(
        result.reason === "rejected"
          ? result.message
          : result.reason === "invalid"
            ? result.issues.join(" · ")
            : "That could not be added.",
      );
    });
  }

  const unlisted = matches.filter((m) => !existingIds.includes(m.id));
  const canAdd = q.length >= 2 && !exactMatch && iso.trim() !== "";

  return (
    <div className="grains-picker">
      <div className="grains-check-row">
        <input
          className="grains-input-cell"
          style={{ flex: 1, width: "auto" }}
          value={query}
          placeholder="search the film stock catalog"
          aria-label="Search the film stock catalog"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {unlisted.map((match) => (
        <button
          key={match.id}
          type="button"
          className="grains-picker-match"
          onClick={() => {
            onPick({ filmStockId: match.id, name: match.name });
            setQuery("");
          }}
        >
          <span>{match.name}</span>
          <span className="grains-stock-meta">
            ISO {match.iso} · {match.formats.join(" / ")}
          </span>
        </button>
      ))}

      {q.length >= 2 && current !== null && !exactMatch && (
        <div className="grains-note">
          <p style={{ margin: 0 }}>
            {matches.length > 0
              ? "Not one of these? Add it to the catalog — it becomes searchable for everyone."
              : "Nothing in the catalog matches. Add it and it becomes searchable for everyone."}
          </p>
          <div className="grains-check-row" style={{ marginTop: 8 }}>
            <input
              className="grains-input-cell"
              style={{ width: 90 }}
              value={iso}
              inputMode="numeric"
              placeholder="ISO"
              aria-label={`ISO for ${query.trim()}`}
              onChange={(event) => setIso(event.target.value)}
            />
            <button
              type="button"
              className="grains-secondary"
              disabled={!canAdd || pending}
              onClick={add}
            >
              {pending ? "Adding…" : `+ Add “${query.trim()}” to catalog`}
            </button>
          </div>
        </div>
      )}

      {exactMatch && unlisted.length === 0 && matches.length > 0 && (
        <p className="grains-hours-closed">Already listed on this lab.</p>
      )}

      {error && <div className="grains-problem">{error}</div>}
    </div>
  );
}
