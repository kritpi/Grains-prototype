import type { Metadata } from "next";

import { FilmForm } from "@/components/films/film-form";
import { BackLink } from "@/components/layout/back-link";
import { requireUser } from "@/lib/auth";

import "@/components/lab-form/lab-form.css";

export const metadata: Metadata = { title: "Add a film stock · Grains" };

export default async function NewFilmStockPage() {
  await requireUser("/films/new");

  return (
    <main>
      <BackLink href="/films" label="Film stocks" />
      <FilmForm />
    </main>
  );
}
