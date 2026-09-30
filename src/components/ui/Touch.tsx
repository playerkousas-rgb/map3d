/**
 * Touch-first controls.
 *
 * Every button here is at least a 44 px target with a visible pressed state —
 * on a phone a 24 px desktop-style button is unusable, and a hover style never
 * fires. The 3D view's floating camera and tool buttons are built from these.
 */

import { css } from "@emotion/react";
import { ButtonHTMLAttributes, ReactNode } from "react";

type BaseProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** stacked icon + label, used in the bottom tool rail */
  stacked?: boolean;
  active?: boolean;
  tone?: "default" | "primary" | "danger";
};

const TONES = {
  default: { color: "#37474f", background: "transparent" },
  primary: { color: "#ffffff", background: "#007bfe" },
  danger: { color: "#ffffff", background: "#e53935" },
};

/** Square, thumb-sized button for the tool rails. */
export function TapButton({
  children,
  stacked = false,
  active = false,
  tone = "default",
  ...rest
}: BaseProps) {
  const palette = active ? TONES.primary : TONES[tone];
  return (
    <button
      type="button"
      {...rest}
      css={css({
        display: "flex",
        flexDirection: stacked ? "column" : "row",
        alignItems: "center",
        justifyContent: "center",
        gap: stacked ? "2px" : "6px",
        minWidth: "var(--tap)",
        minHeight: "var(--tap)",
        padding: "6px 10px",
        borderRadius: "12px",
        border: "none",
        fontSize: "11.5px",
        fontWeight: active ? 700 : 500,
        lineHeight: 1.15,
        color: palette.color,
        backgroundColor: palette.background,
        cursor: "pointer",
        transition: "background-color 0.15s, color 0.15s",
        ":active": {
          backgroundColor: active ? "#086ad4" : "rgba(0,0,0,0.08)",
        },
        ":disabled": { opacity: 0.4, cursor: "not-allowed" },
      })}
    >
      {children}
    </button>
  );
}

/** Round floating button, e.g. the camera controls over the 3D scene. */
export function RoundButton({ children, ...rest }: BaseProps) {
  return (
    <button
      type="button"
      {...rest}
      css={css({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "var(--tap)",
        height: "var(--tap)",
        borderRadius: "50%",
        border: "1px solid #e3e6ea",
        backgroundColor: "#ffffffec",
        backdropFilter: "blur(10px)",
        color: "#37474f",
        boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
        cursor: "pointer",
        transition: "transform 0.12s, background-color 0.15s",
        ":active": { transform: "scale(0.92)", backgroundColor: "#eef3f8" },
        ":disabled": { opacity: 0.4, cursor: "not-allowed" },
      })}
    >
      {children}
    </button>
  );
}

/** A labelled pill used for status / hints floating over a scene. */
export function InfoPill({
  children,
  tone = "default",
  css: extra,
}: {
  children: ReactNode;
  tone?: "default" | "warn" | "error" | "ok";
  css?: ReturnType<typeof css>;
}) {
  const colors = {
    default: { background: "#ffffffeb", color: "#3c4043", border: "#eceef1" },
    ok: { background: "#e6f4eaeb", color: "#1e8e3e", border: "#b7e1c3" },
    warn: { background: "#fef7e0eb", color: "#b06000", border: "#fde293" },
    error: { background: "#fce8e6eb", color: "#c5221f", border: "#f9c9c3" },
  }[tone];
  return (
    <div
      css={[
        css({
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
          padding: "0.5rem 0.85rem",
          borderRadius: "999px",
          backgroundColor: colors.background,
          color: colors.color,
          border: `1px solid ${colors.border}`,
          backdropFilter: "blur(10px)",
          boxShadow: "0 1px 8px rgba(0,0,0,0.1)",
          fontSize: "13px",
          fontWeight: 500,
          maxWidth: "min(92vw, 520px)",
        }),
        extra ?? css({}),
      ]}
    >
      {children}
    </div>
  );
}
