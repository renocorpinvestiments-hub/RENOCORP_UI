// src/test/setup.js
// NEW FILE — P2 fix. Global test setup for vitest: registers
// @testing-library/jest-dom matchers and polyfills a couple of
// browser APIs jsdom doesn't implement, which several components
// under test rely on (Modal/TabBar use requestAnimationFrame;
// styles.js and media-query-driven components reference
// matchMedia).

import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

if (typeof window !== "undefined" && !window.requestAnimationFrame) {
  window.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
}
