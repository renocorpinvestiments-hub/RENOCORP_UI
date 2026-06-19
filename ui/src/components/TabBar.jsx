/**
 * components/TabBar.jsx — RENOCORP Horizontal Tab Switcher  v2.0
 * ================================================================
 * Pill-style tab bar for switching between content views.
 *
 * Usage:
 *   <TabBar
 *     tabs={[{ key: "all", label: "All" }, { key: "videos", label: "Videos" }]}
 *     active="all"
 *     onChange={(key) => setTab(key)}
 *   />
 */

export function TabBar({ tabs = [], active, onChange }) {
  return (
    <div className="rc-tabs" role="tablist" aria-label="Content tabs">
      {tabs.map((tab) => (
        <button
          key={tab.key}
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
