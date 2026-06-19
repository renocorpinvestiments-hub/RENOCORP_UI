/**
 * styles.js — RENOCORP Design System  v2.0
 * ==========================================
 * Single source of truth for all visual tokens and global CSS.
 * Extended from v1.0 with shell components:
 *  · Side drawer
 *  · Bottom navigation
 *  · Modal / bottom sheet
 *  · Notification bell
 *  · Top nav bar extras
 *  · Shared component classes (StatCard, TabBar, Badge, etc.)
 *  · Admin surface tokens
 *  · Responsive grid system
 *  · Animation library
 *
 * Fonts:    Syne (display) + DM Mono (mono)
 * Palette:  Deep dark · Accent green #4ade80 · Status colors
 * Motion:   Purposeful — orchestrated, not decorative
 */

export const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap');

  /* ── RESET ── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  button { cursor: pointer; font-family: inherit; }
  a { text-decoration: none; color: inherit; }
  img, svg { display: block; }

  /* ══════════════════════════════════════════════
     DESIGN TOKENS
  ══════════════════════════════════════════════ */
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

    /* ── Accent green ── */
    --accent:        #4ade80;
    --accent-dim:    rgba(74,222,128,0.10);
    --accent-glow:   rgba(74,222,128,0.22);
    --accent-border: rgba(74,222,128,0.30);
    --accent-dark:   #22c55e;

    /* ── Danger ── */
    --danger:        #f87171;
    --danger-dim:    rgba(248,113,113,0.09);
    --danger-border: rgba(248,113,113,0.28);

    /* ── Warning ── */
    --warning:       #fb923c;
    --warning-dim:   rgba(251,146,60,0.10);
    --warning-border:rgba(251,146,60,0.28);

    /* ── Info / Blue ── */
    --info:          #60a5fa;
    --info-dim:      rgba(96,165,250,0.10);
    --info-border:   rgba(96,165,250,0.25);

    /* ── Purple ── */
    --purple:        #c084fc;
    --purple-dim:    rgba(192,132,252,0.10);
    --purple-border: rgba(192,132,252,0.28);

    /* ── Text ── */
    --text:          #e6edf3;
    --text-muted:    #7d8590;
    --text-dim:      #3d4451;

    /* ── Shape ── */
    --radius:    10px;
    --radius-lg: 16px;
    --radius-xl: 22px;

    /* ── Spacing scale ── */
    --sp-1: 4px;   --sp-2: 8px;   --sp-3: 12px;
    --sp-4: 16px;  --sp-5: 20px;  --sp-6: 24px;
    --sp-8: 32px;  --sp-10: 40px;

    /* ── Motion ── */
    --ease:        cubic-bezier(0.4,0,0.2,1);
    --ease-spring: cubic-bezier(0.34,1.56,0.64,1);
    --transition:  0.17s cubic-bezier(0.4,0,0.2,1);
    --transition-slow: 0.28s cubic-bezier(0.4,0,0.2,1);

    /* ── Font stacks ── */
    --font-display: 'Syne', system-ui, sans-serif;
    --font-mono:    'DM Mono', 'Fira Code', monospace;

    /* ── Z-index ladder ── */
    --z-base:    1;
    --z-nav:     100;
    --z-drawer:  300;
    --z-overlay: 400;
    --z-modal:   500;
    --z-toast:   600;
  }

  /* Light theme override */
  [data-theme="light"] {
    --bg:          #f0f4f8;
    --surface:     #ffffff;
    --surface-2:   #f6f8fa;
    --surface-3:   #eaeef2;
    --surface-4:   #dde3ea;
    --border:        rgba(0,0,0,0.08);
    --border-hover:  rgba(0,0,0,0.14);
    --border-active: rgba(0,0,0,0.22);
    --text:          #0d1117;
    --text-muted:    #57606a;
    --text-dim:      #a0aab4;
  }

  /* ── BASE ── */
  html { -webkit-text-size-adjust: 100%; }
  html, body, #root { height: 100%; }
  body {
    font-family: var(--font-display);
    background: var(--bg);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overscroll-behavior: none;
  }

  ::selection { background: var(--accent-dim); color: var(--accent); }

  /* ── SCROLLBAR ── */
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--surface-3); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--surface-4); }

  /* ── FOCUS VISIBLE ── */
  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }

  /* ── REDUCED MOTION ── */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }

  /* ══════════════════════════════════════════════
     APP SHELL
  ══════════════════════════════════════════════ */
  .rc-app {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  /* ── MAIN CONTENT ── */
  .main-content {
    flex: 1;
    width: 100%;
    padding-top: 64px;         /* TopNavBar height */
    padding-bottom: 68px;      /* BottomNav height + safe area */
    padding-bottom: calc(68px + env(safe-area-inset-bottom));
    min-height: 100dvh;
  }

  @media (min-width: 900px) {
    .main-content { padding-bottom: 24px; }
  }

  /* ══════════════════════════════════════════════
     TOP NAV BAR
  ══════════════════════════════════════════════ */
  .dash-nav {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 64px;
    height: calc(64px + env(safe-area-inset-top));
    padding-top: env(safe-area-inset-top);
    background: rgba(8,12,16,0.88);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-left: 16px;
    padding-right: 16px;
    z-index: var(--z-nav);
    will-change: transform;
  }

  .dash-nav-logo {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .dash-nav-hamburger {
    background: none;
    border: none;
    color: var(--text-muted);
    width: 38px; height: 38px;
    border-radius: var(--radius);
    display: flex; align-items: center; justify-content: center;
    transition: background var(--transition), color var(--transition);
    flex-shrink: 0;
  }

  .dash-nav-hamburger:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .dash-nav-mark {
    width: 32px; height: 32px;
    background: var(--accent);
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 800;
    color: #080c10;
    letter-spacing: -0.5px;
    flex-shrink: 0;
    box-shadow: 0 0 14px var(--accent-glow);
  }

  .dash-nav-wordmark {
    font-size: 13px; font-weight: 700;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: var(--text);
  }

  @media (max-width: 380px) { .dash-nav-wordmark { display: none; } }

  .dash-nav-right {
    display: flex; align-items: center; gap: 10px;
  }

  /* Notification bell button */
  .notif-bell-btn {
    position: relative;
    background: none;
    border: none;
    color: var(--text-muted);
    width: 38px; height: 38px;
    border-radius: var(--radius);
    display: flex; align-items: center; justify-content: center;
    transition: background var(--transition), color var(--transition);
  }

  .notif-bell-btn:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .notif-badge {
    position: absolute;
    top: 5px; right: 5px;
    background: var(--danger);
    color: #fff;
    border-radius: 50%;
    width: 15px; height: 15px;
    font-size: 9px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    border: 1.5px solid var(--bg);
    line-height: 1;
    animation: badgePop 0.3s var(--ease-spring);
  }

  @keyframes badgePop {
    from { transform: scale(0); }
    to   { transform: scale(1); }
  }

  .dash-user-chip {
    display: flex; align-items: center;
    gap: 8px;
    padding: 4px 12px 4px 4px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 30px;
    font-size: 13px; font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
    transition: border-color var(--transition), color var(--transition);
    max-width: 160px;
  }

  .dash-user-chip:hover {
    border-color: var(--border-hover);
    color: var(--text);
  }

  .dash-avatar {
    width: 28px; height: 28px;
    background: var(--accent);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 800;
    color: #080c10;
    flex-shrink: 0;
    letter-spacing: 0;
  }

  .dash-avatar-lg {
    width: 52px; height: 52px;
    border-radius: 50%;
    background: var(--accent);
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: 800;
    color: #080c10;
    flex-shrink: 0;
  }

  /* ══════════════════════════════════════════════
     SIDE DRAWER
  ══════════════════════════════════════════════ */
  .drawer-backdrop {
    position: fixed; inset: 0;
    z-index: calc(var(--z-drawer) - 1);
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    opacity: 0; pointer-events: none;
    transition: opacity var(--transition-slow);
  }

  .drawer-backdrop.open {
    opacity: 1;
    pointer-events: all;
  }

  .drawer {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    width: 75vw;
    max-width: 300px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    z-index: var(--z-drawer);
    transform: translateX(-100%);
    transition: transform var(--transition-slow) var(--ease);
    display: flex; flex-direction: column;
    padding-top: env(safe-area-inset-top);
    will-change: transform;
    overscroll-behavior: contain;
  }

  .drawer.open {
    transform: translateX(0);
  }

  .drawer-inner {
    flex: 1;
    display: flex; flex-direction: column;
    padding: 20px 18px;
    overflow-y: auto;
  }

  .drawer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 22px;
    flex-shrink: 0;
  }

  .drawer-title {
    font-size: 11px; font-weight: 700;
    letter-spacing: 2.5px; text-transform: uppercase;
    color: var(--text-muted);
  }

  .drawer-close {
    background: none; border: none;
    color: var(--text-muted);
    width: 32px; height: 32px;
    border-radius: var(--radius);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
    transition: background var(--transition), color var(--transition);
  }

  .drawer-close:hover { background: var(--surface-2); color: var(--text); }

  .drawer-user {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    margin-bottom: 18px;
    transition: border-color var(--transition), background var(--transition);
    flex-shrink: 0;
  }

  .drawer-user:hover { border-color: var(--border-hover); background: var(--surface-3); }

  .drawer-user-info { min-width: 0; }

  .drawer-user-name {
    font-size: 14px; font-weight: 700;
    color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .drawer-user-email {
    font-size: 11px; font-weight: 300;
    color: var(--text-muted);
    font-family: var(--font-mono);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    margin-top: 2px;
  }

  .drawer-nav {
    display: flex; flex-direction: column;
    gap: 2px; flex: 1;
    margin-bottom: 16px;
  }

  .drawer-nav-btn {
    background: none; border: none;
    text-align: left;
    padding: 12px 14px;
    border-radius: var(--radius);
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: 14px; font-weight: 600;
    display: flex; align-items: center; gap: 12px;
    transition: background var(--transition), color var(--transition);
    position: relative;
  }

  .drawer-nav-btn:hover {
    background: var(--surface-2);
    color: var(--text);
  }

  .drawer-nav-btn.active {
    background: var(--accent-dim);
    color: var(--accent);
  }

  .drawer-nav-btn.admin-btn {
    color: var(--warning);
  }

  .drawer-nav-btn.admin-btn:hover {
    background: var(--warning-dim);
    color: var(--warning);
  }

  .drawer-nav-icon {
    width: 18px; height: 18px;
    flex-shrink: 0;
    opacity: 0.7;
  }

  .drawer-divider {
    height: 1px;
    background: var(--border);
    margin: 10px 0;
    flex-shrink: 0;
  }

  .drawer-footer {
    display: flex; flex-direction: column; gap: 6px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }

  .drawer-footer a {
    color: var(--text-dim);
    font-size: 11px; font-family: var(--font-mono);
    font-weight: 300;
    padding: 4px 0;
    transition: color var(--transition);
    display: block;
  }

  .drawer-footer a:hover { color: var(--text-muted); }

  /* ══════════════════════════════════════════════
     BOTTOM NAV
  ══════════════════════════════════════════════ */
  .bottom-nav {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    height: calc(60px + env(safe-area-inset-bottom));
    background: rgba(13,17,23,0.94);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    border-top: 1px solid var(--border);
    display: flex;
    z-index: var(--z-nav);
    padding-bottom: env(safe-area-inset-bottom);
    will-change: transform;
  }

  @media (min-width: 900px) { .bottom-nav { display: none; } }

  .bottom-nav-item {
    flex: 1;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    color: var(--text-dim);
    font-size: 10px; font-weight: 600;
    gap: 3px;
    padding: 8px 4px 2px;
    transition: color var(--transition);
    position: relative;
    -webkit-tap-highlight-color: transparent;
  }

  .bottom-nav-item.active { color: var(--accent); }

  .bottom-nav-item.active::before {
    content: '';
    position: absolute;
    top: 0; left: 50%;
    transform: translateX(-50%);
    width: 28px; height: 2px;
    background: var(--accent);
    border-radius: 0 0 2px 2px;
  }

  .bottom-nav-icon {
    width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
  }

  .bottom-nav-label { font-size: 10px; letter-spacing: 0.2px; }

  /* ══════════════════════════════════════════════
     MODAL / BOTTOM SHEET
  ══════════════════════════════════════════════ */
  .modal-overlay {
    position: fixed; inset: 0;
    z-index: var(--z-modal);
    background: rgba(0,0,0,0.65);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex;
    align-items: flex-end;
    animation: rcFadeIn 0.15s ease;
  }

  @media (min-width: 600px) {
    .modal-overlay {
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
  }

  .modal-sheet {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    padding: 8px 24px 24px;
    width: 100%;
    max-height: 92dvh;
    overflow-y: auto;
    overscroll-behavior: contain;
    animation: rcSlideUp 0.28s var(--ease);
  }

  @media (min-width: 600px) {
    .modal-sheet {
      border-radius: var(--radius-xl);
      max-width: 480px;
      max-height: 85dvh;
    }
  }

  .modal-handle {
    width: 36px; height: 4px;
    background: var(--border-active);
    border-radius: 2px;
    margin: 0 auto 18px;
  }

  @media (min-width: 600px) { .modal-handle { display: none; } }

  .modal-title {
    font-size: 16px; font-weight: 700;
    margin-bottom: 18px;
    line-height: 1.3;
  }

  /* ══════════════════════════════════════════════
     DASH BODY / PAGE CONTENT
  ══════════════════════════════════════════════ */
  .dash-body {
    padding: 24px 16px 24px;
    max-width: 900px;
    width: 100%;
    margin: 0 auto;
  }

  @media (min-width: 600px) { .dash-body { padding: 32px 24px; } }
  @media (min-width: 900px) { .dash-body { padding: 36px 28px; } }

  .dash-greeting { margin-bottom: 24px; }

  .dash-greeting h2 {
    font-size: 24px; font-weight: 800;
    letter-spacing: -0.5px;
    margin-bottom: 4px;
    line-height: 1.2;
  }

  @media (min-width: 600px) { .dash-greeting h2 { font-size: 28px; } }

  .dash-greeting p {
    font-size: 13px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-weight: 300;
  }

  /* ── STAT CARDS GRID ── */
  .dash-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }

  @media (min-width: 600px) {
    .dash-grid { grid-template-columns: repeat(4, 1fr); gap: 16px; }
  }

  .dash-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 18px;
    transition: border-color var(--transition), transform var(--transition);
    position: relative;
    overflow: hidden;
  }

  .dash-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(255,255,255,0.018) 0%, transparent 60%);
    pointer-events: none;
  }

  .dash-card:hover {
    border-color: var(--border-hover);
    transform: translateY(-1px);
  }

  @media (min-width: 600px) { .dash-card { padding: 22px; } }

  .dash-card h3 {
    font-size: 10px; font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--text-muted);
    font-family: var(--font-mono);
    margin-bottom: 10px;
  }

  .dash-card-value {
    font-size: 22px; font-weight: 700;
    color: var(--text);
    line-height: 1.1;
    font-family: var(--font-mono);
  }

  @media (min-width: 600px) { .dash-card-value { font-size: 26px; } }

  .dash-card-sub {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    margin-top: 5px;
    font-weight: 300;
  }

  /* ── SECTION CARDS ── */
  .dash-section {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    margin-bottom: 14px;
    overflow: hidden;
    transition: border-color var(--transition);
  }

  .dash-section:hover { border-color: var(--border-hover); }

  .dash-section-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center;
    justify-content: space-between;
    cursor: default;
  }

  .dash-section-header h3 {
    font-size: 13px; font-weight: 700;
    display: flex; align-items: center; gap: 8px;
    letter-spacing: 0.3px;
  }

  /* ── PROFILE ROWS ── */
  .profile-row {
    padding: 14px 20px;
    display: flex; align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    gap: 12px;
  }

  .profile-row:last-child { border-bottom: none; }

  .profile-key {
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11.5px;
    flex-shrink: 0;
  }

  .profile-val { font-weight: 600; text-align: right; }

  /* ── SESSION / LIST ITEMS ── */
  .session-item {
    padding: 15px 20px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center;
    justify-content: space-between;
    gap: 12px;
    transition: background var(--transition);
  }

  .session-item:last-child { border-bottom: none; }
  .session-item:hover { background: rgba(255,255,255,0.016); }

  .session-item-left { display: flex; align-items: center; gap: 13px; }

  .session-icon {
    width: 36px; height: 36px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
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

  /* ══════════════════════════════════════════════
     SHARED COMPONENTS
  ══════════════════════════════════════════════ */

  /* ── TAB BAR ── */
  .rc-tabs {
    display: flex;
    gap: 2px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 3px;
    margin-bottom: 18px;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .rc-tabs::-webkit-scrollbar { display: none; }

  .rc-tab-btn {
    flex-shrink: 0;
    background: none; border: none;
    padding: 7px 14px;
    border-radius: 7px;
    font-family: var(--font-display);
    font-size: 13px; font-weight: 600;
    color: var(--text-muted);
    transition: background var(--transition), color var(--transition);
    white-space: nowrap;
  }

  .rc-tab-btn:hover { color: var(--text); }

  .rc-tab-btn.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  }

  /* ── BADGE ── */
  .rc-badge {
    display: inline-flex; align-items: center;
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 10.5px; font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    font-family: var(--font-mono);
  }

  .rc-badge-green   { background: var(--accent-dim);   color: var(--accent);  border: 1px solid var(--accent-border); }
  .rc-badge-orange  { background: var(--warning-dim);  color: var(--warning); border: 1px solid var(--warning-border); }
  .rc-badge-red     { background: var(--danger-dim);   color: var(--danger);  border: 1px solid var(--danger-border); }
  .rc-badge-blue    { background: var(--info-dim);     color: var(--info);    border: 1px solid var(--info-border); }
  .rc-badge-purple  { background: var(--purple-dim);   color: var(--purple);  border: 1px solid var(--purple-border); }
  .rc-badge-grey    { background: var(--surface-3);    color: var(--text-muted); border: 1px solid var(--border); }

  /* ── SPINNER ── */
  .rc-spinner {
    width: 32px; height: 32px;
    border: 2.5px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: rcSpin 0.7s linear infinite;
    flex-shrink: 0;
  }

  .rc-spinner-sm {
    width: 18px; height: 18px;
    border-width: 2px;
  }

  @keyframes rcSpin { to { transform: rotate(360deg); } }

  .rc-spinner-wrap {
    display: flex; align-items: center; justify-content: center;
    padding: 40px;
  }

  /* ── EMPTY STATE ── */
  .rc-empty {
    padding: 52px 24px;
    text-align: center;
  }

  .rc-empty-icon {
    width: 48px; height: 48px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 16px;
    font-size: 22px;
  }

  .rc-empty-title {
    font-size: 15px; font-weight: 700;
    margin-bottom: 6px;
  }

  .rc-empty-sub {
    font-size: 13px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-weight: 300;
    max-width: 280px; margin: 0 auto;
    line-height: 1.6;
  }

  /* ── ALERT ── */
  .rc-alert {
    padding: 12px 16px;
    border-radius: var(--radius);
    font-size: 13px; font-weight: 500;
    display: flex; align-items: flex-start; gap: 10px;
    line-height: 1.5;
    margin-bottom: 14px;
  }

  .rc-alert-error   { background: var(--danger-dim);  border: 1px solid var(--danger-border);  color: var(--danger); }
  .rc-alert-success { background: var(--accent-dim);  border: 1px solid var(--accent-border);  color: var(--accent); }
  .rc-alert-info    { background: var(--info-dim);    border: 1px solid var(--info-border);    color: var(--info); }
  .rc-alert-warning { background: var(--warning-dim); border: 1px solid var(--warning-border); color: var(--warning); }

  /* ── CONFIRM DIALOG ── */
  .rc-confirm-actions {
    display: flex; gap: 10px; margin-top: 20px;
  }

  .rc-confirm-actions button { flex: 1; }

  /* ── STAT CARD (component) ── */
  .stat-card-accent { border-color: var(--accent-border) !important; }
  .stat-card-accent .dash-card-value { color: var(--accent); }

  /* ── PAGINATION ── */
  .rc-pagination {
    display: flex; align-items: center; gap: 8px;
    justify-content: center;
    padding: 16px 0 4px;
  }

  .rc-page-btn {
    min-width: 36px; height: 36px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 13px; font-weight: 600;
    color: var(--text-muted);
    display: flex; align-items: center; justify-content: center;
    transition: all var(--transition);
    padding: 0 10px;
  }

  .rc-page-btn:hover { border-color: var(--border-hover); color: var(--text); }
  .rc-page-btn.active { background: var(--accent-dim); border-color: var(--accent-border); color: var(--accent); }
  .rc-page-btn:disabled { opacity: 0.35; pointer-events: none; }

  /* ── BUTTONS ── */
  .btn-primary {
    width: 100%;
    padding: 13px 20px;
    background: var(--accent);
    border: none;
    border-radius: var(--radius);
    color: #080c10;
    font-family: var(--font-display);
    font-size: 14px; font-weight: 700;
    cursor: pointer;
    transition: opacity var(--transition), transform var(--transition), box-shadow var(--transition);
    display: flex; align-items: center; justify-content: center; gap: 8px;
    letter-spacing: 0.2px;
  }

  .btn-primary:hover {
    opacity: 0.9;
    box-shadow: 0 4px 16px var(--accent-glow);
  }

  .btn-primary:active { transform: scale(0.98); }
  .btn-primary:disabled { opacity: 0.4; pointer-events: none; }

  .btn-secondary {
    width: 100%;
    padding: 12px 20px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--font-display);
    font-size: 14px; font-weight: 600;
    cursor: pointer;
    transition: border-color var(--transition), background var(--transition);
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }

  .btn-secondary:hover { border-color: var(--border-hover); background: var(--surface-3); }
  .btn-secondary:disabled { opacity: 0.4; pointer-events: none; }

  .btn-danger {
    background: var(--danger-dim);
    border-color: var(--danger-border);
    color: var(--danger);
  }

  .btn-danger:hover { background: rgba(248,113,113,0.15); border-color: var(--danger); }

  .btn-ghost {
    background: none;
    border: none;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: 13px; font-weight: 600;
    padding: 8px 12px;
    border-radius: var(--radius);
    transition: background var(--transition), color var(--transition);
  }

  .btn-ghost:hover { background: var(--surface-2); color: var(--text); }

  .link-btn {
    background: none; border: none;
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 11px; font-weight: 500;
    padding: 3px 8px;
    border-radius: 6px;
    transition: background var(--transition);
  }

  .link-btn:hover { background: var(--accent-dim); }

  /* ── FORM INPUTS ── */
  .rc-input {
    width: 100%;
    padding: 11px 14px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--font-display);
    font-size: 14px;
    transition: border-color var(--transition), box-shadow var(--transition);
    appearance: none;
    -webkit-appearance: none;
  }

  .rc-input:focus {
    outline: none;
    border-color: var(--accent-border);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }

  .rc-input::placeholder { color: var(--text-dim); }

  .rc-label {
    display: block;
    font-size: 12px; font-weight: 600;
    color: var(--text-muted);
    font-family: var(--font-mono);
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    text-transform: uppercase;
  }

  .rc-field { margin-bottom: 16px; }

  /* ── SELECT ── */
  .rc-select {
    width: 100%;
    padding: 11px 14px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--font-display);
    font-size: 14px;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
  }

  .rc-select:focus { outline: none; border-color: var(--accent-border); }

  /* ══════════════════════════════════════════════
     AUTH SHELL (preserved from v1)
  ══════════════════════════════════════════════ */
  .auth-shell {
    min-height: 100dvh;
    display: grid;
    grid-template-columns: 1fr 1fr;
    position: relative;
    overflow: hidden;
  }

  @media (max-width: 900px) {
    .auth-shell { grid-template-columns: 1fr; }
    .auth-brand { display: none; }
  }

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
    position: absolute; inset: 0;
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
    display: flex; align-items: center; gap: 11px;
    position: relative; z-index: 1;
  }

  .brand-logo-mark {
    width: 36px; height: 36px;
    background: var(--accent);
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; font-weight: 800;
    color: #080c10; letter-spacing: -1px;
    flex-shrink: 0;
    box-shadow: 0 0 22px var(--accent-glow);
  }

  .brand-logo-name {
    font-size: 17px; font-weight: 700;
    letter-spacing: 2.5px; color: var(--text);
    text-transform: uppercase;
  }

  .brand-headline { position: relative; z-index: 1; }

  .brand-headline h1 {
    font-size: 44px; font-weight: 800;
    line-height: 1.05; letter-spacing: -1.8px;
    color: var(--text); margin-bottom: 18px;
  }

  .brand-headline h1 span { color: var(--accent); }

  .brand-headline p {
    font-size: 13px; color: var(--text-muted);
    line-height: 1.65; max-width: 320px;
  }

  .brand-stats {
    display: flex; gap: 28px;
    position: relative; z-index: 1;
    padding-top: 28px;
    border-top: 1px solid var(--border);
  }

  .brand-stat-num {
    font-size: 22px; font-weight: 800;
    color: var(--text); letter-spacing: -0.5px;
    font-family: var(--font-mono);
  }

  .brand-stat-label {
    font-size: 11px; color: var(--text-muted);
    margin-top: 2px; font-family: var(--font-mono);
    font-weight: 300;
  }

  /* ── AUTH FORM PANEL ── */
  .auth-form-panel {
    display: flex; align-items: center; justify-content: center;
    padding: 40px 24px;
    background: var(--bg);
    min-height: 100dvh;
    overflow-y: auto;
  }

  .auth-form-inner {
    width: 100%; max-width: 400px;
  }

  .auth-nav {
    display: flex; gap: 2px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 3px; margin-bottom: 28px;
  }

  .auth-nav-btn {
    flex: 1; background: none; border: none;
    padding: 9px 16px;
    border-radius: 7px;
    font-family: var(--font-display);
    font-size: 13px; font-weight: 600;
    color: var(--text-muted);
    transition: background var(--transition), color var(--transition);
  }

  .auth-nav-btn:hover { color: var(--text); }
  .auth-nav-btn.active { background: var(--surface); color: var(--text); box-shadow: 0 1px 4px rgba(0,0,0,0.3); }

  .auth-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
  .auth-logo-mark {
    width: 32px; height: 32px;
    background: var(--accent); border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 800; color: #080c10;
    box-shadow: 0 0 14px var(--accent-glow);
  }
  .auth-logo-name { font-size: 15px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }

  /* AUTH FORM fields (matching existing AuthUI) */
  .auth-field { margin-bottom: 16px; }

  .auth-label {
    display: block; font-size: 12px; font-weight: 600;
    color: var(--text-muted); font-family: var(--font-mono);
    letter-spacing: 0.5px; margin-bottom: 6px; text-transform: uppercase;
  }

  .auth-input {
    width: 100%; padding: 11px 14px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text); font-family: var(--font-display); font-size: 14px;
    transition: border-color var(--transition), box-shadow var(--transition);
    -webkit-appearance: none; appearance: none;
  }

  .auth-input:focus {
    outline: none;
    border-color: var(--accent-border);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }

  .auth-input::placeholder { color: var(--text-dim); }

  .auth-input-wrap { position: relative; }
  .auth-input-wrap .auth-input { padding-right: 44px; }

  .auth-eye-btn {
    position: absolute; right: 0; top: 0; bottom: 0;
    width: 44px; background: none; border: none;
    color: var(--text-muted); font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    transition: color var(--transition);
  }

  .auth-eye-btn:hover { color: var(--text); }

  .auth-btn {
    width: 100%; padding: 13px 20px;
    background: var(--accent); border: none;
    border-radius: var(--radius); color: #080c10;
    font-family: var(--font-display);
    font-size: 14px; font-weight: 700;
    cursor: pointer; margin-top: 4px;
    transition: opacity var(--transition), box-shadow var(--transition), transform var(--transition);
    display: flex; align-items: center; justify-content: center; gap: 8px;
    letter-spacing: 0.2px;
  }

  .auth-btn:hover { opacity: 0.9; box-shadow: 0 4px 16px var(--accent-glow); }
  .auth-btn:active { transform: scale(0.98); }
  .auth-btn:disabled { opacity: 0.4; pointer-events: none; }

  .auth-error {
    padding: 11px 14px;
    background: var(--danger-dim);
    border: 1px solid var(--danger-border);
    border-radius: var(--radius);
    color: var(--danger);
    font-size: 13px; font-weight: 500;
    margin-bottom: 16px;
  }

  .auth-success {
    padding: 11px 14px;
    background: var(--accent-dim);
    border: 1px solid var(--accent-border);
    border-radius: var(--radius);
    color: var(--accent);
    font-size: 13px; font-weight: 500;
    margin-bottom: 16px;
  }

  .auth-divider {
    display: flex; align-items: center; gap: 12px;
    margin: 20px 0; color: var(--text-dim); font-size: 12px;
  }

  .auth-divider::before, .auth-divider::after {
    content: ''; flex: 1; height: 1px; background: var(--border);
  }

  .auth-oauth { display: flex; flex-direction: column; gap: 10px; }

  .auth-oauth-btn {
    width: 100%; padding: 11px 16px;
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: var(--radius); color: var(--text);
    font-family: var(--font-display); font-size: 13px; font-weight: 600;
    display: flex; align-items: center; justify-content: center; gap: 10px;
    transition: border-color var(--transition), background var(--transition);
  }

  .auth-oauth-btn:hover { border-color: var(--border-hover); background: var(--surface-3); }

  .auth-footer {
    margin-top: 22px; text-align: center;
    font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); font-weight: 300;
  }

  .auth-footer a { color: var(--accent); font-weight: 500; }

  /* Strength meter */
  .strength-bar {
    height: 3px; background: var(--surface-3);
    border-radius: 2px; margin-top: 6px;
    overflow: hidden;
  }

  .strength-fill {
    height: 100%; border-radius: 2px;
    transition: width 0.3s ease, background 0.3s ease;
  }

  /* MFA screen */
  .mfa-code-inputs {
    display: flex; gap: 8px; justify-content: center; margin: 20px 0;
  }

  .mfa-code-input {
    width: 44px; height: 52px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    text-align: center; font-size: 22px; font-weight: 700;
    color: var(--text); font-family: var(--font-mono);
    transition: border-color var(--transition), box-shadow var(--transition);
    -webkit-appearance: none; appearance: none;
  }

  .mfa-code-input:focus {
    outline: none;
    border-color: var(--accent-border);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }

  /* ══════════════════════════════════════════════
     TASK / REWARD CARDS
  ══════════════════════════════════════════════ */
  .task-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  @media (min-width: 600px) { .task-grid { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 900px) { .task-grid { grid-template-columns: repeat(4, 1fr); } }

  .task-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    cursor: pointer;
    transition: border-color var(--transition), transform var(--transition), box-shadow var(--transition);
    position: relative;
    -webkit-tap-highlight-color: transparent;
  }

  .task-card:hover {
    border-color: var(--border-hover);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.24);
  }

  .task-card:active { transform: scale(0.97); }

  .task-card-thumb {
    width: 100%; aspect-ratio: 16/9;
    background: var(--surface-2);
    display: flex; align-items: center; justify-content: center;
    font-size: 28px;
    overflow: hidden;
  }

  .task-card-thumb img { width: 100%; height: 100%; object-fit: cover; }

  .task-card-body { padding: 11px 12px 12px; }

  .task-card-title {
    font-size: 12px; font-weight: 700;
    line-height: 1.35;
    margin-bottom: 6px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .task-card-reward {
    font-size: 12px; font-weight: 700;
    color: var(--accent);
    font-family: var(--font-mono);
  }

  .task-card-type-badge {
    position: absolute; bottom: 8px; left: 8px;
  }

  /* ── REWARD LIST ITEM ── */
  .reward-item {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center;
    justify-content: space-between; gap: 12px;
  }

  .reward-item:last-child { border-bottom: none; }

  .reward-item-title { font-size: 14px; font-weight: 600; margin-bottom: 3px; }
  .reward-item-meta  { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); font-weight: 300; }

  .reward-amount {
    font-family: var(--font-mono);
    font-size: 14px; font-weight: 700;
    color: var(--accent); white-space: nowrap;
  }

  /* ══════════════════════════════════════════════
     ADMIN SURFACE ADDITIONS
  ══════════════════════════════════════════════ */
  .admin-table {
    width: 100%; border-collapse: collapse;
    font-size: 13px;
  }

  .admin-table th {
    text-align: left; padding: 10px 14px;
    font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 1px;
    color: var(--text-muted); font-family: var(--font-mono);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }

  .admin-table td {
    padding: 13px 14px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  .admin-table tr:last-child td { border-bottom: none; }

  .admin-table tr:hover td { background: rgba(255,255,255,0.014); }

  .admin-table input[type="checkbox"] {
    width: 15px; height: 15px; accent-color: var(--accent);
    cursor: pointer;
  }

  .admin-stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px; margin-bottom: 20px;
  }

  @media (min-width: 600px) { .admin-stat-grid { grid-template-columns: repeat(4, 1fr); } }

  .health-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-right: 6px;
  }

  .health-dot-green  { background: var(--accent); box-shadow: 0 0 6px var(--accent-glow); }
  .health-dot-red    { background: var(--danger); }
  .health-dot-yellow { background: var(--warning); }

  /* Vault mask */
  .vault-masked {
    font-family: var(--font-mono);
    letter-spacing: 2px;
    color: var(--text-dim);
  }

  /* ══════════════════════════════════════════════
     ANIMATIONS
  ══════════════════════════════════════════════ */
  .fade-in {
    animation: rcFadeIn 0.25s ease both;
  }

  .slide-up {
    animation: rcSlideUp 0.3s var(--ease) both;
  }

  .scale-in {
    animation: rcScaleIn 0.2s var(--ease-spring) both;
  }

  @keyframes rcFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes rcSlideUp {
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes rcScaleIn {
    from { opacity: 0; transform: scale(0.94); }
    to   { opacity: 1; transform: scale(1); }
  }

  /* ── PULSE (for loading states) ── */
  .rc-skeleton {
    background: linear-gradient(90deg, var(--surface-2) 25%, var(--surface-3) 50%, var(--surface-2) 75%);
    background-size: 200% 100%;
    animation: rcSkeleton 1.5s ease-in-out infinite;
    border-radius: var(--radius);
  }

  @keyframes rcSkeleton {
    from { background-position: 200% 0; }
    to   { background-position: -200% 0; }
  }

  /* ── NOTIFICATION BELL PULSE ── */
  @keyframes bellShake {
    0%, 100% { transform: rotate(0deg); }
    20%  { transform: rotate(-14deg); }
    40%  { transform: rotate(12deg); }
    60%  { transform: rotate(-8deg); }
    80%  { transform: rotate(6deg); }
  }

  .bell-has-unread { animation: bellShake 0.6s ease 0.5s both; }

  /* ── SUBSCRIPTION CARD EXPAND ── */
  .sub-card-expanded {
    animation: rcFadeIn 0.22s ease both;
  }

  /* ── PAGE TRANSITIONS ── */
  .page-enter { animation: rcFadeIn 0.22s var(--ease) both; }
`;

export default globalStyles;
