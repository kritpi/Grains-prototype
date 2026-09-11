import {
  LoadingAnnouncement,
  SkeletonLine,
  StockTileSkeleton,
} from "@/components/layout/skeleton";
import "@/components/books/photobook.css";

/**
 * One photobook, while its ordered items and their metadata land.
 *
 * Mixed ratios again, for the reason the stock gallery uses them: a photobook
 * is a reading order of photos that each keep their own frame, and a grid of
 * identical placeholders would promise a uniformity the page does not have.
 */
export default function PhotobookLoading() {
  return (
    <main className="grains-book">
      <LoadingAnnouncement label="Loading photobook…" />

      <header className="flex flex-col gap-2.5 px-5 pt-6 pb-5">
        <SkeletonLine width="6rem" />
        <SkeletonLine width="13rem" size="title" />
        <SkeletonLine width="20rem" size="lede" />
      </header>

      <div className="grains-book-grid">
        <StockTileSkeleton ratio="3/2" />
        <StockTileSkeleton ratio="1/1" />
        <StockTileSkeleton ratio="1/1" />
        <StockTileSkeleton ratio="3/2" />
      </div>
    </main>
  );
}
