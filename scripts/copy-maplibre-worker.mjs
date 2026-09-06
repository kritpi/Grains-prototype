// Copies MapLibre's web worker into public/ so the browser can fetch it.
//
// MapLibre 6 ships the worker as a separate ES module and works out its URL
// relative to its own bundle: `new URL("./maplibre-gl-worker.mjs", <the module
// that is running>)`. Under Turbopack that resolves to
// /_next/static/chunks/maplibre-gl-worker.mjs, which the bundler never emits.
// The request 404s, the worker never starts, and the map renders an empty
// canvas — no error, because MapLibre loads the style and sprites on the main
// thread and only parses tiles in the worker.
//
// So we serve it ourselves and hand MapLibre the URL via `setWorkerUrl`
// (components/map/base-map.tsx). Copying at install time rather than
// committing the files keeps them pinned to whatever version the lockfile
// resolves; public/maplibre/ is gitignored for the same reason.
//
// maplibre-gl-shared.mjs comes along because the worker imports it relatively,
// which resolves next to the worker rather than into our bundle.

import { createRequire } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

// Resolved through the package rather than by path: pnpm stores the real files
// under node_modules/.pnpm/<pkg>@<version>/, so a hand-written relative path
// would be wrong.
const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const destination = join(process.cwd(), "public", "maplibre");

const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(destination, { recursive: true });
await Promise.all(
  files.map((file) => copyFile(join(dist, file), join(destination, file))),
);

console.log(`maplibre worker copied to public/maplibre (${files.join(", ")})`);
