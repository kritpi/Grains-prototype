import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendor bundles copied out of node_modules at install time by
    // scripts/copy-maplibre-worker.mjs — minified, not ours to lint.
    "public/maplibre/**",
    // Phase 2's parallel tracks live in worktrees under .claude/worktrees/.
    // Each is a full checkout of this same repository, so linting from the root
    // would walk into them and report every file twice under a second path —
    // including their copied maplibre bundles, which the root-relative pattern
    // above does not match. A worktree lints itself.
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
