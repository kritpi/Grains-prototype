import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AddToBook, type PickablePhoto } from "@/components/books/add-to-book";
import { PhotoGrid, type GridPhoto } from "@/components/books/photo-grid";
import { currentUser } from "@/lib/auth";
import { getPhotobook } from "@/lib/queries/books";
import { listOwnPhotosForBook } from "@/lib/queries/photos";

import "@/components/books/photobook.css";

/**
 * `/u/@username/a-photobook` — the curated set, shown as one thing.
 *
 * The grid is the point: true aspect ratios, no cropping, no uniform tiles.
 * See `components/books/photo-grid.tsx` for why that is a promise rather than
 * a style.
 *
 * The artist's note appears once, at the top, for the whole collection — never
 * as a caption under each frame (PRD D #7). A note per photo is what pushes a
 * photobook towards a busy, caption-heavy feed, which is the thing the fine-art
 * direction exists to avoid.
 *
 * **Owner-aware, which it was not.** This page never asked who was reading it,
 * so the person who made the photobook saw exactly what a stranger saw: a grid,
 * or — far worse — an empty state that said "Nothing in this photobook yet" and
 * offered no way to put anything in it. PRD D #10 asks for an add-photo
 * affordance inside a Photobook its owner is looking at; `AddToBook` is it.
 * Nothing here is private, so what differs between the two views is affordances
 * rather than rows, exactly as on the profile above it.
 */
export const dynamic = "force-dynamic";

const loadBook = cache(getPhotobook);

function handleOf(param: string): string {
  return decodeURIComponent(param).replace(/^@/, "");
}

export async function generateMetadata({
  params,
}: PageProps<"/u/[username]/[slug]">): Promise<Metadata> {
  const { username, slug } = await params;
  const book = await loadBook(handleOf(username), decodeURIComponent(slug));
  if (!book) return { title: "Not found · Grains" };

  return {
    title: `${book.title} · @${book.ownerUsername} · Grains`,
    description:
      book.artistNote ??
      `A photobook by ${book.ownerUsername} — ${book.items.length} photographs.`,
  };
}

export default async function PhotobookPage({
  params,
}: PageProps<"/u/[username]/[slug]">) {
  const { username, slug } = await params;
  const handle = handleOf(username);
  const book = await loadBook(handle, decodeURIComponent(slug));
  if (!book) notFound();

  const viewer = await currentUser();
  const isOwner = viewer?.id === book.ownerId;

  const connected = book.items.filter((item) => item.connected).length;

  // A visitor pays for none of this, because none of it is shown to them.
  const pickable: PickablePhoto[] = isOwner
    ? (await listOwnPhotosForBook(book.ownerId, book.id)).map((photo) => ({
        id: photo.id,
        storageKey: photo.storageKey,
        width: photo.width,
        height: photo.height,
        frameSize: photo.frameSize,
        format: photo.format,
        inBook: photo.inBook,
      }))
    : [];

  return (
    <main className="grains-book">
      <div>
        <nav className="grains-crumb" aria-label="Breadcrumb">
          <Link href={`/u/${handle}`}>@{book.ownerUsername}</Link>
          <span aria-hidden="true">/</span>
          <span>PHOTOBOOK</span>
        </nav>

        <h1 className="grains-book-h1">{book.title}</h1>

        <div className="grains-book-lede">
          {book.items.length}{" "}
          {book.items.length === 1 ? "photograph" : "photographs"}
          {connected > 0 ? ` · ${connected} connected` : null}
        </div>

        {book.artistNote ? (
          <p className="grains-note-quote">{book.artistNote}</p>
        ) : null}

        {isOwner ? (
          <AddToBook
            photobookId={book.id}
            photos={pickable}
            uploadHref={`/u/${handle}`}
          />
        ) : null}
      </div>

      {book.items.length === 0 ? (
        <div className="grains-empty">
          <p>
            {isOwner
              ? "Nothing in this photobook yet. Add photographs above — one frame can sit in several of your photobooks at once."
              : "Nothing in this photobook yet."}
          </p>
        </div>
      ) : (
        <PhotoGrid
          photos={book.items.map((item): GridPhoto => ({
            id: item.photoId,
            storageKey: item.storageKey,
            width: item.width,
            height: item.height,
            frameSize: item.frameSize,
            format: item.format,
            // Only a Connection carries a credit. An own Photo shows none.
            credit: item.connected ? item.uploaderUsername : null,
          }))}
          hrefFor={(photo) => `/u/${handle}/${book.slug}/${photo.id}`}
        />
      )}
    </main>
  );
}
