import "./skeleton.css";

/**
 * The pieces a `loading.tsx` is assembled from.
 *
 * Every route in this app awaited a database round trip to Singapore with no
 * streaming fallback, so a navigation showed the previous page frozen until
 * the new one was ready. These are the placeholders that replace that.
 *
 * Server components on purpose — a skeleton has no state, and making it a
 * client component would ship JavaScript to render a grey box.
 *
 * All of it is `aria-hidden`. A screen reader gets the route's own
 * `role="status"` announcement instead; reading out eleven empty boxes is
 * noise, and the useful information is "loading", said once.
 */

export function SkeletonLine({
  width,
  size,
}: {
  width: string;
  size?: "title" | "lede";
}) {
  return (
    <div
      className="grains-skel-line"
      data-size={size}
      style={{ width }}
      aria-hidden="true"
    />
  );
}

/** One row of the lab list: atmosphere thumb, name, meta, process chips. */
export function LabCardSkeleton({ width }: { width: string }) {
  return (
    <li className="grains-skel-card" aria-hidden="true">
      <div className="grains-skel-hatch grains-skel-card-thumb" />
      <div className="grains-skel-card-body">
        <SkeletonLine width="62%" size="title" />
        <SkeletonLine width="38%" />
        <div className="grains-skel-chips">
          <div className="grains-skel-chip" />
          <div className="grains-skel-chip" />
        </div>
        <SkeletonLine width={width} />
      </div>
    </li>
  );
}

/**
 * A film-stock tile. Duotone content, so the frame is the tile's real
 * aspect ratio and the caption lines sit beneath it exactly as they will.
 */
export function StockTileSkeleton({ ratio }: { ratio: "1/1" | "3/2" }) {
  return (
    <div
      className="flex flex-col gap-2.5"
      aria-hidden="true"
      data-testid="stock-tile-skeleton"
    >
      <div className="grains-skel" data-ratio={ratio} />
      <SkeletonLine width="70%" size="lede" />
      <SkeletonLine width="45%" />
    </div>
  );
}

/**
 * The line a route announces while it waits.
 *
 * Polite, so it does not interrupt whatever the reader was doing when they
 * navigated, and the only thing on the page a screen reader is given.
 */
export function LoadingAnnouncement({ label }: { label: string }) {
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {label}
    </p>
  );
}
