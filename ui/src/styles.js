/**
 * styles.js — RENOCORP Design System
 * =====================================
 * Single source of truth for all visual tokens.
 * Shared across Auth UI + Dashboard + all future modules.
 *
 * Fonts:    Syne (display) + DM Mono (code/mono)
 * Palette:  Deep dark · Accent green (#4ade80) · Danger red
 * Motion:   Subtle, purposeful — no decorative spin
 */

export const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    /* ── Surfaces ── */
    --bg:          #080c10;
    --surface:     #0d1117;
    --surface-2:   #161b22;
    --surface-3:   #1c2330;
    --surface-4:   #21283a;

    /* ── Borders ── */
    --border:        rgba(255,255,255,0.07);
    --border-hover:  rgba(255,255,255,0.13);
    --border-active: rgba(255,255,255,0.20);

    /* ── Accent – green ── */
    --accent:        #4ade80;
    --accent-dim:    rgba(74,222,128,0.10);
    --accent-glow:   rgba(74,222,128,0.22);
    --accent-border: rgba(74,222,128,0.30);

    /* ── Danger ── */
    --danger:        #f87171;
    --danger-dim:    rgba(248,113,113,0.09);
    --danger-border: rgba(248,113,113,0.28);

    /* ── Warning ── */
    --warning:       #fb923c;
    --warning-dim:   rgba(251,146,60,0.10);

    /* ── Info / Blue ── */
    --info:          #60a5fa;
    --info-dim:      rgba(96,165,250,0.10);
    --info-border:   rgba(96,165,250,0.25);

    /* ── Purple (MFA badge) ── */
    --purple:        #c084fc;
    --purple-dim:    rgba(192,132,252,0.10);

    /* ── Text ── */
    --text:          #e6edf3;
    --text-muted:    #7d8590;
    --text-dim:      #3d4451;

    /* ── Shape ── */
    --radius:    10px;
    --radius-lg: 16px;
    --radius-xl: 22px;

    /* ── Motion ── */
    --ease:       cubic-bezier(0.4,0,0.2,1);
    --transition: 0.17s cubic-bezier(0.4,0,0.2,1);

    /* ── Font stacks ── */
    --font-display: 'Syne', sans-serif;
    --font-mono:    'DM Mono', monospace;
  }

  html, body, #root { height: 100%; }

  body {
    font-family: var(--font-display);
    background: var(--bg);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  ::selection { background: var(--accent-dim); color: var(--accent); }

  /* ── SCROLLBAR ── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--surface-3); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--surface-4); }

  /* ── APP SHELL ── */
  .rc-app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* ══════════════════════════════════════════════
     AUTH SHELL
  ══════════════════════════════════════════════ */

  .auth-shell {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 1fr 1fr;
    position: relative;
    overflow: hidden;
  }

  @media (max-width: 900px) {
    .auth-shell { grid-template-columns: 1fr; }
    .auth-brand { display: none; }
  }

  /* ── BRAND PANEL ── */
  .auth-brand {
    background: linear-gradient(145deg, #08122a 0%, #060e1e 55%, #080c10 100%);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 48px;
    position: relative;
    overflow: hidden;
    border-right: 1px solid var(--border);
  }

  .brand-grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(74,222,128,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(74,222,128,0.025) 1px, transparent 1px);
    background-size: 42px 42px;
    pointer-events: none;
  }

  .brand-orb {
    position: absolute;
    width: 560px; height: 560px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(74,222,128,0.07) 0%, transparent 70%);
    left: -140px; bottom: -120px;
    pointer-events: none;
  }

  .brand-orb-2 {
    position: absolute;
    width: 320px; height: 320px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 70%);
    right: -60px; top: 80px;
    pointer-events: none;
  }

  .brand-logo {
    display: flex;
    align-items: center;
    gap: 11px;
    position: relative;
    z-index: 1;
  }

  .brand-logo-mark {
    width: 36px; height: 36px;
    background: var(--accent);
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; font-weight: 800;
    color: #080c10;
    letter-spacing: -1px;
    flex-shrink: 0;
    box-shadow: 0 0 22px var(--accent-glow);
  }

  .brand-logo-name {
    font-size: 17px; font-weight: 700;
    letter-spacing: 2.5px;
    color: var(--text);
    text-transform: uppercase;
  }

  .brand-headline {
    position: relative;
    z-index: 1;
  }

  .brand-headline h1 {
    font-size: 44px; font-weight: 800;
    line-height: 1.05;
    letter-spacing: -1.8px;
    color: var(--text);
    margin-bottom: 18px;
  }

  .brand-headline h1 span { color: var(--accent); }

  .brand-headline p {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.65;
    font-family: var(--font-mono);
    font-weight: 300;
    max-width: 310px;
  }

  .brand-features {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .brand-feature {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 15px;
    background: rgba(255,255,255,0.025);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 12.5px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-weight: 300;
    transition: border-color var(--transition);
  }

  .brand-feature:hover { border-color: var(--border-hover); }

  .brand-feature-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
    box-shadow: 0 0 8px var(--accent-glow);
  }

  /* ── AUTH PANEL ── */
  .auth-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 24px;
    overflow-y: auto;
    background: var(--surface);
  }

  .auth-card { width: 100%; max-width: 420px; }

  .auth-card-header { margin-bottom: 32px; }

  .auth-card-header h2 {
    font-size: 26px; font-weight: 700;
    letter-spacing: -0.5px;
    color: var(--text);
    margin-bottom: 6px;
  }

  .auth-card-header p {
    font-size: 13px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-weight: 300;
  }

  /* ── TAB NAV ── */
  .auth-nav {
    display: flex;
    gap: 2px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px;
    margin-bottom: 28px;
  }

  .auth-nav-btn {
    flex: 1;
    padding: 9px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: 13px; font-weight: 600;
    border-radius: 7px;
    cursor: pointer;
    transition: var(--transition);
    letter-spacing: 0.4px;
  }

  .auth-nav-btn.active {
    background: var(--surface-3);
    color: var(--text);
    box-shadow: 0 1px 6px rgba(0,0,0,0.3);
  }

  /* ── FORM ELEMENTS ── */
  .field { margin-bottom: 16px; }

  .field-label {
    display: block;
    font-size: 11.5px; font-weight: 600;
    letter-spacing: 0.9px;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 8px;
    font-family: var(--font-mono);
  }

  .field-input-wrap { position: relative; }

  .field-input {
    width: 100%;
    padding: 12px 16px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--font-display);
    font-size: 14px;
    outline: none;
    transition: var(--transition);
    appearance: none;
  }

  .field-input:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-dim);
    background: var(--surface-3);
  }

  .field-input.has-right { padding-right: 44px; }

  .field-input.error-state {
    border-color: var(--danger);
    box-shadow: 0 0 0 3px var(--danger-dim);
  }

  .field-input::placeholder { color: var(--text-dim); }

  .field-icon-btn {
    position: absolute;
    right: 12px; top: 50%;
    transform: translateY(-50%);
    background: none; border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    display: flex; align-items: center;
    transition: color var(--transition);
    line-height: 1;
  }

  .field-icon-btn:hover { color: var(--text); }

  .field-error {
    font-size: 11px;
    color: var(--danger);
    margin-top: 6px;
    font-family: var(--font-mono);
    display: flex; align-items: center;
    gap: 5px;
  }

  /* ── PASSWORD STRENGTH ── */
  .pw-strength { margin-top: 10px; }

  .pw-bars { display: flex; gap: 4px; margin-bottom: 6px; }

  .pw-bar {
    height: 3px; flex: 1;
    border-radius: 2px;
    background: var(--surface-3);
    transition: background 0.25s ease;
  }

  .pw-bar.w { background: var(--danger); }
  .pw-bar.f { background: var(--warning); }
  .pw-bar.g { background: #facc15; }
  .pw-bar.s { background: var(--accent); }

  .pw-label {
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--text-muted);
  }

  .pw-rules {
    display: flex; flex-wrap: wrap;
    gap: 5px; margin-top: 8px;
  }

  .pw-rule {
    font-size: 10px;
    font-family: var(--font-mono);
    padding: 3px 8px;
    border-radius: 20px;
    background: var(--surface-3);
    color: var(--text-dim);
    transition: var(--transition);
  }

  .pw-rule.met { background: var(--accent-dim); color: var(--accent); }

  /* ── LAYOUT HELPERS ── */
  .row { display: flex; gap: 12px; }
  .row .field { flex: 1; }

  .check-row {
    display: flex; align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .check-label {
    display: flex; align-items: center;
    gap: 8px; font-size: 13px;
    color: var(--text-muted);
    cursor: pointer;
    user-select: none;
  }

  .check-label input[type="checkbox"] {
    width: 15px; height: 15px;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .link-btn {
    background: none; border: none;
    color: var(--accent);
    font-family: var(--font-display);
    font-size: 13px; font-weight: 600;
    cursor: pointer;
    padding: 0;
    transition: opacity var(--transition);
  }

  .link-btn:hover { opacity: 0.72; }

  /* ── BUTTONS ── */
  .btn-primary {
    width: 100%;
    padding: 13px;
    background: var(--accent);
    color: #080c10;
    border: none;
    border-radius: var(--radius);
    font-family: var(--font-display);
    font-size: 14px; font-weight: 700;
    letter-spacing: 0.2px;
    cursor: pointer;
    transition: var(--transition);
    display: flex; align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: 0 0 20px var(--accent-glow);
    position: relative;
    overflow: hidden;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 28px var(--accent-glow);
  }

  .btn-primary:active:not(:disabled) { transform: translateY(0); }

  .btn-primary:disabled {
    opacity: 0.45; cursor: not-allowed; box-shadow: none;
  }

  .btn-secondary {
    width: 100%; padding: 11px;
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--font-display);
    font-size: 13px; font-weight: 600;
    cursor: pointer;
    transition: var(--transition);
    display: flex; align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .btn-secondary:hover:not(:disabled) {
    border-color: var(--border-active);
    background: rgba(255,255,255,0.04);
  }

  .btn-danger {
    padding: 7px 14px;
    background: transparent;
    color: var(--danger);
    border: 1px solid var(--danger-border);
    border-radius: 7px;
    font-family: var(--font-display);
    font-size: 12px; font-weight: 600;
    cursor: pointer;
    transition: var(--transition);
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--danger-dim);
    border-color: var(--danger);
  }

  .btn-danger:disabled { opacity: 0.45; cursor: not-allowed; }

  /* ── DIVIDER ── */
  .divider {
    display: flex; align-items: center;
    gap: 12px; margin: 20px 0;
    font-size: 10.5px;
    font-family: var(--font-mono);
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1.2px;
  }

  .divider::before, .divider::after {
    content: ''; flex: 1;
    height: 1px; background: var(--border);
  }

  /* ── OAUTH BUTTONS ── */
  .oauth-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  .oauth-btn {
    padding: 11px 8px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: 12px; font-weight: 600;
    cursor: pointer;
    transition: var(--transition);
    display: flex; align-items: center;
    justify-content: center;
    gap: 7px;
    letter-spacing: 0.2px;
  }

  .oauth-btn:hover {
    border-color: var(--border-active);
    color: var(--text);
    background: var(--surface-3);
  }

  /* ── ALERT ── */
  .alert {
    padding: 12px 15px;
    border-radius: var(--radius);
    font-size: 13px;
    font-family: var(--font-mono);
    margin-bottom: 20px;
    display: flex; align-items: flex-start;
    gap: 10px; line-height: 1.5;
    animation: alertIn 0.18s ease;
  }

  @keyframes alertIn {
    from { opacity: 0; transform: translateY(-5px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .alert-error   { background: var(--danger-dim);  border: 1px solid var(--danger-border);  color: var(--danger); }
  .alert-success { background: var(--accent-dim);  border: 1px solid var(--accent-border);  color: var(--accent); }
  .alert-info    { background: var(--info-dim);    border: 1px solid var(--info-border);    color: var(--info); }

  /* ── SPINNER ── */
  .spinner {
    width: 16px; height: 16px;
    border: 2px solid rgba(0,0,0,0.18);
    border-top-color: #080c10;
    border-radius: 50%;
    animation: spin 0.65s linear infinite;
    flex-shrink: 0;
  }

  .spinner-light {
    border-color: rgba(255,255,255,0.08);
    border-top-color: var(--accent);
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── MFA DIGIT INPUT ── */
  .mfa-digits {
    display: flex; gap: 8px;
    justify-content: center;
    margin: 28px 0;
  }

  .mfa-digit {
    width: 48px; height: 58px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    text-align: center;
    font-family: var(--font-mono);
    font-size: 22px; font-weight: 500;
    color: var(--text);
    outline: none;
    transition: var(--transition);
    caret-color: var(--accent);
  }

  .mfa-digit:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-dim);
    background: var(--surface-3);
  }

  .mfa-digit.filled { border-color: var(--accent); color: var(--accent); }

  .mfa-timer {
    text-align: center;
    font-size: 12px; font-family: var(--font-mono);
    color: var(--text-muted);
    margin-bottom: 20px;
  }

  .mfa-timer span { color: var(--accent); font-weight: 500; }

  /* ── BADGES ── */
  .badge {
    font-size: 10px; font-weight: 600;
    padding: 3px 9px;
    border-radius: 20px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    font-family: var(--font-mono);
    white-space: nowrap;
  }

  .badge-active  { background: var(--accent-dim);  color: var(--accent); }
  .badge-current { background: var(--info-dim);    color: var(--info); }
  .badge-mfa     { background: var(--purple-dim);  color: var(--purple); }
  .badge-danger  { background: var(--danger-dim);  color: var(--danger); }

  /* ── STATUS DOT ── */
  .status-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent-glow);
    flex-shrink: 0;
  }

  /* ── TOTP SETUP ── */
  .totp-setup {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px;
    margin-bottom: 20px;
  }

  .totp-setup p {
    font-size: 12px; font-family: var(--font-mono);
    color: var(--text-muted);
    margin-bottom: 10px; line-height: 1.55;
  }

  .totp-secret {
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 10px 14px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--accent);
    word-break: break-all;
    line-height: 1.6;
    user-select: all;
  }

  /* ── DASHBOARD ── */
  .dashboard {
    min-height: 100vh;
    display: flex; flex-direction: column;
    background: var(--bg);
  }

  .dash-nav {
    height: 60px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center;
    justify-content: space-between;
    padding: 0 28px;
    position: sticky; top: 0;
    z-index: 100;
    backdrop-filter: blur(12px);
  }

  .dash-nav-logo {
    display: flex; align-items: center;
    gap: 10px;
    font-weight: 700; font-size: 15px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--text);
    user-select: none;
  }

  .dash-nav-mark {
    width: 30px; height: 30px;
    background: var(--accent);
    border-radius: 7px;
    display: flex; align-items: center;
    justify-content: center;
    font-size: 13px; font-weight: 800;
    color: #080c10;
    letter-spacing: -0.5px;
    box-shadow: 0 0 14px var(--accent-glow);
  }

  .dash-nav-right {
    display: flex; align-items: center; gap: 14px;
  }

  .dash-user-chip {
    display: flex; align-items: center;
    gap: 9px;
    padding: 5px 12px 5px 5px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 30px;
    font-size: 13px; font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .dash-avatar {
    width: 28px; height: 28px;
    background: var(--accent);
    border-radius: 50%;
    display: flex; align-items: center;
    justify-content: center;
    font-size: 10.5px; font-weight: 800;
    color: #080c10;
    flex-shrink: 0;
    letter-spacing: 0;
  }

  .dash-body {
    flex: 1;
    padding: 36px 28px;
    max-width: 900px;
    width: 100%;
    margin: 0 auto;
  }

  .dash-greeting { margin-bottom: 32px; }

  .dash-greeting h2 {
    font-size: 28px; font-weight: 800;
    letter-spacing: -0.5px;
    margin-bottom: 5px;
  }

  .dash-greeting p {
    font-size: 13px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-weight: 300;
  }

  .dash-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 28px;
  }

  .dash-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 22px;
    transition: border-color var(--transition);
  }

  .dash-card:hover { border-color: var(--border-hover); }

  .dash-card h3 {
    font-size: 11px; font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--text-muted);
    font-family: var(--font-mono);
    margin-bottom: 10px;
  }

  .dash-card-value {
    font-size: 26px; font-weight: 700;
    color: var(--text);
  }

  .dash-card-sub {
    font-size: 11.5px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    margin-top: 4px;
    font-weight: 300;
  }

  .dash-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    margin-bottom: 16px;
    overflow: hidden;
  }

  .dash-section-header {
    padding: 18px 22px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center;
    justify-content: space-between;
  }

  .dash-section-header h3 {
    font-size: 14px; font-weight: 700;
    display: flex; align-items: center; gap: 8px;
  }

  /* ── PROFILE ROWS ── */
  .profile-row {
    padding: 14px 22px;
    display: flex; align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }

  .profile-row:last-child { border-bottom: none; }

  .profile-key {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
  }

  .profile-val { font-weight: 600; }

  /* ── SESSION ITEMS ── */
  .session-item {
    padding: 16px 22px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center;
    justify-content: space-between;
    gap: 12px;
    transition: background var(--transition);
  }

  .session-item:last-child { border-bottom: none; }
  .session-item:hover { background: rgba(255,255,255,0.018); }

  .session-item-left { display: flex; align-items: center; gap: 14px; }

  .session-icon {
    width: 36px; height: 36px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 9px;
    display: flex; align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .session-info-name {
    font-size: 13px; font-weight: 600;
    color: var(--text); margin-bottom: 3px;
  }

  .session-info-meta {
    font-size: 11px; color: var(--text-muted);
    font-family: var(--font-mono); font-weight: 300;
  }

  /* ── EMPTY STATE ── */
  .empty-state {
    padding: 44px 22px;
    text-align: center;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 300;
  }

  /* ── ANIMATIONS ── */
  .fade-in {
    animation: fadeIn 0.25s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .slide-up {
    animation: slideUp 0.3s ease;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

export default globalStyles;

