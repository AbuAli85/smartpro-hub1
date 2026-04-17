import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/** Pure: keep newest lines that fit within trim target (used when log exceeds max). */
function trimLogContentToTarget(raw: string): string {
  const lines = raw.split("\n");
  const keptLines: string[] = [];
  let keptBytes = 0;
  const targetSize = TRIM_TARGET_BYTES;
  for (let i = lines.length - 1; i >= 0; i--) {
    const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
    if (keptBytes + lineBytes > targetSize) break;
    keptLines.unshift(lines[i]);
    keptBytes += lineBytes;
  }
  return keptLines.join("\n");
}

/** Write full `content` to `logPath` via temp file + rename (atomic replace). */
function atomicReplaceLogFile(logPath: string, content: string): void {
  let tmpPath: string | null = `${logPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, content, "utf-8");
    fs.renameSync(tmpPath, logPath);
    tmpPath = null;
  } finally {
    if (tmpPath) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    }
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  const block =
    entries
      .map((entry) => {
        const ts = new Date().toISOString();
        return `[${ts}] ${JSON.stringify(entry)}`;
      })
      .join("\n") + "\n";

  // Single read of current file, append in memory, then one atomic write — avoids
  // append + re-read on the same path (CodeQL js/file-system-race).
  let prev = "";
  try {
    prev = fs.readFileSync(logPath, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      return;
    }
  }

  const combined = prev + block;
  const toWrite =
    Buffer.byteLength(combined, "utf-8") <= MAX_LOG_SIZE_BYTES
      ? combined
      : trimLogContentToTarget(combined);

  try {
    atomicReplaceLogFile(logPath, toWrite);
  } catch {
    /* ignore log write errors */
  }
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

// Debug/runtime plugins are development-only tools and must never ship in production builds.
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const plugins = [
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  // vite-plugin-manus-runtime and the debug log collector are only needed during
  // local development. Exclude them from production to avoid shipping dev tooling.
  ...(!IS_PRODUCTION ? [vitePluginManusRuntime(), vitePluginManusDebugCollector()] : []),
];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
    // Dev-only plugins (e.g. Manus runtime) can resolve a second copy of React and break hooks / i18n.
    dedupe: ["react", "react-dom"],
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    // When the Vite dev server is run on its own (without Express), forward API calls to the app server.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
    hmr: {
      clientPort: 443,
      protocol: "wss",
      // When the app is opened via a tunnel URL, set this so the HMR client targets the public host
      // (e.g. VITE_HMR_HOST=3000-xxxx.sg1.manus.computer). Omit for plain localhost.
      ...(process.env.VITE_HMR_HOST ? { host: process.env.VITE_HMR_HOST } : {}),
    },
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
