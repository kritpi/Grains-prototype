import { describe, expect, it } from "vitest";

import {
  applyMerge,
  defaultResolution,
  planMerge,
  slotOf,
} from "@/components/lab-form/conflict";
import {
  diffDraft,
  draftFromLab,
  type LabDraft,
} from "@/components/lab-form/draft";
import type { LabDetail } from "@/lib/queries/labs";

/** A lab as `getLab` returns it, with only what a test names filled in. */
function lab(overrides: Partial<LabDetail> = {}): LabDetail {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    nameEn: "Fixture Lab",
    nameTh: null,
    areaEn: null,
    areaTh: null,
    street: null,
    landmarkNote: null,
    lat: 13.7451,
    lng: 100.5324,
    status: "open",
    statusNote: null,
    openNow: true,
    hours: null,
    completeness: 0,
    version: 4,
    createdAt: "",
    updatedAt: "",
    editCount: 1,
    lastEditedAt: null,
    lastEditorUsername: null,
    processes: ["c41"],
    pricing: [],
    scanners: [],
    services: [],
    supplies: [],
    contacts: [],
    stock: [],
    photos: [],
    badges: [],
    ...overrides,
  } as LabDetail;
}

/** The draft a form would hold, with one edit applied. */
function typed(base: LabDetail, change: (draft: LabDraft) => void): LabDraft {
  const draft = draftFromLab(base);
  change(draft);
  return draft;
}

describe("slots", () => {
  it("groups every leaf of a pricing cell into one decision", () => {
    expect(slotOf("pricing.c41.135.price_thb")).toBe(
      slotOf("pricing.c41.135.turnaround_min_d"),
    );
  });

  it("keeps different cells of the same process apart", () => {
    expect(slotOf("pricing.c41.135.price_thb")).not.toBe(
      slotOf("pricing.c41.120.price_thb"),
    );
  });

  it("treats a weekday as one row", () => {
    expect(slotOf("hours.3.open")).toBe(slotOf("hours.3.close"));
    expect(slotOf("hours.3.open")).not.toBe(slotOf("hours.4.open"));
  });

  it("keeps scalars separate from one another", () => {
    expect(slotOf("name_en")).not.toBe(slotOf("street"));
  });

  it("does not throw on a leaf it has never seen", () => {
    expect(slotOf("something_new_from_track_b")).toBe(
      "path:something_new_from_track_b",
    );
  });
});

describe("planning a merge", () => {
  const base = lab();

  it("auto-merges what only they touched", () => {
    const mine = typed(base, (d) => (d.street = "Soi 11"));
    const server = lab({ version: 5, landmarkNote: "above the 7-Eleven" });

    const plan = planMerge(draftFromLab(base), mine, server);

    expect(plan.contested).toHaveLength(0);
    expect(plan.autoSlots).toEqual(["scalar:landmark_note"]);
    expect(plan.autoLabels).toEqual(["Landmark note"]);
    expect(plan.keptSlots).toEqual(["scalar:street"]);
  });

  it("contests a field both sides changed, and names both values", () => {
    const mine = typed(base, (d) => (d.street = "Soi 11"));
    const server = lab({ version: 5, street: "Soi 13" });

    const plan = planMerge(draftFromLab(base), mine, server);

    expect(plan.autoSlots).toHaveLength(0);
    expect(plan.contested).toHaveLength(1);
    const row = plan.contested[0];
    expect(row.label).toBe("Street");
    expect(row.leaves[0].mine).toBe("Soi 11");
    expect(row.leaves[0].theirs).toBe("Soi 13");
    expect(row.leaves[0].base).toBe("not set");
  });

  it("defaults every contested row to theirs", () => {
    const mine = typed(base, (d) => (d.street = "Soi 11"));
    const server = lab({ version: 5, street: "Soi 13" });
    const plan = planMerge(draftFromLab(base), mine, server);

    expect(defaultResolution(plan)).toEqual({ "scalar:street": "theirs" });
  });
});

describe("applying a merge", () => {
  const base = lab();

  it("keeps my edit, adopts theirs, and resolves the overlap to theirs", () => {
    const mine = typed(base, (d) => {
      d.street = "Soi 11"; // only I touched this
      d.areaEn = "Mine"; // we both touched this
    });
    const server = lab({
      version: 5,
      areaEn: "Theirs",
      landmarkNote: "above the 7-Eleven", // only they touched this
    });

    const plan = planMerge(draftFromLab(base), mine, server);
    const merged = applyMerge(mine, server, plan, defaultResolution(plan));

    expect(merged.street).toBe("Soi 11");
    expect(merged.landmarkNote).toBe("above the 7-Eleven");
    expect(merged.areaEn).toBe("Theirs");
  });

  it("honours an explicit keep-mine", () => {
    const mine = typed(base, (d) => (d.areaEn = "Mine"));
    const server = lab({ version: 5, areaEn: "Theirs" });

    const plan = planMerge(draftFromLab(base), mine, server);
    const merged = applyMerge(mine, server, plan, {
      "scalar:area_en": "mine",
    });

    expect(merged.areaEn).toBe("Mine");
  });

  it("moves a whole pricing cell rather than half of one", () => {
    const withC41 = lab({
      pricing: [
        {
          process: "c41",
          format: "135",
          priceThb: 180,
          turnaroundMinD: 2,
          turnaroundMaxD: null,
        },
      ],
    } as Partial<LabDetail>);

    const mine = typed(withC41, (d) => {
      d.pricing["c41.135"] = { price: "190", turnaround: "2" };
    });
    const server = lab({
      version: 5,
      pricing: [
        {
          process: "c41",
          format: "135",
          priceThb: 200,
          turnaroundMinD: 1,
          turnaroundMaxD: null,
        },
      ],
    } as Partial<LabDetail>);

    const plan = planMerge(draftFromLab(withC41), mine, server);
    const merged = applyMerge(mine, server, plan, defaultResolution(plan));

    // Taking theirs takes the price *and* the turnaround: a cell with my price
    // and their turnaround is a state neither editor chose.
    expect(merged.pricing["c41.135"].price).toBe("200");
    expect(merged.pricing["c41.135"].turnaround).toBe("1");
  });
});

describe("the retry loop", () => {
  /**
   * The regression this whole module exists for.
   *
   * The form used to read the version off an unchanging prop, so a conflict
   * left it re-sending the same stale number forever. Rebasing is only half
   * the fix — the merged draft also has to be expressed against the lab it was
   * rebased onto, or the next diff re-sends leaves the server already has and
   * the save conflicts again on arrival.
   */
  it("produces no changes when the server's version is taken wholesale", () => {
    const base = lab();
    const untouched = draftFromLab(base);
    const server = lab({ version: 9, street: "Soi 13", areaEn: "Theirs" });

    const plan = planMerge(untouched, untouched, server);
    const merged = applyMerge(untouched, server, plan, defaultResolution(plan));

    const nextBaseline = draftFromLab(server);
    expect(diffDraft(nextBaseline, merged)).toEqual([]);
  });

  it("re-sends only my surviving edit after a rebase", () => {
    const base = lab();
    const mine = typed(base, (d) => (d.street = "Soi 11"));
    const server = lab({ version: 9, areaEn: "Theirs" });

    const plan = planMerge(draftFromLab(base), mine, server);
    const merged = applyMerge(mine, server, plan, defaultResolution(plan));

    const nextBaseline = draftFromLab(server);
    const changes = diffDraft(nextBaseline, merged);

    expect(changes.map((c) => c.path)).toEqual(["street"]);
    expect(changes[0].to).toBe("Soi 11");
  });
});
