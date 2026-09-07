import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { FilmForm } from "@/components/films/film-form";
import { BackLink } from "@/components/layout/back-link";
import { requireUser } from "@/lib/auth";
import { getFilmStock } from "@/lib/queries/films";

import "@/components/lab-form/lab-form.css";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Suggest an edit · Grains" };

export default async function EditFilmStockPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  await requireUser(`/films/${id}/edit`);

  const stock = await getFilmStock(id);
  if (!stock) notFound();

  return (
    <main>
      <BackLink href={`/films/${stock.id}`} label={stock.name} />
      <FilmForm stock={stock} />
    </main>
  );
}
