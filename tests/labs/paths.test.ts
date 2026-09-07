import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CHEM_PROCESSES,
  labChangesSchema,
  labPath,
  parseLabPath,
  SCALAR_COLUMNS,
  toHistoryChanges,
  type LabPathLeaf,
} from "@/lib/labs/paths";
import { hasDatabase, testClient } from "../db/client";

const UUID_A = "7c9e1f30-4a2b-4d81-9f55-2e6b8c0a1d42";
const UUID_B = "1f2e3d4c-5b6a-4798-8a9b-0c1d2e3f4a5b";

/** A change set's happy path, so each test names only what it is about. */
function change(path: string, from: unknown, to: unknown) {
  return { path, from, to };
}

function leafOf(path: string): LabPathLeaf {
  const parsed = parseLabPath(path);
  if (!parsed.ok) throw new Error(`${path}: ${parsed.reason}`);
  return parsed.leaf;
}

function reasonFor(path: string): string {
  const parsed = parseLabPath(path);
  if (parsed.ok) throw new Error(`${path} parsed, expected a rejection`);
  return parsed.reason;
}

describe("parseLabPath", () => {
  it("reads every family", () => {
    expect(leafOf("name_en")).toEqual({ kind: "scalar", column: "name_en" });
    expect(leafOf("location")).toEqual({ kind: "location" });
    expect(leafOf("hours.3.open")).toEqual({
      kind: "hours",
      day: 3,
      field: "open",
    });
    expect(leafOf("processes.e6")).toEqual({ kind: "process", process: "e6" });
    expect(leafOf("scanners.Fuji Frontier")).toEqual({
      kind: "scanner",
      model: "Fuji Frontier",
    });
    expect(leafOf("pricing.c41.135.price_thb")).toEqual({
      kind: "pricing",
      process: "c41",
      format: "135",
      field: "price_thb",
    });
    expect(leafOf("services.dropbox.note")).toEqual({
      kind: "curated_service",
      key: "dropbox",
      field: "note",
    });
    expect(leafOf("supplies.chemicals")).toEqual({
      kind: "curated_supply",
      key: "chemicals",
    });
    expect(leafOf(`contacts.${UUID_A}.value`)).toEqual({
      kind: "contact",
      id: UUID_A,
      field: "value",
    });
    expect(leafOf(`stock.${UUID_A}.formats`)).toEqual({
      kind: "stock",
      filmStockId: UUID_A,
    });
  });

  it("tells curated rows from custom ones by shape", () => {
    expect(leafOf(`services.${UUID_A}.custom_label`)).toEqual({
      kind: "custom_service",
      id: UUID_A,
      field: "custom_label",
    });
    expect(leafOf(`supplies.${UUID_A}.custom_label`)).toEqual({
      kind: "custom_supply",
      id: UUID_A,
    });
  });

  /**
   * The paths Track A's seeds and its formatter were written against. If the
   * grammar stops reading one of them, history already in the database becomes
   * unparseable — which is the failure this whole module exists to avoid.
   */
  it("reads the shapes already written to edit_history", () => {
    for (const path of [
      "name_en",
      "hours.1.open",
      "pricing.e6.135.price_thb",
      "pricing.e6.120.price_thb",
      "scanners.Flatbed",
      `contacts.${UUID_A}.value`,
    ]) {
      expect(parseLabPath(path).ok).toBe(true);
    }
  });

  it("keeps location atomic", () => {
    expect(reasonFor("location.lat")).toMatch(/written whole/);
  });

  it("rejects a scalar with a sub-path", () => {
    expect(reasonFor("name_en.value")).toMatch(/takes no sub-path/);
  });

  it("rejects what is not a lab field", () => {
    expect(reasonFor("completeness")).toMatch(/not a field of a lab/);
    expect(reasonFor("version")).toMatch(/not a field of a lab/);
    expect(reasonFor("created_by")).toMatch(/not a field of a lab/);
  });

  it("names photos as reserved rather than unknown", () => {
    expect(reasonFor(`photos.${UUID_A}`)).toMatch(/Track C/);
  });

  it("rejects an out-of-range weekday and an unknown field", () => {
    expect(reasonFor("hours.7.open")).toMatch(/expected hours/);
    expect(reasonFor("hours.3.opens")).toMatch(/not an hours field/);
  });

  it("rejects an unknown process, format or pricing field", () => {
    expect(reasonFor("pricing.c42.135.price_thb")).toMatch(/not a process/);
    expect(reasonFor("pricing.c41.110.price_thb")).toMatch(/not a format/);
    expect(reasonFor("pricing.c41.135.cost")).toMatch(/not a pricing field/);
  });

  it("requires a uuid where a row is addressed by one", () => {
    expect(reasonFor("contacts.first.value")).toMatch(/expected contacts/);
    expect(reasonFor("stock.velvia-50.formats")).toMatch(/expected stock/);
  });

  it("rejects an empty segment", () => {
    expect(reasonFor("pricing..135.price_thb")).toMatch(/illegal segment/);
    expect(reasonFor("hours.3.")).toMatch(/illegal segment/);
  });

  it("every builder round-trips through the parser", () => {
    const built = [
      ...SCALAR_COLUMNS.map((c) => labPath.scalar(c)),
      labPath.location(),
      labPath.hours(0, "closed"),
      labPath.hours(6, "close"),
      ...CHEM_PROCESSES.map((p) => labPath.process(p)),
      labPath.scanner("SP-3000"),
      labPath.pricing("bw", "120", "turnaround_max_d"),
      labPath.curatedService("mail_in", "offered"),
      labPath.customService(UUID_A, "note"),
      labPath.curatedSupply("tanks_reels"),
      labPath.customSupply(UUID_B),
      labPath.contact(UUID_A, "position"),
      labPath.stock(UUID_B),
    ];

    for (const path of built) {
      expect(parseLabPath(path), path).toMatchObject({ ok: true });
    }
  });
});

