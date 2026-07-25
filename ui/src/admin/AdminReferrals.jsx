import { useState, useCallback, useMemo, useRef } from 'react';
import {
  RefreshCw, ToggleLeft, ToggleRight, Ban, Search,
  ChevronLeft, ChevronRight, Users, Gift, TrendingUp, Clock, X,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { formatUGX } from '../utils/formatUGX';
import { timeAgo } from '../utils/timeAgo';
import { StatCard } from '../components/StatCard';
import { TabBar } from '../components/TabBar';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Spinner } from '../components/Spinner';
import { EmptyState } from '../components/EmptyState';
import { Badge } from '../components/Badge';

const PAGE_SIZE = 20;

const STATUS_BADGE = {
  active:  { tone: 'success', label: 'Active' },
  pending: { tone: 'warning', label: 'Pending' },
  voided:  { tone: 'danger',  label: 'Voided' },
};

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef(null);
  const update = useCallback((v) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebounced(v), delay);
  }, [delay]);
  return [debounced, update];
}

export default function AdminReferrals() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="dash-body fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>REFERRALS</h2>
      </div>

      <TabBar
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'rules', label: 'Bonus Rules' },
          { key: 'referrals', label: 'All Referrals' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'overview' && <OverviewPanel />}
      {tab === 'rules' && <RulesPanel />}
      {tab === 'referrals' && <ReferralsPanel />}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * OVERVIEW — system toggle + top-line stats
 * ──────────────────────────────────────────────────────────── */
