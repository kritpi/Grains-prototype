"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";

import { toggleLabBadge } from "@/app/labs/[id]/actions";
import type { LabBadge } from "@/lib/queries/labs";

import { SectionLabel, SectionNote } from "./lab-section";

/**
 * Community badges — a row of chips you can press to endorse.
 *
 * Four properties of the roster are load-bearing, all from PRD C #1:
 *
 *   The roster is fixed and product-defined. Nobody proposes a new badge name,
 *   so there is no freeform namespace and nothing to moderate.
 *
 *   It is identical on every lab, so a badge with no endorsements keeps its slot
 *   rather than disappearing. The prototype says why on the page itself, and the
 *   sentence is worth keeping: it reads as an invitation, not an absence.
 *
 *   The count is the live number of active endorsements, never a historical
 *   total, so it falls when people retract. A badge can go back to zero.
 *
 *   Each vote is one binary (you, this lab, this badge). That is why this is a
 *   toggle rather than an up/down pair or a counter you can press repeatedly.
 *
 * The endorsed state is filled ink, straight from the prototype's
 * `[data-endorsed="true"]`. It has to be visible on the chip itself because it
 * is the only way to answer "did I already do this" — the count cannot tell you,
 * since it moves for everyone.
 *
 * Optimistic rather than awaiting the round trip. These are chips people press
 * two or three of in a row, the page is `force-dynamic` so a revalidate
 * re-renders all of it, and a toggle that lags feels broken in a way that a
 * toggle which occasionally corrects itself does not. `useOptimistic` discards
 * the local guess when the server's answer arrives, so a rejected vote snaps
 * back rather than lying.
 */

type OptimisticToggle = { key: string };

export function LabBadges({
  badges,
  labId,
  signedIn,
}: {
  badges: LabBadge[];
  labId: string;
  signedIn: boolean;
}) {
  const [pending, startTransition] = useTransition();
  /** What went wrong, and the same sentence for a screen reader. */
  const [problem, setProblem] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const [shown, applyToggle] = useOptimistic(
    badges,
    (current: LabBadge[], { key }: OptimisticToggle) =>
      current.map((badge) =>
        badge.key === key
          ? {
              ...badge,
              endorsedByViewer: !badge.endorsedByViewer,
              // The count moves with the vote, so the chip stays internally
              // consistent while the request is in flight.
              count: badge.count + (badge.endorsedByViewer ? -1 : 1),
            }
          : badge,
      ),
  );

  const total = shown.reduce((sum, badge) => sum + badge.count, 0);

  return (
    <section>
      <SectionLabel>
        Community badges{signedIn ? " · tap to endorse" : ""}
      </SectionLabel>

      <ul className="flex flex-wrap gap-2.5">
        {shown.map((badge) => {
          const content = (
            <>
              <i aria-hidden="true" />
              <span>{badge.labelEn}</span>
              <span className="text-[11px] tabular-nums opacity-70">
                {badge.count}
              </span>
            </>
          );

          return (
            <li key={badge.key}>
              {signedIn ? (
                <button
                  type="button"
                  className="grains-badge"
                  data-zero={badge.count === 0}
                  data-endorsed={badge.endorsedByViewer}
                  // The pressed state is the whole point of the control, and a
                  // screen reader gets it from here rather than from the fill.
                  aria-pressed={badge.endorsedByViewer}
                  // A vote in flight is not a chip to press again: the
                  // optimistic count would move twice for one round trip.
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setProblem(null);
                      applyToggle({ key: badge.key });
                      const result = await toggleLabBadge(labId, badge.key);

                      // `useOptimistic` drops the local guess when the
                      // transition ends, so a failed vote reverts on its own.
                      // What it cannot do is say why — and a chip that springs
                      // back in silence is indistinguishable from a mis-click,
                      // which is what this branch is for.
                      if (!result.ok) {
                        setProblem(result.message);
                        setAnnouncement(result.message);
                        return;
                      }
                      setAnnouncement(
                        `${badge.labelEn} ${result.endorsed ? "endorsed" : "endorsement withdrawn"}.`,
                      );
                    })
                  }
                >
                  {content}
                </button>
              ) : (
                <Link
                  href={`/sign-in?next=${encodeURIComponent(`/labs/${labId}`)}`}
                  className="grains-badge"
                  data-zero={badge.count === 0}
                  data-endorsed={false}
                  title="Sign in to endorse"
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {/* Polite and atomic: this confirms an action the reader just took, so
          it must not interrupt, and it reads as one sentence rather than as a
          diff of the previous one. */}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </p>

      {problem && (
        <p
          role="alert"
          className="mt-2.5 border-[1.5px] border-destructive px-2.5 py-2 font-sans text-xs text-destructive"
        >
          {problem}
        </p>
      )}

      <SectionNote className="mt-2.5">
        {total === 0
          ? "No endorsements yet. Every badge keeps its slot — it reads as an invitation, not an absence."
          : "A badge with no endorsements keeps its slot — it reads as an invitation, not an absence."}
      </SectionNote>
    </section>
  );
}
