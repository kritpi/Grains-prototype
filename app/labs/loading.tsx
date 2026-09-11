import {
  LabCardSkeleton,
  LoadingAnnouncement,
  SkeletonLine,
} from "@/components/layout/skeleton";

/**
 * The discovery shell, while the filter catalogue and the first search land.
 *
 * `/labs` is the slowest read in the product — a PostGIS `ST_DWithin` against
 * a geography column, plus completeness ordering, plus the filter catalogue —
 * and it had no fallback, so a navigation here showed the previous page until
 * all of it resolved.
 *
 * The geometry is the real shell, not an approximation: the same
 * `min-h-[calc(100vh-4rem)]` column that reverses to a row at `lg`, the same
 * 27rem rail, the same hairline between them. A skeleton with its own layout
 * would resolve into a visible jump, which is worse than no skeleton — it
 * makes a fast load look broken.
 *
 * The map gets the grid it draws under its own pins rather than a spinner, so
 * when tiles arrive they fill a frame that was already the right shape.
 */
export default function LabsLoading() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col lg:h-[calc(100vh-4rem)] lg:min-h-0 lg:flex-row lg:overflow-hidden">
      <LoadingAnnouncement label="Loading labs…" />

      <div className="order-2 flex w-full flex-col border-border lg:order-1 lg:h-full lg:min-h-0 lg:w-[27rem] lg:shrink-0 lg:border-r">
        <div className="grains-skel-rail">
          <SkeletonLine width="45%" size="lede" />
          <div className="grains-skel-chips">
            <div className="grains-skel-chip" />
            <div className="grains-skel-chip" />
            <div className="grains-skel-chip" />
            <div className="grains-skel-chip" />
          </div>
          <SkeletonLine width="30%" />
        </div>

        {/* Four rows: enough to read as a list, short enough not to imply a
            result count the search has not returned yet. */}
        <ul className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <LabCardSkeleton width="76%" />
          <LabCardSkeleton width="54%" />
          <LabCardSkeleton width="68%" />
          <LabCardSkeleton width="42%" />
        </ul>
      </div>

      <div className="order-1 h-[45vh] w-full lg:order-2 lg:h-full lg:min-h-0 lg:flex-1">
        <div className="grains-skel-map" aria-hidden="true" />
      </div>
    </div>
  );
}
