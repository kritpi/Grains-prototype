import { describe, expect, it } from "vitest";

import {
  formatChangePath,
  formatChangeValue,
  formatEditAge,
} from "@/components/labs/edit-log-format";

/**
 * Reading Track B's leaf paths without depending on Track B.
 *
 * The grammar in `lib/labs/paths.ts` does not exist yet, and when it does it
 * will keep growing. The property worth protecting is therefore not "every path
 * renders beautifully" but "no path renders as nothing": history recorded today
 * has to stay readable after a field is added next month, so the unrecognised
 * cases below matter more than the recognised ones.
 */

describe("formatChangePath", () => {
  it("labels a plain top-level field", () => {
    expect(formatChangePath("name_en")).toBe("Name (EN)");
    expect(formatChangePath("landmark_note")).toBe("Landmark note");
  });

  it("names the weekday behind an hours index", () => {
    // hours.3.open — "3" is Wednesday, and printing the digit helps nobody.
    expect(formatChangePath("hours.3.open")).toBe("Hours · Wednesday · Open");
    expect(formatChangePath("hours.0.closed")).toBe("Hours · Sunday · Closed");
  });

  it("writes process keys the way the rest of the product does", () => {
    expect(formatChangePath("pricing.c41.135.price_thb")).toBe(
      "Pricing · C-41 · 135 · Price",
    );
    expect(formatChangePath("processes.e6")).toBe("Process · E-6");
  });

  it("drops units the column carries and the reader does not need", () => {
    expect(formatChangePath("pricing.bw.120.turnaround_min_d")).toBe(
      "Pricing · B&W · 120 · Turnaround, from",
    );
  });

  it("hides opaque identifiers", () => {
    // A contact's uuid tells a reader nothing; "Contact · Value" is all of it
    // they can use.
    expect(
      formatChangePath("contacts.3f1a9c2e-1b7d-4c8a-9f2e-5d6c7b8a9e01.value"),
    ).toBe("Contact · Value");
  });

  it("keeps a non-uuid key, which is a name rather than an id", () => {
    expect(formatChangePath("scanners.Noritsu")).toBe("Scanner · Noritsu");
    expect(formatChangePath("services.dropbox.note")).toBe(
      "Service · Dropbox · Note",
    );
  });

  it("renders a path it has never seen rather than dropping it", () => {
    // The whole point: an entry written by a future version of the grammar is
    // still shown, imperfectly but truthfully.
    expect(formatChangePath("future_field.deeply.nested")).toBe(
      "Future field · Deeply · Nested",
    );
    expect(formatChangePath("")).toBe("");
  });
});

describe("formatChangeValue", () => {
  it("says 'not set' for every way of having no value", () => {
    // An em dash would read as a value in a column of prices; "" reads as a bug.
    expect(formatChangeValue(null)).toBe("not set");
    expect(formatChangeValue(undefined)).toBe("not set");
    expect(formatChangeValue("")).toBe("not set");
  });

  it("writes booleans as words", () => {
    expect(formatChangeValue(true)).toBe("yes");
    expect(formatChangeValue(false)).toBe("no");
  });

  it("keeps zero, which is a value", () => {
    expect(formatChangeValue(0)).toBe("0");
  });

  it("joins arrays and names an empty one", () => {
    expect(formatChangeValue(["135", "120"])).toBe("135, 120");
    expect(formatChangeValue([])).toBe("none");
  });

  it("falls back to JSON for a structure", () => {
    expect(formatChangeValue({ open: "10:00" })).toBe('{"open":"10:00"}');
  });
});

describe("formatEditAge", () => {
  const now = new Date("2026-09-07T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it("counts up through the units", () => {
    expect(formatEditAge(ago(30_000), now)).toBe("just now");
    expect(formatEditAge(ago(5 * MINUTE), now)).toBe("5 minutes ago");
    expect(formatEditAge(ago(3 * HOUR), now)).toBe("3 hours ago");
    expect(formatEditAge(ago(3 * DAY), now)).toBe("3 days ago");
  });

  it("singularises one of anything", () => {
    expect(formatEditAge(ago(MINUTE), now)).toBe("1 minute ago");
    expect(formatEditAge(ago(DAY), now)).toBe("1 day ago");
  });

  it("switches to a date once the arithmetic stops being useful", () => {
    // "47 days ago" is homework; a date is not.
    expect(formatEditAge(ago(40 * DAY), now)).toBe("29 Jul 2026");
  });

  it("returns nothing for an unparseable timestamp", () => {
    expect(formatEditAge("not a date", now)).toBe("");
  });
});
