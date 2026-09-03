// vitest.config.js
// NEW FILE — P2 fix (RENOCORP_PRODUCTION_READINESS.md §5,
// "Accessibility": "run an automated a11y pass (axe-core) given
// this is a consumer-facing money app"). Also lays the groundwork
// for the P1 frontend test suite (AuthContext, api.js refresh
// logic) referenced in the roadmap, without claiming that broader
// suite is complete here — this config + src/test/setup.js +
// src/test/a11y/*.test.jsx are the P2-scoped piece: automated
// accessibility regression tests.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    globals: true,
    css: false,
  },
});
