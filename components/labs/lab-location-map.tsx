"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";

import { BaseMap } from "@/components/map/base-map";

import "@/components/map/lab-map.css";

/**
 * Where one lab is — a still map with a single pin.
 *
 * `interactive={false}`: this map answers "whereabouts is this", and the
 * question "what else is near it" already has a better answer one click away at
 * /labs. Making it draggable would invite panning around a map that can never
 * load another pin, and would swallow the page's scroll on a phone.
 *
 * It reuses the search map's pin styling rather than introducing a second mark,
 * so the square a reader clicked in the results is the square they arrive at.
 */
export function LabLocationMap({
  lat,
  lng,
  nameEn,
}: {
  lat: number;
  lng: number;
  nameEn: string;
}) {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  const handleReady = useCallback((instance: MapLibreMap) => {
    setMap(instance);
  }, []);

  useEffect(() => {
    if (!map) return;
    let cancelled = false;

    void import("maplibre-gl").then(({ Marker }) => {
      if (cancelled) return;

      const el = document.createElement("div");
      el.className = "grains-pin";
      el.dataset.selected = "true";

      markerRef.current = new Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);
    });

    return () => {
      cancelled = true;
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [map, lat, lng]);

  return (
    <BaseMap
      label={`Map showing the location of ${nameEn}`}
      center={[lng, lat]}
      // Close enough to read the street it is on, which is what a landmark note
      // is describing.
      zoom={15}
      interactive={false}
      onReady={handleReady}
      className="h-56 border border-border"
    />
  );
}
