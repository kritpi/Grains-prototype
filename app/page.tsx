import { redirect } from "next/navigation";

/**
 * `/` is `/labs`.
 *
 * Discovery is the product, so the address people type, bookmark or land on
 * from a search result should be the thing itself rather than a wordmark with
 * nothing under it. This used to render a centred "Grains" and no links at all
 * — three separate affordances (the header wordmark and two breadcrumbs) led
 * here, and all three led somewhere with nowhere to go next.
 *
 * A redirect rather than moving the labs page to `/`: a lab lives at
 * `/labs/[id]`, the breadcrumb above it says "Labs", `?area=` and the map's
 * viewport parameters all hang off `/labs`, and the sitemap already lists it.
 * One canonical address for the search, and `/` is a doormat in front of it.
 *
 * `/` is no longer in `app/sitemap.ts` for the same reason: a crawler should be
 * handed the destination, not the redirect.
 */
export default function Home() {
  redirect("/labs");
}
