import type { LabDetail } from "@/lib/queries/labs";

import { LabLocationMap } from "./lab-location-map";
import { SectionLabel } from "./lab-section";

/**
 * Where the lab is: a still map, the street, and how to find the door.
 *
 * The landmark note is the part that matters and the part a formal address
 * cannot carry — "above the 7-Eleven, unmarked door on the soi side" is what
 * gets somebody inside, especially for a lab down a soi or on a third floor
 * (PRD A, Decision Ledger #4). The prototype marks it with a diamond so it reads
 * as a different kind of fact from the address above it, and prints both as
 * unfilled when they are missing rather than dropping the block.
 */
export function LabLocation({
  lat,
  lng,
  nameEn,
  street,
  areaEn,
  landmarkNote,
}: Pick<
  LabDetail,
  "lat" | "lng" | "nameEn" | "street" | "areaEn" | "landmarkNote"
>) {
  const address = [street, areaEn].filter(Boolean).join(", ");

  return (
    <section>
      <SectionLabel>Location</SectionLabel>

      <LabLocationMap lat={lat} lng={lng} nameEn={nameEn} />

      <p
        className="mt-2.5 font-sans text-xs leading-[1.7]"
        data-filled={address.length > 0}
      >
        {address || "Address not yet added"}
      </p>

      <p
        className="mt-1 font-sans text-xs leading-[1.7] text-muted-foreground"
        data-filled={Boolean(landmarkNote)}
      >
        <span aria-hidden="true">◆ </span>
        {landmarkNote ??
          "No landmark note yet — how would you describe finding it?"}
      </p>
    </section>
  );
}
