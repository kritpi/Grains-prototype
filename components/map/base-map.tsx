"use client";

import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

import { cn } from "@/lib/utils";

import "maplibre-gl/dist/maplibre-gl.css";
import "./base-map.css";

/**
 * CARTO Positron: a near-monochrome basemap that stays out of the way of the
 * pins drawn over it, which is what an editorial, high-negative-space layout
 * needs. Its style JSON carries the CARTO and OpenStreetMap attribution on the
 * source, so `AttributionControl` renders both without us restating the
 * strings — if CARTO ever drops it from the style, add `customAttribution`
 * here rather than leaving the map unattributed.
 */
export const POSITRON_STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

/** Bangkok, where every seeded lab is. */
export const DEFAULT_CENTER: [number, number] = [100.5018, 13.7563];

/** Close enough to read a neighbourhood, wide enough to hold a 5 km radius. */
export const DEFAULT_ZOOM = 12;

/**
 * MapLibre parses vector tiles in a web worker it loads from a second file,
 * whose URL it derives from its own bundle — under Turbopack that lands on a
 * chunk path that is never emitted, so the worker 404s and the map draws an
 * empty canvas without raising anything. scripts/copy-maplibre-worker.mjs puts
 * the file here at install time; this points MapLibre at it.
 */
const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

type BaseMapProps = {
  /**
   * Starting viewport, read once. The map is uncontrolled after creation:
   * panning it does not call back into React, and changing these props does
   * not move it. Callers that need to drive the viewport — restoring it from
   * the URL, widening a radius — do so imperatively on the instance handed to
   * `onReady`, which keeps a user's drag from fighting a re-render.
   */
  center?: [number, number];
  zoom?: number;
  /** False renders a still map: no drag, no scroll-zoom, no controls. */
  interactive?: boolean;
  /** Announced to screen readers; name what this particular map shows. */
  label: string;
  className?: string;
  /**
   * Called once with the live instance, after creation and before the style
   * has necessarily loaded. Add sources and layers behind `map.on("load")`;
   * markers and event listeners can be attached immediately.
   */
  onReady?: (map: MapLibreMap) => void;
  /** Overlaid on the map — a geolocate button, a "widen radius" prompt. */
  children?: React.ReactNode;
};

/**
 * The basemap every Grains map is built on: it owns creation, the style, the
 * controls, attribution and teardown, and nothing else. Lab pins, a draggable
 * location pin and viewport-to-URL syncing all belong to the components that
 * use it, which reach the instance through `onReady`.
 */
export function BaseMap({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  interactive = true,
  label,
  className,
  onReady,
  children,
}: BaseMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Held in a ref so an inline callback prop cannot retrigger the effect and
  // tear down a live map mid-interaction.
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  // Destructured for the dependency list: a [lng, lat] literal is a new array
  // on every render, and comparing it by identity would rebuild the map.
  const [lng, lat] = center;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let map: MapLibreMap | undefined;
    let cancelled = false;
    let observer: ResizeObserver | undefined;

    // Imported here rather than at module scope. A "use client" component is
    // still rendered on the server for the first HTML, and maplibre-gl reads
    // `window` as it initialises; deferring also keeps its bundle off the
    // critical path of a page whose first paint is a list of labs.
    void import("maplibre-gl").then(
      ({ Map, NavigationControl, setWorkerUrl }) => {
        setWorkerUrl(WORKER_URL);

        // The effect can be torn down before this resolves — React's development
        // double-invoke does exactly that — and a map created after the cleanup
        // ran would never be removed.
        if (cancelled) return;

        map = new Map({
          container,
          style: POSITRON_STYLE_URL,
          center: [lng, lat],
          zoom,
          interactive,
          // Bangkok is flat and the pins are the content; tilting and rotating
          // only lose people. Left out of `interactive` because a still map
          // should not respond to any of it either.
          pitchWithRotate: false,
          dragRotate: false,
          touchZoomRotate: interactive,
          // Expanded rather than folded behind a button: attribution that has
          // room to show should show.
          attributionControl: { compact: false },
        });

        if (interactive) {
          map.addControl(
            new NavigationControl({ showCompass: false }),
            "top-right",
          );
        }

        // MapLibre measures the container once, at construction, and otherwise
        // only listens for window resizes. Two things break that here: the map
        // is created after an async import, so it can measure before the
        // stylesheet that gives the container its height has applied — MapLibre
        // then falls back to 400x300 and never grows — and the container also
        // changes size when a filter panel opens or the layout reflows, with no
        // window resize to notice.
        observer = new ResizeObserver(() => map?.resize());
        observer.observe(container);

        onReadyRef.current?.(map);
      },
    );

    return () => {
      cancelled = true;
      observer?.disconnect();
      map?.remove();
    };
  }, [lng, lat, zoom, interactive]);

  return (
    <div className={cn("relative", className)}>
      {/* Sized with h-full/w-full rather than absolute inset-0: MapLibre puts
          its own `maplibregl-map` class on this element, and that rule sets
          `position: relative`. Its stylesheet is unlayered, so it outranks
          Tailwind's layered utilities whatever the import order — an
          `absolute` here loses silently and the map collapses to no height. */}
      <div
        ref={containerRef}
        role="application"
        aria-label={label}
        className="h-full w-full"
      />
      {/* Overlays sit above the canvas without swallowing drags; anything
          clickable in here sets `pointer-events-auto` on itself. */}
      {children ? (
        <div className="pointer-events-none absolute inset-0">{children}</div>
      ) : null}
    </div>
  );
}
