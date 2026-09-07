import type { LabBadge } from "@/lib/queries/labs";
import { cn } from "@/lib/utils";

/**
 * Community badges — read-only here, endorsable in Phase 3.
 *
 * Three properties of the roster are load-bearing and all come from PRD C #1:
 * it is fixed and product-defined, so nobody can propose a new badge name and
 * there is no freeform namespace to moderate; it is identical on every lab, so
 * a badge with no endorsements stays listed rather than disappearing; and the
 * count is the live number of endorsements, never a historical total, so it can
 * fall as well as rise when people retract.
 *
 * The bar is relative within this lab only. There is no cross-lab score, and
 * the widths here must never be read as one — which is why the count is printed
 * next to it rather than left to the bar to imply.
 *
 * `toggleLabBadge` is Phase 3 (build plan 3.2). Until it exists these are
 * static rows and not disabled buttons: a control that cannot do anything is
 * worse than no control, and the endorsement affordance arrives with the action
 * behind it.
 */
export function LabBadges({ badges }: { badges: LabBadge[] }) {
  const total = badges.reduce((sum, badge) => sum + badge.count, 0);
  const strongest = Math.max(...badges.map((badge) => badge.count), 0);

  if (total === 0) {
    return (
      <p className="border border-dashed border-border px-3 py-2 font-sans text-xs text-muted-foreground">
        No endorsements yet. Once sign-in reaches this page, any signed-in
        visitor can say what this lab is good at.
      </p>
    );
  }

  return (
    <ul className="font-sans text-sm">
      {badges.map((badge) => {
        const empty = badge.count === 0;

        return (
          <li
            key={badge.key}
            className={cn(
              "flex items-baseline gap-3 border-b py-2",
              // Dashed and greyed at zero, so the roster reads as comparable
              // across labs without a zero looking like content.
              empty
                ? "border-dashed border-border text-muted-foreground"
                : "border-border",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{badge.labelEn}</span>

            <span
              aria-hidden="true"
              className="hidden h-px w-24 shrink-0 bg-border sm:block"
            >
              <span
                className="block h-px bg-foreground"
                style={{
                  width:
                    strongest > 0
                      ? `${(badge.count / strongest) * 100}%`
                      : "0%",
                }}
              />
            </span>

            <span className="shrink-0 tabular-nums">{badge.count}</span>
          </li>
        );
      })}
    </ul>
  );
}
