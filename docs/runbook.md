# Runbook

The four operations that are done under pressure, written down before they are
needed. Everything here is a thing a person does from a laptop; nothing in it
runs on a deploy.

This describes the system as it is, not as it should be. Where a step is
untested because production does not exist yet, it says so — a runbook that
quietly implies it has been rehearsed is worse than one that admits it has not.

**Nothing here reads a secret out of this repository.** Values live in
`.env.local` and in the Vercel and Supabase dashboards; `.env.example` lists the
names only.

---

## 1. The site is down

Start here, because three of the four causes below look identical from outside:
a page that will not load.

```bash
curl -s https://<production-domain>/api/health | jq
```

`GET /api/health` is infrastructure, not product API. It answers with the
deployment region and a database ping:

| Response | What it means | Go to |
| --- | --- | --- |
| `{"ok":true,"region":"sin1",...}` | Everything the app can check is fine. The problem is upstream — DNS, Vercel, or Cloudflare. | Vercel and Cloudflare status pages |
| `{"ok":false,...,"db":{"ok":false}}` | The app is running; the database is not answering. | §2 |
| `{"ok":true,"region":"iad1"}` or any region that is not `sin1` | The functions are not next to the database. Every render pays roughly 400ms. | Vercel → Project → Functions → Region |
| `{"ok":true,...,"postgis":null}` | PostGIS is missing. Every geospatial query is broken, and it will surface as confusing errors inside search rather than as an outage. | Supabase → Database → Extensions |
| No response at all | The deployment itself is failing. | §5 |

The region check is here because it is the one setting that must not be got
wrong and the one nothing else will ever tell you about.

---

## 2. The database has paused

**The most likely cause of a dead site, and it is not a failure.** Supabase's
free tier pauses a project after 7 days without a connection. The site was fine;
nobody visited.

Symptoms:

- `/api/health` returns 503 with a connection error
- **A deploy fails at build time** with `Missing or invalid environment
  variables: DATABASE_URL, …` — which is a lie. The variables are set; the
  build could not reach the database and the error surfaces at the first thing
  that reads the environment. If you have just deployed after a quiet week,
  this is what happened.

To fix: Supabase dashboard → the project → **Restore project**. It takes a few
minutes. Nothing is lost; a paused project keeps its data.

Then re-run the deploy, and confirm:

```bash
curl -s https://<production-domain>/api/health | jq '.db'
```

**The permanent fix is Supabase Pro**, which does not pause. It is on the Phase
4 list for other reasons too. Until then, this will happen again, and the
build-time symptom is the confusing part — the pages that used to be
prerendered were made dynamic precisely so a paused database is a bad request
rather than a failed deployment.

---

## 3. Migrating production

Production migrations are run by hand, from a laptop, **never on build**. With
two databases behind one repository, a build hook that migrates is a footgun.

The schema file and the migration change in the same pull request. Nothing
generates one from the other, so that parity is a review item rather than
something a tool checks — confirm it before you start.

```bash
# 1. Apply to grains-dev first, always. This is not optional:
#    a migration that has not run anywhere has not been tested.
pnpm db:migrate

# 2. Find out which project you are about to change. The command below
#    refuses to run without this and prints the exact token to use.
pnpm db:migrate:prod
```

Step 2 fails on purpose, with:

```
Refusing to touch PRODUCTION (<host>, postgres.<ref>).
Re-run naming the project explicitly:

  GRAINS_CONFIRM_PROD=postgres.<ref> pnpm db:migrate:prod
```

Copy the command it prints and run it. The token must match the database user,
so confirming requires reading which project is named — a stray
`GRAINS_DB_TARGET=prod` migrated production unintentionally once, which is why
selecting the target is no longer enough on its own.

It connects over `DIRECT_URL_PROD` — the session pooler on 5432, because DDL
needs a real session. The deployed application never reads any `_PROD`
variable; those exist so a laptop can reach production and for no other reason.

**There is no down migration.** If a migration is wrong, the recovery is §5,
not a rollback.

