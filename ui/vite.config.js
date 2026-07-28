import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// RENOCORP uses no CSS framework (styles.js injects a hand-built design
// system at runtime via a <style> tag — see src/App.jsx) so this config
// deliberately has no Tailwind/PostCSS plugin. If you later want utility
// classes for new pages, add tailwindcss + autoprefixer here and a
// postcss.config.js — it will coexist fine with the existing CSS-in-JS.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true, // expose on LAN — needed for testing on real phones
      proxy: {
        // Lets the dev server proxy /api to the FastAPI backend so you
        // don't need CORS configured for local dev.
        "/api": {
          target: env.VITE_API_PROXY_TARGET || "http://localhost:8000",
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: mode !== "production",
      target: "es2020",
      rollupOptions: {
        output: {
          // Keep the lazy-loaded AppShell (see App.jsx) as its own chunk —
          // matches the existing lazy() split so first paint stays small.
          manualChunks(id) {
            if (id.includes("node_modules")) return "vendor";
          },
        },
      },
    },
    preview: {
      port: 4173,
    },
  };
});
