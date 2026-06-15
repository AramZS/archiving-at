import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  publicDir: "static",
  plugins: [svelte()],
  server: {
    host: "127.0.0.1",
    // Redirect unknown paths to index.html so the SPA router handles them,
    // but exclude /view/replay/* so the static service worker files are
    // served directly rather than falling through to index.html.
    historyApiFallback: {
      rewrites: [
        // Static assets under /view/replay/ must NOT be rewritten — serve as-is.
        { from: /^\/view\/replay\//, to: ({ parsedUrl }) => parsedUrl.pathname! },
        // Everything else falls back to the SPA shell.
        { from: /.*/, to: "/index.html" },
      ],
    },
  },
});
