import { css } from "@emotion/react";
import { useI18n, TranslationKey } from "@/i18n";

const LABELS: TranslationKey[] = ["stepLabel1", "stepLabel2", "stepLabel3"];
const ORTHO_LABELS: TranslationKey[] = ["orthoStepLabel1", "orthoStepLabel2", "orthoStepLabel3"];

/**
 * Compact 3-step progress indicator so users always know where they are
 * in the flow (circle area → fetch data → view & export 3D).
 */
export function Steps({ current, variant = "map" }: { current: 1 | 2 | 3; variant?: "map" | "ortho" }) {
  const { t } = useI18n();
  const labels = variant === "ortho" ? ORTHO_LABELS : LABELS;

  return (
    <div
      css={css({
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "0.4rem",
      })}
      aria-label={`Step ${current} of 3`}
    >
      {labels.map((key, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const state = n === current ? "active" : n < current ? "done" : "todo";
        return (
          <span
            key={key}
            css={css({
              display: "inline-flex",
              alignItems: "center",
              padding: "0.3rem 0.7rem",
              borderRadius: "999px",
              fontSize: "12.5px",
              fontWeight: state === "active" ? 600 : 500,
              lineHeight: 1.3,
              color:
                state === "active"
                  ? "#ffffff"
                  : state === "done"
                    ? "#1e8e3e"
                    : "#80868b",
              backgroundColor:
                state === "active"
                  ? "#007bfe"
                  : state === "done"
                    ? "#e6f4ea"
                    : "#f1f3f4",
              border:
                state === "todo" ? "1px solid #e8eaed" : "1px solid transparent",
              transition: "0.2s",
            })}
          >
            {t(key)}
          </span>
        );
      })}
    </div>
  );
}
