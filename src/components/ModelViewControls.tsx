import { css } from "@emotion/react";
import { Focus, Map, Minus, Plus } from "lucide-react";
import { useI18n, type TranslationKey } from "@/i18n";
import type { ViewCommandKind } from "@/state/viewStore";

const actions: { kind: ViewCommandKind; label: TranslationKey; icon: typeof Focus }[] = [
  { kind: "reset", label: "modelFit", icon: Focus },
  { kind: "top", label: "modelTop", icon: Map },
  { kind: "zoomOut", label: "modelZoomOut", icon: Minus },
  { kind: "zoomIn", label: "modelZoomIn", icon: Plus },
];

/** Below the scrolling GPX card and above Back/Export, including short screens. */
export function ModelViewControls({ onRequest }: { onRequest: (kind: ViewCommandKind) => void }) {
  const { t } = useI18n();
  return <div role="group" aria-label={t("modelView")} data-model-view=""
    css={css({ position: "fixed", bottom: "calc(5rem + var(--safe-bottom))", left: "50%", transform: "translateX(-50%)",
      display: "flex", gap: 6, maxWidth: "calc(100% - 16px - var(--safe-left) - var(--safe-right))",
      zIndex: 1000, borderRadius: 12, background: "#fffffff0", padding: "0 4px", boxSizing: "border-box",
      border: "1px solid #dfe3e8", boxShadow: "0 2px 12px #26344120" })}>
    {actions.map(({ kind, label, icon: Icon }) => <button key={kind} type="button" aria-label={t(label)} title={t(label)}
      onClick={() => onRequest(kind)} css={css({ display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        minWidth: 44, minHeight: 44, flexShrink: 0, padding: "0 8px", border: 0, borderRadius: 8,
        background: "#f0f4f8", color: "#166aaa", fontSize: 13, cursor: "pointer",
        ":focus-visible": { outline: "2px solid #007bff", outlineOffset: -2 }, ":active": { background: "#dbeaff" } })}>
      <Icon aria-hidden="true" size={19} />{kind === "reset" && <span>{t(label)}</span>}
    </button>)}
  </div>;
}
