/**
 * Development fixtures — invented labs, not real ones.
 *
 * A6 replaces the rows below with the ten real Bangkok labs, verified by a
 * person. Until then /labs cannot be looked at without something on the map,
 * and reviewing a discovery UI against an empty database only ever proves the
 * empty states.
 *
 * Every row is namespaced by SEED_TAG and `--clean` removes exactly those, so
 * this can never touch a lab someone actually added. It reads .env.local the
 * same way tests/setup.ts and drizzle.config.ts do, and talks to DIRECT_URL
 * because it is a script rather than the running app.
 *
 *   pnpm db:seed:dev            insert (removing any previous run first)
 *   pnpm db:seed:dev --clean    remove and stop
 */
import { existsSync } from "node:fs";
import postgres from "postgres";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set — copy .env.example to .env.local.");
  process.exit(1);
}

const SEED_TAG = "[dev-seed]";
const SEED_EMAIL = "dev-seed@grains.invalid";

/**
 * Three contributors, not one.
 *
 * Badge endorsements are unique per (lab, badge, user), so a single seed user
 * can only ever produce counts of 1 — and a bar chart where every bar is full
 * proves nothing about a component whose whole job is showing relative
 * strength. The edit log wants more than one author for the same reason.
 */
const SEED_USERS = [
  { email: SEED_EMAIL, name: "Dev Seed", username: "dev_seed" },
  { email: "dev-seed-2@grains.invalid", name: "Dev Seed Two", username: "nok" },
  {
    email: "dev-seed-3@grains.invalid",
    name: "Dev Seed Three",
    username: "somchai",
  },
];

const SEED_EMAILS = SEED_USERS.map((u) => u.email);

/** Catalog entries for the inventory section; B's real seed replaces these. */
const FILM_STOCKS = [
  { name: "Kodak Portra 400", iso: 400, formats: ["135", "120"] },
  { name: "Kodak Vision3 500T", iso: 500, formats: ["135"] },
  { name: "Ilford HP5 Plus", iso: 400, formats: ["135", "120"] },
];

const WEEKDAY = { open: "10:00", close: "19:00" };
const WEEKEND = { open: "11:00", close: "18:00" };
const CLOSED = { closed: true };
// Index 0 is Sunday, matching extract(dow).
const USUAL = [CLOSED, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKEND];
const ALWAYS = Array.from({ length: 7 }, () => ({
  open: "00:00",
  close: "23:59",
}));

