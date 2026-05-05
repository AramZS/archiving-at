import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  publicDir: "static",
  server: {
    host: "127.0.0.1",
    // Redirect all unknown paths to index.html so the SPA router handles them
    historyApiFallback: true,
  },
});
