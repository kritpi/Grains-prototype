import { describe, expect, it } from "vitest";

import {
  blankWeek,
  createGate,
  diffDraft,
  draftFromLab,
  draftToCreateInput,
  emptyDraft,
  formatTurnaround,
  parsePrice,
  parseTurnaround,
  type LabDraft,
} from "@/components/lab-form/draft";
import { labChangesSchema } from "@/lib/labs/paths";
import { newLabSchema } from "@/lib/labs/lab-input";
import type { LabDetail } from "@/lib/queries/labs";

const STOCK_A = "11111111-2222-4333-8444-555555555555";
const CONTACT_A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CUSTOM_A = "99999999-8888-4777-8666-555555555555";

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
    version: 1,
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

/** Every diff a form produces has to be one the grammar accepts. */
function accepted(changes: ReturnType<typeof diffDraft>) {
  const result = labChangesSchema.safeParse(changes);
  expect(result.error?.issues.map((i) => i.message).join(" · ") ?? "ok").toBe(
    "ok",
  );
  return changes;
}

function edit(base: LabDetail, change: (draft: LabDraft) => void) {
  const initial = draftFromLab(base);
  const current = draftFromLab(base);
  change(current);
  return diffDraft(initial, current);
}

describe("parsing what a person types", () => {
  it("reads a price however it is written", () => {
    expect(parsePrice("180")).toBe(180);
    expect(parsePrice(" ฿1,180 ")).toBe(1180);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("soon")).toBeNull();
  });

  it("reads a turnaround as a day or a range", () => {
    expect(parseTurnaround("2")).toEqual({ min: 2, max: null });
    expect(parseTurnaround("2-4")).toEqual({ min: 2, max: 4 });
    // An en dash is what a phone keyboard and a paste from a website produce.
    expect(parseTurnaround("2–4 days")).toEqual({ min: 2, max: 4 });
    expect(parseTurnaround("")).toEqual({ min: null, max: null });
  });

  it("writes a turnaround back the way it was read", () => {
    expect(formatTurnaround(2, null)).toBe("2");
    expect(formatTurnaround(2, 4)).toBe("2-4");
    // Stored as a range that is not one; shown as the day it is.
    expect(formatTurnaround(3, 3)).toBe("3");
    expect(formatTurnaround(null, null)).toBe("");
  });
});

