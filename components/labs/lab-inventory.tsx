import Link from "next/link";

import type { LabDetail } from "@/lib/queries/labs";

import { NotEntered } from "./lab-section";

/**
 * Film stock carried in store.
 *
 * Every chip is a link to the catalog entry, and that link is the feature: a
 * stock a lab carries is a real foreign key to `film_stocks`, not a typed
 * label, which is the only reason reverse search — "who near me sells Portra
 * 400" — can exist at all (PRD A, Decision Ledger #3).
 *
 * `/films/[id]` is Track B's page and does not exist in this worktree yet. The
 * links are still written now rather than left as text: the href is fixed by
 * the route table, and a link that 404s until B merges is a smaller problem
 * than a page that has to be revisited to add them.
 */
export function LabInventory({ stock }: Pick<LabDetail, "stock">) {
  if (stock.length === 0) {
    return (
      <NotEntered>
        No film stock listed yet — this is what makes a lab findable from a
        film&rsquo;s page.
      </NotEntered>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {stock.map((item) => (
        <li key={item.filmStockId}>
          <Link
            href={`/films/${item.filmStockId}`}
            className="inline-flex items-baseline gap-2 border border-foreground px-2 py-1 font-sans text-xs hover:bg-foreground hover:text-background"
          >
            <span>{item.name}</span>
            <span className="text-[11px] opacity-70">
              ISO {item.iso}
              {item.formats.length > 0 ? ` · ${item.formats.join(", ")}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
