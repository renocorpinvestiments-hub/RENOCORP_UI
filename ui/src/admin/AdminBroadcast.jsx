import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Megaphone, Send, Check, CheckCheck, Clock, Users, Bell, Mail,
  MessageSquare, Search, X, ChevronDown, AlertTriangle,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Spinner } from '../components/Spinner';
import { EmptyState } from '../components/EmptyState';

const PAGE_SIZE = 30;

const CHANNELS = [
  { key: 'all',   label: 'All channels', icon: Users },
  { key: 'push',  label: 'Push',         icon: Bell },
  { key: 'email', label: 'Email',        icon: Mail },
  { key: 'sms',   label: 'SMS',          icon: MessageSquare },
];

function channelMeta(key) {
  return CHANNELS.find((c) => c.key === key) ?? CHANNELS[0];
}

function formatClock(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function dayLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
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
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ page, limit: PAGE_SIZE }), [page]);

  const { data: stats } = useApi(() => api.admin.broadcastStats(), []);
  const { data, loading, error, reload } = useApi(() => api.admin.broadcastHistory(params), [params]);

  const [pending, setPending] = useState(null); // optimistic in-flight message
  const threadRef = useRef(null);

  const items = data?.items ?? [];
  const hasMore = (data?.total ?? 0) > page * PAGE_SIZE;

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
    });
  }, []);

  useEffect(() => { scrollToBottom(); }, [items.length, scrollToBottom]);

  const handleSent = useCallback(() => {
    setPending(null);
    setPage(1);
    reload();
    scrollToBottom();
  }, [reload, scrollToBottom]);

  return (
    <div className="wa-shell">
      <WaHeader stats={stats} />

      <div className="wa-thread" ref={threadRef}>
        {loading && page === 1 && (
          <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
        )}

        {!loading && error && (
          <div className="alert alert-error" style={{ margin: 16 }}>
            {error}
            <button className="link-btn" style={{ marginLeft: 12 }} onClick={reload}>Retry</button>
          </div>
        )}

        {!loading && !error && items.length === 0 && !pending && (
          <div style={{ padding: '60px 20px' }}>
            <EmptyState message="No broadcasts sent yet. Your first message will appear here." />
          </div>
        )}

        {hasMore && !loading && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <button className="link-btn" onClick={() => setPage((p) => p + 1)}>Load earlier messages</button>
          </div>
        )}

        <Thread items={items} pending={pending} />
      </div>

      <Composer onSent={handleSent} onPending={setPending} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * HEADER — channel identity + delivery stats
 * ──────────────────────────────────────────────────────────── */
