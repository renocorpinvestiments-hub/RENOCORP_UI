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
          // P2 fix (RENOCORP_PRODUCTION_READINESS.md §5, "Frontend
          // bundle": "audit whether admin/* (10 files) is
          // code-split from the main user bundle, since most users
          // never touch admin views"). AUDIT RESULT: every
          // admin/*.jsx screen was already behind its own
          // `lazy(() => import(...))` in shell/AppShell.jsx, so
          // Rollup was already emitting each as a separate chunk,
          // fetched only when an admin user navigates to that
          // route — non-admin users never download any admin code.
          // This manualChunks addition is a refinement, not a fix:
          // it groups the ~10 admin screens into ONE "admin" chunk
          // (instead of ~10 tiny separate chunks) so an admin
          // navigating between admin screens pays one shared-chunk
          // fetch instead of many small ones, while still keeping
          // that entire chunk out of the non-admin bundle.
          manualChunks(id) {
            if (id.includes("node_modules")) return "vendor";
            if (id.includes("/src/admin/")) return "admin";
          },
        },
      },
    },
    preview: {
      port: 4173,
    },
  };
});
