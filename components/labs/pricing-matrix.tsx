import { CHEM_PROCESSES, PROCESS_LABELS } from "./search-state";
import { SectionLabel, SectionNote } from "./lab-section";
import type {
  ChemProcess,
  LabDetail,
  LabPricingCell,
} from "@/lib/queries/labs";

/**
 * Pricing and turnaround, laid out as the prototype has it:
 * PROCESS | 135 | 120 | TURNAROUND, right-aligned, one row per process.
 *
 * The distinction the table exists to make (PRD A, Decision Ledger #1):
 *
 *   "—"            the lab does not offer this process at all
 *   "not entered"  it does, and nobody has said what it costs
 *
 * Collapsing those into one blank cell is what the prototype's own predecessor
 * did, and it is why the ledger entry was written: a reader cannot tell "they
 * don't do E-6" from "we don't know their E-6 price", and a contributor cannot
 * tell which gap is theirs to fill. So every process keeps a row.
 *
 * THE TURNAROUND COLUMN
 *
 * This is the one place the prototype's layout and the schema disagree. A single
 * TURNAROUND column per row assumes one turnaround per process; the schema
 * stores it per (process, format), which is the shape that exists because a 135
 * can come back next day while 120 goes out to a partner lab for a week.
 *
 * Resolved by rendering what is true rather than by picking a side: when the
 * formats agree — the ordinary case, and the only case in the real seed — the
 * column shows one value, exactly as the prototype draws it. When they genuinely
 * differ it shows both, labelled by format, stacked in the same narrow column.
 * Flattening them to a single span would say a 135 might take a week.
 */

const FORMATS = ["135", "120"] as const;
type Format = (typeof FORMATS)[number];

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

/** The turnaround column for one process: one line, or one line per format. */
function turnaroundLines(
  cells: Map<Format, LabPricingCell>,
): { format: Format | null; text: string }[] {
  const byFormat = FORMATS.map((format) => {
    const cell = cells.get(format);
    return {
      format,
      text: cell
        ? formatTurnaround(cell.turnaroundMinD, cell.turnaroundMaxD)
        : null,
    };
  }).filter(
    (entry): entry is { format: Format; text: string } => entry.text !== null,
  );

  if (byFormat.length === 0) return [];

  const distinct = new Set(byFormat.map((entry) => entry.text));
  return distinct.size === 1
    ? [{ format: null, text: byFormat[0].text }]
    : byFormat;
}

export function PricingMatrix({
  processes,
  pricing,
}: Pick<LabDetail, "processes" | "pricing">) {
  const offered = new Set<ChemProcess>(processes);

  const cells = new Map<string, LabPricingCell>(
    pricing.map((cell) => [`${cell.process}:${cell.format}`, cell]),
  );

  return (
    <section>
      <SectionLabel>Pricing per process</SectionLabel>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] border-collapse">
          <caption className="sr-only">
            Price and turnaround by chemical process and film format
          </caption>
          <thead>
            <tr className="border-b-[1.5px] border-foreground font-sans text-[9px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
              <th scope="col" className="pb-1.5 text-left font-bold">
                Process
              </th>
              {FORMATS.map((format) => (
                <th
                  key={format}
                  scope="col"
                  className="w-16 pb-1.5 text-right font-bold"
                >
                  {format}
                </th>
              ))}
              <th scope="col" className="w-24 pb-1.5 text-right font-bold">
                Turnaround
              </th>
            </tr>
          </thead>
          <tbody>
            {CHEM_PROCESSES.map((process) => {
              const isOffered = offered.has(process);
              const processCells = new Map<Format, LabPricingCell>();
              for (const format of FORMATS) {
                const cell = cells.get(`${process}:${format}`);
                if (cell) processCells.set(format, cell);
              }
              const turnaround = turnaroundLines(processCells);

              return (
                <tr
                  key={process}
                  className="border-b border-border font-sans text-[13px]"
                >
                  <th
                    scope="row"
                    className="py-2.5 text-left align-baseline font-normal"
                  >
                    {/* The process code stays Latin in both languages — it is a
                        standard, like a film format, not a translatable word. */}
                    {PROCESS_LABELS[process]}
                  </th>

                  {FORMATS.map((format) => {
                    const cell = processCells.get(format);
                    return (
                      <td
                        key={format}
                        className="py-2.5 text-right align-baseline tabular-nums"
                      >
                        {!isOffered ? (
                          <>
                            <span
                              aria-hidden="true"
                              className="text-muted-foreground"
                            >
                              —
                            </span>
                            <span className="sr-only">Not offered</span>
                          </>
                        ) : cell?.priceThb != null ? (
                          `฿${cell.priceThb.toLocaleString("en-US")}`
                        ) : (
                          <span className="text-[11px] text-muted-foreground italic">
                            not entered
                          </span>
                        )}
                      </td>
                    );
                  })}

                  <td className="py-2.5 text-right align-baseline text-muted-foreground">
                    {!isOffered ? (
                      <span aria-hidden="true">—</span>
                    ) : turnaround.length === 0 ? (
                      <span className="text-[11px] italic">not entered</span>
                    ) : (
                      turnaround.map((line) => (
                        <span
                          key={line.format ?? "all"}
                          className="block text-xs"
                        >
                          {line.format ? (
                            <span className="text-[10px] opacity-70">
                              {line.format}{" "}
                            </span>
                          ) : null}
                          {line.text}
                        </span>
                      ))
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SectionNote className="mt-2">
        &ldquo;—&rdquo; = not offered · price is community-entered, not live
      </SectionNote>
    </section>
  );
}
