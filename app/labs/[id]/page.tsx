import { cache } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LabBadges } from "@/components/labs/lab-badges";
import { LabContacts, LabQuickActions } from "@/components/labs/lab-contacts";
import { LabEditLog } from "@/components/labs/lab-edit-log";
import { LabHoursTable } from "@/components/labs/lab-hours-table";
import { LabInventory } from "@/components/labs/lab-inventory";
import { LabLocationMap } from "@/components/labs/lab-location-map";
import { LabPhotos } from "@/components/labs/lab-photos";
import { LabSection, NotEntered } from "@/components/labs/lab-section";
import { LabServices, LabSupplies } from "@/components/labs/lab-services";
import { LabStatusBanner, LabStatusLine } from "@/components/labs/lab-status";
import { PricingMatrix } from "@/components/labs/pricing-matrix";
import { formatEditAge } from "@/components/labs/edit-log-format";
import { labPhotoUrl } from "@/lib/labs/photo-url";
import { getLab } from "@/lib/queries/labs";

/**
 * "Open now" is a function of the clock, so there is nothing here to prerender
 * — the same reason /labs is dynamic. Everything else on the page would cache
 * happily; the status pill is what stops it.
 */
export const dynamic = "force-dynamic";

/**
 * `generateMetadata` and the page body both need the lab, and `getLab` is ten
 * statements. Cached per request so it is fetched once: without this the pool
 * — five connections, and small enough to have deadlocked this page's sibling
 * once already — serves twenty statements to render one page.
 */
const loadLab = cache(getLab);

/**
 * A bad id must not reach the query. `getLab` casts to uuid in SQL, so a
 * hand-typed path segment would raise 22P02 and surface as a 500 rather than
 * the 404 it actually is.
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
      ? ` Develops ${lab.processes.map((p) => p.toUpperCase()).join(", ")}.`
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

  const lab = await loadLab(id);
  if (!lab) notFound();

  // Resolvable only once Track C's bucket exists; until then the section is
  // absent rather than a row of broken frames.
  const photos = lab.photos
    .map((photo) => ({ ...photo, url: labPhotoUrl(photo.storageKey) }))
    .filter(
      (photo): photo is typeof photo & { url: string } => photo.url !== null,
    );

  const address = [lab.street, lab.areaEn].filter(Boolean).join(", ");

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <nav
        aria-label="Breadcrumb"
        className="font-sans text-xs text-muted-foreground"
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

      {lab.status !== "open" ? (
        <div className="mt-5">
          <LabStatusBanner
            status={lab.status}
            statusNote={lab.statusNote}
            openNow={lab.openNow}
            hours={lab.hours}
          />
        </div>
      ) : null}

      <header className="mt-5">
        <h1 className="text-4xl leading-tight">{lab.nameEn}</h1>
        {lab.nameTh ? (
          <p className="mt-1 text-lg text-muted-foreground">{lab.nameTh}</p>
        ) : null}

        <div className="mt-4">
          <LabStatusLine
            status={lab.status}
            statusNote={lab.statusNote}
            openNow={lab.openNow}
            hours={lab.hours}
          />
        </div>

        <div className="mt-4">
          <LabQuickActions
            lat={lab.lat}
            lng={lab.lng}
            nameEn={lab.nameEn}
            contacts={lab.contacts}
          />
        </div>
      </header>

      {photos.length > 0 ? (
        <div className="mt-8">
          <LabPhotos photos={photos} nameEn={lab.nameEn} />
        </div>
      ) : null}

      {/* Two columns on desktop, one on a phone. The rail is the "where and
          how do I reach it" half; the main column is the "what does it cost
          and what can it do" half. */}
      <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-8">
          <LabSection title="Pricing per process">
            <PricingMatrix processes={lab.processes} pricing={lab.pricing} />
          </LabSection>

          <LabSection title="Scanners">
            {lab.scanners.length > 0 ? (
              <p className="font-sans text-sm">{lab.scanners.join(" · ")}</p>
            ) : (
              <NotEntered>No scanner listed yet.</NotEntered>
            )}
          </LabSection>

          <LabSection title="Services">
            <LabServices services={lab.services} />
          </LabSection>

          <LabSection
            title="Community badges"
            aside={
              lab.badges.reduce((sum, b) => sum + b.count, 0) > 0
                ? `${lab.badges.reduce((sum, b) => sum + b.count, 0)} endorsements`
                : undefined
            }
          >
            <LabBadges badges={lab.badges} />
          </LabSection>
        </div>

        <aside className="flex flex-col gap-8 lg:sticky lg:top-8 lg:self-start">
          <LabSection title="Location">
            <LabLocationMap lat={lab.lat} lng={lab.lng} nameEn={lab.nameEn} />

            {address ? (
              <p className="mt-3 font-sans text-sm">{address}</p>
            ) : null}

            {/* How a person finds this in practice — "above the 7-Eleven,
                unmarked door" — which a formal address does not carry, and
                which matters for a lab down a soi (Decision Ledger #4). */}
            {lab.landmarkNote ? (
              <p className="mt-2 font-sans text-sm text-muted-foreground">
                {lab.landmarkNote}
              </p>
            ) : null}
          </LabSection>

          <LabSection title="Hours">
            <LabHoursTable
              hours={lab.hours}
              overridden={lab.status !== "open"}
            />
          </LabSection>

          <LabSection title="Contact">
            <LabContacts contacts={lab.contacts} />
          </LabSection>

          <LabSection title="In store · film stock">
            <LabInventory stock={lab.stock} />
          </LabSection>

          <LabSection title="Darkroom supplies">
            <LabSupplies supplies={lab.supplies} />
          </LabSection>

          <LabSection title="Contribution">
            <p className="font-sans text-xs text-muted-foreground">
              {lab.lastEditedAt
                ? `Last edited ${formatEditAge(lab.lastEditedAt)}${
                    lab.lastEditorUsername
                      ? ` by @${lab.lastEditorUsername}`
                      : ""
                  } · ${lab.editCount} edit${lab.editCount === 1 ? "" : "s"}`
                : "No edits recorded yet."}
            </p>
            <p className="mt-2 font-sans text-xs text-muted-foreground">
              Anything above can be corrected by anyone signed in, and edits go
              live immediately.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {/* Track B's route. Linked now because the path is fixed by the
                  route table and the page should not need revisiting. */}
              <Link
                href={`/labs/${lab.id}/edit`}
                className="border border-foreground px-3 py-1.5 font-sans text-xs hover:bg-foreground hover:text-background"
              >
                Suggest an edit
              </Link>
            </div>
          </LabSection>
        </aside>
      </div>

      <div className="mt-12">
        <LabSection title="Edit history">
          <LabEditLog labId={lab.id} editCount={lab.editCount} />
        </LabSection>
      </div>
    </main>
  );
}
