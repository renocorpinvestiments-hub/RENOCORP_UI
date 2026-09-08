/**
 * TASKS CSS ADDITIONS — append to globalStyles in styles.js
 * ===========================================================
 * All classes used exclusively by Tasks.jsx.
 * Follows existing RENOCORP design system tokens exactly.
 *
 * Sections:
 *  1. Screen wrapper
 *  2. Daily progress bar
 *  3. Check-in button
 *  4. Limit gate banner
 *  5. Error banner
 *  6. Task grid (2-col)
 *  7. Task card — collapsed (grid item)
 *  8. Task card — expanded (YouTube-style)
 *  9. Type chip
 * 10. Complete modal
 * 11. Skeleton
 * 12. Utilities
 * 13. Animations
 * 14. Responsive
 */

/* ══════════════════════════════════════════════
   1. SCREEN WRAPPER
══════════════════════════════════════════════ */

.tasks-screen {
  padding: var(--sp-4) var(--sp-4) var(--sp-6);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  max-width: 480px;
  margin: 0 auto;
  width: 100%;
}

/* ══════════════════════════════════════════════
   2. DAILY PROGRESS BAR
══════════════════════════════════════════════ */

.tasks-progress-bar-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  transition: border-color var(--transition);
  animation: fadeIn 0.25s var(--ease);
}

.tasks-progress-bar-card.limit-reached {
  border-color: var(--warning-border);
  background: var(--warning-dim);
}

.tasks-progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}

.tasks-progress-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.tasks-progress-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
}

.tasks-progress-sep {
  color: var(--text-dim);
  font-weight: 400;
}

.tasks-progress-limit {
  color: var(--text-muted);
  font-weight: 500;
  font-size: 12px;
}

.tasks-limit-reached-text {
  color: var(--warning);
}

.tasks-progress-track {
  height: 6px;
  background: var(--surface-3);
  border-radius: 99px;
  overflow: hidden;
}

.tasks-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-dark), var(--accent));
  border-radius: 99px;
  transition: width 0.7s var(--ease-spring);
  box-shadow: 0 0 8px var(--accent-glow);
}

.tasks-progress-fill-done {
  background: linear-gradient(90deg, var(--warning), #fbbf24);
  box-shadow: 0 0 8px var(--warning-dim);
}

.tasks-progress-meta {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.tasks-progress-meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.tasks-tier-badge {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.5px;
  font-family: var(--font-mono);
  padding: 2px 7px;
  border-radius: 20px;
}

.tasks-tier-badge[data-tier="free"] {
  background: var(--surface-3);
  color: var(--text-dim);
  border: 1px solid var(--border);
}

.tasks-tier-badge[data-tier="pro"] {
  background: var(--info-dim);
  color: var(--info);
  border: 1px solid var(--info-border);
}

.tasks-tier-badge[data-tier="elite"] {
  background: var(--purple-dim);
  color: var(--purple);
  border: 1px solid var(--purple-border);
}

.tasks-limit-msg {
  font-size: 11px;
  color: var(--warning);
  font-family: var(--font-mono);
  margin-left: auto;
}

/* ══════════════════════════════════════════════
   3. CHECK-IN BUTTON
══════════════════════════════════════════════ */

.tasks-top-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.checkin-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 18px;
  background: var(--accent-dim);
  border: 1px solid var(--accent-border);
  border-radius: 99px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
  font-family: var(--font-display);
  cursor: pointer;
  transition: background var(--transition), transform var(--transition);
  animation: checkinPop 0.4s var(--ease-spring);
}

.checkin-btn:hover:not(:disabled) {
  background: rgba(74, 222, 128, 0.18);
  transform: scale(1.02);
}

.checkin-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.checkin-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkin-claimed {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 18px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 99px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-mono);
}

.checkin-success {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 18px;
  background: var(--accent-dim);
  border: 1px solid var(--accent-border);
  border-radius: 99px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
  animation: checkinPop 0.4s var(--ease-spring);
}

.tasks-refetch-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

/* ══════════════════════════════════════════════
   4. LIMIT GATE BANNER
══════════════════════════════════════════════ */

.tasks-limit-gate {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 12px 16px;
  background: var(--warning-dim);
  border: 1px solid var(--warning-border);
  border-radius: var(--radius-lg);
  color: var(--warning);
  animation: fadeIn 0.2s var(--ease);
}

.tasks-limit-gate-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.5;
}

.tasks-limit-gate-text strong {
  display: block;
}

.tasks-limit-gate-text span {
  font-size: 12px;
  opacity: 0.85;
}

/* ══════════════════════════════════════════════
   5. ERROR BANNER
══════════════════════════════════════════════ */

.tasks-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--danger-dim);
  border: 1px solid var(--danger-border);
  border-radius: var(--radius);
  color: var(--danger);
  font-size: 13px;
}

.tasks-error-banner span {
  flex: 1;
}

/* ══════════════════════════════════════════════
   6. TASK GRID (2-column)
══════════════════════════════════════════════ */

.tasks-feed-section {
  /* Contains the grid */
}

.task-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-2);
}

/* When an expanded card is present it spans both columns */
.task-grid-expanded-slot {
  grid-column: 1 / -1;
}

