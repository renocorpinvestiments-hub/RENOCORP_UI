/**
 * components/EmptyState.jsx — RENOCORP Empty List Placeholder  v2.0
 * ===================================================================
 * Shown when a list or feed has no items.
 *
 * Usage:
 *   <EmptyState
 *     icon="📋"
 *     title="No tasks yet"
 *     message="Check back soon — new tasks are added daily."
 *     action={{ label: "Refresh", onClick: reload }}
 *   />
 */

export function EmptyState({ icon = "📭", title, message, action }) {
  return (
    <div className="rc-empty fade-in">
      <div className="rc-empty-icon" aria-hidden="true">{icon}</div>
      {title && <div className="rc-empty-title">{title}</div>}
      {message && <p className="rc-empty-sub">{message}</p>}
      {action && (
        <button
          className="btn-secondary"
          onClick={action.onClick}
          style={{ marginTop: 18, width: "auto", padding: "9px 20px" }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default EmptyState;
