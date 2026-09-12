import {
  LoadingAnnouncement,
  SkeletonLine,
  StockTileSkeleton,
} from "@/components/layout/skeleton";
import "@/components/films/films.css";

/**
 * A stock and its whole inspiration gallery, which are fetched together.
 *
 * The hero reserves 3:2 because that is the ratio the page draws it at. The
 * gallery below keeps mixed ratios on purpose — the real one does, since a
 * community photo keeps the frame it was shot in and nothing is cropped to
 * square up a grid, so a uniform placeholder grid would misdescribe it.
 */
export default function FilmStockLoading() {
  return (
    <main className="grains-stock">
      <LoadingAnnouncement label="Loading film stock…" />

      <div className="grains-stock-hero">
        <div className="grains-skel" data-ratio="3/2" aria-hidden="true" />
        <div className="grains-stock-facts">
          <SkeletonLine width="11rem" size="title" />
          <div className="grains-skel-chips">
            <div className="grains-skel-chip" />
            <div className="grains-skel-chip" />
            <div className="grains-skel-chip" />
          </div>
          <SkeletonLine width="90%" size="lede" />
          <SkeletonLine width="72%" size="lede" />
        </div>
      </div>

      <div className="grains-stock-grid px-5 pb-10">
        <StockTileSkeleton ratio="3/2" />
        <StockTileSkeleton ratio="1/1" />
        <StockTileSkeleton ratio="3/2" />
        <StockTileSkeleton ratio="1/1" />
        <StockTileSkeleton ratio="1/1" />
        <StockTileSkeleton ratio="3/2" />
      </div>
    </main>
  );
}
