import type { LabDayHours, LabHours } from "@/lib/queries/labs";

/**
 * Reading the weekly schedule — the display side of "open now".
 *
 * Whether a lab is open is answered in SQL (`OPEN_NOW` in lib/queries/labs.ts)
 * and never recomputed here: that answer is a filter as well as a label, and
 * two implementations would eventually disagree in the one place it matters.
 * What this file adds is what SQL is not asked for — the day names, the
 * "closes 19:00" tail on an open lab and the "opens Tue 10:00" on a shut one —
 * all derived from the same schedule, in the same time zone, using the same
 * midnight-crossing rule.
 *
 * The import above is type-only, so this module stays free of the query layer
 * at runtime and can be used by client components.
 */

/** Fixed, and not the viewer's: every lab in scope is in Thailand. */
export const BANGKOK_TIME_ZONE = "Asia/Bangkok";

/** Index 0 = Sunday, matching `extract(dow)` and the stored array. */
export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const DAY_LABELS_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

// Typed as plain strings: the lookup key is whatever Intl hands back, not one
// of our literals, and inferring the narrow union here would reject it.
const SHORT_TO_INDEX = new Map<string, number>(
  DAY_LABELS_SHORT.map((day, index) => [day, index]),
);

export type BangkokMoment = {
  /** 0 = Sunday. */
  dow: number;
  /** Minutes since midnight, Bangkok wall clock. */
  minutes: number;
};

/**
 * The Bangkok wall clock, read from the host's clock in Bangkok's zone.
 *
 * `hourCycle: "h23"` rather than `hour12: false`, which renders midnight as
 * "24" under some ICU builds and would put every after-midnight moment a full
 * day out.
 */
export function bangkokNow(at: Date = new Date()): BangkokMoment {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BANGKOK_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);

  const find = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return {
    dow: SHORT_TO_INDEX.get(find("weekday")) ?? 0,
    minutes: Number(find("hour")) * 60 + Number(find("minute")),
  };
}

/** `"09:30"` → 570. */
export function toMinutes(clock: string): number {
  const [hour, minute] = clock.split(":");
  return Number(hour) * 60 + Number(minute);
}

/**
 * Is this day's window open at this minute?
 *
 * A close time at or before the open time means the shift runs past midnight,
 * so the window is a union rather than a range — the same rule the SQL applies,
 * and the same one-entry-per-day reading: a lab whose Friday runs to 02:00 is
 * "open" at 01:00 on Friday, because Friday's own entry is the only one
 * consulted.
 */
export function isOpenAt(day: LabDayHours, minutes: number): boolean {
  if (day.closed) return false;

  const open = toMinutes(day.open);
  const close = toMinutes(day.close);

  return close <= open
    ? minutes >= open || minutes < close
    : minutes >= open && minutes < close;
}

/** The closing time of the window currently open, if one is. */
export function closingTime(
  hours: LabHours,
  now: BangkokMoment = bangkokNow(),
): string | null {
  const today = hours[now.dow];
  if (!today || today.closed) return null;
  return isOpenAt(today, now.minutes) ? today.close : null;
}

export type NextOpening = {
  /** "today", "tomorrow", or a weekday name. */
  dayLabel: string;
  time: string;
};

/**
 * When the doors open next, looked forward over one week.
 *
 * Returns null when no day has hours at all, which is the honest answer for a
 * lab whose schedule is empty — "opens never" would be a claim nobody made.
 */
export function nextOpening(
  hours: LabHours,
  now: BangkokMoment = bangkokNow(),
): NextOpening | null {
  for (let ahead = 0; ahead < 7; ahead++) {
    const index = (now.dow + ahead) % 7;
    const day = hours[index];
    if (!day || day.closed) continue;

    // Today only counts if the opening is still ahead of us; a window that has
    // already closed is yesterday's news, and one that is open right now is not
    // a "next" opening at all.
    if (ahead === 0 && toMinutes(day.open) <= now.minutes) continue;

    return {
      dayLabel:
        ahead === 0 ? "today" : ahead === 1 ? "tomorrow" : DAY_LABELS[index],
      time: day.open,
    };
  }

  return null;
}

/** One row of the hours table: "10:00 – 19:00", or "Closed". */
export function formatDayHours(day: LabDayHours): string {
  return day.closed ? "Closed" : `${day.open} – ${day.close}`;
}

/** True when every day of the week is marked closed. */
export function isClosedAllWeek(hours: LabHours): boolean {
  return hours.every((day) => day.closed);
}
