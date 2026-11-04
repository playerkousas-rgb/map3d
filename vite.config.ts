import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";

/**
 * Split rarely-changing third-party code into its own long-cached chunks.
 * After a deploy that only touches app code, returning visitors re-download
 * just the small app chunk instead of the whole ~1.4 MB bundle
 * (dist/assets/* is served with an immutable Cache-Control, see vercel.json).
 *
 * Chunk graph is acyclic: react-vendor <- leaflet, react-vendor <- vendor -> three.
 */
function vendorChunk(id: string): string | undefined {
  // Rollup's CommonJS helpers are shared by every CJS package -> base chunk
  if (id.includes("commonjsHelpers")) return "react-vendor";
  if (!id.includes("/node_modules/")) return undefined;
  // keep CSS with the entry so stylesheet order stays exactly the same
  if (/\.css($|\?)/.test(id)) return undefined;
  if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react-vendor";
  if (/\/node_modules\/three\//.test(id)) return "three";
  if (/\/node_modules\/(leaflet|react-leaflet|@react-leaflet)\//.test(id)) return "leaflet";
  return "vendor";
}

// Production preview consumes the actual static-host security headers. Do not
// apply script-src to Vite's dev-only inline React refresh preamble.
const hosting = JSON.parse(readFileSync("./vercel.json", "utf8"));
const productionHeaders = Object.fromEntries(hosting.headers
  .filter((rule: { source: string }) => rule.source === "/(.*)")
  .flatMap((rule: { headers: { key: string; value: string }[] }) => rule.headers.map(h => [h.key, h.value])));

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    // Keep localhost/IP access and Arena previews without disabling the
    // DNS-rebinding host check for arbitrary sites. Never use `true` here.
    allowedHosts: [".e2b.app"],
  },
  preview: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app"],
    headers: productionHeaders,
  },
  plugins: [
    react({
      jsxImportSource: "@emotion/react",
      babel: {
        plugins: ["@emotion/babel-plugin"],
      },
    }),
  ],
  resolve: {
    alias: [{ find: "@", replacement: "/src" }],
  },
  build: {
    // three.js alone is ~700 kB minified; the real budget is enforced by
    // scripts/slim-guard.mjs (runs after every build)
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
});