describe("diffDraft", () => {
  it("reports nothing when nothing was touched", () => {
    const source = lab({
      nameTh: "แลป",
      pricing: [
        {
          process: "c41",
          format: "135",
          priceThb: 180,
          turnaroundMinD: 2,
          turnaroundMaxD: null,
        },
      ],
      contacts: [{ id: CONTACT_A, channel: "phone", value: "02 214 5500" }],
      hours: blankWeek(),
    } as Partial<LabDetail>);

    expect(diffDraft(draftFromLab(source), draftFromLab(source))).toEqual([]);
  });

  it("does not invent a change out of how a price is typed", () => {
    const source = lab({
      pricing: [
        {
          process: "c41",
          format: "135",
          priceThb: 180,
          turnaroundMinD: null,
          turnaroundMaxD: null,
        },
      ],
    } as Partial<LabDetail>);

    const changes = edit(source, (d) => {
      d.pricing["c41.135"].price = " ฿180 ";
    });
    expect(changes).toEqual([]);
  });

  it("clears a field to null rather than to an empty string", () => {
    const source = lab({ landmarkNote: "above the 7-Eleven" });
    const changes = accepted(edit(source, (d) => (d.landmarkNote = "   ")));

    expect(changes).toEqual([
      { path: "landmark_note", from: "above the 7-Eleven", to: null },
    ]);
  });

  it("keeps the pin whole", () => {
    const changes = accepted(
      edit(lab(), (d) => (d.location = { lat: 13.75, lng: 100.53 })),
    );
    expect(changes).toEqual([
      {
        path: "location",
        from: { lat: 13.7451, lng: 100.5324 },
        to: { lat: 13.75, lng: 100.53 },
      },
    ]);
  });

  describe("hours", () => {
    /**
     * The week is materialised on the first edit, but the log should read as the
     * one day somebody actually set — not as six closed days they never touched.
     */
    it("reports the edited day and not the week it materialised", () => {
      const changes = accepted(
        edit(lab(), (d) => {
          d.hours = blankWeek();
          d.hours[1] = { closed: false, open: "09:00", close: "19:00" };
        }),
      );

      expect(changes.map((c) => c.path)).toEqual([
        "hours.1.closed",
        "hours.1.open",
        "hours.1.close",
      ]);
    });

    it("clears the times when a day is closed", () => {
      const source = lab({
        hours: [
          { closed: true },
          { closed: false, open: "09:00", close: "19:00" },
          ...Array.from({ length: 5 }, () => ({ closed: true }) as const),
        ],
      } as Partial<LabDetail>);

      const changes = accepted(
        edit(source, (d) => (d.hours![1] = { closed: true })),
      );
      expect(changes).toEqual([
        { path: "hours.1.closed", from: false, to: true },
        { path: "hours.1.open", from: "09:00", to: null },
        { path: "hours.1.close", from: "19:00", to: null },
      ]);
    });
  });

  describe("processes", () => {
    /**
     * The cascade, from the only place that can see both halves: the form knows
     * the process is going and knows what was in its cells. `applyLabChanges`
     * refuses the save without these, deliberately.
     */
    it("carries away the pricing a dropped process takes with it", () => {
      const source = lab({
        processes: ["c41", "e6"],
        pricing: [
          {
            process: "e6",
            format: "135",
            priceThb: 340,
            turnaroundMinD: 3,
            turnaroundMaxD: 5,
          },
          {
            process: "e6",
            format: "120",
            priceThb: 400,
            turnaroundMinD: null,
            turnaroundMaxD: null,
          },
        ],
      } as Partial<LabDetail>);

      const changes = accepted(edit(source, (d) => (d.processes.e6 = false)));

      expect(changes).toEqual([
        { path: "processes.e6", from: true, to: false },
        { path: "pricing.e6.135.price_thb", from: 340, to: null },
        { path: "pricing.e6.135.turnaround_min_d", from: 3, to: null },
        { path: "pricing.e6.135.turnaround_max_d", from: 5, to: null },
        { path: "pricing.e6.120.price_thb", from: 400, to: null },
      ]);
    });

    it("leaves another process's prices alone", () => {
      const source = lab({
        processes: ["c41", "e6"],
        pricing: [
          {
            process: "c41",
            format: "135",
            priceThb: 180,
            turnaroundMinD: null,
            turnaroundMaxD: null,
          },
        ],
      } as Partial<LabDetail>);

      const changes = accepted(edit(source, (d) => (d.processes.e6 = false)));
      expect(changes).toEqual([
        { path: "processes.e6", from: true, to: false },
      ]);
    });

    it("does not price a process that was only just added", () => {
      const changes = accepted(edit(lab(), (d) => (d.processes.bw = true)));
      expect(changes).toEqual([
        { path: "processes.bw", from: false, to: true },
      ]);
    });
  });

  describe("contacts", () => {
    it("adds one as a channel, a value and a place in the list", () => {
      const changes = accepted(
        edit(lab(), (d) =>
          d.contacts.push({
            id: CONTACT_A,
            channel: "line",
            value: "@fixture",
          }),
        ),
      );

      expect(changes).toEqual([
        { path: `contacts.${CONTACT_A}.channel`, from: null, to: "line" },
        { path: `contacts.${CONTACT_A}.value`, from: null, to: "@fixture" },
        { path: `contacts.${CONTACT_A}.position`, from: null, to: 0 },
      ]);
    });

    /** One leaf, not three: a channel on a row that no longer exists says nothing. */
    it("removes one with a single leaf", () => {
      const source = lab({
        contacts: [{ id: CONTACT_A, channel: "phone", value: "02 214 5500" }],
      } as Partial<LabDetail>);

      const changes = accepted(edit(source, (d) => (d.contacts = [])));
      expect(changes).toEqual([
        { path: `contacts.${CONTACT_A}.value`, from: "02 214 5500", to: null },
      ]);
    });
  });

  describe("services and supplies", () => {
    it("ties a note to the box it belongs to", () => {
      const source = lab({
        services: [
          {
            id: "s1",
            key: "dropbox",
            labelEn: "Storefront drop-box",
            labelTh: null,
            customLabel: null,
            note: "from ฿60",
            offered: true,
            custom: false,
          },
        ],
      } as Partial<LabDetail>);

      // Un-ticking the service takes its note with it; a note on a service the
      // lab does not offer is not a note.
      const changes = accepted(
        edit(source, (d) => (d.services.dropbox.on = false)),
      );
      expect(changes).toEqual([
        { path: "services.dropbox.offered", from: true, to: false },
        { path: "services.dropbox.note", from: "from ฿60", to: null },
      ]);
    });

    it("removes a contributor's own row by clearing its label", () => {
      const source = lab({
        services: [
          {
            id: CUSTOM_A,
            key: null,
            labelEn: null,
            labelTh: null,
            customLabel: "Frame return",
            note: null,
            offered: true,
            custom: true,
          },
        ],
      } as Partial<LabDetail>);

      const changes = accepted(edit(source, (d) => (d.customServices = [])));
      expect(changes).toEqual([
        {
          path: `services.${CUSTOM_A}.custom_label`,
          from: "Frame return",
          to: null,
        },
      ]);
    });
  });

  describe("inventory", () => {
    it("tells an emptied stock from a removed one", () => {
      const source = lab({
        stock: [
          {
            filmStockId: STOCK_A,
            name: "Portra 400",
            iso: 400,
            formats: ["135"],
          },
        ],
      } as Partial<LabDetail>);

      expect(accepted(edit(source, (d) => (d.stock[0].formats = [])))).toEqual([
        { path: `stock.${STOCK_A}.formats`, from: ["135"], to: [] },
      ]);
      expect(accepted(edit(source, (d) => (d.stock = [])))).toEqual([
        { path: `stock.${STOCK_A}.formats`, from: ["135"], to: null },
      ]);
    });
  });
});

