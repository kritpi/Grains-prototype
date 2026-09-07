"use client";

import { useState } from "react";

import {
  DAY_LABELS_SHORT,
  bangkokNow,
  formatDayHours,
  isClosedAllWeek,
} from "@/lib/labs/hours";
import type { LabHours } from "@/lib/queries/labs";
import { cn } from "@/lib/utils";

import { NotEntered, SectionLabel } from "./lab-section";

/**
 * The weekly schedule, with today marked and a collapse control.
 *
 * The prototype orders the week Monday-first, which is how a person reads a
 * shop's hours; the array is stored Sunday-first because that is what
 * `extract(dow)` returns and what the SQL indexes into. The rotation happens
 * here, once, rather than being pushed into the column.
 *
 * "Today" is Bangkok's today, not the reader's: someone checking Thai opening
 * hours from another time zone wants the lab's Tuesday. The page is
 * `force-dynamic`, so the server computes it per request — but the toggle needs
 * state, so this is a client component and the day index is passed in rather
 * than recomputed here, where it would be the browser's clock.
 */
export function LabHoursTable({
  hours,
  todayDow,
  overridden = false,
}: {
  hours: LabHours | null;
  /** 0 = Sunday, computed on the server in Asia/Bangkok. */
  todayDow?: number;
  overridden?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  // Falls back to the browser's reading of Bangkok time only if the server did
  // not supply one, which keeps the component usable on its own.
  const today = todayDow ?? bangkokNow().dow;

  return (
    <section>
      <SectionLabel
        aside={
          hours === null ? undefined : (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              className="font-sans text-[10px] underline underline-offset-2 hover:no-underline"
              aria-expanded={expanded}
            >
              {expanded ? "collapse" : "expand"}
            </button>
          )
        }
      >
        Hours
      </SectionLabel>

      {hours === null ? (
        <NotEntered>
          No opening hours yet — this is what &ldquo;open now&rdquo; is computed
          from, so a lab without them never shows as open.
        </NotEntered>
      ) : expanded ? (
        <div className={cn(overridden && "opacity-55")}>
          <dl className="font-sans text-xs">
            {/* Monday first: rotate the Sunday-first array rather than storing
                it differently, so the SQL and the page keep one index. */}
            {[1, 2, 3, 4, 5, 6, 0].map((index) => {
              const day = hours[index];
              const isToday = index === today;

              return (
                <div
                  key={index}
                  className={cn(
                    "flex items-baseline justify-between gap-4 border-b border-border py-1",
                    isToday && "font-bold",
                  )}
                >
                  <dt className={cn(!isToday && "text-muted-foreground")}>
                    {DAY_LABELS_SHORT[index]}
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
            <p className="mt-2 font-sans text-[10px] leading-relaxed text-muted-foreground">
              Every day is marked closed. That is a schedule somebody entered,
              not a missing one.
            </p>
          ) : null}

          <p className="mt-2 border border-dashed border-ring px-2.5 py-2 font-sans text-[10px] leading-relaxed text-muted-foreground">
            Open/closed is computed from this schedule. A manual override wins
            over it when set.
          </p>
        </div>
      ) : null}
    </section>
  );
}
