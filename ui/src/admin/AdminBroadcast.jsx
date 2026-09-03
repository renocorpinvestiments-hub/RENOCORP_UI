import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Megaphone, Send, Check, CheckCheck, Pin, Users, MessageSquare,
  Search, X, AlertTriangle,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { newIdempotencyKey } from '../utils/idempotency';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Spinner } from '../components/Spinner';
import { EmptyState } from '../components/EmptyState';

/**
 * admin/AdminBroadcast.jsx
 * =========================
 * P0 FIX (audit findings #7): this panel previously called
 * `api.admin.broadcastStats()` and `api.admin.broadcastHistory()` —
 * neither existed anywhere in api.js, so both calls threw
 * `TypeError: ... is not a function` on every load, and the "send"
 * action posted through the NOTIFICATIONS module's push-broadcast
 * (`api.admin.broadcast` → POST /api/notifications/admin/broadcast)
 * instead of the actual, fully-built `modules/broadcasts/broadcasts.py`
 * backend module (11 endpoints at /api/broadcasts/*: create, edit,
 * delete, pin, receipts, admin stats, admin feed, public feed,
 * mark-read, live feed) — which had ZERO frontend wiring anywhere in
 * this codebase (no `URLS.BROADCASTS`, no `api.broadcasts` namespace).
 *
 * This rewrite wires this panel to the real broadcasts module end to
 * end — read (stats/feed) AND write (send) both now go through
 * `api.broadcasts.*` (see api.js), which is required for correctness,
 * not just style: fixing only the read side while leaving "send" on
 * the notifications module would mean a freshly-sent message would
 * never appear when the feed reloads, since notifications' push
 * history and broadcasts' persisted feed are two unrelated tables.
 *
 * This also means the DATA SHAPE changed. The broadcasts module has
 * no delivery tracking (no `delivered_count`/`recipients_count`/
 * `channel`), no per-user targeting on a broadcast itself, and uses
 * `caption` (not `body`) + a unix-epoch `created_at` (not an ISO
 * `sent_at` string) + cursor pagination (not page/limit) + a `pinned`
 * flag + a Redis-backed `read_count`. Every render below reflects the
 * real `BroadcastRecord` / `AdminBroadcastStats` / `BroadcastFeedPage`
 * shapes (see modules/broadcasts/broadcasts.py) instead of the
 * notifications-shaped fields (`delivery_rate`, `read_rate`,
 * `delivered_count`, `target_type`, ...) the old version rendered.
 *
 * "Direct message to one user" is INTENTIONALLY kept on the
 * notifications module (`api.admin.notifyUser`) — the broadcasts
 * module's `CreateBroadcastRequest` has no per-user target field at
 * all, it is broadcast-to-everyone by design. Since a direct push is
 * not a broadcast, it is not added to the broadcast thread below (it
 * would vanish on reload, since it was never persisted as a
 * BroadcastRecord) — it gets its own lightweight inline confirmation
 * instead of a bubble in this feed.
 */

const MAX_CAPTION_LEN = 2000; // mirrors backend's CreateBroadcastRequest.caption max_length intent