describe("creation", () => {
  it("names what the gate is still waiting for", () => {
    expect(createGate(emptyDraft()).missing).toEqual([
      "a name",
      "a pin on the map",
      "at least one process",
    ]);

    const ready = emptyDraft();
    ready.nameEn = "XANAP";
    ready.location = { lat: 13.7451, lng: 100.5324 };
    ready.processes.c41 = true;
    expect(createGate(ready).ready).toBe(true);
  });

  it("produces something createLab's own schema accepts", () => {
    const draft = emptyDraft();
    draft.nameEn = "XANAP Filmlab";
    draft.nameTh = "  ";
    draft.location = { lat: 13.7451, lng: 100.5324 };
    draft.processes.c41 = true;
    draft.pricing["c41.135"] = { price: "฿180", turnaround: "2-4" };
    // A cell for a process nobody offers is dropped rather than sent and refused.
    draft.pricing["e6.135"] = { price: "340", turnaround: "" };
    draft.contacts.push({
      id: CONTACT_A,
      channel: "phone",
      value: " 02 214 5500 ",
    });

    const input = draftToCreateInput(draft);
    const parsed = newLabSchema.safeParse(input);

    expect(parsed.error?.issues.map((i) => i.message).join(" · ") ?? "ok").toBe(
      "ok",
    );
    expect(input.nameTh).toBeNull();
    expect(input.pricing).toEqual([
      {
        process: "c41",
        format: "135",
        priceThb: 180,
        turnaroundMinD: 2,
        turnaroundMaxD: 4,
      },
    ]);
    expect(input.contacts[0].value).toBe("02 214 5500");
  });
});
