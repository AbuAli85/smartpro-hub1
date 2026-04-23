/**
 * Moves frontend-only packages from dependencies to devDependencies.
 * These packages are bundled by Vite into dist/public/ and are NOT needed
 * in the production Node.js container, so they bloat the Docker image.
 *
 * Keep out of this list: `react` and `lucide-react` — the server bundle imports
 * `client/src/config/platformNav.tsx` (nav integrity checks) and resolves them at runtime
 * because `scripts/bundle-server.mjs` uses packages: "external".
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)));
const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));

// Frontend-only packages: bundled by Vite, not imported by server code
const FRONTEND_ONLY = new Set([
  "@radix-ui/react-accordion",
  "@radix-ui/react-alert-dialog",
  "@radix-ui/react-aspect-ratio",
  "@radix-ui/react-avatar",
  "@radix-ui/react-checkbox",
  "@radix-ui/react-collapsible",
  "@radix-ui/react-context-menu",
  "@radix-ui/react-dialog",
  "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-hover-card",
  "@radix-ui/react-label",
  "@radix-ui/react-menubar",
  "@radix-ui/react-navigation-menu",
  "@radix-ui/react-popover",
  "@radix-ui/react-progress",
  "@radix-ui/react-radio-group",
  "@radix-ui/react-scroll-area",
  "@radix-ui/react-select",
  "@radix-ui/react-separator",
  "@radix-ui/react-slider",
  "@radix-ui/react-slot",
  "@radix-ui/react-switch",
  "@radix-ui/react-tabs",
  "@radix-ui/react-toggle",
  "@radix-ui/react-toggle-group",
  "@radix-ui/react-tooltip",
  "@tanstack/react-query",
  "@trpc/react-query",
  "@types/pdfkit",
  "embla-carousel-react",
  "react-day-picker",
  "react-dom",
  "react-hook-form",
  "react-i18next",
  "react-resizable-panels",
  "recharts",
  "tailwindcss-animate",
]);

const moved = [];
for (const [name, version] of Object.entries(pkg.dependencies || {})) {
  if (FRONTEND_ONLY.has(name)) {
    pkg.devDependencies = pkg.devDependencies || {};
    pkg.devDependencies[name] = version;
    delete pkg.dependencies[name];
    moved.push(name);
  }
}

// Sort devDependencies alphabetically
pkg.devDependencies = Object.fromEntries(
  Object.entries(pkg.devDependencies).sort(([a], [b]) => a.localeCompare(b))
);

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`Moved ${moved.length} packages to devDependencies:`);
moved.forEach((m) => console.log(`  - ${m}`));
console.log("\nRemaining production dependencies:", Object.keys(pkg.dependencies).length);
