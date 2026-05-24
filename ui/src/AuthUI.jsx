/**
 * AuthUI.jsx — RENOCORP Authentication UI
 * =========================================
 * Single-file auth surface. All views:
 *   · Login (email/password + remember me + MFA flow)
 *   · Register (full profile + password strength + terms)
 *   · MFA Challenge (6-digit TOTP with paste + auto-submit)
 *   · Forgot Password (fire-and-forget, no email enumeration)
 *   · Brand Panel (split-screen, hidden on mobile)
 *
 * Imports shared modules:
 *   · api.js          → HTTP client, tokenStore
 *   · AuthContext.jsx → React context
 *   · styles.js       → CSS design system
 *
 * Backend compatibility:
 *   · POST /api/auth/register  → RegisterRequest / RegisterResponse
 *   · POST /api/auth/login     → LoginRequest    / TokenResponse
 *   · POST /api/auth/refresh   → RefreshRequest  / TokenResponse
 *   · GET  /api/auth/me        → UserProfile
 *   · POST /api/auth/mfa/totp/verify → TOTPVerifyRequest
 *   · POST /api/auth/forgot-password (model defined, endpoint to be wired)
 *
 * Security:
 *   · All tokens in-memory only (tokenStore module, no localStorage)
 *   · CSRF-safe: SameSite cookies not used; Bearer token auth
 *   · Password never echoed; strength meter client-side only
 *   · Forgot-password always shows success (no email enumeration)
 *   · MFA timer shows remaining seconds (cosmetic; real validation server-side)
 *
 * Performance:
 *   · Zero third-party UI libs
 *   · Inline SVG icons (no icon font download)
 *   · Fonts: Google Fonts loaded by styles.js (display=swap)
 *   · All state local to each form; no global store
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { api, tokenStore } from "./api.js";
import { useAuth } from "./AuthContext.jsx";
import { globalStyles } from "./styles.js";

// ═══════════════════════════════════════════════════════════
// ICONS (inline SVG — zero network cost)
// ═══════════════════════════════════════════════════════════

const Icon = {
  Eye: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  EyeOff: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ),
  Lock: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  X: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  Warn: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  Google: () => (
    <svg width="15" height="15" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  ),
  GitHub: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  ),
  Microsoft: () => (
    <svg width="15" height="15" viewBox="0 0 24 24">
      <rect x="1"  y="1"  width="10" height="10" fill="#f25022"/>
      <rect x="13" y="1"  width="10" height="10" fill="#7fba00"/>
      <rect x="1"  y="13" width="10" height="10" fill="#00a4ef"/>
      <rect x="13" y="13" width="10" height="10" fill="#ffb900"/>
    </svg>
  ),
};

// ═══════════════════════════════════════════════════════════
// PASSWORD STRENGTH METER
// ═══════════════════════════════════════════════════════════

function getPasswordStrength(pw) {
  if (!pw) return { score: 0, label: "", tier: "", rules: {} };
  const rules = {
    length:  pw.length >= 8,
    upper:   /[A-Z]/.test(pw),
    lower:   /[a-z]/.test(pw),
    number:  /[0-9]/.test(pw),
    special: /[^a-zA-Z0-9]/.test(pw),
  };
  const score = Object.values(rules).filter(Boolean).length;
  const [label, tier] = score <= 1 ? ["Weak", "w"] : score <= 2 ? ["Fair", "f"] : score <= 3 ? ["Good", "g"] : ["Strong", "s"];
  return { score, label, tier, rules };
}

function PasswordStrength({ password }) {
  const { score, label, tier, rules } = getPasswordStrength(password);
  if (!password) return null;

  const labelColor = { w: "var(--danger)", f: "var(--warning)", g: "#facc15", s: "var(--accent)" }[tier];

  return (
    <div className="pw-strength">
      <div className="pw-bars">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`pw-bar ${i <= score ? tier : ""}`} />
        ))}
      </div>
      <div className="pw-label" style={{ color: labelColor }}>{label}</div>
      <div className="pw-rules">
        {[
          { key: "length",  label: "8+ chars" },
          { key: "upper",   label: "Uppercase" },
          { key: "lower",   label: "Lowercase" },
          { key: "number",  label: "Number" },
          { key: "special", label: "Symbol" },
        ].map((r) => (
          <span key={r.key} className={`pw-rule ${rules[r.key] ? "met" : ""}`}>{r.label}</span>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PRIMITIVE COMPONENTS
// ═══════════════════════════════════════════════════════════

function Field({ label, error, children }) {
  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      {children}
      {error && (
        <div className="field-error">
          <Icon.Warn /> {error}
        </div>
      )}
    </div>
  );
}

function Input({ type = "text", placeholder, value, onChange, error, autoFocus, rightEl, ...rest }) {
  return (
    <div className="field-input-wrap">
      <input
        type={type}
        className={`field-input${rightEl ? " has-right" : ""}${error ? " error-state" : ""}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        {...rest}
      />
      {rightEl && <div className="field-icon-btn">{rightEl}</div>}
    </div>
  );
}

function PasswordInput({ value, onChange, error, placeholder = "••••••••", autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <Input
      type={show ? "text" : "password"}
      value={value}
      onChange={onChange}
      error={error}
      placeholder={placeholder}
      autoFocus={autoFocus}
      rightEl={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", padding: 0 }}
        >
          {show ? <Icon.EyeOff /> : <Icon.Eye />}
        </button>
      }
    />
  );
}

function Alert({ type = "error", children }) {
  const cls = { error: "alert-error", success: "alert-success", info: "alert-info" }[type];
  const ico = { error: <Icon.X />, success: <Icon.Check />, info: <Icon.Lock /> }[type];
  return (
    <div className={`alert ${cls}`}>
      {ico} {children}
    </div>
  );
}

function OAuthButtons() {
  return (
    <div className="oauth-grid">
      {[
        { name: "Google",    icon: <Icon.Google />,    provider: "google" },
        { name: "GitHub",    icon: <Icon.GitHub />,    provider: "github" },
        { name: "Microsoft", icon: <Icon.Microsoft />, provider: "microsoft" },
      ].map((p) => (
        <button key={p.provider} className="oauth-btn" onClick={() => api.oauthStart(p.provider)}>
          {p.icon} {p.name}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// BRAND PANEL
// ═══════════════════════════════════════════════════════════

function BrandPanel() {
  return (
    <div className="auth-brand">
      <div className="brand-grid" />
      <div className="brand-orb" />
      <div className="brand-orb-2" />

      <div className="brand-logo">
        <div className="brand-logo-mark">RC</div>
        <div className="brand-logo-name">Renocorp</div>
      </div>

      <div className="brand-headline">
        <h1>
          Institutional<br />
          <span>Auth</span><br />
          Infrastructure.
        </h1>
        <p>
          Zero-trust identity layer built for enterprise workloads.
          PKCE OAuth, TOTP MFA, session rotation and tamper-proof audit trails.
        </p>
      </div>

      <div className="brand-features">
        {[
          "JWT + refresh token rotation",
          "TOTP multi-factor authentication",
          "OAuth 2.0 / PKCE federation",
          "Session management + revocation",
          "Trusted device registry",
        ].map((f) => (
          <div key={f} className="brand-feature">
            <div className="brand-feature-dot" />
            {f}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LOGIN FORM
// Backend: POST /api/auth/login (LoginRequest → TokenResponse)
//          GET  /api/auth/me    (→ UserProfile)
// MFA: 428 or message contains "mfa" → trigger MFA challenge
// ═══════════════════════════════════════════════════════════

function LoginForm({ onMfaRequired }) {
  const auth = useAuth();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [fieldErr, setFieldErr] = useState({});

  const validate = () => {
    const e = {};
    if (!email)                            e.email    = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) e.email    = "Enter a valid email";
    if (!password)                         e.password = "Password is required";
    return e;
  };

  const handleSubmit = useCallback(async () => {
    setError("");
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErr(errs); return; }
    setFieldErr({});
    setLoading(true);

    try {
      // LoginRequest: { email, password, remember_session, provider="local" }
      const res = await api.login({ email, password, remember_session: remember });

      // Store tokens in memory
      tokenStore.setTokens(res.access_token, res.refresh_token);

      // Hydrate user profile
      const user = await api.me();
      tokenStore.setSession({ session_id: res.session_id, ...res });

      auth.onLogin(user);
    } catch (e) {
      // Backend returns 428 or includes "mfa" in detail for MFA-required logins
      if (e.status === 428 || e.message?.toLowerCase().includes("mfa")) {
        onMfaRequired?.();
      } else {
        setError(e.message || "Invalid email or password.");
      }
    } finally {
      setLoading(false);
    }
  }, [email, password, remember, auth, onMfaRequired]);

  const handleKey = (e) => { if (e.key === "Enter") handleSubmit(); };

  return (
    <div className="fade-in">
      {error && <Alert type="error">{error}</Alert>}

      <Field label="Email" error={fieldErr.email}>
        <Input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={setEmail}
          error={fieldErr.email}
          autoFocus
          onKeyDown={handleKey}
        />
      </Field>

      <Field label="Password" error={fieldErr.password}>
        <PasswordInput
          value={password}
          onChange={setPassword}
          error={fieldErr.password}
        />
      </Field>

      <div className="check-row">
        <label className="check-label">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember me
        </label>
        <button className="link-btn" onClick={() => auth.setView("forgot")}>
          Forgot password?
        </button>
      </div>

      <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
        {loading ? <><div className="spinner" /> Signing in…</> : "Sign in →"}
      </button>

      <div className="divider">or continue with</div>
      <OAuthButtons />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// REGISTER FORM
// Backend: POST /api/auth/register (RegisterRequest → RegisterResponse)
//          POST /api/auth/login    (auto-login after register)
//          GET  /api/auth/me
// ═══════════════════════════════════════════════════════════

function RegisterForm() {
  const auth = useAuth();
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", password: "", terms: false,
  });
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [fieldErr, setFieldErr] = useState({});

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.firstName)                                   e.firstName = "Required";
    if (!form.lastName)                                    e.lastName  = "Required";
    if (!form.email || !/\S+@\S+\.\S+/.test(form.email)) e.email     = "Valid email required";
    if (!form.password || form.password.length < 8)       e.password  = "Minimum 8 characters";
    if (!form.terms)                                       e.terms     = "You must accept the terms";
    return e;
  };

  const handleSubmit = useCallback(async () => {
    setError("");
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErr(errs); return; }
    setFieldErr({});
    setLoading(true);

    try {
      // RegisterRequest: { email, password, first_name, last_name, accept_terms, provider="local" }
      await api.register({
        email:      form.email,
        password:   form.password,
        first_name: form.firstName,
        last_name:  form.lastName,
        accept_terms: true,
      });

      // Auto-login after register
      const loginRes = await api.login({ email: form.email, password: form.password });
      tokenStore.setTokens(loginRes.access_token, loginRes.refresh_token);

      const user = await api.me();
      tokenStore.setSession({ session_id: loginRes.session_id, ...loginRes });
      auth.onLogin(user);
    } catch (e) {
      setError(e.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [form, auth]);

  return (
    <div className="fade-in">
      {error && <Alert type="error">{error}</Alert>}

      <div className="row">
        <Field label="First Name" error={fieldErr.firstName}>
          <Input
            placeholder="Jane"
            value={form.firstName}
            onChange={set("firstName")}
            error={fieldErr.firstName}
            autoFocus
          />
        </Field>
        <Field label="Last Name" error={fieldErr.lastName}>
          <Input
            placeholder="Doe"
            value={form.lastName}
            onChange={set("lastName")}
            error={fieldErr.lastName}
          />
        </Field>
      </div>

      <Field label="Email" error={fieldErr.email}>
        <Input
          type="email"
          placeholder="you@company.com"
          value={form.email}
          onChange={set("email")}
          error={fieldErr.email}
        />
      </Field>

      <Field label="Password" error={fieldErr.password}>
        <PasswordInput
          value={form.password}
          onChange={set("password")}
          error={fieldErr.password}
        />
        <PasswordStrength password={form.password} />
      </Field>

      <div style={{ marginBottom: 20 }}>
        <label className="check-label" style={{ gap: 10, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            style={{ marginTop: 2 }}
            checked={form.terms}
            onChange={(e) => set("terms")(e.target.checked)}
          />
          <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)", lineHeight: 1.5 }}>
            I accept the{" "}
            <button className="link-btn" style={{ fontSize: 12 }}>Terms of Service</button>
            {" "}and{" "}
            <button className="link-btn" style={{ fontSize: 12 }}>Privacy Policy</button>
          </span>
        </label>
        {fieldErr.terms && (
          <div className="field-error" style={{ marginTop: 6 }}>
            <Icon.Warn /> {fieldErr.terms}
          </div>
        )}
      </div>

      <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
        {loading ? <><div className="spinner" /> Creating account…</> : "Create account →"}
      </button>

      <div className="divider">or sign up with</div>
      <OAuthButtons />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MFA CHALLENGE
// Backend: POST /api/auth/mfa/totp/verify (TOTPVerifyRequest: { code })
//          GET  /api/auth/me              (re-hydrate user on success)
// ═══════════════════════════════════════════════════════════

function MfaChallenge({ onBack }) {
  const auth   = useAuth();
  const [digits,  setDigits]  = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [seconds, setSeconds] = useState(30);
  const refs = useRef([]);

  // Countdown timer (cosmetic — real TTL enforced server-side)
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => (s <= 1 ? 30 : s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const submitCode = useCallback(async (code) => {
    setError("");
    setLoading(true);
    try {
      // TOTPVerifyRequest: { code: string (6-8 chars) }
      const res = await api.verifyTotp(code);
      if (res?.access_token) {
        tokenStore.setTokens(res.access_token, res.refresh_token ?? tokenStore.getRefresh());
      }
      const user = await api.me();
      tokenStore.setSession({ session_id: res?.session_id, ...res });
      auth.onLogin(user);
    } catch (e) {
      setError(e.message || "Invalid code. Try again.");
      setDigits(["", "", "", "", "", ""]);
      refs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }, [auth]);

  const handleDigit = (i, val) => {
    const v = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < 5) refs.current[i + 1]?.focus();
    if (next.every((d) => d) && next.join("").length === 6) {
      submitCode(next.join(""));
    }
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "Enter" && digits.every((d) => d)) submitCode(digits.join(""));
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = [...digits];
    [...text].forEach((c, i) => { next[i] = c; });
    setDigits(next);
    if (text.length === 6) submitCode(text);
    else refs.current[Math.min(text.length, 5)]?.focus();
  };

  return (
    <div className="fade-in">
      <div style={{ textAlign: "center", marginBottom: 8, fontSize: 38 }}>🔐</div>
      <div className="auth-card-header" style={{ textAlign: "center" }}>
        <h2>Two-factor auth</h2>
        <p>Enter the 6-digit code from your authenticator app</p>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <div className="mfa-digits" onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            className={`mfa-digit${d ? " filled" : ""}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={d}
            onChange={(e) => handleDigit(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={loading}
            autoFocus={i === 0}
          />
        ))}
      </div>

      <div className="mfa-timer">
        Code expires in: <span>{seconds}s</span>
      </div>

      <button
        className="btn-primary"
        onClick={() => submitCode(digits.join(""))}
        disabled={digits.some((d) => !d) || loading}
      >
        {loading ? <><div className="spinner" /> Verifying…</> : "Verify code →"}
      </button>

      <div style={{ textAlign: "center", marginTop: 18 }}>
        <button
          className="link-btn"
          onClick={onBack}
          style={{ fontSize: 13, color: "var(--text-muted)" }}
        >
          ← Back to login
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FORGOT PASSWORD
// Backend: POST /api/auth/forgot-password (ForgotPasswordRequest: { email })
// Always shows success — no email enumeration leak.
// ═══════════════════════════════════════════════════════════

function ForgotPassword() {
  const auth = useAuth();
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");

  const handleSubmit = useCallback(async () => {
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await api.forgotPassword(email);
    } catch {
      // Always show success — don't leak whether email exists (security best practice)
    } finally {
      setLoading(false);
      setSent(true);
    }
  }, [email]);

  return (
    <div className="fade-in">
      <div style={{ textAlign: "center", marginBottom: 8, fontSize: 38 }}>🔑</div>
      <div className="auth-card-header" style={{ textAlign: "center" }}>
        <h2>Reset password</h2>
        <p>Enter your email and we'll send a reset link</p>
      </div>

      {sent ? (
        <>
          <Alert type="success">
            If an account exists for that email, a reset link is on its way.
          </Alert>
          <button className="btn-secondary" onClick={() => auth.setView("auth")}>
            ← Back to sign in
          </button>
        </>
      ) : (
        <>
          {error && <Alert type="error">{error}</Alert>}
          <Field label="Email">
            <Input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={setEmail}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </Field>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={loading}
            style={{ marginBottom: 12 }}
          >
            {loading ? <><div className="spinner" /> Sending…</> : "Send reset link →"}
          </button>
          <button className="btn-secondary" onClick={() => auth.setView("auth")}>
            ← Back to sign in
          </button>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AUTH PAGE (router)
// Views: login / register → split-screen with brand panel
//        mfa              → split-screen, no tab nav
//        forgot           → split-screen, back link
// ═══════════════════════════════════════════════════════════

function AuthPage() {
  const auth = useAuth();
  const [tab,     setTab]     = useState("login"); // "login" | "register"
  const [showMfa, setShowMfa] = useState(false);

  // Forgot password view
  if (auth.view === "forgot") {
    return (
      <div className="auth-shell">
        <BrandPanel />
        <div className="auth-panel">
          <div className="auth-card">
            <ForgotPassword />
          </div>
        </div>
      </div>
    );
  }

  // MFA challenge view
  if (showMfa) {
    return (
      <div className="auth-shell">
        <BrandPanel />
        <div className="auth-panel">
          <div className="auth-card">
            <MfaChallenge onBack={() => setShowMfa(false)} />
          </div>
        </div>
      </div>
    );
  }

  // Login / Register
  return (
    <div className="auth-shell">
      <BrandPanel />
      <div className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-header">
            <h2>{tab === "login" ? "Welcome back" : "Create account"}</h2>
            <p>
              {tab === "login"
                ? "Sign in to your Renocorp workspace"
                : "Get started with Renocorp today"}
            </p>
          </div>

          <div className="auth-nav">
            <button
              className={`auth-nav-btn${tab === "login" ? " active" : ""}`}
              onClick={() => setTab("login")}
            >
              Sign in
            </button>
            <button
              className={`auth-nav-btn${tab === "register" ? " active" : ""}`}
              onClick={() => setTab("register")}
            >
              Register
            </button>
          </div>

          {tab === "login"
            ? <LoginForm onMfaRequired={() => setShowMfa(true)} />
            : <RegisterForm />
          }
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DEFAULT EXPORT — mount this inside <AuthProvider>
// ═══════════════════════════════════════════════════════════

export default function AuthUI() {
  return (
    <>
      <style>{globalStyles}</style>
      <div className="rc-app">
        <AuthPage />
      </div>
    </>
  );
}

