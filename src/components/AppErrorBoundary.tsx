import { Component, ReactNode } from "react";

/**
 * Last-resort safety net: if anything unexpected crashes the React tree,
 * show a small bilingual message with a reload button instead of a blank
 * white page. Renders its children untouched when nothing goes wrong.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[map3d] Unexpected application error:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#202124",
        }}
      >
        <div style={{ fontSize: "20px", fontWeight: 600 }}>
          Something went wrong · 發生錯誤
        </div>
        <div style={{ fontSize: "14px", color: "#5f6368" }}>
          Please reload the page. · 請重新整理頁面。
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: "8px",
            padding: "0.6rem 1.2rem",
            borderRadius: "8px",
            border: "none",
            backgroundColor: "#007bffe8",
            color: "#ffffff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reload · 重新載入
        </button>
      </div>
    );
  }
}
