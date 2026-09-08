/**
 * components/PaginationBar.jsx — RENOCORP Pagination Controls  v2.0
 * ===================================================================
 * Accessible pagination with prev/next and page number buttons.
 * Renders nothing when there's only 1 page.
 *
 * Usage:
 *   <PaginationBar page={page} total={total} limit={20} onChange={setPage} />
 */

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

export function PaginationBar({ page = 1, total = 0, limit = 20, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;

  // Show window of max 5 pages centered on current
  const window = 2;
  const start  = Math.max(1, page - window);
  const end    = Math.min(totalPages, page + window);
  const pages  = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <nav
      className="rc-pagination"
      aria-label="Pagination"
      role="navigation"
    >
      <button
        className="rc-page-btn"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeftIcon size={16} strokeWidth={2} />
      </button>

      {start > 1 && (
        <>
          <button className="rc-page-btn" onClick={() => onChange(1)} aria-label="Page 1">1</button>
          {start > 2 && <span style={{ color: "var(--text-dim)", fontSize: 12 }}>…</span>}
        </>
      )}

      {pages.map((p) => (
        <button
          key={p}
          className={`rc-page-btn${p === page ? " active" : ""}`}
          onClick={() => onChange(p)}
          aria-label={`Page ${p}`}
          aria-current={p === page ? "page" : undefined}
        >
          {p}
        </button>
      ))}

      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span style={{ color: "var(--text-dim)", fontSize: 12 }}>…</span>}
          <button className="rc-page-btn" onClick={() => onChange(totalPages)} aria-label={`Page ${totalPages}`}>
            {totalPages}
          </button>
        </>
      )}

      <button
        className="rc-page-btn"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <ChevronRightIcon size={16} strokeWidth={2} />
      </button>
    </nav>
  );
}

export default PaginationBar;
