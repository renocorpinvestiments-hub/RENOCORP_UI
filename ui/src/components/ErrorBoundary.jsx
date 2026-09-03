/**
 * ErrorBoundary.jsx — RENOCORP UI
 * ==================================
 * NEW FILE — P1 fix (RENOCORP_PRODUCTION_READINESS.md P1 item #7:
 * "No error boundary / global crash handling confirmed in App.jsx").
 *
 * Prior state: App.jsx had zero error boundaries anywhere. React does
 * NOT catch render-phase errors automatically — an unhandled error
 * thrown while rendering any component (a bad API response shape, a
 * null-pointer in a financial calculation, a third-party library
 * throwing) unmounts the entire React tree and leaves the user
 * looking at a blank white page with no way to recover except a hard
 * refresh. For a money app, "the screen went blank while I was
 * checking my withdrawal" is about the worst possible failure mode.
 *
 * This must be a class component — React only supports error
 * boundaries via componentDidCatch/getDerivedStateFromError, there is
 * no hooks equivalent (as of the React version pinned in package.json).
 *
 * Design choices:
 *   - Two boundary instances are used in App.jsx: one wrapping the
 *     whole app (catches errors in AuthProvider/AuthUI itself — the
 *     last line of defense) and one wrapping just <AppShell/> inside
 *     the Suspense boundary (so an error deep in one authenticated
 *     screen doesn't take down the ability to at least see the login
 *     state / log out and retry). See App.jsx for wiring.
 *   - NEVER renders the raw error message or stack trace to the user
 *     — that can leak internal details (stack traces routinely
 *     contain file paths, sometimes fragments of API response bodies
 *     with backend implementation details). A short reference ID
 *     (reusing the same request-id correlation scheme as api.js) is
 *     shown instead, which support/on-call can grep logs for.
 *   - `onError` prop is optional and fires with the full error/info
 *     for a caller to pipe into real error reporting (Sentry, an
 *     internal /api/client-errors endpoint, etc.) without this
 *     component needing to know which one you use.
 *   - "Try again" resets local component state (common transient-
 *     error recovery); "Reload app" forces a hard refresh for cases
 *     where in-memory app state itself is corrupted (matches this
 *     codebase's in-memory-only token model — a hard reload is always
 *     a safe, correct recovery path here since nothing sensitive was
 *     ever in localStorage to begin with).
 */

import { Component } from "react";

function generateErrorRef() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorRef: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true, errorRef: generateErrorRef() };
  }

  componentDidCatch(error, errorInfo) {
    // Never throw from inside an error boundary's own error handler.
    try {
      // eslint-disable-next-line no-console
      console.error(
        `[ErrorBoundary:${this.state.errorRef}]`,
        error,
        errorInfo?.componentStack,
      );
      if (typeof this.props.onError === "function") {
        this.props.onError(error, errorInfo, this.state.errorRef);
      }
    } catch {
      // Deliberately swallowed — an error-reporting failure must
      // never prevent the fallback UI below from rendering.
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorRef: null });
  };

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (typeof this.props.fallback === "function") {
      return this.props.fallback({
        errorRef: this.state.errorRef,
        retry: this.handleRetry,
        reload: this.handleReload,
      });
    }

    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 32,
          textAlign: "center",
          background: "#080c10",
          color: "#e6edf3",
        }}
      >
        <div style={{ fontSize: 40, lineHeight: 1 }}>⚠️</div>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          Something went wrong
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#7d8590",
            maxWidth: 360,
            margin: 0,
          }}
        >
          We hit an unexpected error. Your account and balance are
          safe — this is a display issue only. Try again, or reload
          the app if that doesn't help.
        </p>
        {this.state.errorRef && (
          <p
            style={{
              fontSize: 12,
              color: "#3d4451",
              fontFamily: "monospace",
              margin: 0,
            }}
          >
            Reference: {this.state.errorRef}
          </p>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button
            onClick={this.handleRetry}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid rgba(74,222,128,0.30)",
              background: "rgba(74,222,128,0.10)",
              color: "#4ade80",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            onClick={this.handleReload}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.07)",
              background: "transparent",
              color: "#e6edf3",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
