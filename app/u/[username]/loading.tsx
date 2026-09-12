import {
  LoadingAnnouncement,
  SkeletonLine,
  StockTileSkeleton,
} from "@/components/layout/skeleton";
import "@/components/books/photobook.css";

/**
 * A public profile, while the user and their photobooks land.
 *
 * The avatar is a circle here and a circle on the real page: this is the one
 * place the design's flat-rectangle rule is deliberately broken, so a square
 * placeholder resolving into a round avatar would be a visible pop.
 */
export default function ProfileLoading() {
  return (
    <main className="grains-profile">
      <LoadingAnnouncement label="Loading profile…" />

      <header className="grains-profile-head">
        <div className="grains-identity">
          <div
            className="grains-skel h-[60px] w-[60px] shrink-0 rounded-full"
            aria-hidden="true"
          />
          <div className="flex min-w-0 flex-col gap-2">
            <SkeletonLine width="9rem" size="title" />
            <SkeletonLine width="7rem" />
            <SkeletonLine width="16rem" size="lede" />
          </div>
        </div>
      </header>

      <div className="grains-book-grid">
        <StockTileSkeleton ratio="3/2" />
        <StockTileSkeleton ratio="3/2" />
        <StockTileSkeleton ratio="3/2" />
      </div>
    </main>
  );
}
