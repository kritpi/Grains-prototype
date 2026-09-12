import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ConnectSheet } from "@/components/books/connect-sheet";
import { PhotoOwnerActions } from "@/components/books/photo-owner-actions";
import { currentUser } from "@/lib/auth";
import { publicUrl } from "@/lib/image-loader";
import { getPhotobook, listPhotobooksForConnect } from "@/lib/queries/books";
import { listFormCatalog } from "@/lib/queries/catalogs";
import { alsoAppearsIn, getPhotoDetail } from "@/lib/queries/photos";

import "@/components/books/photobook.css";

/**
 * A Photo, in the context of the Photobook it was opened from.
 *
 * The context is the route, which is what the prototype got wrong: opening a
 * photo there jumped to a standalone screen under the Films tab, so the nav
 * highlight moved from Profile to Films mid-flow (gap plan L4). Here the book
 * is in the path, prev/next walk that book's order, and the breadcrumb goes
 * back where you came from.
 *
 * `-` as the slug means there is no book — a Photo that belongs to none, opened
 * from its owner's profile. Everything book-shaped then simply does not render;
 * the page is still the Photo's page.
 */
export const dynamic = "force-dynamic";

const loadPhoto = cache(getPhotoDetail);
const loadBook = cache(getPhotobook);

const NO_BOOK = "-";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function handleOf(param: string): string {
  return decodeURIComponent(param).replace(/^@/, "");
}

export async function generateMetadata({
  params,
}: PageProps<"/u/[username]/[slug]/[photoId]">): Promise<Metadata> {
  const { photoId } = await params;
  if (!UUID.test(photoId)) return { title: "Not found · Grains" };

  const photo = await loadPhoto(photoId);
  if (!photo) return { title: "Not found · Grains" };

  const name = photo.filmStockName ?? "Photograph";
  return {
    title: `${name} · @${photo.uploaderUsername} · Grains`,
    description: `Shot on ${name} by ${photo.uploaderUsername}.`,
  };
}

export default async function PhotoPage({
  params,
}: PageProps<"/u/[username]/[slug]/[photoId]">) {
  const { username, slug, photoId } = await params;
  if (!UUID.test(photoId)) notFound();

  const handle = handleOf(username);
  const bookSlug = decodeURIComponent(slug);

  const photo = await loadPhoto(photoId);
  if (!photo) notFound();

  const book = bookSlug === NO_BOOK ? null : await loadBook(handle, bookSlug);

  // Position within the book comes from the items the book already returned in
  // order — no second query, and no chance of the two disagreeing about what
  // "next" means.
  const index = book
    ? book.items.findIndex((item) => item.photoId === photoId)
    : -1;
  const previous = index > 0 ? book!.items[index - 1] : null;
  const next =
    book && index >= 0 && index < book.items.length - 1
      ? book.items[index + 1]
      : null;

  const viewer = await currentUser();
  const isOwner = viewer?.id === photo.ownerId;

  const [appearsIn, targets, catalog] = await Promise.all([
    alsoAppearsIn(photoId),
    // The owner's books too. This used to be fetched only for a visitor,
    // because the owner was offered no sheet at all — which is precisely why
    // there was no way to put your own photograph into your own photobook from
    // the page that shows it.
    viewer ? listPhotobooksForConnect(viewer.id, photoId) : Promise.resolve([]),
    isOwner ? listFormCatalog() : Promise.resolve(null),
  ]);

  // Fixed order, every row rendered. An absent field has to read as "not
  // tagged" rather than as a different layout (gap plan L5) — and there is no
  // Lab row here, and never will be: a scan attributes to a film stock, a
  // camera and a scanner model, never to the lab that developed it.
  const rail: { label: string; value: string | null }[] = [
    { label: "Film stock", value: photo.filmStockName },
    { label: "Format", value: photo.format },
    { label: "Frame", value: photo.frameSize },
    { label: "Camera", value: photo.camera },
    { label: "Scanner", value: photo.scannerModel },
    { label: "Chemistry", value: photo.chemistry },
  ];

  return (
    <main className="grains-photo">
      <div className="grains-photo-frame">
        <Image
          src={publicUrl(photo.storageKey)}
          width={photo.width}
          height={photo.height}
          alt={
            photo.filmStockName
              ? `Photograph on ${photo.filmStockName}`
              : "Photograph"
          }
          sizes="(min-width: 768px) 55vw, 100vw"
          priority
        />
      </div>

      <div className="grains-photo-rail">
        <div>
          <div className="grains-photo-nav">
            {book ? (
              <>
                <Link href={`/u/${handle}/${book.slug}`}>{book.title}</Link>
                <span>
                  · {index + 1} / {book.items.length}
                </span>
                <span style={{ marginLeft: "auto" }}>
                  {previous ? (
                    <Link
                      href={`/u/${handle}/${book.slug}/${previous.photoId}`}
                      aria-label="Previous photograph"
                    >
                      ←
                    </Link>
                  ) : (
                    <span aria-disabled="true">←</span>
                  )}{" "}
                  {next ? (
                    <Link
                      href={`/u/${handle}/${book.slug}/${next.photoId}`}
                      aria-label="Next photograph"
                    >
                      →
                    </Link>
                  ) : (
                    <span aria-disabled="true">→</span>
                  )}
                </span>
              </>
            ) : (
              <Link href={`/u/${handle}`}>@{handle}</Link>
            )}
          </div>

          <h1 className="grains-photo-h1">
            {photo.filmStockName ?? "Untagged photograph"}
          </h1>

          {/* The photo → uploader route. Under PRD D #9 the Connection graph is
              the only way to discover another person, so this link is that
              mechanism rather than a courtesy. */}
          <Link
            href={`/u/${photo.uploaderUsername}`}
            className="grains-photo-by"
          >
            Uploaded by @{photo.uploaderUsername}
          </Link>

          <div className="grains-also">
            {appearsIn === 0
              ? "In no photobook yet"
              : `Also appears in · ${appearsIn} ${appearsIn === 1 ? "photobook" : "photobooks"}`}
          </div>
        </div>

        <dl className="grains-meta-rail">
          {rail.map((row) => (
            <div key={row.label} className="grains-meta-row">
              <dt>{row.label}</dt>
              <dd data-empty={row.value === null}>
                {row.value ?? "Not tagged"}
              </dd>
            </div>
          ))}
        </dl>

        {isOwner && catalog ? (
          <>
            {/* Filing first, editing second: putting a frame into a book is the
                thing an uploader does often, and deleting it is the thing they
                do once. */}
            <ConnectSheet photoId={photoId} targets={targets} mode="file" />
            <PhotoOwnerActions
              photo={photo}
              alsoAppearsIn={appearsIn}
              scannerModels={catalog.scanners}
              afterDelete={book ? `/u/${handle}/${book.slug}` : `/u/${handle}`}
            />
          </>
        ) : viewer ? (
          <ConnectSheet photoId={photoId} targets={targets} />
        ) : (
          <div className="grains-sheet-note">
            <Link href="/sign-in" className="grains-photo-by">
              Sign in to connect this into a photobook
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
