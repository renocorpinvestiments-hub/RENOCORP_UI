/**
 * DASHBOARD CSS ADDITIONS — append to globalStyles in styles.js
 * ==============================================================
 * All classes used exclusively by Dashboard.jsx.
 * Designed to slot into the existing RENOCORP design system tokens.
 *
 * Sections:
 *  1. Screen wrapper
 *  2. Pull-to-refresh indicator
 *  3. Error banner
 *  4. Balance hero card
 *  5. Stats grid
 *  6. Task progress card
 *  7. Status feed
 *  8. Action cards (invite, package, withdraw)
 *  9. Skeleton
 * 10. Animations
 */

/* ══════════════════════════════════════════════
   1. SCREEN WRAPPER
══════════════════════════════════════════════ */

.dash-screen {
  padding: var(--sp-4) var(--sp-4) var(--sp-6);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-width: 480px;
  margin: 0 auto;
  width: 100%;
  position: relative;
}

/* ══════════════════════════════════════════════
   2. PULL-TO-REFRESH
══════════════════════════════════════════════ */

.dash-ptr-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: height 0.15s var(--ease);
  margin: -4px 0 0;
}

/* ══════════════════════════════════════════════
   3. ERROR BANNER
══════════════════════════════════════════════ */

.dash-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--danger-dim);
  border: 1px solid var(--danger-border);
  border-radius: var(--radius);
  color: var(--danger);
  font-size: 13px;
  animation: fadeIn 0.2s var(--ease);
}

.dash-error-banner span {
  flex: 1;
}

/* ══════════════════════════════════════════════
   4. BALANCE HERO CARD
══════════════════════════════════════════════ */

.dash-hero-card {
  background: linear-gradient(
    135deg,
    rgba(74, 222, 128, 0.13) 0%,
    rgba(34, 197, 94, 0.06) 60%,
    var(--surface-2) 100%
  );
  border: 1px solid var(--accent-border);
  border-radius: var(--radius-xl);
  padding: var(--sp-5) var(--sp-5) var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  animation: heroIn 0.35s var(--ease-spring);
  box-shadow: 0 0 40px var(--accent-glow);
  position: relative;
  overflow: hidden;
}

/* Decorative glow orb */
.dash-hero-card::before {
  content: "";
  position: absolute;
  top: -40px;
  right: -40px;
  width: 160px;
  height: 160px;
  background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
  pointer-events: none;
  border-radius: 50%;
}

.dash-hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
}

.dash-hero-identity {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
}

.dash-avatar-hero {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 800;
  color: #080c10;
  flex-shrink: 0;
  box-shadow: 0 0 12px var(--accent-glow);
}

.dash-hero-greeting {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.4;
}

.dash-hero-name {
  color: var(--text);
  font-weight: 600;
}

.dash-hero-email {
  font-size: 11px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
  font-family: var(--font-mono);
}

.dash-hero-balance-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dash-hero-balance-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--accent);
  font-family: var(--font-mono);
}

.dash-hero-balance-value {
  font-size: 32px;
  font-weight: 800;
  color: var(--text);
  font-family: var(--font-display);
  letter-spacing: -1px;
  line-height: 1.1;
  min-height: 38px;
}

.dash-hero-pending {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--warning);
  font-family: var(--font-mono);
}

.dash-hero-sub-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.dash-hero-renew-btn {
  background: var(--warning-dim);
  border: 1px solid var(--warning-border);
  color: var(--warning);
  border-radius: 20px;
  padding: 2px 10px;
  font-size: 10px;
  font-weight: 700;
  font-family: var(--font-mono);
  cursor: pointer;
  margin-left: 4px;
  transition: background var(--transition);
}

.dash-hero-renew-btn:hover {
  background: rgba(251, 146, 60, 0.2);
}

/* ══════════════════════════════════════════════
   5. STATS GRID
══════════════════════════════════════════════ */

.dash-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-2);
}

/* StatCard base styles (extend existing .dash-card) */
.dash-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--sp-4) var(--sp-4) var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: border-color var(--transition), background var(--transition);
  animation: fadeIn 0.25s var(--ease);
}

.dash-card:hover,
.dash-card:focus-visible {
  border-color: var(--border-hover);
  background: var(--surface-3);
}

.dash-card h3 {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.dash-card-value {
  font-size: 20px;
  font-weight: 800;
  color: var(--text);
  font-family: var(--font-display);
  letter-spacing: -0.5px;
  line-height: 1.2;
}

.dash-card-sub {
  font-size: 11px;
  color: var(--text-dim);
}

.stat-card-accent {
  border-color: var(--accent-border);
  background: linear-gradient(135deg, var(--accent-dim) 0%, var(--surface-2) 100%);
}

/* ══════════════════════════════════════════════
   6. TASK PROGRESS CARD
══════════════════════════════════════════════ */

.dash-task-progress-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  animation: fadeIn 0.25s var(--ease);
}

.dash-task-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dash-task-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.dash-task-count {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.dash-task-num {
  font-size: 28px;
  font-weight: 800;
  color: var(--accent);
  font-family: var(--font-display);
  letter-spacing: -1px;
}

.dash-task-sep {
  font-size: 20px;
  color: var(--text-dim);
  font-weight: 300;
}

.dash-task-denom {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-muted);
  font-family: var(--font-display);
}

