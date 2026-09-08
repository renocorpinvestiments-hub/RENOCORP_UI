/**
 * components/StatCard.jsx — RENOCORP Metric Display Card  v2.0
 * ==============================================================
 * Displays a single KPI with label, value, optional sub-label,
 * optional icon, and an optional accent (green) variant.
 *
 * Usage:
 *   <StatCard label="Balance" value="UGX 10,000" accent />
 *   <StatCard label="Invites" value={5} sub="this month" icon={<UsersIcon />} />
 */

export function StatCard({ label, value, sub, accent = false, icon, onClick }) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      className={`dash-card${accent ? " stat-card-accent" : ""}`}
      onClick={onClick}
      style={onClick ? { cursor: "pointer", border: "none", textAlign: "left", width: "100%" } : undefined}
    >
      <h3>{label}</h3>
      <div
        className="dash-card-value"
        style={accent ? { color: "var(--accent)" } : undefined}
      >
        {icon && (
          <span
            style={{ marginRight: 6, opacity: 0.7, verticalAlign: "middle", display: "inline-flex" }}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        {value ?? "—"}
      </div>
      {sub && <div className="dash-card-sub">{sub}</div>}
    </Tag>
  );
}

export default StatCard;