const LABS = [
  {
    nameEn: "Sukhumvit Film Works",
    nameTh: "สุขุมวิทฟิล์มเวิร์คส",
    areaEn: "Phrom Phong",
    areaTh: "พร้อมพงษ์",
    lat: 13.7305,
    lng: 100.5698,
    completeness: 95,
    hours: ALWAYS,
    processes: ["c41", "bw", "e6"],
    scanners: ["Noritsu", "Fuji Frontier"],
    services: ["dropbox", "hi_res_scan", "push_pull"],
    pricing: [
      ["c41", "135", 180, 1, 2],
      ["c41", "120", 220, 1, 2],
      ["bw", "135", 250, 3, 5],
      ["e6", "135", 400, 5, 7],
    ],
    street: "12 Sukhumvit Soi 33",
    landmarkNote:
      "Second floor, above the coffee shop — the street door is unmarked.",
    customServices: [["Same-day rush", "add ฿100"]],
    supplies: ["chemicals", "tanks_reels", "film_sold"],
    customSupplies: ["Changing bags"],
    contacts: [
      ["phone", "02 123 4567"],
      ["line", "@sukhumvitfilm"],
      ["instagram", "@sukhumvitfilmworks"],
      ["website", "https://example.invalid/sukhumvit"],
    ],
    stock: [
      [0, ["135", "120"]],
      [2, ["135"]],
    ],
    // Counts of 3, 2, 1 and 0 — one of each shape the badge list must render.
    badges: [
      ["fast", [0, 1, 2]],
      ["clean", [0, 1]],
      ["color", [2]],
    ],
    history: [
      [
        1,
        "Corrected the C-41 price after calling them.",
        [{ path: "pricing.c41.135.price_thb", from: 200, to: 180 }],
      ],
      [
        2,
        null,
        [
          { path: "hours.0.closed", from: true, to: false },
          { path: "scanners.Fuji Frontier", from: null, to: true },
        ],
      ],
      [
        0,
        "Created the listing.",
        [{ path: "name_en", from: null, to: "Sukhumvit Film Works" }],
      ],
    ],
  },
  {
    nameEn: "Ari Analog",
    nameTh: "อารีย์อนาล็อก",
    areaEn: "Ari",
    areaTh: "อารีย์",
    lat: 13.7797,
    lng: 100.5443,
    completeness: 70,
    hours: USUAL,
    processes: ["c41", "bw"],
    scanners: ["SP-3000"],
    services: ["mail_in", "negative_pickup"],
    pricing: [
      // 120 deliberately absent: the matrix must show "not entered" for a
      // format of a process the lab does offer.
      ["c41", "135", 150, 2, 3],
      ["bw", "135", 200, 4, 6],
    ],
    street: "5 Phahonyothin Soi 7",
    supplies: ["chemicals"],
    contacts: [
      ["phone", "081-234-5678"],
      ["facebook", "AriAnalogBKK"],
    ],
    stock: [[1, ["135"]]],
    badges: [["clean", [1]]],
    history: [[1, null, [{ path: "services.mail_in", from: null, to: true }]]],
  },
  {
    nameEn: "Charoenkrung Darkroom",
    nameTh: "ห้องมืดเจริญกรุง",
    areaEn: "Bang Rak",
    areaTh: "บางรัก",
    lat: 13.7229,
    lng: 100.5145,
    completeness: 60,
    hours: USUAL,
    processes: ["bw"],
    scanners: ["Flatbed"],
    services: ["push_pull"],
    pricing: [["bw", "135", 190, 5, 7]],
  },
  {
    nameEn: "Silom Cine Lab",
    nameTh: "สีลมซีเนแล็บ",
    areaEn: "Bang Rak",
    areaTh: "บางรัก",
    lat: 13.7269,
    lng: 100.5241,
    completeness: 85,
    hours: ALWAYS,
    processes: ["c41", "ecn2"],
    scanners: ["Noritsu"],
    services: ["dropbox", "mail_in", "negative_deliver"],
    pricing: [
      ["c41", "135", 170, 1, 2],
      ["ecn2", "135", 320, 3, 5],
    ],
  },
  {
    nameEn: "Thonglor Colour",
    nameTh: "ทองหล่อคัลเลอร์",
    areaEn: "Thong Lo",
    areaTh: "ทองหล่อ",
    lat: 13.7245,
    lng: 100.5822,
    completeness: 40,
    hours: USUAL,
    processes: ["c41"],
    scanners: [],
    services: [],
    pricing: [],
  },
  {
    nameEn: "Old Town Negatives",
    nameTh: "เนกาทีฟเมืองเก่า",
    areaEn: "Phra Nakhon",
    areaTh: "พระนคร",
    lat: 13.7539,
    lng: 100.4966,
    completeness: 55,
    hours: USUAL,
    status: "temporarily_closed",
    statusNote: "Renovating until further notice",
    processes: ["c41", "bw"],
    scanners: ["Fuji Frontier"],
    services: ["negative_pickup"],
    pricing: [["c41", "135", 160, 2, 4]],
    landmarkNote: "Down the soi beside the temple, blue shutter.",
    contacts: [["phone", "02 987 6543"]],
    history: [
      [
        2,
        "Renovating — spoke to the owner.",
        [{ path: "status", from: "open", to: "temporarily_closed" }],
      ],
    ],
  },
];

const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });

async function clean() {
  // Order matters, and only the first line is obvious. `labs` cascades to its
  // children, but `edit_history.entity_id` is a plain uuid with no foreign key
  // — history is meant to outlive what it describes — so those rows have to go
  // explicitly or they hold a reference to the users deleted below.
  await sql`
    delete from edit_history
    where editor_id in (select id from users where email = any(${SEED_EMAILS}))
  `;
  await sql`delete from labs where name_en like ${`${SEED_TAG}%`}`;
  await sql`delete from film_stocks where name like ${`${SEED_TAG}%`}`;
  await sql`delete from users where email = any(${SEED_EMAILS})`;
}

