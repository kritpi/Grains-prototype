import type { Metadata } from "next";

import { LabForm } from "@/components/lab-form/lab-form";
import { BackLink } from "@/components/layout/back-link";
import { requireUser } from "@/lib/auth";
import { listFormCatalog } from "@/lib/queries/catalogs";

import "@/components/lab-form/lab-form.css";

export const metadata: Metadata = {
  title: "Add a lab · Grains",
  description: "Add a film-developing lab to Grains.",
};

/**
 * Add Lab.
 *
 * `requireUser` before anything is read, so a signed-out visitor arrives at
 * sign-in rather than at a form they cannot submit — the auth gate is
 * contextual, and the context is that adding a lab needs an account.
 *
 * Three of the seeded Bangkok labs exist only in a research note because no
 * source could give them a location and `labs.location` is NOT NULL. A seed file
 * cannot drop a pin on a map. This page is where they get added.
 */
export default async function NewLabPage() {
  await requireUser("/labs/new");
  const catalog = await listFormCatalog();

  return (
    <main>
      <BackLink href="/labs" label="Labs" />
      <LabForm catalog={catalog} />
    </main>
  );
}
