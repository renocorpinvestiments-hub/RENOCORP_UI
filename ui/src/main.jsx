import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// Global error boundary so one broken screen never white-screens the
// whole app — falls back to a minimal reload prompt.
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[RENOCORP] Uncaught render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            background: "#0b0f0d",
            color: "#e8ece9",
            fontFamily: "system-ui, sans-serif",
            gap: "12px",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 16, opacity: 0.85 }}>
            Something went wrong. Please reload.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "#4ade80",
              color: "#0b0f0d",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
