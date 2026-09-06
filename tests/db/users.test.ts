import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { UNIQUE_VIOLATION, hasDatabase, testClient } from "./client";

/**
 * The two guarantees `claimUsername` leans on the database for.
 *
 * Both are tested as SQL rather than through the query function, because the
 * point is that the *database* enforces them: a test that went through
 * application code could pass while the constraint was missing.
 */
describe.skipIf(!hasDatabase)("username claiming", () => {
  let sql: postgres.Sql;

  beforeAll(() => {
    sql = testClient();
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("treats usernames as case-insensitive when deciding uniqueness", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`
          insert into users (email, username)
          values ('claim-a@example.com', 'somchai')
        `;
        // A different capitalisation is the same name to a reader, and the
        // lower(username) index is what makes it the same name to Postgres.
        await tx`
          insert into users (email, username)
          values ('claim-b@example.com', 'SomChai')
        `;
      }),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("lets many users have no username at all", async () => {
    let count = 0;
    await sql
      .begin(async (tx) => {
        await tx`insert into users (email) values ('claim-c@example.com')`;
        await tx`insert into users (email) values ('claim-d@example.com')`;
        const [row] = await tx<{ n: number }[]>`
          select count(*)::int as n from users where username is null
        `;
        count = row.n;
        throw new Rollback();
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });

    // A partial unique index would be needed for this to hold if NULLs
    // collided; they do not, and this pins that behaviour down.
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("claims exactly once — a second claim updates no rows", async () => {
    let first: string | null = null;
    let second: number | null = null;

    await sql
      .begin(async (tx) => {
        const [user] = await tx<{ id: string }[]>`
          insert into users (email) values ('claim-e@example.com') returning id
        `;

        const claimed = await tx<{ username: string }[]>`
          update users set username = 'firstname'
          where id = ${user.id} and username is null
          returning username
        `;
        first = claimed[0]?.username ?? null;

        // The same guard, run again. It must match nothing rather than
        // overwrite, which is why the condition lives in the WHERE clause and
        // not in a read-then-write.
        const again = await tx<{ username: string }[]>`
          update users set username = 'secondname'
          where id = ${user.id} and username is null
          returning username
        `;
        second = again.length;

        throw new Rollback();
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });

    expect(first).toBe("firstname");
    expect(second).toBe(0);
  });
});

/** Sentinel used to roll back a transaction whose writes should not persist. */
class Rollback extends Error {}
