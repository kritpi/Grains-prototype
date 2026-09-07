import type postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { labPath } from "@/lib/labs/paths";
import { hasDatabase, testClient } from "../db/client";

/**
 * The Server Actions, run for real against grains-dev.
 *
 * These cannot roll back the way tests/queries/lab-edits.test.ts does: an action
 * opens its own transaction, which is the behaviour under test. So each one
 * creates its own lab and the ids are torn down afterwards — including the
 * `edit_history` rows, which survive their lab on purpose. `entity_id` carries
 * no foreign key because history is polymorphic across labs and film stocks,
 * and because a record of what happened should outlive the thing it happened
 * to. A deliberate design property there; a cleanup obligation here.
 *
 * `requireUser` and `revalidatePath` are the two things an action does that need
 * a request behind them, so they are the two things mocked. Everything else —
 * the transaction, the constraints, the history row — is real.
 */

const seeded = { userId: "" };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireUser: vi.fn(async () => ({
    id: seeded.userId,
    username: "tester",
    name: "Tester",
  })),
}));

const { createLab, setLabStatus, updateLab } =
  await import("@/app/labs/actions");

describe.skipIf(!hasDatabase)("lab actions", () => {
  let sql: postgres.Sql;
  const created: string[] = [];

  beforeAll(async () => {
    sql = testClient();
    const rows = await sql<{ id: string }[]>`
      insert into users (email, name, username)
      values (${`action-${crypto.randomUUID()}@grains.invalid`}, 'Tester',
              ${`a${Date.now()}${Math.floor(Math.random() * 1000)}`})
      returning id
    `;
    seeded.userId = rows[0].id;
  });

  afterEach(async () => {
    if (created.length === 0) return;
    const ids = created.splice(0);
    await sql`delete from edit_history where entity = 'lab' and entity_id in ${sql(ids)}`;
    await sql`delete from labs where id in ${sql(ids)}`;
  });

  afterAll(async () => {
    if (seeded.userId) await sql`delete from users where id = ${seeded.userId}`;
    await sql?.end();
  });

  /** The minimum a lab can be created with: a name, a pin, one process. */
  function draft(overrides: Record<string, unknown> = {}) {
    return {
      nameEn: `Action Fixture ${crypto.randomUUID().slice(0, 8)}`,
      location: { lat: 13.7451, lng: 100.5324 },
      processes: ["c41"],
      ...overrides,
    };
  }

  async function create(overrides: Record<string, unknown> = {}) {
    const result = await createLab(draft(overrides));
    if (!result.ok) throw new Error(JSON.stringify(result));
    created.push(result.id);
    return result.id;
  }

  async function historyOf(labId: string) {
    return sql<{ note: string | null; changes: unknown[] }[]>`
      select note, changes from edit_history
       where entity = 'lab' and entity_id = ${labId}
       order by created_at, id
    `;
  }

  async function labRow(labId: string) {
    const rows = await sql<
      { version: number; name_th: string | null; status: string }[]
    >`select version, name_th, status from labs where id = ${labId}`;
    return rows[0];
  }

  // -------------------------------------------------------------------------

  describe("createLab", () => {
    it("writes the lab and one history entry saying it appeared", async () => {
      const labId = await create({ nameTh: "แลปทดสอบ" });

      const history = await historyOf(labId);
      expect(history).toHaveLength(1);
      expect(history[0].changes).toEqual([
        { path: "name_en", from: null, to: expect.stringContaining("Action") },
      ]);
    });

    it("refuses a lab with no process, which is the create gate", async () => {
      const result = await createLab(draft({ processes: [] }));
      expect(result).toMatchObject({ ok: false, reason: "invalid" });
      expect((result as { issues: string[] }).issues.join(" ")).toMatch(
        /at least one process/,
      );
    });

    it("refuses a lab with no pin", async () => {
      const result = await createLab({ ...draft(), location: undefined });
      expect(result).toMatchObject({ ok: false, reason: "invalid" });
    });

    it("names the process before the database has to", async () => {
      const result = await createLab(
        draft({ pricing: [{ process: "e6", format: "135", priceThb: 340 }] }),
      );
      expect((result as { issues: string[] }).issues.join(" ")).toMatch(
        /e6 is priced but not offered/,
      );
    });
  });

  describe("updateLab", () => {
    it("writes exactly one history row, carrying the contributor's note", async () => {
      const labId = await create();

      const result = await updateLab(
        labId,
        1,
        [{ path: "name_th", from: null, to: "แลปทดสอบ" }],
        "  Asked at the counter.  ",
      );

      expect(result).toEqual({ ok: true, id: labId });
      const history = await historyOf(labId);
      // One for the creation, one for this edit. Not three, not one.
      expect(history).toHaveLength(2);
      expect(history[1].note).toBe("Asked at the counter.");
      expect((await labRow(labId)).name_th).toBe("แลปทดสอบ");
    });

    it("returns the lab as it now is when the version is stale, and writes nothing", async () => {
      const labId = await create();
      await updateLab(labId, 1, [{ path: "name_th", from: null, to: "first" }]);

      const result = await updateLab(labId, 1, [
        { path: "street", from: null, to: "Rama I Rd" },
      ]);

      expect(result).toMatchObject({ ok: false, reason: "conflict" });
      const current = (result as { current: { nameTh: string | null } })
        .current;
      expect(current.nameTh).toBe("first");

      // Creation and the first edit. The refused one left no trace.
      expect(await historyOf(labId)).toHaveLength(2);
      expect((await labRow(labId)).version).toBe(2);
    });

    it("treats a save with nothing in it as a no-op, not an error", async () => {
      const labId = await create();
      expect(await updateLab(labId, 1, [])).toEqual({
        ok: false,
        reason: "unchanged",
      });
      expect(await historyOf(labId)).toHaveLength(1);
    });

    it("refuses to drop a process without the prices it takes, and records nothing", async () => {
      const labId = await create({
        processes: ["c41", "e6"],
        pricing: [{ process: "e6", format: "135", priceThb: 340 }],
      });

      const result = await updateLab(labId, 1, [
        { path: labPath.process("e6"), from: true, to: false },
      ]);

      expect(result).toMatchObject({ ok: false, reason: "cascade" });
      expect((result as { missing: string[] }).missing).toContain(
        "pricing.e6.135.price_thb",
      );
      expect(await historyOf(labId)).toHaveLength(1);
    });

    /**
     * The schema stays authoritative and the contributor still gets a sentence.
     * A turnaround with only an upper bound is a fact about the row that
     * results, not about the diff, so neither the grammar nor the form's own
     * rules can see it — only the database can.
     */
    it("turns a constraint the form could not catch into words", async () => {
      const labId = await create();

      const result = await updateLab(labId, 1, [
        {
          path: labPath.pricing("c41", "135", "price_thb"),
          from: null,
          to: 180,
        },
        {
          path: labPath.pricing("c41", "135", "turnaround_max_d"),
          from: null,
          to: 5,
        },
      ]);

      expect(result).toMatchObject({ ok: false, reason: "rejected" });
      expect((result as { message: string }).message).toMatch(
        /needs a starting number of days/,
      );
      expect(await historyOf(labId)).toHaveLength(1);
    });

    /**
     * Postgres reports the *first* constraint a row violates, so which sentence
     * comes back depends on the row and not only on the mistake. A cell with an
     * upper turnaround bound and nothing else fails the not-empty rule before it
     * ever reaches the one about bounds — "a turnaround" means its start.
     */
    it("answers with the rule the row actually broke first", async () => {
      const labId = await create();

      const result = await updateLab(labId, 1, [
        {
          path: labPath.pricing("c41", "135", "turnaround_max_d"),
          from: null,
          to: 5,
        },
      ]);

      expect((result as { message: string }).message).toMatch(
        /needs a price or a turnaround/,
      );
    });
  });

  describe("setLabStatus", () => {
    it("logs the change like any other edit", async () => {
      const labId = await create();

      const result = await setLabStatus(
        labId,
        1,
        "temporarily_closed",
        "Renovating until 15 Oct",
      );

      expect(result).toEqual({ ok: true, id: labId });
      expect((await labRow(labId)).status).toBe("temporarily_closed");

      const history = await historyOf(labId);
      expect(history).toHaveLength(2);
      expect(history[1].changes).toEqual([
        { path: "status", from: "open", to: "temporarily_closed" },
        { path: "status_note", from: null, to: "Renovating until 15 Oct" },
      ]);
    });

    it("is a flag and not a delete — the lab is still there", async () => {
      const labId = await create();
      await setLabStatus(labId, 1, "permanently_closed");
      expect((await labRow(labId)).status).toBe("permanently_closed");
    });

    it("says nothing changed rather than logging a status set to itself", async () => {
      const labId = await create();
      expect(await setLabStatus(labId, 1, "open")).toEqual({
        ok: false,
        reason: "unchanged",
      });
      expect(await historyOf(labId)).toHaveLength(1);
    });
  });
});