function OverviewPanel() {
  const { data: config, loading: configLoading, error: configError, reload: reloadConfig } =
    useApi(() => api.admin.referralConfig(), []);
  const { data: stats, loading: statsLoading, error: statsError, reload: reloadStats } =
    useApi(() => api.admin.referralStats(), []);

  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState(null);
  const [confirmToggleOff, setConfirmToggleOff] = useState(false);

  const enabled = config?.enabled ?? false;

  const applyToggle = useCallback(async (nextEnabled) => {
    setToggling(true);
    setToggleError(null);
    try {
      await api.admin.toggleReferralSystem(nextEnabled);
      await reloadConfig();
    } catch (e) {
      setToggleError(e.message ?? 'Could not update the referral system.');
    } finally {
      setToggling(false);
    }
  }, [reloadConfig]);

  const handleToggleClick = () => {
    if (enabled) {
      setConfirmToggleOff(true);
    } else {
      applyToggle(true);
    }
  };

  if (configLoading || statsLoading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;
  }

  if (configError || statsError) {
    return (
      <div className="alert alert-error">
        {configError || statsError}
        <button className="link-btn" style={{ marginLeft: 12 }} onClick={() => { reloadConfig(); reloadStats(); }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="dash-card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ marginBottom: 4 }}>Referral system</h3>
            <div className="dash-card-sub">
              {enabled ? 'Referral bonuses are active for all users.' : 'Referral bonuses are currently paused.'}
            </div>
          </div>
          <button
            className="link-btn"
            disabled={toggling}
            onClick={handleToggleClick}
            aria-pressed={enabled}
            aria-label={enabled ? 'Disable referral system' : 'Enable referral system'}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: enabled ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            {enabled ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
            {toggling ? 'Saving…' : enabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>
        {toggleError && <div className="alert alert-error" style={{ marginTop: 12 }}>{toggleError}</div>}
      </div>

      <div className="dash-grid" style={{ marginBottom: 8 }}>
        <StatCard label="Total referrals" value={stats?.total_referrals ?? 0} icon={<Users size={16} />} />
        <StatCard label="Active referrals" value={stats?.active_referrals ?? 0} accent icon={<TrendingUp size={16} />} />
        <StatCard label="Bonus paid" value={formatUGX(stats?.total_bonus_paid_usd ?? stats?.total_bonus_paid)} icon={<Gift size={16} />} />
        <StatCard label="Pending bonus" value={formatUGX(stats?.pending_bonus_usd ?? stats?.pending_bonus)} icon={<Clock size={16} />} />
      </div>

      <ConfirmDialog
        open={confirmToggleOff}
        title="Disable referral system?"
        message="New referrals will stop earning bonuses immediately. Existing pending bonuses are not affected."
        confirmLabel="Disable"
        danger
        onCancel={() => setConfirmToggleOff(false)}
        onConfirm={async () => {
          setConfirmToggleOff(false);
          await applyToggle(false);
        }}
      />
    </>
  );
}

/* ────────────────────────────────────────────────────────────
 * BONUS RULES — edit reward amounts per referral event
 * ──────────────────────────────────────────────────────────── */
function RulesPanel() {
  const { data: config, loading, error, reload } = useApi(() => api.admin.referralConfig(), []);
  const rules = config?.rules ?? [];

  const [editingId, setEditingId] = useState(null);
  const [draftAmount, setDraftAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState(null);

  const startEdit = (rule) => {
    setEditingId(rule.id);
    setDraftAmount(String(rule.bonus_usd ?? rule.bonus_amount ?? ''));
    setRowError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftAmount('');
    setRowError(null);
  };

  const saveEdit = async (rule) => {
    const amount = Number(draftAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setRowError('Enter a valid, non-negative amount.');
      return;
    }
    setSaving(true);
    setRowError(null);
    try {
      await api.admin.updateReferralRule({ rule_id: rule.id, bonus_usd: amount });
      await reload();
      setEditingId(null);
    } catch (e) {
      setRowError(e.message ?? 'Could not save this rule.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;
  if (error) {
    return (
      <div className="alert alert-error">
        {error}
        <button className="link-btn" style={{ marginLeft: 12 }} onClick={reload}>Retry</button>
      </div>
    );
  }
  if (rules.length === 0) {
    return <EmptyState message="No bonus rules configured yet." />;
  }

  return (
    <div className="dash-card">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Description</th>
            <th>Bonus</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => {
            const isEditing = editingId === rule.id;
            return (
              <tr key={rule.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{rule.event_type}</td>
                <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{rule.description}</td>
                <td>
                  {isEditing ? (
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      step="0.01"
                      className="admin-input"
                      value={draftAmount}
                      onChange={(e) => setDraftAmount(e.target.value)}
                      style={{ width: 100 }}
                    />
                  ) : (
                    formatUGX(rule.bonus_usd ?? rule.bonus_amount)
                  )}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {isEditing ? (
                    <>
                      <button className="link-btn" disabled={saving} onClick={() => saveEdit(rule)}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button className="link-btn" disabled={saving} onClick={cancelEdit} style={{ marginLeft: 10, color: 'var(--text-muted)' }}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button className="link-btn" onClick={() => startEdit(rule)}>Edit</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rowError && <div className="alert alert-error" style={{ marginTop: 12 }}>{rowError}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * REFERRALS — paginated list, search, void action
 * ──────────────────────────────────────────────────────────── */
function ReferralsPanel() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search] = useDebouncedValue(searchInput, 500);

  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidSubmitting, setVoidSubmitting] = useState(false);
  const [voidError, setVoidError] = useState(null);

  const params = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    ...(status !== 'all' ? { status } : {}),
    ...(search ? { q: search } : {}),
  }), [page, status, search]);

  const { data, loading, error, reload } = useApi(() => api.admin.referralList(params), [params]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openVoid = (item) => {
    setVoidTarget(item);
    setVoidReason('');
    setVoidError(null);
  };

  const submitVoid = async () => {
    if (!voidReason.trim()) {
      setVoidError('A reason is required to void a referral.');
      return;
    }
    setVoidSubmitting(true);
    setVoidError(null);
    try {
      await api.admin.voidReferral(voidTarget.id, voidReason.trim());
      setVoidTarget(null);
      await reload();
    } catch (e) {
      setVoidError(e.message ?? 'Could not void this referral.');
    } finally {
      setVoidSubmitting(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="admin-input"
            style={{ width: '100%', paddingLeft: 34 }}
            placeholder="Search by referrer or referred user…"
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="admin-input"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="voided">Voided</option>
        </select>
        <button className="link-btn" onClick={reload} aria-label="Refresh" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>}

      {!loading && error && (
        <div className="alert alert-error">
          {error}
          <button className="link-btn" style={{ marginLeft: 12 }} onClick={reload}>Retry</button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <EmptyState message="No referrals match your filters." />
      )}

      {!loading && !error && items.length > 0 && (
        <div className="dash-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Referrer</th>
                <th>Referred</th>
                <th>Status</th>
                <th>Bonus</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const badge = STATUS_BADGE[r.status] ?? { tone: 'info', label: r.status };
                return (
                  <tr key={r.id}>
                    <td>{r.referrer_name ?? r.referrer_id}</td>
                    <td>{r.referred_name ?? r.referred_id}</td>
                    <td><Badge tone={badge.tone}>{badge.label}</Badge></td>
                    <td>{formatUGX(r.bonus_usd ?? r.bonus_amount)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{timeAgo(r.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {r.status !== 'voided' && (
                        <button
                          className="link-btn"
                          style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          onClick={() => openVoid(r)}
                        >
                          <Ban size={14} /> Void
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 16 }}>
          <button className="link-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
            <ChevronLeft size={18} />
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Page {page} of {totalPages}
          </span>
          <button className="link-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      <Modal open={!!voidTarget} onClose={() => (!voidSubmitting ? setVoidTarget(null) : null)} title="Void referral">
        {voidTarget && (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              This removes any pending bonus tied to{' '}
              <strong style={{ color: 'var(--text)' }}>{voidTarget.referred_name ?? voidTarget.referred_id}</strong>{' '}
              being referred by{' '}
              <strong style={{ color: 'var(--text)' }}>{voidTarget.referrer_name ?? voidTarget.referrer_id}</strong>.
              This cannot be undone.
            </p>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Reason
            </label>
            <textarea
              className="admin-input"
              style={{ width: '100%', minHeight: 80, resize: 'vertical' }}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. duplicate account, fraudulent signup"
            />
            {voidError && <div className="alert alert-error" style={{ marginTop: 12 }}>{voidError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button className="link-btn" disabled={voidSubmitting} onClick={() => setVoidTarget(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{ background: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}
                disabled={voidSubmitting}
                onClick={submitVoid}
              >
                {voidSubmitting ? 'Voiding…' : (<><X size={14} /> Void referral</>)}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