function formatClock(unixSeconds) {
  if (!unixSeconds) return '';
  try {
    return new Date(unixSeconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function dayLabel(unixSeconds) {
  if (!unixSeconds) return '';
  const d = new Date(unixSeconds * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ────────────────────────────────────────────────────────────
 * ROOT
 * ──────────────────────────────────────────────────────────── */
export default function AdminBroadcast() {
  // Cursor-based pagination, matching BroadcastFeedPage's actual
  // shape (`next_cursor` / `has_more`) — NOT page/limit, which the
  // old version incorrectly assumed.
  const [cursor, setCursor] = useState(null);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [feedError, setFeedError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  const { data: stats } = useApi(() => api.broadcasts.admin.stats(), [reloadTick]);

  const [pending, setPending] = useState(null); // optimistic in-flight broadcast
  const [directNotice, setDirectNotice] = useState(null); // { ok, message } for direct-send mode
  const threadRef = useRef(null);

  const loadFirstPage = useCallback(async () => {
    setInitialLoading(true);
    setFeedError(null);
    try {
      const page = await api.broadcasts.admin.feed();
      setItems(page?.items ?? []);
      setCursor(page?.next_cursor ?? null);
      setHasMore(!!page?.has_more);
    } catch (e) {
      setFeedError(e.message ?? 'Could not load broadcasts.');
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => { loadFirstPage(); }, [loadFirstPage, reloadTick]);

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.broadcasts.admin.feed(cursor);
      setItems((prev) => [...prev, ...(page?.items ?? [])]);
      setCursor(page?.next_cursor ?? null);
      setHasMore(!!page?.has_more);
    } catch (e) {
      setFeedError(e.message ?? 'Could not load more broadcasts.');
    } finally {
      setLoadingMore(false);
    }
  };

  const scrollToTop = useCallback(() => {
    requestAnimationFrame(() => {
      if (threadRef.current) threadRef.current.scrollTop = 0;
    });
  }, []);

  const handleBroadcastSent = useCallback(() => {
    setPending(null);
    setReloadTick((t) => t + 1);
    scrollToTop();
  }, [scrollToTop]);

  return (
    <div className="wa-shell">
      <WaHeader stats={stats} />

      <div className="wa-thread" ref={threadRef}>
        {initialLoading && (
          <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
        )}

        {!initialLoading && feedError && (
          <div className="alert alert-error" style={{ margin: 16 }}>
            {feedError}
            <button className="link-btn" style={{ marginLeft: 12 }} onClick={loadFirstPage}>Retry</button>
          </div>
        )}

        {!initialLoading && !feedError && items.length === 0 && !pending && (
          <div style={{ padding: '60px 20px' }}>
            <EmptyState message="No broadcasts sent yet. Your first announcement will appear here." />
          </div>
        )}

        <Thread items={items} pending={pending} />

        {hasMore && !initialLoading && (
          <div style={{ textAlign: 'center', margin: '12px 0' }}>
            <button className="link-btn" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? 'Loading…' : 'Load older broadcasts'}
            </button>
          </div>
        )}
      </div>

      <Composer
        onBroadcastSent={handleBroadcastSent}
        onBroadcastPending={setPending}
        onDirectResult={setDirectNotice}
      />

      {directNotice && (
        <div
          className={`alert ${directNotice.ok ? 'alert-success' : 'alert-error'}`}
          style={{ margin: '0 14px 12px' }}
        >
          {directNotice.message}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * HEADER — channel identity + real AdminBroadcastStats fields
 * ──────────────────────────────────────────────────────────── */
function WaHeader({ stats }) {
  return (
    <div className="wa-header">
      <div className="wa-header-avatar"><Megaphone size={18} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="wa-header-title">Broadcast Channel</div>
        <div className="wa-header-sub">
          {stats
            ? `${stats.total_broadcasts ?? 0} total · ${stats.published_today ?? 0} today · ${stats.total_reads_today ?? 0} reads today · ${stats.pinned_count ?? 0} pinned`
            : 'Announcements to every RENOCORP user'}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * THREAD — grouped-by-day bubble list
 * ──────────────────────────────────────────────────────────── */
function Thread({ items, pending }) {
  const grouped = useMemo(() => {
    const groups = [];
    let lastLabel = null;
    for (const item of items) {
      const label = dayLabel(item.created_at);
      if (label !== lastLabel) {
        groups.push({ type: 'divider', label, key: `div-${item.id}` });
        lastLabel = label;
      }
      groups.push({ type: 'message', item, key: item.id });
    }
    return groups;
  }, [items]);

  return (
    <div className="wa-thread-inner">
      {pending && <Bubble entry={pending} isPending />}
      {grouped.map((g) =>
        g.type === 'divider'
          ? <DayDivider key={g.key} label={g.label} />
          : <Bubble key={g.key} entry={g.item} />
      )}
    </div>
  );
}

function DayDivider({ label }) {
  return (
    <div className="wa-day-divider">
      <span>{label}</span>
    </div>
  );
}

function Bubble({ entry, isPending }) {
  const failed = entry.status === 'failed'; // only ever true for the local optimistic `pending` entry
  const deleted = entry.status === 'deleted';

  return (
    <div className="wa-row">
      <div className={`wa-bubble ${failed ? 'wa-bubble-failed' : ''} ${isPending ? 'wa-bubble-pending' : ''}`}>
        <div className="wa-bubble-meta">
          <Users size={11} />
          <span>To all users</span>
          {entry.pinned && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6 }}>
              <Pin size={10} /> Pinned
            </span>
          )}
        </div>
        {entry.title && <div className="wa-bubble-title">{entry.title}</div>}
        <div className="wa-bubble-body">
          {deleted ? <em style={{ color: 'var(--text-muted)' }}>Broadcast deleted</em> : (entry.caption ?? entry.body)}
        </div>
        <div className="wa-bubble-footer">
          {!isPending && !deleted && (
            <span className="wa-bubble-count">{entry.read_count ?? 0} read</span>
          )}
          <span className="wa-bubble-time">
            {isPending ? 'Sending…' : formatClock(entry.created_at)}
          </span>
          {failed ? (
            <AlertTriangle size={13} color="var(--danger)" />
          ) : isPending ? (
            <Check size={14} color="var(--text-muted)" />
          ) : (
            <CheckCheck size={14} color={(entry.read_count ?? 0) > 0 ? 'var(--info)' : 'var(--text-muted)'} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * COMPOSER — mode toggle (broadcast / direct), pin option, send
 * ──────────────────────────────────────────────────────────── */
function Composer({ onBroadcastSent, onBroadcastPending, onDirectResult }) {
  const [mode, setMode] = useState('broadcast'); // 'broadcast' | 'direct'
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pin, setPin] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [targetUser, setTargetUser] = useState(null);
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [userSearching, setUserSearching] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const searchTimer = useRef(null);

  const canSend = body.trim().length > 0
    && body.trim().length <= MAX_CAPTION_LEN
    && (mode === 'broadcast' || !!targetUser)
    && !sending;

  useEffect(() => {
    if (mode === 'direct' && userQuery.trim().length >= 2) {
      clearTimeout(searchTimer.current);
      setUserSearching(true);
      searchTimer.current = setTimeout(async () => {
        try {
          const res = await api.admin.users({ search: userQuery.trim(), page: 1, limit: 6 });
          setUserResults(res?.items ?? []);
          setUserDropdownOpen(true);
        } catch {
          setUserResults([]);
        } finally {
          setUserSearching(false);
        }
      }, 400);
    } else {
      setUserResults([]);
    }
    return () => clearTimeout(searchTimer.current);
  }, [userQuery, mode]);

  const resetComposer = () => {
    setTitle('');
    setBody('');
    setPin(false);
    setTargetUser(null);
    setUserQuery('');
    setUserResults([]);
  };

  const doSend = async () => {
    if (!canSend) return;
    setError(null);
    setConfirmOpen(false);
    setSending(true);

    if (mode === 'direct') {
      // Direct pushes are NOT broadcasts — the broadcasts module has
      // no per-user target field, so this can only ever go through
      // notifications' single-user push. It is intentionally not
      // added to the thread above (it wouldn't survive a reload,
      // since it's never persisted as a BroadcastRecord).
      onDirectResult(null);
      try {
        await api.admin.notifyUser(targetUser.id, {
          title: title.trim() || undefined,
          body: body.trim(),
        });
        onDirectResult({ ok: true, message: `Sent to ${targetUser.name ?? targetUser.email}.` });
        resetComposer();
      } catch (e) {
        onDirectResult({ ok: false, message: e.message ?? 'Could not send this message.' });
      } finally {
        setSending(false);
      }
      return;
    }

    // Broadcast mode — persisted, appears in the feed on reload.
    const draft = {
      id: `pending-${Date.now()}`,
      title: title.trim() || null,
      caption: body.trim(),
      pinned: pin,
      created_at: Math.floor(Date.now() / 1000),
      status: 'sending',
    };
    onBroadcastPending(draft);

    try {
      await api.broadcasts.create({
        type: 'text',
        caption: body.trim(),
        title: title.trim() || undefined,
        media: [],
        pin,
        idempotency_key: newIdempotencyKey(),
      });
      resetComposer();
      onBroadcastSent();
    } catch (e) {
      onBroadcastPending(null);
      setError(e.message ?? 'Could not send this broadcast. It has not been delivered.');
    } finally {
      setSending(false);
    }
  };

  const handleSendClick = () => {
    if (!canSend) return;
    if (mode === 'broadcast') {
      setConfirmOpen(true);
    } else {
      doSend();
    }
  };

  return (
    <div className="wa-composer">
      <div className="wa-mode-toggle">
        <button
          className={`wa-mode-btn ${mode === 'broadcast' ? 'active' : ''}`}
          onClick={() => setMode('broadcast')}
        >
          <Users size={13} /> Broadcast to all
        </button>
        <button
          className={`wa-mode-btn ${mode === 'direct' ? 'active' : ''}`}
          onClick={() => setMode('direct')}
        >
          <MessageSquare size={13} /> Direct message
        </button>
      </div>

      {mode === 'broadcast' && (
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8, cursor: 'pointer',
        }}>
          <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} />
          <Pin size={12} /> Pin to top of feed
        </label>
      )}

      {mode === 'direct' && (
        <div className="wa-user-search">
          {targetUser ? (
            <div className="wa-user-pill">
              <span>{targetUser.name ?? targetUser.email}</span>
              <button onClick={() => setTargetUser(null)} aria-label="Remove recipient"><X size={13} /></button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="admin-input wa-user-input"
                placeholder="Search a user by name or email…"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                onFocus={() => userResults.length > 0 && setUserDropdownOpen(true)}
              />
              {userDropdownOpen && (userResults.length > 0 || userSearching) && (
                <div className="wa-user-dropdown">
                  {userSearching && <div className="wa-user-option" style={{ color: 'var(--text-muted)' }}>Searching…</div>}
                  {!userSearching && userResults.map((u) => (
                    <button
                      key={u.id}
                      className="wa-user-option"
                      onClick={() => {
                        setTargetUser(u);
                        setUserDropdownOpen(false);
                        setUserQuery('');
                      }}
                    >
                      <span>{u.name ?? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{u.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="wa-input-row">
        <div className="wa-input-stack">
          <input
            className="wa-title-input"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
          />
          <textarea
            className="wa-body-input"
            placeholder={mode === 'broadcast' ? 'Write an announcement…' : 'Type a message to this user…'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={1}
            maxLength={MAX_CAPTION_LEN}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendClick();
              }
            }}
          />
        </div>
        <button
          className="wa-send-btn"
          disabled={!canSend}
          onClick={handleSendClick}
          aria-label="Send message"
        >
          <Send size={17} />
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 8 }}>{error}</div>}

      <ConfirmDialog
        open={confirmOpen}
        title="Publish broadcast?"
        message={`This announcement will go out to every RENOCORP user${pin ? ' and be pinned to the top of the feed' : ''}. It can be edited or deleted afterward, but the initial push can't be recalled.`}
        confirmLabel="Publish"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={doSend}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * SCOPED STYLES — WhatsApp-inspired dark chat, built from
 * existing RENOCORP design tokens (no new global CSS required)
 * ──────────────────────────────────────────────────────────── */
const style = document.createElement('style');
style.setAttribute('data-scope', 'admin-broadcast');
if (!document.querySelector('style[data-scope="admin-broadcast"]')) {
  style.textContent = `
    .wa-shell {
      display: flex;
      flex-direction: column;
      height: calc(100dvh - var(--nav-height, 60px) - 24px);
      max-height: 820px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .wa-header {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 18px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    .wa-header-avatar {
      width: 38px; height: 38px; border-radius: 50%;
      background: var(--accent-dim); color: var(--accent);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .wa-header-title { font-family: var(--font-display); font-weight: 700; font-size: 14px; }
    .wa-header-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; font-family: var(--font-mono); }

    .wa-thread {
      flex: 1; overflow-y: auto;
      background-image: radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px);
      background-size: 16px 16px;
      background-color: #060a0d;
    }
    .wa-thread-inner { padding: 18px 16px 8px; display: flex; flex-direction: column; gap: 2px; }

    .wa-day-divider { display: flex; justify-content: center; margin: 14px 0; }
    .wa-day-divider span {
      background: var(--surface-2); color: var(--text-muted);
      font-size: 11px; font-family: var(--font-mono);
      padding: 4px 12px; border-radius: 999px;
      border: 1px solid var(--border);
    }

    .wa-row { display: flex; justify-content: flex-end; margin-bottom: 10px; }
    .wa-bubble {
      max-width: 72%;
      background: var(--accent-dim);
      border: 1px solid var(--accent-border);
      border-radius: 14px 14px 3px 14px;
      padding: 9px 12px 7px;
      color: var(--text);
    }
    .wa-bubble-pending { opacity: 0.65; }
    .wa-bubble-failed { background: var(--danger-dim); border-color: rgba(248,113,113,0.35); }

    .wa-bubble-meta {
      display: flex; align-items: center; gap: 5px;
      font-size: 10.5px; color: var(--accent); font-family: var(--font-mono);
      margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.4px;
    }
    .wa-bubble-title { font-weight: 700; font-size: 13.5px; margin-bottom: 2px; }
    .wa-bubble-body { font-size: 13.5px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
    .wa-bubble-footer {
      display: flex; align-items: center; justify-content: flex-end; gap: 6px;
      margin-top: 5px; font-size: 10.5px; color: var(--text-muted);
    }
    .wa-bubble-count { font-family: var(--font-mono); }
    .wa-bubble-time { font-family: var(--font-mono); }

    .wa-composer {
      background: var(--surface);
      border-top: 1px solid var(--border);
      padding: 10px 14px 12px;
    }
    .wa-mode-toggle { display: flex; gap: 6px; margin-bottom: 8px; }
    .wa-mode-btn {
      display: flex; align-items: center; gap: 6px;
      background: var(--surface-2); border: 1px solid var(--border);
      color: var(--text-muted); font-family: var(--font-display);
      font-size: 11.5px; font-weight: 600; padding: 6px 12px;
      border-radius: 999px; cursor: pointer; transition: all var(--transition);
    }
    .wa-mode-btn.active { background: var(--accent-dim); border-color: var(--accent-border); color: var(--accent); }

    .wa-user-search { margin-bottom: 8px; }
    .wa-user-input { width: 100%; padding-left: 30px !important; }
    .wa-user-pill {
      display: inline-flex; align-items: center; gap: 8px;
      background: var(--info-dim); border: 1px solid rgba(96,165,250,0.35);
      color: var(--info); font-size: 12px; padding: 5px 6px 5px 12px;
      border-radius: 999px;
    }
    .wa-user-pill button { background: none; border: none; color: var(--info); cursor: pointer; display: flex; }
    .wa-user-dropdown {
      position: absolute; top: 100%; left: 0; right: 0; margin-top: 4px;
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: var(--radius); max-height: 200px; overflow-y: auto;
      z-index: 20; box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .wa-user-option {
      display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
      width: 100%; text-align: left; background: none; border: none;
      padding: 9px 12px; color: var(--text); font-size: 12.5px; cursor: pointer;
      border-bottom: 1px solid var(--border);
    }
    .wa-user-option:last-child { border-bottom: none; }
    .wa-user-option:hover { background: var(--surface-3); }

    .wa-input-row { display: flex; align-items: flex-end; gap: 10px; }
    .wa-input-stack {
      flex: 1; background: var(--surface-3); border: 1px solid var(--border);
      border-radius: var(--radius-lg); padding: 6px 14px;
    }
    .wa-title-input {
      width: 100%; background: none; border: none; outline: none;
      color: var(--text); font-family: var(--font-display); font-weight: 700;
      font-size: 12.5px; padding: 3px 0; border-bottom: 1px dashed var(--border);
      margin-bottom: 3px;
    }
    .wa-title-input::placeholder { color: var(--text-dim); font-weight: 600; }
    .wa-body-input {
      width: 100%; background: none; border: none; outline: none; resize: none;
      color: var(--text); font-size: 13.5px; line-height: 1.4; padding: 3px 0;
      font-family: inherit; max-height: 120px;
    }
    .wa-body-input::placeholder { color: var(--text-dim); }

    .wa-send-btn {
      width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
      background: var(--accent); border: none; color: #06240f;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: transform var(--transition), opacity var(--transition);
    }
    .wa-send-btn:disabled { background: var(--surface-3); color: var(--text-dim); cursor: not-allowed; }
    .wa-send-btn:not(:disabled):hover { transform: scale(1.06); }
  `;
  document.head.appendChild(style);
}
