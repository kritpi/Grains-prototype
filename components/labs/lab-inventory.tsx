import Link from "next/link";

import type { LabDetail } from "@/lib/queries/labs";

import { NotEntered, SectionLabel } from "./lab-section";

/**
 * Film stock carried in store, as chips that leave the page.
 *
 * Every chip is a link to the catalog entry, and that link is the feature: a
 * stock a lab carries is a real foreign key to `film_stocks`, not a typed label,
 * which is the only reason reverse search — "who near me sells Portra 400" — can
 * exist at all (PRD A, Decision Ledger #3). The prototype marks each one with an
 * outbound arrow for the same reason: the chip is a door, not a tag.
 *
 * `/films/[id]` is Track B's page and does not exist in this worktree yet. The
 * links are still written now: the href is fixed by the route table, and a link
 * that 404s until B merges is a smaller problem than a page that has to be
 * revisited to add them.
 */
export function LabInventory({ stock }: Pick<LabDetail, "stock">) {
  return (
    <section>
      <SectionLabel>In store · film stock</SectionLabel>

      {stock.length === 0 ? (
        <NotEntered>
          No film stock listed yet — this is what makes a lab findable from a
          film&rsquo;s page.
        </NotEntered>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {stock.map((item) => (
            <li key={item.filmStockId}>
              <Link
                href={`/films/${item.filmStockId}`}
                className="inline-flex items-baseline gap-1.5 border-[1.5px] border-foreground px-2.5 py-1 font-sans text-xs hover:bg-foreground hover:text-background"
              >
                <span>{item.name}</span>
                <span aria-hidden="true">↗</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
