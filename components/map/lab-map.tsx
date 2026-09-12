"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";

import { BaseMap } from "@/components/map/base-map";
import type { LabCard } from "@/lib/queries/labs";

import "./lab-map.css";

const RADIUS_SOURCE = "search-radius";

/**
 * A palette token, as a string MapLibre can use.
 *
 * MapLibre paint properties are set in JavaScript and take concrete colours —
 * `var(--g-ink)` in a paint object is not resolved by anything. So the two
 * colours this map draws were written as hex literals here, out of reach of
 * the stylesheet and of any theme change, which is exactly how a map ends up
 * a shade off the page it sits on.
 *
 * Reading the computed value keeps one source of truth. The fallback matters:
 * this runs in an effect, so the custom property is available, but a browser
 * that returns an empty string should get a colour rather than `""`, which
 * MapLibre rejects with a style error.
 */
function paletteColor(token: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  return value || fallback;
}

/**
 * Below this the container has not been laid out yet and any framing computed
 * from it would be wrong. Framing waits rather than guessing.
 */
const MIN_FRAMEABLE_PX = 200;

type LabMapProps = {
  labs: LabCard[];
  /** Centre of the search, and of the radius ring drawn around it. */
  center: [number, number];
  radiusM: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
};

/**
 * A geodesic circle as a GeoJSON polygon.
 *
 * MapLibre has no "circle of N metres": a styled circle's radius is in screen
 * pixels and stays the same size as the map zooms, which is the opposite of
 * what a search radius means. Projecting the ring once in metres makes it
 * scale with the map the way the search itself does.
 */
