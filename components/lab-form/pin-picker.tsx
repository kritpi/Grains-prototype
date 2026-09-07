"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";

import { BaseMap, DEFAULT_CENTER } from "@/components/map/base-map";

export type Pin = { lat: number; lng: number };

type NearbyLab = { id: string; nameEn: string; distanceM: number };

type PinPickerProps = {
  value: Pin | null;
  onChange: (pin: Pin) => void;
  /** Excluded from the duplicate warning: a lab is not near itself. */
  excludeLabId?: string;
};

/**
 * Dropping a pin, and being told when one is already there.
 *
 * The pin is the required location input, not the address (PRD A #4): a Bangkok
 * shop above an unmarked staircase has a location long before it has an address
 * anybody could type. The street field beside this one is secondary and
 * editable.
 *
 * The duplicate check is soft on purpose. It reads the same `/api/labs` the
 * search page does and says what it found; it never blocks the save. A
 * contributor standing outside a shop knows better than a radius does whether
 * the listing 40 metres away is the same place, and refusing the save would
 * lose the contribution rather than improve it.
 */
export function PinPicker({ value, onChange, excludeLabId }: PinPickerProps) {
  // The map lives in state rather than a ref, the way components/map/lab-map.tsx
  // holds it: a ref is populated inside `onReady`, which fires after MapLibre's
  // dynamic import resolves — later than the effects that want to draw on it,
  // and without telling React to run them again. The marker then gets created
  // against nothing and never appears, which is exactly what happened here.
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [nearby, setNearby] = useState<NearbyLab[]>([]);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const onReady = useCallback((instance: MapLibreMap) => {
    setMap(instance);
    instance.on("click", (event) => {
      onChangeRef.current({
        lat: Number(event.lngLat.lat.toFixed(6)),
        lng: Number(event.lngLat.lng.toFixed(6)),
      });
    });
  }, []);

  /**
   * The pin, drawn by MapLibre rather than by React.
   *
   * Created fresh on every run and removed by the cleanup, rather than kept in
   * a ref and moved. Keeping one costs a little less work and is wrong: React
   * mounts effects twice in development, so BaseMap builds a map, throws it
   * away and builds another, and a marker held across that lands on the
   * discarded one. It is attached to a real canvas container and never appears,
   * with nothing thrown and nothing logged — the pin simply is not there.
   *
   * Tying the marker's life to the effect that made it means it always belongs
   * to the map currently on screen. `value` changes only when somebody moves
   * the pin, so re-creating is not a cost anybody pays twice.
   */
  useEffect(() => {
    if (!map || !value) return;

    let cancelled = false;
    let marker: Marker | undefined;

    void import("maplibre-gl").then(({ Marker }) => {
      if (cancelled) return;
      const element = document.createElement("div");
      element.className = "grains-drop-pin";
      marker = new Marker({ element })
        .setLngLat([value.lng, value.lat])
        .addTo(map);
    });

    return () => {
      cancelled = true;
      marker?.remove();
    };
  }, [map, value]);

  // Soft duplicate detection, debounced: a pin gets nudged several times before
  // it settles, and each nudge is not a question worth asking the database.
  useEffect(() => {
    if (!value) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        lat: String(value.lat),
        lng: String(value.lng),
        radius_m: "150",
        limit: "5",
      });
      void fetch(`/api/labs?${params}`)
        .then((response) => (response.ok ? response.json() : { labs: [] }))
        .then((data: { labs: NearbyLab[] }) =>
          setNearby(data.labs.filter((lab) => lab.id !== excludeLabId)),
        )
        .catch(() => setNearby([]));
    }, 400);

    return () => clearTimeout(timer);
  }, [value, excludeLabId]);

  return (
    <div className="flex flex-col gap-2">
      <BaseMap
        label="Drop a pin where the lab is"
        className="grains-pin-map"
        center={value ? [value.lng, value.lat] : DEFAULT_CENTER}
        zoom={value ? 16 : 12}
        onReady={onReady}
      >
        <p className="grains-pin-hint">
          {value
            ? `Pin at ${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} — tap again to move it`
            : "Tap the map to drop a pin"}
        </p>
      </BaseMap>

      {nearby.length > 0 && (
        <p className="grains-note">
          ⚠ Already listed near this pin:{" "}
          {nearby.map((lab) => lab.nameEn).join(", ")}. Same place? Edit the
          existing listing instead of adding a second one.
        </p>
      )}
    </div>
  );
}
