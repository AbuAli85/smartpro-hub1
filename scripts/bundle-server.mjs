/**
 * Bundles the Node server with process.env.NODE_ENV fixed to "production" so
 * esbuild can drop the dev-only Vite branch (no shell-specific --define quoting).
 */
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  entryPoints: [path.join(root, "server/_core/index.ts")],
  bundle: true,
  platform: "node",
  packages: "external",
  format: "esm",
  outfile: path.join(root, "dist/index.js"),
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});