describe("labChangesSchema — one change", () => {
  function accepts(...changes: ReturnType<typeof change>[]) {
    const result = labChangesSchema.safeParse(changes);
    expect(result.error?.issues[0]?.message ?? "ok").toBe("ok");
    return result.data!;
  }

  function refuses(...changes: ReturnType<typeof change>[]) {
    const result = labChangesSchema.safeParse(changes);
    expect(result.success).toBe(false);
    return result.error!.issues.map((i) => i.message).join(" · ");
  }

  it("attaches the parsed leaf to what it returns", () => {
    const [parsed] = accepts(change("pricing.c41.135.price_thb", 180, 200));
    expect(parsed.leaf).toEqual({
      kind: "pricing",
      process: "c41",
      format: "135",
      field: "price_thb",
    });
  });

  it("will not let a lab lose its name, but will let it lose a Thai one", () => {
    expect(refuses(change("name_en", "XANAP", null))).toMatch(
      /expected string/i,
    );
    accepts(change("name_th", "แซนแนป", null));
  });

  it("refuses an empty string, which is a second spelling of absent", () => {
    expect(refuses(change("landmark_note", "above the 7-Eleven", ""))).toMatch(
      /use null to clear/,
    );
  });

  it("checks the value against the leaf, not against the head", () => {
    accepts(change("hours.3.closed", false, true));
    expect(refuses(change("hours.3.closed", false, "true"))).toMatch(
      /expected boolean/i,
    );
    accepts(change("hours.3.open", "10:00", "09:00"));
    expect(refuses(change("hours.3.open", "10:00", "9am"))).toMatch(/HH:MM/);
    expect(refuses(change("hours.3.open", "10:00", "24:00"))).toMatch(/HH:MM/);
  });

  it("bounds a price to the column and turnaround to whole days", () => {
    accepts(change("pricing.c41.135.price_thb", null, 180));
    expect(refuses(change("pricing.c41.135.price_thb", null, -1))).toMatch(
      />=0|greater than or equal/i,
    );
    expect(
      refuses(change("pricing.c41.135.turnaround_min_d", null, 1.5)),
    ).toMatch(/expected int/i);
  });

  it("takes a status from the enum only", () => {
    accepts(change("status", "open", "temporarily_closed"));
    expect(refuses(change("status", "open", "closed"))).toMatch(
      /invalid|expected/i,
    );
  });

  it("takes a contact channel from the enum only", () => {
    accepts(change(`contacts.${UUID_A}.channel`, "phone", "line"));
    expect(
      refuses(change(`contacts.${UUID_A}.channel`, "phone", "whatsapp")),
    ).toMatch(/invalid|expected/i);
  });

  it("keeps the pin whole and on the planet", () => {
    accepts(
      change(
        "location",
        { lat: 13.7451, lng: 100.5324 },
        { lat: 13.75, lng: 100.53 },
      ),
    );
    expect(
      refuses(
        change(
          "location",
          { lat: 13.7451, lng: 100.5324 },
          { lat: 213, lng: 100.53 },
        ),
      ),
    ).toMatch(/<=90|less than or equal/i);
  });

  it("distinguishes an emptied stock from a removed one, and rejects a repeat", () => {
    accepts(change(`stock.${UUID_A}.formats`, ["135"], []));
    accepts(change(`stock.${UUID_A}.formats`, ["135"], null));
    expect(
      refuses(change(`stock.${UUID_A}.formats`, null, ["135", "135"])),
    ).toMatch(/repeated/);
  });

  it("validates `from` as well, because the log records it forever", () => {
    expect(refuses(change("hours.3.open", "10am", "09:00"))).toMatch(/HH:MM/);
  });

  it("refuses a change that changes nothing", () => {
    expect(refuses(change("name_th", "แซนแนป", "แซนแนป"))).toMatch(/unchanged/);
    expect(
      refuses(change(`stock.${UUID_A}.formats`, ["135"], ["135"])),
    ).toMatch(/unchanged/);
  });
});

