import { cache } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LabBadges } from "@/components/labs/lab-badges";
import { LabContacts, LabQuickActions } from "@/components/labs/lab-contacts";
import {
  LabContribution,
  SuggestEditButton,
} from "@/components/labs/lab-contribution";
import { LabEditLog } from "@/components/labs/lab-edit-log";
import { LabHoursTable } from "@/components/labs/lab-hours-table";
import { LabInventory } from "@/components/labs/lab-inventory";
import { LabLocation } from "@/components/labs/lab-location";
import { LabPhotos } from "@/components/labs/lab-photos";
import { LabServices, LabSupplies } from "@/components/labs/lab-services";
import {
  LabMetaLine,
  LabStatus,
  LabStatusBanner,
} from "@/components/labs/lab-status";
import { PricingMatrix } from "@/components/labs/pricing-matrix";
import { PROCESS_LABELS } from "@/components/labs/search-state";
import { currentUser } from "@/lib/auth";
import { bangkokNow } from "@/lib/labs/hours";
import { labPhotoUrl } from "@/lib/labs/photo-url";
import { CHEM_PROCESSES, getLab } from "@/lib/queries/labs";

import "@/components/labs/lab-detail.css";

/**
 * "Open now" is a function of the clock, so there is nothing here to prerender —
 * the same reason /labs is dynamic. Everything else on the page would cache
 * happily; the status dot is what stops it.
 */
export const dynamic = "force-dynamic";

/**
 * `generateMetadata` and the page body both need the lab, and `getLab` is ten
 * statements. Cached per request so it is fetched once: without this the pool —
 * five connections, and small enough to have deadlocked this page's sibling once
 * already — serves twenty statements to render one page.
 */
const loadLab = cache(getLab);

