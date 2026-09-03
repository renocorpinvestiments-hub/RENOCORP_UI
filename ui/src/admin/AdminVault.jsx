import { useState, useMemo, useEffect } from 'react';
import {
  ShieldCheck, ShieldAlert, RefreshCw, Trash2,
  Plus, Check, X, ChevronLeft, ChevronRight, Activity,
} from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { api } from '../api';
import { timeAgo } from '../utils/timeAgo';
import { StatCard } from '../components/StatCard';
import { TabBar } from '../components/TabBar';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Spinner } from '../components/Spinner';
import { EmptyState } from '../components/EmptyState';
import { Badge } from '../components/Badge';

const PAGE_SIZE = 20;

const CRED_STATUS_BADGE = {
  active:   { tone: 'success', label: 'Active' },
  expiring: { tone: 'warning', label: 'Expiring soon' },
  error:    { tone: 'danger',  label: 'Error' },
};

export default function AdminVault() {
  const [tab, setTab] = useState('credentials');

  return (
    <div className="dash-body fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>VAULT</h2>
      </div>

      <VaultStatusBanner />

      <TabBar
        tabs={[
          { key: 'credentials', label: 'Credentials' },
          { key: 'audit', label: 'Audit Log' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'credentials' && <CredentialsPanel />}
      {tab === 'audit' && <AuditPanel />}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * STATUS BANNER
 * ──────────────────────────────────────────────────────────── */
function VaultStatusBanner() {
  const { data: status, loading, error, reload } = useApi(() => api.admin.vaultStatus(), []);

  if (loading) return null;
  if (error) {
    return (
      <div className="alert alert-error" style={{ marginBottom: 16 }}>
        Could not reach the vault: {error}
        <button className="link-btn" style={{ marginLeft: 12 }} onClick={reload}>Retry</button>
      </div>
    );
  }

  const healthy = status?.healthy ?? false;

  return (
    <div className="dash-grid" style={{ marginBottom: 20 }}>
      <StatCard
        label="Vault status"
        value={healthy ? 'Healthy' : 'Attention needed'}
        accent={healthy}
        icon={healthy ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
      />
      <StatCard label="Encryption provider" value={status?.kms_provider ?? '—'} />
      <StatCard label="Credential groups" value={status?.groups_count ?? 0} />
      <StatCard
        label="Last rotation check"
        value={status?.last_rotation_check ? timeAgo(status.last_rotation_check) : '—'}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
 * CREDENTIALS PANEL — grouped list, reveal / rotate / delete / test
 * ──────────────────────────────────────────────────────────── */
function CredentialsPanel() {
  const { data, loading, error, reload } = useApi(() => api.admin.vaultCredentials(), []);
  const groups = data?.groups ?? [];

  const [addOpen, setAddOpen] = useState(false);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;
  if (error) {
    return (
      <div className="alert alert-error">
        {error}
        <button className="link-btn" style={{ marginLeft: 12 }} onClick={reload}>Retry</button>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button
          className="btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => setAddOpen(true)}
        >
          <Plus size={15} /> Add credential
        </button>
      </div>

      {groups.length === 0 && <EmptyState message="No credential groups configured yet." />}

      {groups.map((group) => (
        <CredentialGroupCard key={group.name} group={group} onChanged={reload} />
      ))}

      <AddCredentialModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => { setAddOpen(false); reload(); }}
      />
    </>
  );
}

function CredentialGroupCard({ group, onChanged }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok: bool, message }

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // P1 FIX (audit finding #6): api.admin.testCredentialGroup(...)
      // never existed in api.js — calling it threw
      // `TypeError: api.admin.testCredentialGroup is not a function`
      // on every click. api.admin.vaultTest(group) is the real,
      // working binding (POST /api/vault/test/{group}).
      const res = await api.admin.vaultTest(group.name);
      setTestResult({ ok: res?.ok ?? true, message: res?.message ?? 'Connection succeeded.' });
    } catch (e) {
      setTestResult({ ok: false, message: e.message ?? 'Connection test failed.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="dash-card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', borderBottom: '1px solid var(--border)',
      }}>
        <div>
          <h3 style={{ fontSize: 14 }}>{group.display_name ?? group.name}</h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{group.name}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {testResult && (
            <span style={{
              fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
              color: testResult.ok ? 'var(--accent)' : 'var(--danger)',
            }}>
              {testResult.ok ? <Check size={13} /> : <X size={13} />}
              {testResult.message}
            </span>
          )}
          <button
            className="link-btn"
            disabled={testing}
            onClick={runTest}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Activity size={14} /> {testing ? 'Testing…' : 'Test connection'}
          </button>
        </div>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Value</th>
            <th>Status</th>
            <th>Last rotated</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(group.credentials ?? []).map((cred) => (
            <CredentialRow
              key={cred.key}
              group={group.name}
              credential={cred}
              onChanged={onChanged}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CredentialRow({ group, credential, onChanged }) {
  // P1 FIX (audit finding #6): this component previously called
  // `api.admin.revealCredential(group, key, password)` to fetch a
  // decrypted credential value back into the browser. That function
  // never existed in api.js, so every click threw a TypeError — but
  // more importantly, there is no backend endpoint that could have
  // backed it even if the binding had been correct.
  //
  // modules/vault/routes.py's own module docstring states as an
  // architecture rule: "NO decryption in this file" and "Values are
  // NEVER in any response body". modules/vault/models.py's
  // CredentialRecord goes further and hard-codes the value field:
  //   value_masked: str = _MASKED_VALUE   # always "***"
  //   """value_masked is always "***" — never the real value."""
  // i.e. this isn't a missing feature, it's a deliberate,
  // deeply-embedded security boundary: this backend does not have a
  // code path that ever serializes a decrypted secret into an HTTP
  // response, by design (consistent with how most secrets managers —
  // e.g. AWS Secrets Manager's console — treat "view value" as a
  // privileged, audited, separate action, and many treat secrets as
  // rotate-only, never re-displayed, which is the stance this backend
  // has taken).
  //
  // Building a reveal endpoint to match this removed UI would mean
  // *weakening* that existing guarantee, which is a deliberate
  // security/product decision for your team to make explicitly — not
  // something to bolt on silently while fixing a broken button. Until
  // that decision is made, the honest fix is to remove the "reveal"
  // affordance so the UI stops promising something the backend
  // intentionally never provides, and let admins rotate a credential
  // (which this panel already supports) when its value needs to
  // change.
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const badge = CRED_STATUS_BADGE[credential.status] ?? { tone: 'info', label: credential.status ?? 'Unknown' };

  const rotate = async () => {
    setRotating(true);
    setRotateError(null);
    try {
      // P1 FIX (audit finding #6): api.admin.rotateCredential(...)
      // never existed in api.js. api.admin.vaultRotate(group, key) is
      // the real, working binding
      // (POST /api/vault/credentials/{group}/{key}/rotate).
      await api.admin.vaultRotate(group, credential.key);
      onChanged();
    } catch (e) {
      setRotateError(e.message ?? 'Rotation failed.');
    } finally {
      setRotating(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      // P1 FIX (audit finding #6): api.admin.deleteCredential(...)
      // never existed in api.js. api.admin.vaultRemove(group, key) is
      // the real, working binding
      // (DELETE /api/vault/credentials/{group}/{key}).
      await api.admin.vaultRemove(group, credential.key);
      setConfirmDelete(false);
      onChanged();
    } catch (e) {
      setRotateError(e.message ?? 'Could not delete this credential.');
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <tr>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{credential.key}</td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        {/* Values are never returned by the backend — see the P1 FIX
            note above CredentialRow. Rotate to replace a value; there
            is intentionally no way to view an existing one. */}
        <span
          title="Credential values are never displayed after creation. Rotate to replace this value."
          style={{ color: 'var(--text-muted)' }}
        >
          {credential.masked ?? '••••••••'}
        </span>
      </td>
      <td><Badge tone={badge.tone}>{badge.label}</Badge></td>
      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        {credential.last_rotated_at ? timeAgo(credential.last_rotated_at) : 'Never'}
      </td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <button className="link-btn" disabled={rotating} onClick={rotate} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <RefreshCw size={13} /> {rotating ? 'Rotating…' : 'Rotate'}
        </button>
        <button
          className="link-btn"
          onClick={() => setConfirmDelete(true)}
          style={{ marginLeft: 12, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <Trash2 size={13} /> Delete
        </button>
        {rotateError && <div style={{ color: 'var(--danger)', fontSize: 11, marginTop: 4 }}>{rotateError}</div>}
      </td>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete credential?"
        message={`This permanently removes "${credential.key}" from the ${group} group. Any service relying on it will fail until a replacement is added.`}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
      />
    </tr>
  );
}

/* ────────────────────────────────────────────────────────────
 * ADD CREDENTIAL MODAL
 * ──────────────────────────────────────────────────────────── */
const SLUG_PATTERN = /^[a-z0-9_]+$/;

function AddCredentialModal({ open, onClose, onAdded }) {
  const [group, setGroup] = useState('');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setGroup(''); setKey(''); setValue(''); setDescription('');
      setError(null); setSubmitting(false);
    }
  }, [open]);

  const validate = () => {
    if (!group.trim() || !SLUG_PATTERN.test(group.trim())) {
      return 'Group must be lowercase letters, numbers, and underscores only.';
    }
    if (!key.trim() || !SLUG_PATTERN.test(key.trim())) {
      return 'Key must be lowercase letters, numbers, and underscores only.';
    }
    if (!value) {
      return 'A value is required.';
    }
    return null;
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // P1 FIX (audit finding #6): api.admin.addCredential(...) never
      // existed in api.js. api.vault.add(body) is the real, working
      // binding (POST /api/vault/credentials).
      await api.vault.add({
        group: group.trim(),
        key: key.trim(),
        value,
        description: description.trim() || undefined,
      });
      onAdded();
    } catch (e) {
      setError(e.message ?? 'Could not save this credential.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !submitting && onClose()} title="Add credential">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Group">
          <input className="admin-input" style={{ width: '100%' }} placeholder="e.g. flutterwave" value={group} onChange={(e) => setGroup(e.target.value)} />
        </Field>
        <Field label="Key">
          <input className="admin-input" style={{ width: '100%' }} placeholder="e.g. secret_key" value={key} onChange={(e) => setKey(e.target.value)} />
        </Field>
        <Field label="Value">
          <input type="password" className="admin-input" style={{ width: '100%' }} placeholder="Credential value" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Description (optional)">
          <input className="admin-input" style={{ width: '100%' }} placeholder="What this credential is used for" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        {error && <div className="alert alert-error">{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
          <button className="link-btn" disabled={submitting} onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={submitting} onClick={submit}>
            {submitting ? 'Saving…' : 'Add credential'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

/* ────────────────────────────────────────────────────────────
 * AUDIT LOG PANEL
 * ──────────────────────────────────────────────────────────── */
function AuditPanel() {
  const [page, setPage] = useState(1);

  const params = useMemo(() => ({ page, limit: PAGE_SIZE }), [page]);
  const { data, loading, error, reload } = useApi(() => api.admin.vaultAudit(params), [params]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>;
  if (error) {
    return (
      <div className="alert alert-error">
        {error}
        <button className="link-btn" style={{ marginLeft: 12 }} onClick={reload}>Retry</button>
      </div>
    );
  }
  if (items.length === 0) {
    return <EmptyState message="No vault activity recorded yet." />;
  }

  return (
    <>
      <div className="dash-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Actor</th>
              <th>Action</th>
              <th>Credential</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {items.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.actor_name ?? entry.actor_id}</td>
                <td style={{ textTransform: 'capitalize' }}>{entry.action}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                  {entry.group}{entry.key ? ` / ${entry.key}` : ''}
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{timeAgo(entry.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
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
    </>
  );
}
