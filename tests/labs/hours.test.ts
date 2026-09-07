import { describe, expect, it } from "vitest";

import {
  bangkokNow,
  closingTime,
  isClosedAllWeek,
  isOpenAt,
  nextOpening,
  toMinutes,
} from "@/lib/labs/hours";
import type { LabHours } from "@/lib/queries/labs";

/**
 * The display side of the weekly schedule.
 *
 * `openNow` itself is answered in SQL and is tested against a real database in
 * labs.test.ts. What is checked here is the part SQL is not asked for — the
 * closing time, the next opening, and the midnight-crossing rule these share
 * with the SQL. The two implementations of that rule are the reason it is
 * tested twice: they must agree, or a lab reads "Open now · opens tomorrow".
 */

const day = (open: string, close: string) =>
  ({ closed: false, open, close }) as const;
const shut = { closed: true } as const;

/** Sunday-first, so index 0 is Sunday exactly as `extract(dow)` returns it. */
const WEEK: LabHours = [
  shut,
  day("10:00", "19:00"),
  day("10:00", "19:00"),
  day("10:00", "19:00"),
  day("10:00", "19:00"),
  day("10:00", "19:00"),
  day("11:00", "18:00"),
];

describe("toMinutes", () => {
  it("counts from midnight", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("23:59")).toBe(1439);
  });
});

describe("isOpenAt", () => {
  it("is a half-open range: the opening minute counts, the closing one does not", () => {
    const monday = WEEK[1];
    expect(isOpenAt(monday, toMinutes("09:59"))).toBe(false);
    expect(isOpenAt(monday, toMinutes("10:00"))).toBe(true);
    expect(isOpenAt(monday, toMinutes("18:59"))).toBe(true);
    // Closing time excluded: a lab that shuts at 19:00 is not open at 19:00.
    expect(isOpenAt(monday, toMinutes("19:00"))).toBe(false);
  });

  it("never reports a closed day as open", () => {
    expect(isOpenAt(shut, toMinutes("12:00"))).toBe(false);
  });

  describe("a shift that crosses midnight", () => {
    // Close at or before open means the window is a union, not a range — the
    // same rule the OPEN_NOW expression applies in SQL.
    const nightShift = day("20:00", "02:00");

    it("is open on both sides of midnight", () => {
      expect(isOpenAt(nightShift, toMinutes("21:00"))).toBe(true);
      expect(isOpenAt(nightShift, toMinutes("01:00"))).toBe(true);
    });

    it("is shut in the gap between them", () => {
      expect(isOpenAt(nightShift, toMinutes("03:00"))).toBe(false);
      expect(isOpenAt(nightShift, toMinutes("19:00"))).toBe(false);
    });
  });

  it("treats an equal open and close as open around the clock", () => {
    // close <= open, so the union covers everything: "00:00–00:00" is 24 hours,
    // which is what a lab entering the same time twice means.
    expect(isOpenAt(day("00:00", "00:00"), toMinutes("13:00"))).toBe(true);
  });
});

describe("closingTime", () => {
  it("gives the closing time while the doors are open", () => {
    expect(closingTime(WEEK, { dow: 1, minutes: toMinutes("12:00") })).toBe(
      "19:00",
    );
  });

  it("gives nothing when the lab is shut, so no tail is printed", () => {
    expect(
      closingTime(WEEK, { dow: 1, minutes: toMinutes("20:00") }),
    ).toBeNull();
    expect(
      closingTime(WEEK, { dow: 0, minutes: toMinutes("12:00") }),
    ).toBeNull();
  });
});

describe("nextOpening", () => {
  it("finds later the same day", () => {
    expect(nextOpening(WEEK, { dow: 1, minutes: toMinutes("08:00") })).toEqual({
      dayLabel: "today",
      time: "10:00",
    });
  });

  it("says tomorrow once today's opening has passed", () => {
    expect(nextOpening(WEEK, { dow: 1, minutes: toMinutes("20:00") })).toEqual({
      dayLabel: "tomorrow",
      time: "10:00",
    });
  });

  it("names the weekday when it is further off", () => {
    // Sunday is closed, so from Saturday evening the next opening is Monday.
    expect(nextOpening(WEEK, { dow: 6, minutes: toMinutes("19:00") })).toEqual({
      dayLabel: "Monday",
      time: "10:00",
    });
  });

  it("skips closed days rather than reporting them", () => {
    expect(nextOpening(WEEK, { dow: 0, minutes: toMinutes("09:00") })).toEqual({
      dayLabel: "tomorrow",
      time: "10:00",
    });
  });

  it("returns nothing when every day is closed", () => {
    // "Opens never" is not a claim anybody made, so the tail is simply absent.
    const never: LabHours = Array.from({ length: 7 }, () => shut);
    expect(nextOpening(never, { dow: 3, minutes: 600 })).toBeNull();
  });
});

describe("isClosedAllWeek", () => {
  it("distinguishes a shut week from an ordinary one", () => {
    expect(isClosedAllWeek(WEEK)).toBe(false);
    expect(isClosedAllWeek(Array.from({ length: 7 }, () => shut))).toBe(true);
  });
});

describe("bangkokNow", () => {
  it("reads the Bangkok wall clock, not the host's", () => {
    // 2026-09-07T18:30:00Z is 01:30 on Tuesday the 8th in Bangkok (UTC+7):
    // a moment that is a different day in the two zones, which is exactly the
    // case a naive `new Date().getDay()` gets wrong.
    const at = new Date("2026-09-07T18:30:00Z");
    expect(bangkokNow(at)).toEqual({ dow: 2, minutes: toMinutes("01:30") });
  });

  it("reports midnight as 0, not 24", () => {
    // hourCycle h23 rather than hour12:false — some ICU builds render midnight
    // as "24" under the latter, putting the reading a full day out.
    const at = new Date("2026-09-07T17:00:00Z"); // 00:00 Tuesday in Bangkok
    expect(bangkokNow(at).minutes).toBe(0);
    expect(bangkokNow(at).dow).toBe(2);
  });
});
