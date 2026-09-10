"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type NearbyLab = {
  id: string;
  nameEn: string;
  nameTh: string | null;
  distanceM: number;
  openNow: boolean;
};

/**
 * Reverse search: labs near you that carry this stock.
 *
 * The feature the inventory link exists for (PRD B). It runs in the browser
 * rather than on the server because it needs the reader's coordinates, and
 * because asking for those is a decision the reader makes by pressing a button
 * — the location prompt fires on tap, never on load, which is the same rule
 * `/labs` follows.
 *
 * It calls the same `/api/labs` the search page does, with `film_stock_id`.
 * There is no second endpoint and no second query: "labs near me carrying X" is
 * lab search with one more filter, and treating it as anything else would mean
 * two implementations of the radius rule.
 */
export function NearbyLabs({ filmStockId }: { filmStockId: string }) {
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "locating" }
    | { kind: "denied" }
    | { kind: "done"; labs: NearbyLab[] }
  >({ kind: "idle" });

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  useEffect(() => {
    if (!coords) return;
    let cancelled = false;

    const params = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      radius_m: "10000",
      film_stock_id: filmStockId,
      limit: "10",
    });

    void fetch(`/api/labs?${params}`)
      .then((response) => (response.ok ? response.json() : { labs: [] }))
      .then((data: { labs: NearbyLab[] }) => {
        if (!cancelled) setState({ kind: "done", labs: data.labs });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "done", labs: [] });
      });

    return () => {
      cancelled = true;
    };
  }, [coords, filmStockId]);

  function locate() {
    setState({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      () => setState({ kind: "denied" }),
      { timeout: 10_000 },
    );
  }

  return (
    <section className="grains-stock-section">
      <div className="grains-stock-label">
        LABS NEAR YOU THAT CARRY THIS STOCK
      </div>

      {state.kind === "idle" && (
        <button
          type="button"
          className="grains-facet self-start"
          onClick={locate}
        >
          Use my location
        </button>
      )}

      {state.kind === "locating" && (
        <p className="grains-stock-empty">Finding you…</p>
      )}

      {state.kind === "denied" && (
        <p className="grains-stock-empty">
          Without a location there is nothing to measure from.{" "}
          <Link href="/labs" className="underline">
            Search an area instead
          </Link>
          .
        </p>
      )}

      {state.kind === "done" && state.labs.length === 0 && (
        <p className="grains-stock-empty">
          No lab within 10 km has said it carries this stock. That is more often
          a gap in the listings than in the shops —{" "}
          <Link href="/labs" className="underline">
            find a lab
          </Link>{" "}
          and add it to their inventory.
        </p>
      )}

      {state.kind === "done" &&
        state.labs.map((lab) => (
          <Link
            key={lab.id}
            href={`/labs/${lab.id}`}
            className="grains-nearby-row"
          >
            <span className="grains-nearby-name">
              {lab.nameEn}
              {lab.nameTh ? (
                <span className="grains-stock-meta block">{lab.nameTh}</span>
              ) : null}
            </span>
            <span
              className="grains-status"
              data-status={lab.openNow ? "open" : "closed"}
            >
              <i />
              {lab.openNow ? "Open" : "Closed"}
            </span>
            <span className="grains-nearby-dist">
              {(lab.distanceM / 1000).toFixed(1)} km
            </span>
          </Link>
        ))}

      {/* The way onto the map with this filter already applied (PROPOSED).
       *
       * This list is deliberately short — ten kilometres, no paging, no filters
       * — because it answers "can I get this developed near me right now". The
       * map answers everything after that: a wider radius, a process, an area
       * across town. The stock travels as `?stock=`, which /labs turns into the
       * removable "Carries" chip.
       *
       * Shown whatever the outcome above, including when nothing was found:
       * "nothing within 10 km" is exactly when somebody wants to widen the
       * search, and offering the map only on success would hide it precisely
       * then. */}
      <Link href={`/labs?stock=${filmStockId}`} className="grains-facet">
        Find these on the map
      </Link>
    </section>
  );
}
