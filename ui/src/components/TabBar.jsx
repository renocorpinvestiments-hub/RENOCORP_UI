/**
 * components/TabBar.jsx — RENOCORP Horizontal Tab Switcher  v2.1
 * ================================================================
 * Pill-style tab bar for switching between content views.
 *
 * P2 FIX (RENOCORP_PRODUCTION_READINESS.md §5, "Accessibility"):
 * this already had role="tablist"/role="tab"/aria-selected and a
 * roving tabIndex (0 on the active tab, -1 on the rest) — but no
 * keydown handler. Per the WAI-ARIA Authoring Practices tablist
 * pattern (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), a
 * tablist MUST support:
 *   - ArrowLeft / ArrowRight: move focus to the previous/next tab
 *     (wrapping at the ends)
 *   - Home / End: jump to the first/last tab
 * A screen reader announces "tab, 1 of 4" and the user's learned
 * expectation is that arrow keys work — shipping the roles without
 * the keyboard behavior is arguably worse than not using the
 * pattern at all, since it sets an expectation the widget doesn't
 * meet. This version selects (not just focuses) the tab on arrow
 * navigation, matching the "automatic activation" variant of the
 * pattern, which is standard for lightweight content-filter tabs
 * like this one (as opposed to "manual activation", better suited
 * to tabs with expensive panel content).
 *
 * Usage:
 *   <TabBar
 *     tabs={[{ key: "all", label: "All" }, { key: "videos", label: "Videos" }]}
 *     active="all"
 *     onChange={(key) => setTab(key)}
 *   />
 */

import { useCallback, useRef } from "react";

export function TabBar({ tabs = [], active, onChange }) {
  const btnRefs = useRef(new Map());

  const focusAndSelect = useCallback(
    (index) => {
      const count = tabs.length;
      if (count === 0) return;
      const wrapped = ((index % count) + count) % count; // wrap both directions
      const tab = tabs[wrapped];
      if (!tab) return;
      onChange(tab.key);
      // Move DOM focus to match the new roving tabIndex — the
      // active tab always renders tabIndex=0, so this keeps focus
      // visually and programmatically in sync with selection.
      requestAnimationFrame(() => {
        btnRefs.current.get(tab.key)?.focus();
      });
    },
    [tabs, onChange]
  );

  const handleKeyDown = useCallback(
    (e) => {
      const currentIndex = tabs.findIndex((t) => t.key === active);
      if (currentIndex === -1) return;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          focusAndSelect(currentIndex + 1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          focusAndSelect(currentIndex - 1);
          break;
        case "Home":
          e.preventDefault();
          focusAndSelect(0);
          break;
        case "End":
          e.preventDefault();
          focusAndSelect(tabs.length - 1);
          break;
        default:
          break;
      }
    },
    [tabs, active, focusAndSelect]
  );

  return (
    <div className="rc-tabs" role="tablist" aria-label="Content tabs" onKeyDown={handleKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          ref={(el) => {
            if (el) btnRefs.current.set(tab.key, el);
            else btnRefs.current.delete(tab.key);
          }}
          role="tab"
          aria-selected={active === tab.key}
          className={`rc-tab-btn${active === tab.key ? " active" : ""}`}
          onClick={() => onChange(tab.key)}
          tabIndex={active === tab.key ? 0 : -1}
        >
          {tab.icon && (
            <span style={{ marginRight: 5, verticalAlign: "middle" }} aria-hidden="true">
              {tab.icon}
            </span>
          )}
          {tab.label}
          {tab.count != null && (
            <span
              style={{
                marginLeft: 6,
                background: active === tab.key ? "var(--accent-dim)" : "var(--surface-3)",
                color: active === tab.key ? "var(--accent)" : "var(--text-muted)",
                borderRadius: 20,
                padding: "1px 7px",
                fontSize: 10,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
              }}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export default TabBar;
