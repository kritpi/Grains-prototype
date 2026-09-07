import { CHEM_PROCESSES, PROCESS_LABELS } from "./search-state";
import type { ChemProcess, LabDetail } from "@/lib/queries/labs";
import { cn } from "@/lib/utils";

/**
 * Pricing and turnaround, per process and per format.
 *
 * The distinction this table exists to make (PRD A, Decision Ledger #1):
 *
 *   "—"               the lab does not offer this process at all
 *   "Not entered"     it does, and nobody has said what it costs
 *
 * Collapsing those two into one blank cell is what the prototype did, and it
 * is why the ledger entry exists: a reader cannot tell "they don't do E-6"
 * from "we don't know their E-6 price", and a contributor cannot tell which
 * gap is theirs to fill. So every process in the roster gets a row — including
 * the ones this lab does not offer — because "not offered" is information too,
 * and a row that is simply missing states nothing.
 *
 * Turnaround sits inside each cell rather than in a column of its own. The
 * wireframe gives it one column per process, which assumed a single turnaround
 * per process; the schema stores it per (process, format), and a 135 that comes
 * back next day while 120 goes out to a partner lab for a week is exactly the
 * case that shape exists for. Rendering one number for both would be inventing
 * data — the same failure the ledger entry was written about.
 */

const FORMATS = ["135", "120"] as const;

function formatTurnaround(
  min: number | null,
  max: number | null,
): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) {
    return min === max
      ? `${min} day${min === 1 ? "" : "s"}`
      : `${min}–${max} days`;
  }
  const single = (min ?? max)!;
  return min !== null
    ? `from ${single} day${single === 1 ? "" : "s"}`
    : `up to ${single} day${single === 1 ? "" : "s"}`;
}

export function PricingMatrix({
  processes,
  pricing,
}: Pick<LabDetail, "processes" | "pricing">) {
  const offered = new Set<ChemProcess>(processes);

  // Keyed lookup rather than a find() per cell: eight cells, four processes,
  // and the table reads better when the cell knows nothing about the list.
  const cells = new Map(
    pricing.map((cell) => [`${cell.process}:${cell.format}`, cell]),
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] border-collapse text-sm">
        <caption className="sr-only">
          Price and turnaround by chemical process and film format
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="border-b border-foreground pr-3 pb-2 text-left font-sans text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase"
            >
              Process
            </th>
            {FORMATS.map((format) => (
              <th
                key={format}
                scope="col"
                className="border-b border-foreground px-3 pb-2 text-left font-sans text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase"
              >
                {format}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CHEM_PROCESSES.map((process) => {
            const isOffered = offered.has(process);

            return (
              <tr
                key={process}
                className={cn(!isOffered && "text-muted-foreground")}
              >
                <th
                  scope="row"
                  className="border-b border-border py-3 pr-3 text-left font-sans text-xs font-normal"
                >
                  {/* The process code stays Latin in both languages — it is a
                      standard, like a film format, not a translatable word. */}
                  {PROCESS_LABELS[process]}
                </th>

                {isOffered ? (
                  FORMATS.map((format) => {
                    const cell = cells.get(`${process}:${format}`);
                    const turnaround = cell
                      ? formatTurnaround(
                          cell.turnaroundMinD,
                          cell.turnaroundMaxD,
                        )
                      : null;

                    return (
                      <td
                        key={format}
                        className="border-b border-border px-3 py-3 align-top"
                      >
                        {cell?.priceThb != null ? (
                          <span className="tabular-nums">
                            ฿{cell.priceThb.toLocaleString("en-US")}
                          </span>
                        ) : (
                          <span className="font-sans text-xs text-muted-foreground">
                            Not entered
                          </span>
                        )}
                        {turnaround ? (
                          <span className="mt-0.5 block font-sans text-[11px] text-muted-foreground">
                            {turnaround}
                          </span>
                        ) : null}
                      </td>
                    );
                  })
                ) : (
                  <td
                    colSpan={FORMATS.length}
                    className="border-b border-border px-3 py-3 font-sans text-xs"
                  >
                    {/* An em dash, spelt out for a screen reader, which would
                        otherwise read the glyph as silence. */}
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">Not offered</span>
                    <span className="ml-2">Not offered here</span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-3 font-sans text-[11px] text-muted-foreground">
        Prices are entered by contributors, not by the labs, and are a guide
        rather than a quote.
      </p>
    </div>
  );
}