/**
 * A bad id must not reach the query. `getLab` casts to uuid in SQL, so a
 * hand-typed path segment would raise 22P02 and surface as a 500 rather than the
 * 404 it actually is.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: PageProps<"/labs/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Lab not found · Grains" };

  const lab = await loadLab(id);
  if (!lab) return { title: "Lab not found · Grains" };

  const where = lab.areaEn ? ` in ${lab.areaEn}` : "";
  const processes =
    lab.processes.length > 0
      ? ` Develops ${lab.processes.map((p) => PROCESS_LABELS[p]).join(", ")}.`
      : "";

  return {
    title: `${lab.nameEn} · Grains`,
    description: `Film developing lab${where}, Bangkok.${processes}`,
    // Discovery is the point of the product, and a permanently-closed lab is
    // deliberately out of search — including this one.
    robots: lab.status === "permanently_closed" ? { index: false } : undefined,
  };
}

export default async function LabPage({ params }: PageProps<"/labs/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  // The reader, if there is one — used only to mark their own endorsements and
  // to decide whether a badge is a button or a link to sign in. currentUser()
  // is React.cached, so the header's own lookup does not cost a second query.
  const viewer = await currentUser();

  const lab = await loadLab(id, viewer?.id);
  if (!lab) notFound();

  // Resolvable only once Track C's bucket exists; until then the mosaic renders
  // as empty hatched slots rather than disappearing.
  const photos = lab.photos
    .map((photo) => ({ ...photo, url: labPhotoUrl(photo.storageKey) }))
    .filter(
      (photo): photo is typeof photo & { url: string } => photo.url !== null,
    );

  const offered = new Set(lab.processes);

  // Bangkok's today, computed here rather than in the hours component: that one
  // is a client component for its collapse toggle, and the browser's clock is
  // not the lab's.
  const todayDow = bangkokNow().dow;

  return (
    <main>
      <nav
        aria-label="Breadcrumb"
        className="border-b border-border px-5 py-2.5 font-sans text-xs text-muted-foreground"
      >
        <Link href="/labs" className="hover:underline">
          Labs
        </Link>
        {lab.areaEn ? (
          <>
            <span aria-hidden="true"> / </span>
            {/* The area is a real search, not a label: ?area= resolves to a
                centroid on the server and renders results in the HTML. */}
            <Link
              href={`/labs?area=${encodeURIComponent(lab.areaEn)}`}
              className="hover:underline"
            >
              {lab.areaEn}
            </Link>
          </>
        ) : null}
        <span aria-hidden="true"> / </span>
        <span className="text-foreground">{lab.nameEn}</span>
      </nav>

      <LabPhotos photos={photos} nameEn={lab.nameEn} />

      {/* Wraps to one column below ~780px: the rail's content is the "where and
          how do I reach it" half and reads perfectly well underneath. */}
      <div className="flex flex-wrap items-start">
        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-5 px-5 pt-5 pb-8">
          {lab.status !== "open" ? (
            <LabStatusBanner
              status={lab.status}
              statusNote={lab.statusNote}
              openNow={lab.openNow}
              hours={lab.hours}
            />
          ) : null}

          <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start gap-3.5">
              <div className="min-w-[200px] flex-1">
                <h1 className="font-serif text-[32px] leading-[1.08]">
                  {lab.nameEn}
                </h1>
                {lab.nameTh ? (
                  <p className="mt-1 text-[17px] text-muted-foreground">
                    {lab.nameTh}
                  </p>
                ) : null}
              </div>
              <div className="mt-1">
                <LabStatus
                  status={lab.status}
                  statusNote={lab.statusNote}
                  openNow={lab.openNow}
                  hours={lab.hours}
                />
              </div>
            </div>

            <LabMetaLine
              areaEn={lab.areaEn}
              status={lab.status}
              openNow={lab.openNow}
              hours={lab.hours}
            />

            {/* Process chips carry their own colour, which is the product's
                shorthand for a process everywhere it appears. An unoffered one
                is outlined rather than absent, for the same reason its pricing
                row stays. */}
            <div className="mt-1 flex flex-wrap gap-1.5">
              {CHEM_PROCESSES.map((process) => (
                <span
                  key={process}
                  className="grains-proc"
                  data-process={process}
                  data-on={offered.has(process)}
                >
                  {PROCESS_LABELS[process]}
                </span>
              ))}
              {/* One chip per scanner rather than one chip listing them all.
                  A scanner is an independent fact about the lab in the same way
                  a process is — it is a filter value on /labs, and people pick
                  a lab for a Frontier the way they pick one for E-6. Joining
                  them into "Noritsu · SP-3000" made a set look like a sentence.
                  Outlined rather than colour-coded: the process palette is a
                  fixed roster of four, while the scanner roster is content and
                  grows without a migration. */}
              {lab.scanners.map((model) => (
                <span
                  key={model}
                  className="border border-ring px-2.5 py-[3px] font-sans text-xs text-muted-foreground"
                >
                  {model}
                </span>
              ))}
            </div>
          </header>

          <LabQuickActions
            lat={lab.lat}
            lng={lab.lng}
            nameEn={lab.nameEn}
            contacts={lab.contacts}
          />

          <LabBadges
            badges={lab.badges}
            labId={lab.id}
            signedIn={Boolean(viewer?.username)}
          />

          <PricingMatrix processes={lab.processes} pricing={lab.pricing} />

          <div className="flex flex-wrap gap-7">
            <LabServices services={lab.services} />
            <LabContribution
              labId={lab.id}
              editCount={lab.editCount}
              lastEditedAt={lab.lastEditedAt}
              lastEditorUsername={lab.lastEditorUsername}
              status={lab.status}
            />
          </div>

          <LabInventory stock={lab.stock} />
          <LabSupplies supplies={lab.supplies} />

          <SuggestEditButton labId={lab.id} />
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-5 border-border px-5 pt-5 pb-8 md:border-l">
          <LabLocation
            lat={lab.lat}
            lng={lab.lng}
            nameEn={lab.nameEn}
            street={lab.street}
            areaEn={lab.areaEn}
            landmarkNote={lab.landmarkNote}
          />

          <LabHoursTable
            hours={lab.hours}
            todayDow={todayDow}
            overridden={lab.status !== "open"}
          />

          <LabContacts contacts={lab.contacts} />
        </aside>
      </div>

      <div
        id="edit-history"
        className="scroll-mt-4 border-t border-border px-5 pt-5 pb-10"
      >
        <LabEditLog labId={lab.id} editCount={lab.editCount} />
      </div>
    </main>
  );
}