---

## 4. Rotating a credential

Four secrets, four different blast radii. In every case: change it at the
source, update Vercel, redeploy, **then** confirm — a rotation that is not
verified is a rotation you will discover failed at the worst moment.

### R2 (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`)

Rotate immediately if either appears in a commit, a screenshot or a log: they
are write access to the bucket.

1. Cloudflare → R2 → **Manage API tokens** → create a new token, *Object Read &
   Write*, scoped to the one bucket.
2. Put the new pair in Vercel (all environments that use that bucket) and in
   `.env.local`.
3. Redeploy, then verify before deleting the old token:
   ```bash
   pnpm r2:check
   ```
   All five lines must read `ok`. It writes an object, reads it back over the
   S3 API, fetches it through the public domain, resizes it, and deletes it.
4. Only then revoke the old token.

Reading is unaffected throughout: the bucket is public-read behind a custom
domain and needs no credential.

### `AUTH_SECRET`

```bash
openssl rand -base64 32
```

**Rotating this signs everyone out.** It is the JWT signing key; every existing
session cookie becomes invalid the moment the new value is live. That is the
correct response to a leak and an unnecessary annoyance otherwise.

### `AUTH_GOOGLE_SECRET`

Google Cloud console → the OAuth client → new secret. Sign-in breaks between
the change and the redeploy, so do it when nobody is signing in.

While you are there, confirm the authorised redirect URIs still include the
production `/api/auth/callback/google`. Preview deployments get a new hostname
every time and can never sign in — that is expected, not a misconfiguration.

### Database (`DATABASE_URL`, `DIRECT_URL`, `DIRECT_URL_PROD`)

Supabase → Settings → Database → reset the password. Every connection string
changes: both poolers, both environments. Update all of them together — a
half-rotated set means the app works and migrations do not, or the reverse, and
the two failures look nothing alike.

Remember which port belongs to which: `DATABASE_URL` is 6543, the transaction
pooler, used by the running app. `DIRECT_URL` is 5432, the session pooler, used
by drizzle-kit only.

---

## 5. Restoring from a backup

**Untested.** Production does not exist yet, so this has never been rehearsed.
Rehearse it against `grains-dev` before it is needed rather than after.

Supabase takes daily backups on paid plans. On the free tier there are none —
which means, today, **there is nothing to restore from**. That is the single
biggest gap in this document, and it is a plan decision rather than an
operational one: the answer is Supabase Pro.

When there is a backup:

1. Supabase → Database → **Backups**, and pick a point before the damage.
2. Restore into a **new project**, never over the live one. A restore in place
   destroys the evidence of what went wrong, and the first restore point chosen
   under pressure is usually the wrong one.
3. Point a local shell at the restored project and check that what was lost is
   actually there.
4. Only then decide: promote the restored project by moving `DATABASE_URL` and
   `DIRECT_URL` in Vercel, or copy the missing rows across by hand.

Two things worth knowing before you need them:

- **Objects in R2 are not in the database backup.** A restore returns `photos`
  and `lab_photos` rows pointing at storage keys; whether the objects are still
  there is a separate question. R2 has no point-in-time restore, so a deleted
  object is gone. The `pending/` lifecycle rule deletes unconfirmed uploads
  after a day, and nothing else deletes an object except the app.
- **Edit history is the product's own undo.** `edit_history` records every
  change to a lab with an author, and a revert is itself an edit. Vandalism or a
  bad edit is a revert in the application, not a database restore — reach for
  this section only when the database itself is damaged.

---

## What is deliberately not here

- **A staging tier.** Cut on purpose; see the cut table in
  [00_BACKLOG.md](00_BACKLOG.md) before reintroducing it.
- **Infrastructure as code.** Also cut. Everything above is a dashboard, which
  is the trade that was made.
- **Alerting.** There is none. Sentry is Phase 4 and not installed, so today the
  first report of an outage will be a person. Say so out loud rather than
  assuming a page will fire.
