import {
  DAY_LABELS,
  bangkokNow,
  formatDayHours,
  isClosedAllWeek,
} from "@/lib/labs/hours";
import type { LabHours } from "@/lib/queries/labs";
import { cn } from "@/lib/utils";

import { NotEntered } from "./lab-section";

/**
 * The weekly schedule, with today marked.
 *
 * Rendered on the server, from the Bangkok clock rather than the reader's:
 * "today" on this page means today at the lab, and someone checking Thai
 * opening hours from another time zone wants the lab's Tuesday, not theirs.
 * The page is `force-dynamic`, so this is computed per request and never
 * cached into staleness.
 *
 * Greyed as a whole when a manual override is in force — the override outranks
 * the schedule but does not replace it, and a contributor needs to see what is
 * being overridden in order to judge whether the override is still right.
 */
export function LabHoursTable({
  hours,
  overridden = false,
}: {
  hours: LabHours | null;
  overridden?: boolean;
}) {
  if (hours === null) {
    return (
      <NotEntered>
        No opening hours yet — this is what &ldquo;open now&rdquo; is computed
        from, so a lab without them never shows as open.
      </NotEntered>
    );
  }

  const today = bangkokNow().dow;

  return (
    <div className={cn(overridden && "opacity-55")}>
      <dl className="font-sans text-sm">
        {DAY_LABELS.map((label, index) => {
          const day = hours[index];
          const isToday = index === today;

          return (
            <div
              key={label}
              className={cn(
                "flex items-baseline justify-between gap-4 border-b border-border py-1.5",
                isToday && "font-semibold",
              )}
            >
              <dt className={cn(!isToday && "text-muted-foreground")}>
                {label}
                {isToday ? <span className="sr-only"> (today)</span> : null}
              </dt>
              <dd
                className={cn(
                  "tabular-nums",
                  day?.closed && !isToday && "text-muted-foreground",
                )}
              >
                {day ? formatDayHours(day) : "Closed"}
              </dd>
            </div>
          );
        })}
      </dl>

      {isClosedAllWeek(hours) ? (
        <p className="mt-3 font-sans text-[11px] text-muted-foreground">
          Every day is marked closed. That is a schedule somebody entered, not a
          missing one — if it looks wrong, the edit form is the place to say so.
        </p>
      ) : null}

      {overridden ? (
        <p className="mt-3 font-sans text-[11px] text-muted-foreground">
          A manual status override is in force and outranks this schedule.
        </p>
      ) : null}
    </div>
  );
}
