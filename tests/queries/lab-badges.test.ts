import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getLab } from "@/lib/queries/labs";
import { toggleBadgeVote } from "@/lib/queries/lab-badges";
import { FOREIGN_KEY_VIOLATION, hasDatabase, testClient } from "../db/client";

/**
 * Endorsing, retracting, and knowing which of those you did.
 *
 * The UI half of this cannot be exercised without signing in through Google, so
 * the behaviour is pinned here instead — which is the better place for it
 * anyway: what matters is that a toggle is a toggle, that two people's votes are
 * independent, and that "have I endorsed this" is answered per reader rather
 * than leaking whose votes they are.
 */
describe.skipIf(!hasDatabase)("lab badges", () => {
  let sql: postgres.Sql;
  const TAG = "grains-test-badges";
  const AT = { lat: 8.4304, lng: 99.9631 }; // Nakhon Si Thammarat, far from other fixtures.

  let labId: string;
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

    const [lab] = await sql<{ id: string }[]>`
      insert into labs (name_en, location, created_by)
      values (
        ${`${TAG} lab`},
        st_setsrid(st_makepoint(${AT.lng}, ${AT.lat}), 4326)::geography,
        ${users.one}
      ) returning id
    `;
    labId = lab.id;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from labs where name_en like ${`${TAG}%`}`;
    await sql`delete from users where email like ${`${TAG}%`}`;
    await sql.end();
  });

  it("endorses on the first press and retracts on the second", async () => {
    expect(await toggleBadgeVote(labId, "clean", users.one)).toEqual({
      endorsed: true,
    });
    expect(await toggleBadgeVote(labId, "clean", users.one)).toEqual({
      endorsed: false,
    });
    // And again, because a toggle that only works once is not a toggle.
    expect(await toggleBadgeVote(labId, "clean", users.one)).toEqual({
      endorsed: true,
    });

    await toggleBadgeVote(labId, "clean", users.one);
  });

  it("counts each person once and lets them vote independently", async () => {
    await toggleBadgeVote(labId, "fast", users.one);
    await toggleBadgeVote(labId, "fast", users.two);

    const lab = await getLab(labId);
    expect(lab?.badges.find((b) => b.key === "fast")?.count).toBe(2);

    // One retracting does not touch the other's vote.
    await toggleBadgeVote(labId, "fast", users.one);
    const after = await getLab(labId);
    expect(after?.badges.find((b) => b.key === "fast")?.count).toBe(1);

    await toggleBadgeVote(labId, "fast", users.two);
  });

  describe("whose vote it is", () => {
    beforeAll(async () => {
      await toggleBadgeVote(labId, "color", users.one);
    });

    it("marks the badge for the person who endorsed it", async () => {
      const lab = await getLab(labId, users.one);
      const color = lab?.badges.find((b) => b.key === "color");
      expect(color?.count).toBe(1);
      expect(color?.endorsedByViewer).toBe(true);
    });

    it("does not mark it for anybody else, though the count is public", async () => {
      const lab = await getLab(labId, users.two);
      const color = lab?.badges.find((b) => b.key === "color");
      expect(color?.count).toBe(1);
      expect(color?.endorsedByViewer).toBe(false);
    });

    it("is false throughout for a signed-out reader", async () => {
      const lab = await getLab(labId);
      expect(lab?.badges.every((b) => b.endorsedByViewer === false)).toBe(true);
      // The counts still show: what somebody endorsed is public, who they are
      // is not.
      expect(lab?.badges.find((b) => b.key === "color")?.count).toBe(1);
    });
  });

  it("refuses a badge key that is not in the roster", async () => {
    // The roster is fixed and product-defined (PRD C #1), and the schema is what
    // enforces it — there is no such thing as endorsing a badge nobody defined.
    //
    // The SQLSTATE is asserted on `cause` rather than on the error itself:
    // these queries go through Drizzle, which wraps the driver's error in a
    // DrizzleQueryError. The schema-invariant tests assert on the bare error
    // because they hold a raw postgres.js client instead.
    await expect(
      toggleBadgeVote(labId, "not-a-real-badge", users.one),
    ).rejects.toMatchObject({ cause: { code: FOREIGN_KEY_VIOLATION } });
  });

  it("keeps every badge in the roster at zero rather than dropping it", async () => {
    const lab = await getLab(labId);
    expect(lab?.badges).toHaveLength(4);
    expect(lab?.badges.some((b) => b.count === 0)).toBe(true);
  });
});
