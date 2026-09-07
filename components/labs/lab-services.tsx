import type { LabDetail } from "@/lib/queries/labs";

import { NotEntered, SectionLabel, SectionNote } from "./lab-section";

/**
 * Services as a checklist, and supplies as tags.
 *
 * The checklist is the point. The prototype renders the whole curated roster
 * whether or not the lab offers each one — ticked for yes, an empty grey box for
 * "nobody has said" — which turns the section from a list of facts into a list
 * of questions with some of the answers filled in. An absent line says nothing;
 * an unticked box says a contributor could tick it.
 *
 * Note the third state the box does *not* have: there is no "explicitly does not
 * offer this". `lab_services` records what a lab does, not what it refuses, so an
 * unticked box means unknown and the styling says so by going grey rather than
 * drawing a cross.
 *
 * Curated and contributor-added entries render identically. Decision Ledger #2
 * makes custom entries display-only — they never back a filter, because with no
 * moderator persona there is nothing to reconcile "push/pull" with "push-pull
 * processing" — but that is a rule about the *filter*, not about the reader. The
 * only concession is a quiet marker, which the prototype also carries, so a
 * contributor can see which entries are theirs to fix.
 */

export function LabServices({ services }: Pick<LabDetail, "services">) {
  return (
    <div className="min-w-0 flex-1 basis-52">
      <SectionLabel>Services</SectionLabel>

      <ul className="flex flex-col gap-2">
        {services.map((service) => (
          <li
            key={service.id ?? service.key}
            data-svstate={service.offered ? "on" : "unknown"}
            className="flex items-center gap-2.5 font-sans text-xs"
          >
            <span className="grains-svbox" aria-hidden="true">
              {service.offered ? "✓" : ""}
            </span>
            <span>
              <span>{service.labelEn ?? service.customLabel}</span>
              {/* e.g. "from ฿60", "24h" — the specific bit a curated label
                  cannot carry, and why lab_services has a note column. */}
              {service.note ? (
                <span className="text-muted-foreground"> · {service.note}</span>
              ) : null}
              {service.custom ? (
                <span className="text-muted-foreground">
                  {" "}
                  · community-added
                </span>
              ) : null}
            </span>
            <span className="sr-only">
              {service.offered ? "offered" : "not known"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LabSupplies({ supplies }: Pick<LabDetail, "supplies">) {
  return (
    <section>
      <SectionLabel>Darkroom supplies</SectionLabel>

      {supplies.length === 0 ? (
        <NotEntered>No darkroom supplies listed yet.</NotEntered>
      ) : (
        <>
          <ul className="flex flex-wrap gap-1.5">
            {supplies.map((supply) => (
              <li
                key={supply.id}
                className="border border-ring px-2.5 py-1 font-sans text-xs text-muted-foreground"
              >
                {supply.labelEn ?? supply.customLabel}
              </li>
            ))}
          </ul>
          <SectionNote className="mt-2">
            What the shop sells, not what is in stock today.
          </SectionNote>
        </>
      )}
    </section>
  );
}
