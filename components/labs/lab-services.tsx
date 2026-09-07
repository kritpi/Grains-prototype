import type { LabDetail } from "@/lib/queries/labs";

import { Chip, NotEntered } from "./lab-section";

/**
 * Services and darkroom supplies — curated entries and contributors' own.
 *
 * Both are rendered identically on purpose. Decision Ledger #2 makes custom
 * entries display-only: they never back a filter, because with no moderator
 * persona there is nothing to reconcile "push/pull" with "push-pull
 * processing". That is a rule about the *filter*, not about the reader — a
 * service a lab offers is worth knowing whether or not somebody put it in a
 * catalog, so nothing here marks custom entries as second-class.
 *
 * Ordering does the honest thing instead: the query returns curated rows first,
 * in catalog order, so every lab's list opens the same way and the comparable
 * part is comparable.
 */

export function LabServices({ services }: Pick<LabDetail, "services">) {
  if (services.length === 0) {
    return <NotEntered>No services listed yet.</NotEntered>;
  }

  return (
    <ul className="font-sans text-sm">
      {services.map((service) => (
        <li
          key={service.id}
          className="flex flex-wrap items-baseline gap-x-2 border-b border-border py-2"
        >
          <span>{service.labelEn ?? service.customLabel}</span>
          {/* e.g. "from ฿60", "24h" — the specific bit a curated label cannot
              carry, and the reason lab_services has a note column at all. */}
          {service.note ? (
            <span className="text-xs text-muted-foreground">
              {service.note}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function LabSupplies({ supplies }: Pick<LabDetail, "supplies">) {
  if (supplies.length === 0) {
    return <NotEntered>No darkroom supplies listed yet.</NotEntered>;
  }

  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {supplies.map((supply) => (
          <li key={supply.id}>
            <Chip muted>{supply.labelEn ?? supply.customLabel}</Chip>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-sans text-[11px] text-muted-foreground">
        What the shop sells, not what is in stock today — there is no quantity
        and no freshness date behind these tags.
      </p>
    </>
  );
}
