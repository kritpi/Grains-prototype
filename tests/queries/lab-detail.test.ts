import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getLab, listLabHistory } from "@/lib/queries/labs";
import { hasDatabase, testClient } from "../db/client";

/**
 * `getLab` and `listLabHistory` against a lab with every child table populated.
 *
 * The existing coverage in labs.test.ts proves both return nothing for an
 * unknown id, which is the easy half. What /labs/[id] actually depends on is
 * the shape of a *populated* answer: that the pricing matrix can tell "not
 * offered" from "not entered", that the badge roster comes back whole rather
 * than only where somebody voted, and that a schedule stored as jsonb arrives
 * as seven known-shaped days.
 *
 * Fixtures are committed and removed in afterAll, for the same reason as the
 * search tests: the functions under test reach the database through getDb() on
 * the transaction pooler and cannot see a transaction held open elsewhere.
 * `edit_history` is deleted explicitly — `entity_id` is a plain uuid with no
 * foreign key, so nothing cascades it when the lab goes.
 */
describe.skipIf(!hasDatabase)("getLab", () => {
  let sql: postgres.Sql;
  const TAG = "grains-test-detail";
  // Phuket, far from every other fixture in the suite.
  const AT = { lat: 7.8804, lng: 98.3923 };

  let labId: string;
  let closedId: string;
  let sparseId: string;
  let filmStockId: string;
  const users: Record<string, string> = {};

  beforeAll(async () => {
    sql = testClient();

    for (const name of ["one", "two"]) {
      const [row] = await sql<{ id: string }[]>`
        insert into users (email, name, username)
        values (${`${TAG}-${name}@example.test`}, ${name},
                ${`${TAG.replace(/-/g, "_")}_${name}`})
        returning id
      `;
      users[name] = row.id;
    }

    const [stock] = await sql<{ id: string }[]>`
      insert into film_stocks (name, iso, formats, created_by)
      values (${`${TAG} Portra 400`}, 400, '{135,120}'::film_format[],
              ${users.one})
      returning id
    `;
    filmStockId = stock.id;

    async function makeLab(
      name: string,
      extra: {
        status?: string;
        hours?: unknown;
        street?: string | null;
        landmark?: string | null;
      } = {},
    ) {
      const [row] = await sql<{ id: string }[]>`
        insert into labs (
          name_en, name_th, area_en, street, landmark_note,
          location, hours, status, completeness, created_by
        ) values (
          ${`${TAG} ${name}`}, ${`${name} ไทย`}, 'Phuket Town',
          ${extra.street ?? null}, ${extra.landmark ?? null},
          st_setsrid(st_makepoint(${AT.lng}, ${AT.lat}), 4326)::geography,
          ${sql.json((extra.hours ?? []) as never)},
          ${extra.status ?? "open"}::lab_status, 50, ${users.one}
        ) returning id
      `;
      return row.id;
    }

    // A schedule with seconds on the times and a closed Sunday: the times must
    // come back trimmed to HH:MM, and the closed day must not become a range.
    labId = await makeLab("full", {
      hours: [
        { closed: true },
        { open: "09:30:00", close: "19:00:00" },
        { open: "09:30", close: "19:00" },
        { open: "09:30", close: "19:00" },
        { open: "09:30", close: "19:00" },
        { open: "09:30", close: "19:00" },
        { open: "11:00", close: "18:00" },
      ],
      street: "1 Thalang Road",
      landmark: "Blue shutter beside the bakery",
    });
    closedId = await makeLab("gone", { status: "permanently_closed" });
    sparseId = await makeLab("sparse");

    // Offers c41 and bw. Pricing exists for c41/135 only, so c41/120 is
    // "not entered" while e6 is "not offered" — the distinction PRD A #1 is about.
    await sql`
      insert into lab_processes (lab_id, process)
      values (${labId}::uuid, 'c41'), (${labId}::uuid, 'bw')
    `;
    await sql`
      insert into lab_pricing
        (lab_id, process, format, price_thb, turnaround_min_d, turnaround_max_d)
      values (${labId}::uuid, 'c41', '135', 180, 1, 2)
    `;
    await sql`
      insert into lab_scanners (lab_id, model)
      values (${labId}::uuid, 'Noritsu')
    `;
    await sql`
      insert into lab_services (lab_id, service_key) values (${labId}::uuid, 'dropbox')
    `;
    await sql`
      insert into lab_services (lab_id, custom_label, note)
      values (${labId}::uuid, 'Scans burned to CD', 'add ฿50')
    `;
    await sql`
      insert into lab_supplies (lab_id, supply_key) values (${labId}::uuid, 'chemicals')
    `;
    await sql`
      insert into lab_contacts (lab_id, channel, value, position) values
        (${labId}::uuid, 'phone', '02 555 0100', 0),
        (${labId}::uuid, 'line',  '@testlab',    1)
    `;
    await sql`
      insert into lab_stock (lab_id, film_stock_id, formats)
      values (${labId}::uuid, ${filmStockId}::uuid, '{135}'::film_format[])
    `;
    // Two endorsements on one badge, one on another, none on the other two.
    await sql`
      insert into lab_badge_votes (lab_id, badge_key, user_id) values
        (${labId}::uuid, 'fast',  ${users.one}),
        (${labId}::uuid, 'fast',  ${users.two}),
        (${labId}::uuid, 'clean', ${users.one})
    `;
    await sql`
      insert into edit_history (entity, entity_id, editor_id, note, changes) values
        ('lab', ${labId}::uuid, ${users.one}, 'first',  ${sql.json([{ path: "name_en", from: null, to: "full" }] as never)}),
        ('lab', ${labId}::uuid, ${users.two}, 'second', ${sql.json([{ path: "street", from: null, to: "1 Thalang Road" }] as never)}),
        ('lab', ${labId}::uuid, ${users.two}, null,     ${sql.json([{ path: "pricing.c41.135.price_thb", from: 200, to: 180 }] as never)})
    `;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`
      delete from edit_history
      where editor_id in (select id from users where email like ${`${TAG}%`})
    `;
    await sql`delete from labs where name_en like ${`${TAG}%`}`;
    await sql`delete from film_stocks where name like ${`${TAG}%`}`;
    await sql`delete from users where email like ${`${TAG}%`}`;
    await sql.end();
  });

  describe("hours", () => {
    it("normalises seven days, trimming seconds off the times", async () => {
      const lab = await getLab(labId);
      expect(lab?.hours).toHaveLength(7);
      expect(lab?.hours?.[0]).toEqual({ closed: true });
      // Stored as "09:30:00"; the page renders "09:30".
      expect(lab?.hours?.[1]).toEqual({
        closed: false,
        open: "09:30",
        close: "19:00",
      });
    });

    it("is null when nobody has entered a schedule", async () => {
      // Distinct from "closed every day", which is a claim somebody made.
      const lab = await getLab(sparseId);
      expect(lab?.hours).toBeNull();
    });
  });

  describe("pricing", () => {
    it("returns only the cells actually entered", async () => {
      const lab = await getLab(labId);
      expect(lab?.pricing).toEqual([
        {
          process: "c41",
          format: "135",
          priceThb: 180,
          turnaroundMinD: 1,
          turnaroundMaxD: 2,
        },
      ]);
    });

    it("lists every offered process, so a blank cell is not 'not offered'", async () => {
      const lab = await getLab(labId);
      // bw is offered with no price at all: the matrix must show it as a row
      // with empty cells, not omit it the way it omits e6.
      expect(lab?.processes.sort()).toEqual(["bw", "c41"]);
    });
  });

  describe("badges", () => {
    it("returns the whole roster, including badges with no endorsements", async () => {
      const lab = await getLab(labId);
      expect(lab?.badges.map((b) => b.key)).toEqual([
        "clean",
        "fast",
        "color",
        "beginner",
      ]);
      expect(
        Object.fromEntries(lab!.badges.map((b) => [b.key, b.count])),
      ).toEqual({ clean: 1, fast: 2, color: 0, beginner: 0 });
    });

    it("carries the catalog labels", async () => {
      const lab = await getLab(labId);
      const fast = lab?.badges.find((b) => b.key === "fast");
      expect(fast?.labelEn).toBe("Fast Turnaround");
      expect(fast?.labelTh).toBe("ล้างไว");
    });

    it("returns zeros for a lab nobody has endorsed", async () => {
      const lab = await getLab(sparseId);
      expect(lab?.badges).toHaveLength(4);
      expect(lab?.badges.every((b) => b.count === 0)).toBe(true);
    });
  });

  describe("services and supplies", () => {
    it("returns the whole curated roster, offered or not", async () => {
      // The page renders an un-offered service as an unticked box rather than
      // omitting it, so the roster has to come back whole — the same argument
      // as the badge list and the pricing matrix's rows.
      const lab = await getLab(labId);
      const curated = lab!.services.filter((s) => !s.custom);
      expect(curated).toHaveLength(6);
      expect(curated.filter((s) => s.offered).map((s) => s.labelEn)).toEqual([
        "Storefront drop-box",
      ]);
      expect(curated.filter((s) => !s.offered).length).toBe(5);
    });

    it("puts curated entries first and keeps the contributor's own last", async () => {
      const lab = await getLab(labId);
      const custom = lab!.services.filter((s) => s.custom);
      expect(custom.map((s) => s.customLabel)).toEqual(["Scans burned to CD"]);
      // A freeform row has no catalog key, is always offered — it exists only
      // because somebody added it — and keeps its note.
      expect(custom[0].key).toBeNull();
      expect(custom[0].offered).toBe(true);
      expect(custom[0].note).toBe("add ฿50");
      // Curated first, so every lab's list opens the same way.
      expect(lab!.services.at(-1)?.custom).toBe(true);
    });

    it("resolves supply labels from the catalog", async () => {
      const lab = await getLab(labId);
      expect(lab?.supplies.map((s) => s.labelEn)).toEqual([
        "Developing chemicals",
      ]);
    });
  });

  it("returns contacts in their stored order", async () => {
    const lab = await getLab(labId);
    expect(lab?.contacts.map((c) => [c.channel, c.value])).toEqual([
      ["phone", "02 555 0100"],
      ["line", "@testlab"],
    ]);
  });

  it("joins inventory to the film stock catalog", async () => {
    const lab = await getLab(labId);
    expect(lab?.stock).toEqual([
      {
        filmStockId,
        name: `${TAG} Portra 400`,
        iso: 400,
        formats: ["135"],
      },
    ]);
  });

  describe("contribution summary", () => {
    it("counts the edits and names the most recent editor", async () => {
      const lab = await getLab(labId);
      expect(lab?.editCount).toBe(3);
      // The third insert, by user two, with no note.
      expect(lab?.lastEditorUsername).toBe(`${TAG.replace(/-/g, "_")}_two`);
      expect(lab?.lastEditedAt).not.toBeNull();
    });

    it("is empty rather than absent for a lab nobody has edited", async () => {
      const lab = await getLab(sparseId);
      expect(lab?.editCount).toBe(0);
      expect(lab?.lastEditedAt).toBeNull();
      expect(lab?.lastEditorUsername).toBeNull();
    });
  });

  it("returns a permanently-closed lab, which search excludes", async () => {
    // Hidden from results, still reachable by direct link — "Mark as Closed"
    // is a flag that preserves history, not a delete (PRD A).
    const lab = await getLab(closedId);
    expect(lab?.status).toBe("permanently_closed");
  });

  it("carries the address fields the location block renders", async () => {
    const lab = await getLab(labId);
    expect(lab?.street).toBe("1 Thalang Road");
    expect(lab?.landmarkNote).toBe("Blue shutter beside the bakery");
    expect(lab?.lat).toBeCloseTo(AT.lat, 4);
    expect(lab?.lng).toBeCloseTo(AT.lng, 4);
  });

  describe("listLabHistory", () => {
    it("returns newest first", async () => {
      const { entries } = await listLabHistory(labId);
      expect(entries).toHaveLength(3);
      expect(entries[0].changes[0].path).toBe("pricing.c41.135.price_thb");
      expect(entries[2].note).toBe("first");
    });

    it("pages by cursor without repeating or skipping an entry", async () => {
      const first = await listLabHistory(labId, undefined, 2);
      expect(first.entries).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      const second = await listLabHistory(labId, first.nextCursor!, 2);
      expect(second.entries).toHaveLength(1);
      expect(second.nextCursor).toBeNull();

      const ids = [...first.entries, ...second.entries].map((e) => e.id);
      expect(new Set(ids).size).toBe(3);
    });

    it("attributes each entry to its editor", async () => {
      const { entries } = await listLabHistory(labId);
      expect(entries[2].editorUsername).toBe(`${TAG.replace(/-/g, "_")}_one`);
    });
  });
});
