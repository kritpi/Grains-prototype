import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getLab, listLabHistory, searchLabs } from "@/lib/queries/labs";
import { hasDatabase, testClient } from "../db/client";

/**
 * searchLabs against a real PostGIS database.
 *
 * The radius cases are the point of the whole exercise: 00_BACKLOG.md keeps
 * PostGIS for query *correctness*, and the claim it is really making is that a
 * lab 4.9 km away is inside a 5 km search and one 5.1 km away is outside. A
 * degree-box approximation passes every other test in this file and fails
 * those two, which is why they are written by distance rather than by
 * coordinates: the fixtures are placed with ST_Project, so "4900 metres north"
 * means 4900 metres on the spheroid and not a decimal guess.
 *
 * Fixtures are committed rather than rolled back, because the functions under
 * test reach the database through getDb() on the transaction pooler and cannot
 * see a transaction held open on another connection. Everything is namespaced
 * and removed in afterAll.
 *
 * Skipped when there is no DIRECT_URL, which is how CI runs without holding
 * credentials.
 */
describe.skipIf(!hasDatabase)("searchLabs", () => {
  let sql: postgres.Sql;

  const ORIGIN = { lat: 13.7563, lng: 100.5018 };
  const TAG = "grains-test-labs";

  const ids: Record<string, string> = {};

  beforeAll(async () => {
    sql = testClient();

    const [user] = await sql<{ id: string }[]>`
      insert into users (email, name, username)
      values (${`${TAG}@example.test`}, ${TAG}, ${TAG.replace(/-/g, "_")})
      returning id
    `;

    // ST_Project takes metres and a bearing in radians, so each fixture sits at
    // an exact geodesic distance due north of the origin.
    async function makeLab(
      name: string,
      metres: number,
      status: "open" | "permanently_closed" = "open",
      completeness = 50,
    ) {
      const [row] = await sql<{ id: string }[]>`
        insert into labs (name_en, location, status, completeness, created_by)
        values (
          ${`${TAG} ${name}`},
          st_project(
            st_setsrid(st_makepoint(${ORIGIN.lng}, ${ORIGIN.lat}), 4326)::geography,
            ${metres},
            radians(0)
          ),
          ${status}::lab_status,
          ${completeness},
          ${user.id}
        )
        returning id
      `;
      ids[name] = row.id;
      return row.id;
    }

    const near = await makeLab("near", 1000, "open", 80);
    const edgeIn = await makeLab("edge-in", 4900);
    await makeLab("edge-out", 5100);
    await makeLab("closed", 500, "permanently_closed");

    await sql`
      insert into lab_processes (lab_id, process) values
        (${near}::uuid, 'c41'), (${near}::uuid, 'bw'),
        (${edgeIn}::uuid, 'c41'),
        (${ids["edge-out"]}::uuid, 'c41'),
        (${ids["closed"]}::uuid, 'c41')
    `;
    await sql`
      insert into lab_scanners (lab_id, model)
      values (${near}::uuid, 'Noritsu')
    `;
    await sql`
      insert into lab_services (lab_id, service_key) values
        (${near}::uuid, 'dropbox'), (${near}::uuid, 'mail_in')
    `;
    // A freeform service on the same lab: it must display but never filter.
    await sql`
      insert into lab_services (lab_id, custom_label)
      values (${near}::uuid, 'Scans burned to CD')
    `;
    await sql`
      insert into lab_pricing (lab_id, process, format, price_thb)
      values (${near}::uuid, 'c41', '135', 180), (${near}::uuid, 'bw', '135', 220)
    `;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from labs where name_en like ${`${TAG}%`}`;
    await sql`delete from users where email = ${`${TAG}@example.test`}`;
    await sql.end();
  });

  function names(labs: { nameEn: string }[]) {
    return labs.map((l) => l.nameEn.replace(`${TAG} `, "")).sort();
  }

  async function search(input: Partial<Parameters<typeof searchLabs>[0]> = {}) {
    const r = await searchLabs({ ...ORIGIN, ...input });
    return { ...r, labs: r.labs.filter((l) => l.nameEn.startsWith(TAG)) };
  }

  describe("radius — the reason PostGIS is here", () => {
    it("includes a lab 4.9 km away and excludes one 5.1 km away", async () => {
      const { labs } = await search();
      expect(names(labs)).toEqual(["edge-in", "near"]);
    });

    it("reports true geodesic distance, not a planar approximation", async () => {
      const { labs } = await search();
      const edgeIn = labs.find((l) => l.nameEn.endsWith("edge-in"));
      // A metre of tolerance for the spheroid round trip; a degree-box
      // approximation would be tens of metres out at this distance.
      expect(edgeIn?.distanceM).toBeCloseTo(4900, -1);
    });

    it("widening the radius brings the far lab in", async () => {
      const { labs } = await search({ radiusM: 6000 });
      expect(names(labs)).toEqual(["edge-in", "edge-out", "near"]);
    });
  });

  it("excludes permanently-closed labs even when they are nearest", async () => {
    const { labs } = await search();
    expect(names(labs)).not.toContain("closed");
  });

  it("orders nearest first", async () => {
    const { labs } = await search({ radiusM: 6000 });
    const distances = labs.map((l) => l.distanceM);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  describe("filters", () => {
    it("ANDs processes: every value must be offered", async () => {
      expect(names((await search({ process: ["c41"] })).labs)).toEqual([
        "edge-in",
        "near",
      ]);
      // edge-in offers c41 but not bw, so asking for both drops it.
      expect(names((await search({ process: ["c41", "bw"] })).labs)).toEqual([
        "near",
      ]);
    });

    it("ORs scanners: any one model qualifies", async () => {
      const { labs } = await search({
        scanner: ["Noritsu", "Fuji Frontier"],
      });
      expect(names(labs)).toEqual(["near"]);
    });

    it("ANDs curated services", async () => {
      expect(
        names((await search({ service: ["dropbox", "mail_in"] })).labs),
      ).toEqual(["near"]);
      expect(
        names((await search({ service: ["dropbox", "push_pull"] })).labs),
      ).toEqual([]);
    });

    it("cannot filter on a contributor's freeform service", async () => {
      // The freeform row exists on `near` and is invisible to the filter by
      // design — PRD A, Decision Ledger #2.
      const { labs } = await search({ service: ["Scans burned to CD"] });
      expect(labs).toEqual([]);
    });
  });

  it("carries the card fields the list and map render", async () => {
    const { labs } = await search({ process: ["c41", "bw"] });
    const near = labs[0];
    expect(near.processes.sort()).toEqual(["bw", "c41"]);
    expect(near.scanners).toEqual(["Noritsu"]);
    expect(near.priceFromThb).toBe(180);
    expect(near.completeness).toBe(80);
    expect(near.lat).toBeCloseTo(13.765, 2);
    expect(near.openNow).toBe(false); // no hours entered is not a claim to be open
  });

  it("totals before the page limit", async () => {
    const r = await searchLabs({ ...ORIGIN, radiusM: 6000, limit: 1 });
    expect(r.labs).toHaveLength(1);
    expect(r.total).toBeGreaterThanOrEqual(3);
  });
});

/**
 * "Open now" against the clock the database is actually using.
 *
 * These fixtures sit far from the searchLabs origin above so they cannot
 * disturb its exact-match assertions. The hours are built from the current
 * Asia/Bangkok weekday rather than hard-coded, because the alternative — a
 * fixed schedule and a fixed expectation — passes or fails depending on what
 * day the suite happens to run, and a test that is green six days a week is
 * worse than no test.
 */
describe.skipIf(!hasDatabase)("open now", () => {
  let sql: postgres.Sql;
  const TAG = "grains-test-hours";
  // Chiang Mai, ~580 km from the fixtures above.
  const ORIGIN = { lat: 18.7883, lng: 98.9853 };

  beforeAll(async () => {
    sql = testClient();

    const [now] = await sql<{ dow: number }[]>`
      select extract(dow from (now() at time zone 'Asia/Bangkok'))::int as dow
    `;

    const openAllDay = Array.from({ length: 7 }, (_, i) =>
      i === now.dow ? { open: "00:00", close: "23:59" } : { closed: true },
    );
    const shutAllWeek = Array.from({ length: 7 }, () => ({ closed: true }));

    const [user] = await sql<{ id: string }[]>`
      insert into users (email, name, username)
      values (${`${TAG}@example.test`}, ${TAG}, ${TAG.replace(/-/g, "_")})
      returning id
    `;

    async function makeLab(name: string, hours: unknown, status = "open") {
      await sql`
        insert into labs (name_en, location, hours, status, created_by)
        values (
          ${`${TAG} ${name}`},
          st_setsrid(st_makepoint(${ORIGIN.lng}, ${ORIGIN.lat}), 4326)::geography,
          ${sql.json(hours as never)},
          ${status}::lab_status,
          ${user.id}
        )
      `;
    }

    await makeLab("open", openAllDay);
    await makeLab("shut", shutAllWeek);
    await makeLab("no-hours", []);
    // Open on paper, but the manual status override says otherwise.
    await makeLab("temporarily-closed", openAllDay, "temporarily_closed");
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from labs where name_en like ${`${TAG}%`}`;
    await sql`delete from users where email = ${`${TAG}@example.test`}`;
    await sql.end();
  });

  it("is true only for a lab whose hours span the current Bangkok time", async () => {
    const { labs } = await searchLabs({ ...ORIGIN, radiusM: 1000 });
    const byName = Object.fromEntries(
      labs
        .filter((l) => l.nameEn.startsWith(TAG))
        .map((l) => [l.nameEn.replace(`${TAG} `, ""), l.openNow]),
    );

    expect(byName).toEqual({
      open: true,
      shut: false,
      "no-hours": false,
      "temporarily-closed": false,
    });
  });

  it("filters to open labs when asked", async () => {
    const { labs } = await searchLabs({
      ...ORIGIN,
      radiusM: 1000,
      openNow: true,
    });
    expect(labs.map((l) => l.nameEn.replace(`${TAG} `, ""))).toEqual(["open"]);
  });
});

describe.skipIf(!hasDatabase)("getLab", () => {
  it("returns null for an unknown id", async () => {
    expect(await getLab("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe.skipIf(!hasDatabase)("listLabHistory", () => {
  it("is empty for a lab with no edits, with and without a cursor", async () => {
    const id = "00000000-0000-0000-0000-000000000000";
    expect(await listLabHistory(id)).toEqual({ entries: [], nextCursor: null });
    expect(await listLabHistory(id, "999999")).toEqual({
      entries: [],
      nextCursor: null,
    });
  });
});
