import { describe, expect, it } from "vitest";

import { diffFilmStock, filmChangesSchema } from "@/lib/films/paths";

/** Every diff the form produces has to be one the grammar accepts. */
function accepted(changes: ReturnType<typeof diffFilmStock>) {
  const result = filmChangesSchema.safeParse(changes);
  expect(result.error?.issues.map((i) => i.message).join(" · ") ?? "ok").toBe(
    "ok",
  );
  return changes;
}

const portra = {
  name: "Kodak Portra 400",
  iso: 400,
  formats: ["135", "120"] as const,
};

describe("diffFilmStock", () => {
  it("reports nothing when nothing changed", () => {
    expect(
      diffFilmStock(
        { ...portra, formats: [...portra.formats] },
        { ...portra, formats: [...portra.formats] },
      ),
    ).toEqual([]);
  });

  it("ignores how the name was typed", () => {
    expect(
      diffFilmStock(
        { ...portra, formats: [...portra.formats] },
        {
          ...portra,
          name: "  Kodak Portra 400  ",
          formats: [...portra.formats],
        },
      ),
    ).toEqual([]);
  });

  it("names each field it changed", () => {
    const changes = accepted(
      diffFilmStock(
        { ...portra, formats: [...portra.formats] },
        { name: "Kodak Portra 800", iso: 800, formats: ["135"] },
      ),
    );

    expect(changes).toEqual([
      { path: "name", from: "Kodak Portra 400", to: "Kodak Portra 800" },
      { path: "iso", from: 400, to: 800 },
      { path: "formats", from: ["135", "120"], to: ["135"] },
    ]);
  });
});

describe("filmChangesSchema", () => {
  function refuses(changes: { path: string; from: unknown; to: unknown }[]) {
    const result = filmChangesSchema.safeParse(changes);
    expect(result.success).toBe(false);
    return result.error!.issues.map((i) => i.message).join(" · ");
  }

  it("takes the three fields of a stock and nothing else", () => {
    expect(refuses([{ path: "process", from: null, to: "c41" }])).toMatch(
      /not a field of a film stock/,
    );
    // Not a lab. The two grammars share a table, not a vocabulary.
    expect(refuses([{ path: "name_en", from: null, to: "x" }])).toMatch(
      /not a field of a film stock/,
    );
  });

  /**
   * A stock exists in at least one format, or it is not a stock anybody can
   * buy — and an entry with no format is invisible to every format filter.
   */
  it("refuses a stock in no format at all", () => {
    expect(refuses([{ path: "formats", from: ["135"], to: [] }])).toMatch(
      /at least one format/,
    );
  });

  it("refuses an ISO no film was ever sold at", () => {
    expect(refuses([{ path: "iso", from: 400, to: 4000000 }])).toMatch(
      /less than or equal|<=/i,
    );
    expect(refuses([{ path: "iso", from: 400, to: 0 }])).toMatch(
      /greater than or equal|>=/i,
    );
  });

  it("admits null on the from side, which is what creation looks like", () => {
    const result = filmChangesSchema.safeParse([
      { path: "name", from: null, to: "Kodak Gold 200" },
    ]);
    expect(result.success).toBe(true);
  });

  it("refuses an empty save and a repeated field", () => {
    expect(refuses([])).toMatch(/no changes is not a save/);
    expect(
      refuses([
        { path: "iso", from: 400, to: 800 },
        { path: "iso", from: 400, to: 200 },
      ]),
    ).toMatch(/more than once/);
  });
});
