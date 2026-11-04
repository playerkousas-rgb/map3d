import type { ReactNode } from "react";
import { css } from "@emotion/react";
import { RotateCw } from "lucide-react";
import { useI18n, type TranslationKey } from "@/i18n";
import { useSceneStore, type LoadState, type ScenePart } from "@/state/sceneStore";
import { canRetrySceneLayer } from "@/utils/sceneRecovery";

/** Keep recovery beside its layer, not behind a return to the area picker. */
export function SceneRecoveryRow({ part, label, state, failed = 0, total = 0, children }: {
  part: ScenePart;
  label: TranslationKey;
  state: LoadState;
  failed?: number;
  total?: number;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const retry = useSceneStore(s => s.retry);
  const hasArea = useSceneStore(s => s.dataArea !== null);
  const recoverable = canRetrySceneLayer(state, failed);
  const busy = state === "loading";
  const name = `${t("orthoRetry")} ${t(label)}`;
  return (
    <div role="group" aria-label={t(label)} css={css({ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 })}>
      <span role="status" aria-atomic="true" css={css({ flex: 1, minWidth: 0, overflowWrap: "anywhere" })}>
        {children}
        {state === "ready" && failed > 0 && (
          <span css={css({ display: "block", color: "#b06000" })}>
            {failed}/{total} {t("orthoCellsUnavailable")}
          </span>
        )}
      </span>
      {(recoverable || busy) && (
        <button
          type="button"
          aria-label={name}
          aria-disabled={busy || !hasArea}
          aria-busy={busy}
          onClick={() => { if (recoverable && hasArea) retry(part); }}
          css={css({
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "5px",
            minHeight: "44px", minWidth: "44px", padding: "0 9px", flexShrink: 0,
            maxWidth: "55%", overflowWrap: "anywhere", font: "inherit", fontWeight: 600,
            color: "#0067ce", background: "#fff", border: "1px solid #dfe3e8", borderRadius: "8px",
            cursor: busy ? "wait" : "pointer", opacity: busy || !hasArea ? .55 : 1,
          })}
        >
          <RotateCw aria-hidden="true" size={14} css={css({ flexShrink: 0 })} />
          {name}
        </button>
      )}
    </div>
  );
}