function WaHeader({ stats }) {
  return (
    <div className="wa-header">
      <div className="wa-header-avatar"><Megaphone size={18} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="wa-header-title">Broadcast Channel</div>
        <div className="wa-header-sub">
          {stats
            ? `${stats.total_sent ?? 0} sent · ${stats.delivery_rate != null ? Math.round(stats.delivery_rate * 100) : '—'}% delivered · ${stats.read_rate != null ? Math.round(stats.read_rate * 100) : '—'}% read`
            : 'Messages to every RENOCORP user'}
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
      const label = dayLabel(item.sent_at ?? item.created_at);
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
      {grouped.map((g) =>
        g.type === 'divider'
          ? <DayDivider key={g.key} label={g.label} />
          : <Bubble key={g.key} entry={g.item} />
      )}
      {pending && <Bubble entry={pending} isPending />}
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
  const meta = channelMeta(entry.channel ?? 'all');
  const ChannelIcon = meta.icon;
  const failed = entry.status === 'failed';

  const targetLabel = entry.target_type === 'user'
    ? `To ${entry.target_user_name ?? 'one user'}`
    : `To all users`;

  let ReceiptIcon = Clock;
  let receiptColor = 'var(--text-muted)';
  if (!isPending && !failed) {
    if ((entry.read_count ?? 0) > 0) {
      ReceiptIcon = CheckCheck;
      receiptColor = 'var(--info)';
    } else if ((entry.delivered_count ?? 0) > 0) {
      ReceiptIcon = CheckCheck;
      receiptColor = 'var(--text-muted)';
    } else if (entry.status === 'sent') {
      ReceiptIcon = Check;
      receiptColor = 'var(--text-muted)';
    }
  }

  return (
    <div className="wa-row">
      <div className={`wa-bubble ${failed ? 'wa-bubble-failed' : ''} ${isPending ? 'wa-bubble-pending' : ''}`}>
        <div className="wa-bubble-meta">
          <ChannelIcon size={11} />
          <span>{targetLabel}</span>
        </div>
        {entry.title && <div className="wa-bubble-title">{entry.title}</div>}
        <div className="wa-bubble-body">{entry.body}</div>
        <div className="wa-bubble-footer">
          {entry.recipients_count != null && (
            <span className="wa-bubble-count">
              {entry.delivered_count ?? 0}/{entry.recipients_count} delivered
            </span>
          )}
          <span className="wa-bubble-time">{isPending ? 'Sending…' : formatClock(entry.sent_at ?? entry.created_at)}</span>
          {failed ? (
            <AlertTriangle size={13} color="var(--danger)" />
          ) : (
            <ReceiptIcon size={14} color={receiptColor} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * COMPOSER — mode toggle (broadcast / direct), channel chips, send
 * ──────────────────────────────────────────────────────────── */
function Composer({ onSent, onPending }) {
  const [mode, setMode] = useState('broadcast'); // 'broadcast' | 'direct'
  const [channel, setChannel] = useState('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [targetUser, setTargetUser] = useState(null);
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [userSearching, setUserSearching] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const searchTimer = useRef(null);

  const canSend = body.trim().length > 0 && (mode === 'broadcast' || !!targetUser) && !sending;

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
    setChannel('all');
    setTargetUser(null);
    setUserQuery('');
    setUserResults([]);
  };

  const doSend = async () => {
    if (!canSend) return;
    setError(null);
    setConfirmOpen(false);
    setSending(true);

    const draft = {
      id: `pending-${Date.now()}`,
      title: title.trim() || null,
      body: body.trim(),
      channel,
      target_type: mode === 'direct' ? 'user' : 'all',
      target_user_name: targetUser?.name ?? targetUser?.email,
      created_at: new Date().toISOString(),
      status: 'sending',
    };
    onPending(draft);

    try {
      if (mode === 'direct') {
        await api.admin.notifyUser(targetUser.id, { title: title.trim() || undefined, body: body.trim() });
      } else {
        await api.admin.broadcast({ title: title.trim() || undefined, body: body.trim(), channel });
      }
      resetComposer();
      onSent();
    } catch (e) {
      onPending(null);
      setError(e.message ?? 'Could not send this message. It has not been delivered.');
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
        <div className="wa-channel-row">
          {CHANNELS.map((c) => {
            const Icon = c.icon;
            const active = channel === c.key;
            return (
              <button
                key={c.key}
                className={`wa-chip ${active ? 'active' : ''}`}
                onClick={() => setChannel(c.key)}
              >
                <Icon size={12} /> {c.label}
              </button>
            );
          })}
        </div>
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
            placeholder="Type a message to your users…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={1}
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
        title="Send to all users?"
        message={`This message will go out to every RENOCORP user via ${channelMeta(channel).label.toLowerCase()}. This can't be recalled once sent.`}
        confirmLabel="Send broadcast"
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

    .wa-channel-row { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
    .wa-chip {
      display: flex; align-items: center; gap: 5px;
      background: var(--surface-3); border: 1px solid var(--border);
      color: var(--text-muted); font-size: 11px; font-family: var(--font-mono);
      padding: 5px 10px; border-radius: 999px; cursor: pointer;
      transition: all var(--transition);
    }
    .wa-chip.active { background: var(--info-dim); border-color: rgba(96,165,250,0.35); color: var(--info); }

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
