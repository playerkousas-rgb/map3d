import { css } from "@emotion/react";
import { DetailedHTMLProps, ButtonHTMLAttributes } from "react";
import { APP_VERSION, APP_COPYRIGHT } from "@/config/app";
import { useI18n } from "@/i18n";

const TOP_PANEL_HEIGHT = "var(--topnav-h)";
const BORDER_COLOR = "#ededf290";

interface ButtonProps
  extends DetailedHTMLProps<
    ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  > {
  isShow?: boolean;
}

export function TopNav() {
  const { t, toggleLang } = useI18n();

  return (
    <div
      data-topnav=""
      css={css({
        display: "flex",
        transition: ".5s",
        transform: "translate(0px, 0px)",
        position: "fixed",
        top: "var(--viewport-top, 0px)",
        left: 0,
        boxSizing: "border-box",
        width: "100%",
        height: TOP_PANEL_HEIGHT,
        paddingTop: "var(--safe-top)",
        paddingLeft: "var(--safe-left)",
        paddingRight: "var(--safe-right)",
        backgroundColor: "#ffffff50",
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${BORDER_COLOR}`,
        zIndex: 9999,
        justifyContent: "space-between",
        alignItems: "center",
      })}
    >
      <div
        css={css({
          paddingLeft: "2rem",
          alignItems: "center",
          flexDirection: "row",
          display: "flex",
          gap: "0.75rem",
          "@media (max-width: 720px)": { paddingLeft: "0.85rem", gap: "0.4rem" },
        })}
      >
        <span
          css={css({
            fontSize: "14px",
            fontWeight: "600",
            color: "#5b5d63",
          })}
        >
          {t("appName")}
        </span>
        <span
          css={css({
            fontSize: "11px",
            fontWeight: "400",
            color: "#9a9ba1",
            letterSpacing: "0.02em",
          })}
        >
          {APP_COPYRIGHT} · v{APP_VERSION}
        </span>
      </div>

      <div
        css={css({
          paddingRight: "2rem",
          display: "flex",
          flexDirection: "row",
          gap: "0.5rem",
          alignItems: "center",
          "@media (max-width: 720px)": { paddingRight: "0.6rem", gap: "0.35rem" },
        })}
      >
        <NavButton isShow={true} onClick={toggleLang}>
          {t("langToggle")}
        </NavButton>
      </div>
    </div>
  );
}

export function NavButton(props: ButtonProps) {
  return (
    <button
      css={css({
        color: "#000000",
        backgroundColor: "#ffffff96",
        backdropFilter: "blur(8px)",
        border: "none",
        padding: "0.5rem 1rem",
        minHeight: "var(--tap)",
        borderRadius: "8px",
        fontWeight: "300",
        fontSize: "12px",
        outline: "rgba(240, 240, 244, 0.51) solid 0.1rem",
        display: props.isShow ? "" : "none",
        cursor: "pointer",
      })}
      {...props}
    >
      {props.children}
    </button>
  );
}
