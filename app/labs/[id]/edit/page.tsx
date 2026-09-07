import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { LabForm } from "@/components/lab-form/lab-form";
import { BackLink } from "@/components/layout/back-link";
import { requireUser } from "@/lib/auth";
import { listFormCatalog } from "@/lib/queries/catalogs";
import { getLab } from "@/lib/queries/labs";

import "@/components/lab-form/lab-form.css";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = {
  title: "Suggest an edit · Grains",
};

/**
 * Suggest an edit — the same form, seeded from the lab.
 *
 * The lab is read here and handed to the form as the diff's baseline, which is
 * also what carries `version`: the number the form was rendered from is the one
 * the save is checked against, so a lab that moves between this render and that
 * click is a conflict rather than a silent overwrite.
 *
 * There is no ownership check. Anyone signed in may edit any lab — trust by
 * default, every change attributed and reversible (PRD A). The guard is the
 * history, not a permission.
 */
export default async function EditLabPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  await requireUser(`/labs/${id}/edit`);

  const [lab, catalog] = await Promise.all([getLab(id), listFormCatalog()]);
  if (!lab) notFound();

  return (
    <main>
      {/* Back to the lab, not to the search: an edit is reached from the page
          it edits, and that is where abandoning it should land. */}
      <BackLink href={`/labs/${lab.id}`} label={lab.nameEn} />
      <LabForm catalog={catalog} lab={lab} />
    </main>
  );
}
