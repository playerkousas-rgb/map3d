import { css } from "@emotion/react";
import React from "react";

export function FullscreenModal({
  children,
  isOpen = false,
}: {
  children: React.ReactNode;
  isOpen?: boolean;
}) {
  return (
    <div
      css={css({
        width: "100%",
        height: "100%",
        position: "fixed",
        zIndex: 999,
        backgroundColor: "#ffffffc9",
        backdropFilter: "blur(12px)",
        display: isOpen ? "flex" : "none",
        // Tall content (map + inputs + buttons) must scroll, not get clipped
        // behind the bottom of the screen.
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
      })}
    >
      <div
        css={css({
          padding: "2rem",
          paddingTop: "4rem",
          // Room for the fixed Prev / Next buttons at the bottom edge.
          paddingBottom: "calc(6rem + var(--safe-bottom))",
          width: "100%",
          boxSizing: "border-box",
          minHeight: "min-content",
          "@media (max-width: 720px)": {
            padding: "1rem",
            paddingTop: "calc(var(--topnav-h) + 0.75rem)",
            paddingBottom: "calc(6rem + var(--safe-bottom))",
          },
        })}
      >
        {children}
      </div>
    </div>
  );
}