describe("labChangesSchema — the set", () => {
  function refuses(changes: ReturnType<typeof change>[]) {
    const result = labChangesSchema.safeParse(changes);
    expect(result.success).toBe(false);
    return result.error!.issues.map((i) => i.message).join(" · ");
  }

  it("refuses a save with no changes", () => {
    expect(refuses([])).toMatch(/no changes is not a save/);
  });

  it("refuses two changes to one leaf", () => {
    expect(
      refuses([
        change("pricing.c41.135.price_thb", 180, 200),
        change("pricing.c41.135.price_thb", 180, 220),
      ]),
    ).toMatch(/more than once/);
  });

  /**
   * lab_pricing's foreign key to (lab_id, process) is ON DELETE CASCADE, so
   * dropping a process destroys its prices. A set that drops e6 and prices it
   * is incoherent in whichever order it is applied.
   */
  it("refuses to price a process the same save removes", () => {
    expect(
      refuses([
        change("processes.e6", true, false),
        change("pricing.e6.135.price_thb", 340, 380),
      ]),
    ).toMatch(/which the same save removes/);
  });

  it("accepts dropping a process alongside the prices it takes with it", () => {
    const result = labChangesSchema.safeParse([
      change("processes.e6", true, false),
      change("pricing.e6.135.price_thb", 340, null),
      change("pricing.e6.120.price_thb", 400, null),
    ]);
    expect(result.error?.issues[0]?.message ?? "ok").toBe("ok");
  });

  it("leaves the other processes alone", () => {
    const result = labChangesSchema.safeParse([
      change("processes.e6", true, false),
      change("pricing.c41.135.price_thb", 180, 200),
    ]);
    expect(result.error?.issues[0]?.message ?? "ok").toBe("ok");
  });
});

describe("toHistoryChanges", () => {
  it("strips the parsed leaf back to the wire shape", () => {
    const parsed = labChangesSchema.parse([
      change("name_th", null, "แซนแนป"),
      change("hours.1.open", "10:00", "09:00"),
    ]);

    expect(toHistoryChanges(parsed)).toEqual([
      { path: "name_th", from: null, to: "แซนแนป" },
      { path: "hours.1.open", from: "10:00", to: "09:00" },
    ]);
  });
});

/**
 * The guard the grammar cannot enforce on its own.
 *
 * Catalog keys and scanner model names become path segments verbatim, and
 * `scanner_models.model` is unconstrained text. One future row called
 * "Nikon Coolscan v.2" would split into two segments and quietly corrupt
 * history that is already written. Failing here makes that a red test in the
 * migration's own pull request rather than an unparseable log months later.
 */
describe.skipIf(!hasDatabase)("catalog rows are path-safe", () => {
  let sql: postgres.Sql;

  beforeAll(() => {
    sql = testClient();
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("every scanner model parses as a scanner path", async () => {
    const rows = await sql<
      { model: string }[]
    >`SELECT model FROM scanner_models`;
    expect(rows.length).toBeGreaterThan(0);
    for (const { model } of rows) {
      expect(parseLabPath(labPath.scanner(model)), model).toMatchObject({
        ok: true,
      });
    }
  });

  it("every curated service and supply key parses", async () => {
    const services = await sql<
      { key: string }[]
    >`SELECT key FROM service_catalog`;
    const supplies = await sql<
      { key: string }[]
    >`SELECT key FROM supply_catalog`;
    expect(services.length + supplies.length).toBeGreaterThan(0);

    for (const { key } of services) {
      expect(
        parseLabPath(labPath.curatedService(key, "offered")),
        key,
      ).toMatchObject({ ok: true });
    }
    for (const { key } of supplies) {
      expect(parseLabPath(labPath.curatedSupply(key)), key).toMatchObject({
        ok: true,
      });
    }
  });
});
