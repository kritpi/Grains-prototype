import {
  LoadingAnnouncement,
  SkeletonLine,
  StockTileSkeleton,
} from "@/components/layout/skeleton";
import "@/components/films/films.css";

/**
 * The film-stock catalogue, while the rows and their sample counts land.
 *
 * Eight tiles because the grid is `auto-fill, minmax(150px, 1fr)` and eight is
 * what fills it at the widths this page is read at — a count that leaves a
 * ragged final row would read as a result set rather than as a placeholder.
 */
export default function FilmsLoading() {
  return (
    <main className="grains-films">
      <LoadingAnnouncement label="Loading film stocks…" />

      <header className="flex flex-col gap-2.5 px-5 pt-6 pb-5">
        <SkeletonLine width="8rem" size="title" />
        <SkeletonLine width="14rem" />
      </header>

      <div className="grains-stock-grid px-5 pb-10">
        {Array.from({ length: 8 }, (_, i) => (
          <StockTileSkeleton key={i} ratio="1/1" />
        ))}
      </div>
    </main>
  );
}
