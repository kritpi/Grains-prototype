import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { NewPhotobook } from "@/components/books/new-photobook";
import { PhotobookCard } from "@/components/books/photobook-card";
import { PhotoGrid, type GridPhoto } from "@/components/books/photo-grid";
import { PhotoUploader } from "@/components/upload/photo-uploader";
import { currentUser } from "@/lib/auth";
import { UPLOAD_CAP } from "@/lib/photos/limits";
import { getProfile } from "@/lib/queries/books";
import { listFormCatalog } from "@/lib/queries/catalogs";
import { countOriginals, listUnfiledPhotos } from "@/lib/queries/photos";

import "@/components/books/photobook.css";

/**
 * `/u/@username` — the public profile, and the surface that owns the Photo
 * lifecycle.
 *
 * Two views of the same data. A visitor sees the Photobooks; the owner also
 * gets the cap meter, the upload entry point and "+ New Photobook" — the meter
 * sitting directly next to the action it constrains, which is why upload lives
 * here rather than behind a global "+" in the app shell (PRD D #10).
 *
 * Nothing here is private, so `getProfile` does not take a viewer: what differs
 * between the two views is affordances, not rows.
 */
export const dynamic = "force-dynamic";

const loadProfile = cache(getProfile);

/** The URL carries the @; the column does not. */
function handleOf(param: string): string {
  return decodeURIComponent(param).replace(/^@/, "");
}

export async function generateMetadata({
  params,
}: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  const profile = await loadProfile(handleOf(username));
  if (!profile) return { title: "Not found · Grains" };

  const books = profile.photobooks.length;
  return {
    title: `@${profile.username} · Grains`,
    description:
      books === 0
        ? `${profile.name ?? profile.username} on Grains.`
        : `${books} photobook${books === 1 ? "" : "s"} by ${profile.name ?? profile.username}.`,
  };
}

export default async function ProfilePage({
  params,
}: PageProps<"/u/[username]">) {
  const { username } = await params;
  const profile = await loadProfile(handleOf(username));
  if (!profile) notFound();

  const viewer = await currentUser();
  const isOwner = viewer?.id === profile.id;

  // The Photos stat is the person's own uploads, and it is deliberately NOT the
  // sum of their photobooks' item counts.
  //
  // Summing items is the prototype's worst bug (gap plan J13): a Connection is
  // somebody else's work, and one Photo filed in two books would be counted
  // twice. PRD D #5 exists to say Connections are not a user's uploads, and
  // this number is the one place in the product that expresses it — so it has
  // to come from `photos` by owner. Everyone sees it; only the owner sees what
  // it is measured against.
  const used = await countOriginals(profile.id);

  // A visitor pays for neither of these, because neither is shown to them.
  const [unfiled, catalog] = isOwner
    ? await Promise.all([listUnfiledPhotos(profile.id), listFormCatalog()])
    : [[], null];

  return (
    <main className="grains-profile">
      <header className="grains-profile-head">
        <div className="grains-identity">
          <div className="grains-avatar" aria-hidden="true">
            {profile.image ? (
              // A Google avatar URL, not an object in our bucket, so there is
              // nothing for the R2 loader to transform and next/image would
              // only wrap it in layout it does not need.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.image} alt="" width={60} height={60} />
            ) : (
              (profile.name ?? profile.username).charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h1 className="grains-handle">@{profile.username}</h1>
            {/* The path, not a domain. The production hostname is a launch
                decision nobody has made yet, and printing a guess would put it
                in front of every visitor. */}
            <div className="grains-profile-url">/u/@{profile.username}</div>
          </div>
        </div>

        <div className="grains-profile-side">
          <div className="grains-stats">
            <div className="grains-stat">
              <b>{profile.photobooks.length}</b>
              {profile.photobooks.length === 1 ? "Photobook" : "Photobooks"}
            </div>
            <div className="grains-stat">
              <b>{used}</b>
              {used === 1 ? "Photo" : "Photos"}
            </div>
          </div>
          {/* No "connected by others" total. A reuse count belongs to a Photo,
              where it is navigational; on a person it is a popularity score,
              which is what "no ads, no like counts" rules out (PRD D #11). */}
          {isOwner ? (
            <div className="grains-cap">
              {used} of {UPLOAD_CAP} uploads used · connections are free
            </div>
          ) : null}
        </div>
      </header>

      {profile.photobooks.length === 0 ? (
        <div className="grains-empty">
          <p>
            {isOwner
              ? "No photobooks yet. A photobook is a set — a few frames that belong together."
              : "No public photobooks yet."}
          </p>
        </div>
      ) : (
        <>
          <div className="grains-section-label">
            PHOTOBOOKS · {profile.photobooks.length}
          </div>
          <div className="grains-book-grid">
            {profile.photobooks.map((book) => (
              <PhotobookCard
                key={book.id}
                book={book}
                username={profile.username}
              />
            ))}
            {isOwner ? <NewPhotobook /> : null}
          </div>
        </>
      )}

      {isOwner && profile.photobooks.length === 0 ? (
        <div className="grains-book-grid">
          <NewPhotobook />
        </div>
      ) : null}

      {/* PROPOSED, and the answer to PRD D #10's open sub-question: a Photo in
          no Photobook surfaces here, and only for its owner. A visitor's view of
          a profile stays curated sets; the person who uploaded a frame and has
          not filed it can still find it. */}
      {isOwner && unfiled.length > 0 ? (
        <>
          <div className="grains-section-label">
            NOT IN A PHOTOBOOK · {unfiled.length}
          </div>
          <PhotoGrid
            photos={unfiled.map((photo): GridPhoto => ({
              id: photo.id,
              storageKey: photo.storageKey,
              width: photo.width,
              height: photo.height,
              frameSize: photo.frameSize,
              format: photo.format,
              credit: null,
            }))}
            hrefFor={(photo) => `/u/${profile.username}/-/${photo.id}`}
          />
        </>
      ) : null}

      {isOwner && catalog ? (
        <>
          <div className="grains-section-label">UPLOAD</div>
          <PhotoUploader scannerModels={catalog.scanners} />
        </>
      ) : null}
    </main>
  );
}