/* ══════════════════════════════════════════════
   7. TASK CARD — COLLAPSED (GRID ITEM)
══════════════════════════════════════════════ */

.task-card {
  display: flex;
  flex-direction: column;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  transition:
    border-color var(--transition),
    background var(--transition),
    transform var(--transition),
    box-shadow var(--transition);
  animation: cardIn 0.22s var(--ease);
}

.task-card-grid:hover {
  border-color: var(--border-hover);
  background: var(--surface-3);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
}

.task-card-grid:active {
  transform: scale(0.98);
}

.task-card-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 16/10;
  background: var(--surface-3);
  overflow: hidden;
  flex-shrink: 0;
}

.task-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.task-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.task-duration-pill {
  position: absolute;
  bottom: 5px;
  right: 6px;
  background: rgba(0,0,0,0.72);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  backdrop-filter: blur(2px);
}

.task-card-body {
  padding: var(--sp-2) var(--sp-3) var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.task-card-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
}

/* Type icon dot — bottom left of card (blueprint) */
.task-type-icon-dot {
  width: 22px;
  height: 22px;
  border-radius: var(--sp-1);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.task-card-reward {
  font-size: 11px;
  font-weight: 800;
  color: var(--accent);
  font-family: var(--font-mono);
  letter-spacing: -0.3px;
}

/* ══════════════════════════════════════════════
   8. TASK CARD — EXPANDED (YouTube-style)
══════════════════════════════════════════════ */

.task-card-expanded {
  cursor: default;
  padding: var(--sp-4);
  border-color: var(--accent-border);
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  animation: expandCard 0.28s var(--ease-spring);
}

.task-card-collapse-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  font-family: var(--font-mono);
  cursor: pointer;
  padding: 0;
  align-self: flex-start;
  transition: color var(--transition);
}

.task-card-collapse-btn:hover {
  color: var(--text);
}

.task-expanded-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  flex-wrap: wrap;
}

.task-provider-label {
  font-size: 11px;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.task-expanded-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.4;
  font-family: var(--font-display);
}

.task-expanded-desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
}

.task-expanded-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  flex-wrap: wrap;
}

.task-reward-display {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.task-reward-ugx {
  font-size: 22px;
  font-weight: 800;
  color: var(--accent);
  font-family: var(--font-display);
  letter-spacing: -0.5px;
}

.task-reward-usd {
  font-size: 11px;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.task-meta-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 3px 10px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.task-expanded-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-2);
}

.task-start-btn,
.task-done-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

/* ══════════════════════════════════════════════
   9. TYPE CHIP
══════════════════════════════════════════════ */

.task-type-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 20px;
  border: 1px solid;
  font-size: 10px;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: 0.5px;
}

/* ══════════════════════════════════════════════
   10. COMPLETE MODAL
══════════════════════════════════════════════ */

.complete-modal-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  text-align: center;
  padding: var(--sp-2) 0;
}

.complete-modal-success-icon {
  font-size: 40px;
  line-height: 1;
}

.complete-modal-success-title {
  font-size: 18px;
  font-weight: 800;
  color: var(--accent);
  font-family: var(--font-display);
}

.complete-modal-success-msg {
  font-size: 14px;
  color: var(--text-muted);
  line-height: 1.6;
  max-width: 300px;
}

.complete-modal-task-preview {
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
  margin-bottom: 4px;
}

.complete-modal-reward-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}

/* ══════════════════════════════════════════════
   11. SKELETON
══════════════════════════════════════════════ */

.task-card-skeleton {
  height: 180px;
  border-radius: var(--radius-lg);
  display: block;
}

/* ══════════════════════════════════════════════
   12. UTILITIES
══════════════════════════════════════════════ */

/* Screen-reader only */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}

.spin {
  animation: spinLoop 1s linear infinite;
}

/* ══════════════════════════════════════════════
   13. ANIMATIONS
══════════════════════════════════════════════ */

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes cardIn {
  from { opacity: 0; transform: scale(0.96); }
  to   { opacity: 1; transform: scale(1); }
}

@keyframes expandCard {
  from { opacity: 0; transform: scaleY(0.92); transform-origin: top; }
  to   { opacity: 1; transform: scaleY(1); }
}

@keyframes checkinPop {
  0%   { transform: scale(0.9); }
  60%  { transform: scale(1.05); }
  100% { transform: scale(1); }
}

@keyframes spinLoop {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ══════════════════════════════════════════════
   14. RESPONSIVE
══════════════════════════════════════════════ */

@media (min-width: 480px) {
  .task-grid {
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-3);
  }

  .task-card-title {
    font-size: 13px;
  }
}

@media (min-width: 600px) {
  .tasks-screen {
    padding: var(--sp-6);
    gap: var(--sp-4);
  }

  .task-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* ══════════════════════════════════════════════
   REDUCED MOTION
══════════════════════════════════════════════ */

@media (prefers-reduced-motion: reduce) {
  .task-card,
  .task-card-expanded,
  .checkin-btn,
  .checkin-success,
  .tasks-progress-fill {
    animation: none !important;
    transition: none !important;
  }

  .spin {
    animation: none !important;
  }
}