try {
  await clean();

  if (process.argv.includes("--clean")) {
    console.log("dev seed removed");
  } else {
    const users = [];
    for (const seedUser of SEED_USERS) {
      const [inserted] = await sql`
        insert into users (email, name, username)
        values (${seedUser.email}, ${seedUser.name}, ${seedUser.username})
        returning id
      `;
      users.push(inserted);
    }
    const user = users[0];

    const filmStocks = [];
    for (const stock of FILM_STOCKS) {
      const [inserted] = await sql`
        insert into film_stocks (name, iso, formats, created_by)
        values (
          ${`${SEED_TAG} ${stock.name}`}, ${stock.iso},
          ${sql.array(stock.formats)}::film_format[], ${user.id}
        ) returning id
      `;
      filmStocks.push(inserted);
    }

    for (const lab of LABS) {
      const [row] = await sql`
        insert into labs (
          name_en, name_th, area_en, area_th, location, street, landmark_note,
          hours, status, status_note, completeness, created_by
        ) values (
          ${`${SEED_TAG} ${lab.nameEn}`}, ${lab.nameTh},
          ${lab.areaEn}, ${lab.areaTh},
          st_setsrid(st_makepoint(${lab.lng}, ${lab.lat}), 4326)::geography,
          ${lab.street ?? null}, ${lab.landmarkNote ?? null},
          ${sql.json(lab.hours)},
          ${lab.status ?? "open"}::lab_status, ${lab.statusNote ?? null},
          ${lab.completeness}, ${user.id}
        ) returning id
      `;

      for (const process of lab.processes) {
        await sql`insert into lab_processes (lab_id, process)
                  values (${row.id}::uuid, ${process}::chem_process)`;
      }
      for (const model of lab.scanners) {
        await sql`insert into lab_scanners (lab_id, model)
                  values (${row.id}::uuid, ${model})`;
      }
      for (const key of lab.services) {
        await sql`insert into lab_services (lab_id, service_key)
                  values (${row.id}::uuid, ${key})`;
      }
      for (const [process, format, price, min, max] of lab.pricing) {
        await sql`
          insert into lab_pricing
            (lab_id, process, format, price_thb, turnaround_min_d, turnaround_max_d)
          values (${row.id}::uuid, ${process}::chem_process, ${format}::film_format,
                  ${price}, ${min}, ${max})
        `;
      }

      // Freeform entries, which display but never filter (Decision Ledger #2).
      // Seeded so the detail page is reviewed with both kinds present — the
      // rendering rule is that they are indistinguishable to a reader.
      for (const [label, note] of lab.customServices ?? []) {
        await sql`insert into lab_services (lab_id, custom_label, note)
                  values (${row.id}::uuid, ${label}, ${note ?? null})`;
      }
      for (const key of lab.supplies ?? []) {
        await sql`insert into lab_supplies (lab_id, supply_key)
                  values (${row.id}::uuid, ${key})`;
      }
      for (const label of lab.customSupplies ?? []) {
        await sql`insert into lab_supplies (lab_id, custom_label)
                  values (${row.id}::uuid, ${label})`;
      }

      for (const [position, [channel, value]] of (
        lab.contacts ?? []
      ).entries()) {
        await sql`
          insert into lab_contacts (lab_id, channel, value, position)
          values (${row.id}::uuid, ${channel}::contact_channel, ${value}, ${position})
        `;
      }

      for (const [stockIndex, formats] of lab.stock ?? []) {
        await sql`
          insert into lab_stock (lab_id, film_stock_id, formats)
          values (${row.id}::uuid, ${filmStocks[stockIndex].id}::uuid,
                  ${sql.array(formats)}::film_format[])
        `;
      }

      for (const [badgeKey, voterIndexes] of lab.badges ?? []) {
        for (const voter of voterIndexes) {
          await sql`
            insert into lab_badge_votes (lab_id, badge_key, user_id)
            values (${row.id}::uuid, ${badgeKey}, ${users[voter].id})
          `;
        }
      }

      // Inserted oldest-last so the identity column orders the way the log
      // reads: `listLabHistory` sorts by id desc, and seeding them in display
      // order would put "created the listing" at the top.
      for (const [editorIndex, note, changes] of [
        ...(lab.history ?? []),
      ].reverse()) {
        await sql`
          insert into edit_history (entity, entity_id, editor_id, note, changes)
          values ('lab', ${row.id}::uuid, ${users[editorIndex].id},
                  ${note}, ${sql.json(changes)})
        `;
      }
    }

    console.log(`seeded ${LABS.length} development labs`);
  }
} finally {
  await sql.end();
}
