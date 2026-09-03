/**
 * components/Card.jsx — RENOCORP Surface Card Container  v2.0
 * =============================================================
 * A styled surface card for grouping related content.
 *
 * Usage:
 *   <Card>content</Card>
 *   <Card title="Withdrawal History" action={<button>View All</button>}>
 *     ...
 *   </Card>
 *   <Card accent>highlighted card</Card>
 */

export function Card({
  children,
  title,
  action,
  accent = false,
  style,
  className = "",
  onClick,
}) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      className={`dash-section ${className}`}
      style={{
        ...(accent ? { borderColor: "var(--accent-border)" } : {}),
        ...(onClick ? { cursor: "pointer", width: "100%", textAlign: "left", background: "none" } : {}),
        ...style,
      }}
      onClick={onClick}
    >
      {(title || action) && (
        <div className="dash-section-header">
          {title && <h3>{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}

export default Card;
