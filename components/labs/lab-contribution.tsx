import Link from "next/link";

import type { LabDetail } from "@/lib/queries/labs";

import { EditHistoryLink } from "./edit-history-link";
import { formatEditAge } from "./edit-log-format";
import { SectionLabel } from "./lab-section";

/**
 * Who last touched this lab, and the two ways to touch it yourself.
 *
 * Sits beside Services in the prototype rather than in the rail, which reads
 * better than it sounds: the left column is what the lab *is*, and the last line
 * of it is who said so. Attribution is not metadata here — every contribution is
 * attributed forever (PRD A), and this is where that promise is visible.
 *
 * "Edit history" is an anchor to the log further down rather than a link to a
 * separate page. The prototype routes to its own history screen; A5 specifies the
 * log below the fold on this page, fetched lazily, and jumping to it keeps both
 * — the count is still the affordance, it just does not cost a navigation.
 *
 * "Mark as closed" is `setLabStatus`, which is Track B's action and does not
 * exist. It points at the edit route rather than being a dead button: that is
 * where the status lives once the form is built, and a link that lands somewhere
 * sensible beats a control that does nothing.
 */
export function LabContribution({
  labId,
  editCount,
  lastEditedAt,
  lastEditorUsername,
  status,
}: Pick<
  LabDetail,
  "editCount" | "lastEditedAt" | "lastEditorUsername" | "status"
> & { labId: string }) {
  return (
    <div className="min-w-0 flex-1 basis-52">
      <SectionLabel>Contribution</SectionLabel>

      <p className="font-sans text-xs leading-[1.8] text-muted-foreground">
        {lastEditedAt ? (
          <>
            Last edited{" "}
            {lastEditorUsername ? (
              <span className="text-foreground">@{lastEditorUsername}</span>
            ) : (
              "by a contributor"
            )}{" "}
            · {formatEditAge(lastEditedAt)}
          </>
        ) : (
          "No edits recorded yet."
        )}
      </p>

      <div className="mt-2 flex flex-col items-start gap-1.5">
        <EditHistoryLink count={editCount} />
        <Link
          href={`/labs/${labId}/edit`}
          className="font-sans text-xs underline underline-offset-2 hover:no-underline"
        >
          {status === "permanently_closed" ? "Reopen" : "Mark as closed"}
        </Link>
      </div>
    </div>
  );
}

/**
 * The one action the page is asking for, sized accordingly.
 *
 * Signal red and filled, alone above a hairline at the foot of the column. Every
 * other control on this page is an outline; this is the only thing the product
 * actively wants from a reader, and the prototype gives it the only saturated
 * colour on the screen.
 */
export function SuggestEditButton({ labId }: { labId: string }) {
  return (
    <div className="border-t border-border pt-4">
      <Link
        href={`/labs/${labId}/edit`}
        className="inline-block border-[1.5px] border-destructive bg-destructive px-4 py-2.5 font-sans text-sm font-bold text-background hover:bg-transparent hover:text-destructive"
      >
        Suggest an edit
      </Link>
      <p className="mt-2 font-sans text-[11px] text-muted-foreground">
        Anything above can be corrected by anyone signed in, and edits go live
        immediately.
      </p>
    </div>
  );
}
