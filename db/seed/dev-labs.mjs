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
      ["c41", "135", 150, 2, 3],
      ["bw", "135", 200, 4, 6],
    ],
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
  },
];

const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });

async function clean() {
  await sql`delete from labs where name_en like ${`${SEED_TAG}%`}`;
  await sql`delete from users where email = ${SEED_EMAIL}`;
}

try {
  await clean();

  if (process.argv.includes("--clean")) {
    console.log("dev seed removed");
  } else {
    const [user] = await sql`
      insert into users (email, name, username)
      values (${SEED_EMAIL}, 'Dev Seed', 'dev_seed')
      returning id
    `;

    for (const lab of LABS) {
      const [row] = await sql`
        insert into labs (
          name_en, name_th, area_en, area_th, location, hours,
          status, status_note, completeness, created_by
        ) values (
          ${`${SEED_TAG} ${lab.nameEn}`}, ${lab.nameTh},
          ${lab.areaEn}, ${lab.areaTh},
          st_setsrid(st_makepoint(${lab.lng}, ${lab.lat}), 4326)::geography,
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
    }

    console.log(`seeded ${LABS.length} development labs`);
  }
} finally {
  await sql.end();
}