.dash-task-label {
  font-size: 12px;
  color: var(--text-dim);
  margin-left: 6px;
  font-family: var(--font-mono);
}

.dash-task-bar {
  height: 5px;
  background: var(--surface-3);
  border-radius: 99px;
  overflow: hidden;
}

.dash-task-bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 99px;
  transition: width 0.6s var(--ease-spring);
  box-shadow: 0 0 8px var(--accent-glow);
}

.dash-task-nudge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--warning);
  font-family: var(--font-mono);
}

.dash-task-done {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--accent);
  font-family: var(--font-mono);
}

/* ══════════════════════════════════════════════
   7. STATUS FEED
══════════════════════════════════════════════ */

.dash-status-section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.dash-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dash-section-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.2px;
}

.dash-expand-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  font-family: var(--font-mono);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius);
  transition: background var(--transition), color var(--transition);
}

.dash-expand-btn:hover {
  background: var(--surface-2);
  color: var(--text);
}

.dash-status-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dash-status-item {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: border-color var(--transition);
  animation: fadeIn 0.2s var(--ease);
}

.dash-status-item:hover {
  border-color: var(--border-hover);
}

.dash-status-item-inner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: none;
  border: none;
  width: 100%;
  text-align: left;
  color: var(--text);
}

.dash-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  box-shadow: 0 0 6px var(--accent-glow);
}

.dash-status-content {
  flex: 1;
  min-width: 0;
}

.dash-status-title {
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dash-status-time {
  font-size: 11px;
  color: var(--text-dim);
  margin-top: 2px;
  font-family: var(--font-mono);
}

.dash-status-chevron {
  color: var(--text-dim);
  flex-shrink: 0;
  transition: transform var(--transition);
}

.dash-status-chevron.open {
  transform: rotate(180deg);
}

.dash-status-body {
  padding: 0 14px 12px 33px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
  animation: fadeIn 0.15s var(--ease);
}

/* ══════════════════════════════════════════════
   8. ACTION CARDS
══════════════════════════════════════════════ */

.dash-actions-section {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.dash-action-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-2);
}

.dash-action-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  transition: border-color var(--transition);
  animation: fadeIn 0.25s var(--ease);
}

.dash-action-card:hover {
  border-color: var(--border-hover);
}

.dash-action-card-header {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
}

.dash-action-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.invite-icon {
  background: var(--info-dim);
  color: var(--info);
  border: 1px solid var(--info-border);
}

.package-icon {
  background: var(--purple-dim);
  color: var(--purple);
  border: 1px solid var(--purple-border);
}

.withdraw-icon {
  background: var(--accent-dim);
  color: var(--accent);
  border: 1px solid var(--accent-border);
}

.dash-action-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.3;
}

.dash-action-sub {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

/* Invite card specifics */
.invite-card {
  border-color: var(--info-border);
}

.dash-invite-code-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.dash-invite-code {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.dash-invite-code-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.dash-invite-code-value {
  font-size: 14px;
  font-weight: 800;
  color: var(--info);
  font-family: var(--font-mono);
  letter-spacing: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dash-invite-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.dash-action-empty-msg {
  font-size: 12px;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

/* Package card specifics */
.package-card {
  border-color: var(--purple-border);
}

.dash-pkg-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.dash-pkg-stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.dash-pkg-stat-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.dash-pkg-stat-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--purple);
  font-family: var(--font-mono);
}

/* Withdraw card — full width */
.withdraw-card {
  border-color: var(--accent-border);
}

/* ══════════════════════════════════════════════
   9. SKELETON LOADER
══════════════════════════════════════════════ */

.rc-skeleton {
  background: linear-gradient(
    90deg,
    var(--surface-2) 0%,
    var(--surface-3) 50%,
    var(--surface-2) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
  border-radius: var(--radius);
  display: block;
}

@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

/* ══════════════════════════════════════════════
   10. ANIMATIONS
══════════════════════════════════════════════ */

@keyframes heroIn {
  from {
    opacity: 0;
    transform: translateY(-10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ══════════════════════════════════════════════
   BUTTON EXTENSIONS
══════════════════════════════════════════════ */

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius);
  background: var(--surface-3);
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.btn-icon:hover {
  background: var(--surface-4);
  color: var(--text);
}

.btn-disabled,
button:disabled {
  opacity: 0.45;
  pointer-events: none;
}

/* ══════════════════════════════════════════════
   RESPONSIVE — tablet and above
══════════════════════════════════════════════ */

@media (min-width: 600px) {
  .dash-screen {
    padding: var(--sp-6);
    gap: var(--sp-5);
  }

  .dash-hero-balance-value {
    font-size: 40px;
  }

  .dash-stats-grid {
    grid-template-columns: repeat(4, 1fr);
  }

  .dash-action-row {
    gap: var(--sp-3);
  }
}

/* ══════════════════════════════════════════════
   REDUCED MOTION
══════════════════════════════════════════════ */

@media (prefers-reduced-motion: reduce) {
  .rc-skeleton,
  .dash-hero-card,
  .dash-task-bar-fill,
  .dash-status-item {
    animation: none !important;
    transition: none !important;
  }
}