function circlePolygon(
  [lng, lat]: [number, number],
  radiusM: number,
  steps = 96,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const EARTH_M = 6_378_137;
  const angular = radiusM / EARTH_M;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const ring: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const pLat = Math.asin(
      Math.sin(latRad) * Math.cos(angular) +
        Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing),
    );
    const pLng =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
        Math.cos(angular) - Math.sin(latRad) * Math.sin(pLat),
      );
    ring.push([(pLng * 180) / Math.PI, (pLat * 180) / Math.PI]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

/**
 * A zoom level at which the whole radius fits the viewport.
 *
 * Web Mercator's metres-per-pixel halves with every zoom level and shrinks
 * with the cosine of the latitude, so this inverts that relation rather than
 * guessing from a lookup table. The margin keeps the ring off the edges.
 */
function zoomForRadius(radiusM: number, lat: number, viewportPx: number) {
  const METRES_PER_PIXEL_AT_Z0 = 156_543.03392;
  const MARGIN = 1.35;
  const needed =
    (radiusM * 2 * MARGIN) / Math.max(viewportPx, MIN_FRAMEABLE_PX);
  const atLatitude = METRES_PER_PIXEL_AT_Z0 * Math.cos((lat * Math.PI) / 180);
  return Math.min(Math.max(Math.log2(atLatitude / needed), 4), 17);
}

/**
 * Has the style been parsed far enough to accept a source and a layer?
 *
 * Deliberately not `isStyleLoaded()`. That reports whether the style *and its
 * sources* have settled, which additionally requires tiles to have loaded —
 * and tiles only load while the map is actually rendering. A map in a
 * background tab therefore never satisfies it, and anything gated on it is
 * never added at all. Adding a layer needs only the stylesheet itself, which
 * is exactly what having layers proves.
 */
function styleAcceptsLayers(map: MapLibreMap): boolean {
  try {
    return (map.getStyle()?.layers?.length ?? 0) > 0;
  } catch {
    // getStyle() throws while the style is still being set.
    return false;
  }
}

/**
 * Runs once the style can accept sources and layers, and returns a canceller.
 *
 * `map.once("load")` is the obvious spelling and is a race: an effect that
 * runs after the map has already loaded attaches a listener for an event that
 * has been and gone, so it never fires and the layers are silently never
 * added. `styledata` keeps firing as the style settles, so it gives a second
 * chance however late this runs.
 */
function whenStyleReady(map: MapLibreMap, run: () => void): () => void {
  if (styleAcceptsLayers(map)) {
    run();
    return () => {};
  }

  const handler = () => {
    if (!styleAcceptsLayers(map)) return;
    map.off("styledata", handler);
    run();
  };

  map.on("styledata", handler);
  return () => map.off("styledata", handler);
}

/**
 * The lab map: pins, the search radius, and a viewport that follows the search.
 *
 * It owns no map of its own — BaseMap does — and receives the instance through
 * onReady. The instance lives in state rather than a ref because it arrives
 * asynchronously, after BaseMap's dynamic import resolves: held in a ref, every
 * effect below would run once against null on mount and never run again.
 *
 * Markers are diffed against the previous render rather than cleared and
 * rebuilt, so a filter change that keeps most labs does not flicker every pin.
 */
export function LabMap({
  labs,
  center,
  radiusM,
  selectedId,
  onSelect,
  className,
}: LabMapProps) {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());

  // Latest callback, read from listeners registered once per marker.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const handleReady = useCallback((instance: MapLibreMap) => {
    setMap(instance);
  }, []);

  const [lng, lat] = center;

  // The radius ring: source and layers once, data on every search.
  useEffect(() => {
    if (!map) return;

    const cleanups: (() => void)[] = [];

    cleanups.push(
      whenStyleReady(map, () => {
        if (!map.getSource(RADIUS_SOURCE)) {
          map.addSource(RADIUS_SOURCE, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: `${RADIUS_SOURCE}-fill`,
            type: "fill",
            source: RADIUS_SOURCE,
            paint: {
              "fill-color": paletteColor("--g-ink", "#141412"),
              "fill-opacity": 0.04,
            },
          });
          map.addLayer({
            id: `${RADIUS_SOURCE}-line`,
            type: "line",
            source: RADIUS_SOURCE,
            paint: {
              "line-color": paletteColor("--g-faint", "#8b8b84"),
              "line-width": 1,
              "line-dasharray": [3, 3],
            },
          });
        }

        const source = map.getSource(RADIUS_SOURCE) as
          GeoJSONSource | undefined;
        source?.setData({
          type: "FeatureCollection",
          features: [circlePolygon([lng, lat], radiusM)],
        });

        // Framing is deferred until the container has been laid out. Reading
        // clientHeight from a container that has no height yet falls through to
        // the floor in zoomForRadius and frames the search for a 200px map —
        // and because map.resize() preserves the zoom, that wrong framing then
        // survives every later resize. The observer waits for a real height,
        // frames once, and disconnects.
        const container = map.getContainer();

        // easeTo rather than jumpTo: when the radius widens, watching the frame
        // pull back is what tells you the search changed.
        const frame = () =>
          map.easeTo({
            center: [lng, lat],
            zoom: zoomForRadius(radiusM, lat, container.clientHeight),
            duration: 500,
          });

        if (container.clientHeight >= MIN_FRAMEABLE_PX) {
          frame();
          return;
        }

        const observer = new ResizeObserver(() => {
          if (container.clientHeight < MIN_FRAMEABLE_PX) return;
          observer.disconnect();
          frame();
        });
        observer.observe(container);
        cleanups.push(() => observer.disconnect());
      }),
    );

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [map, lng, lat, radiusM]);

  // Pins, diffed against what is already on the map.
  useEffect(() => {
    if (!map) return;
    let cancelled = false;

    void import("maplibre-gl").then(({ Marker }) => {
      if (cancelled) return;
      const existing = markersRef.current;
      const wanted = new Set(labs.map((l) => l.id));

      for (const [id, marker] of existing) {
        if (!wanted.has(id)) {
          marker.remove();
          existing.delete(id);
        }
      }

      for (const lab of labs) {
        const selected = lab.id === selectedId;
        const already = existing.get(lab.id);
        if (already) {
          already.setLngLat([lab.lng, lab.lat]);
          already.getElement().dataset.selected = String(selected);
          continue;
        }

        const el = document.createElement("button");
        el.type = "button";
        el.className = "grains-pin";
        el.dataset.selected = String(selected);
        el.setAttribute("aria-label", lab.nameEn);
        el.addEventListener("click", (event) => {
          // Without this the click also reaches the map, which clears the
          // selection the marker just made.
          event.stopPropagation();
          onSelectRef.current(lab.id);
        });

        existing.set(
          lab.id,
          new Marker({ element: el }).setLngLat([lab.lng, lab.lat]).addTo(map),
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [map, labs, selectedId]);

  // Markers outlive the effect that created them, so they are torn down with
  // the component rather than on any single render.
  useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const marker of markers.values()) marker.remove();
      markers.clear();
    };
  }, []);

  return (
    <BaseMap
      label="Map of film labs matching this search"
      center={center}
      zoom={zoomForRadius(radiusM, lat, 600)}
      className={className}
      onReady={handleReady}
    />
  );
}
