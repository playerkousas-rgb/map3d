import { css, keyframes } from "@emotion/react";
import { CheckCircle2, Loader2, SearchX } from "lucide-react";
import { useI18n } from "@/i18n";
import type { CellProgress } from "@/utils/sceneData";

export type Building = import("@/utils/sceneData").RawBuilding;

const spinAnimation = keyframes`
from { transform: rotate(0deg); }
to { transform: rotate(360deg); }
`;

/**
 * Clear, friendly status card for the fetch step — what is happening right
 * now, how long it usually takes and what to do next. (Replaces the old raw
 * JSON dump that looked like the app had crashed.)
 */
export function FetchStatus({
  buildings,
  loading,
  fetched,
  cells,
}: {
  buildings: Building[];
  loading: boolean;
  fetched: boolean;
  /** how the area was cut up for Overpass (see utils/sceneData) */
  cells?: CellProgress;
}) {
  const { t } = useI18n();
  const total = cells?.total ?? 0;
  const done = cells?.done ?? 0;
  const failed = cells?.failed ?? 0;

  return (
    <div
      role="status"
      aria-live="polite"
      css={css({
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
        padding: "1rem 1.1rem",
        borderRadius: "12px",
        backgroundColor: "#ffffffcc",
        border: "1px solid #e8eaee",
        boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
        fontSize: "14px",
        color: "#3c4043",
        minWidth: "min(360px, 70vw)",
      })}
    >
      {loading && (
        <div css={css({ display: "flex", alignItems: "center", gap: "0.55rem" })}>
          <Loader2
            css={css({ animation: `${spinAnimation} 1s linear infinite`, flexShrink: 0 })}
            size={16}
            color="#007bff"
          />
          <span>{t("fetchingBuildings")}</span>
        </div>
      )}

      {loading && (
        <div css={css({ fontSize: "12.5px", color: "#80868b", paddingLeft: "1.5rem" })}>
          {t("fetchSeconds")}
        </div>
      )}

      {/* A large box is fetched as several small queries, so show the tally —
          the number climbing is the clearest sign that it is working. */}
      {loading && total > 1 && (
        <div
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "0.55rem",
            fontSize: "12.5px",
            color: "#1e8e3e",
            fontWeight: 600,
            paddingLeft: "1.5rem",
          })}
        >
          <span>
            {done} / {total}
          </span>
          <span css={css({ color: "#80868b", fontWeight: 400 })}>
            {buildings.length.toLocaleString("en-US")} {t("orthoBuildingCount")}
          </span>
        </div>
      )}

      {!loading && fetched && failed > 0 && (
        <div css={css({ fontSize: "12.5px", color: "#b06000", paddingLeft: "1.5rem" })}>
          {t("orthoSomeCellsFailed")}
        </div>
      )}

      {!!cells?.flatHippedRoofs && (
        <div css={css({ fontSize: "12.5px", color: "#b06000", paddingLeft: "1.5rem" })}>
          {cells.flatHippedRoofs} {t("buildingHippedFlat")}
        </div>
      )}
      {!!cells?.flatPyramidalRoofs && (
        <div css={css({ fontSize: "12.5px", color: "#b06000", paddingLeft: "1.5rem" })}>
          {cells.flatPyramidalRoofs} {t("buildingPyramidalFlat")}
        </div>
      )}
      {!!cells?.flatSkillionRoofs && (
        <div css={css({ fontSize: "12.5px", color: "#b06000", paddingLeft: "1.5rem" })}>
          {cells.flatSkillionRoofs} {t("buildingSkillionFlat")}
        </div>
      )}
      {!!cells?.skippedBuildings && (
        <div css={css({ fontSize: "12.5px", color: "#b06000", paddingLeft: "1.5rem" })}>
          {cells.skippedBuildings} {t("buildingGeometrySkipped")}
        </div>
      )}

      {!loading && !fetched && (
        <div css={css({ display: "flex", alignItems: "center", gap: "0.55rem" })}>
          <SearchX size={16} color="#80868b" css={{ flexShrink: 0 }} />
          <span>{t("fetchIdle")}</span>
        </div>
      )}

      {!loading && fetched && buildings.length > 0 && (
        <>
          <div
            css={css({
              display: "flex",
              alignItems: "center",
              gap: "0.55rem",
              color: "#1e8e3e",
              fontWeight: 600,
            })}
          >
            <CheckCircle2 size={16} css={{ flexShrink: 0 }} />
            <span>
              {t("buildingsLoaded")} {buildings.length}
            </span>
          </div>
          <div css={css({ fontSize: "13px", color: "#5f6368", paddingLeft: "1.5rem" })}>
            {t("readyFor3d")}
          </div>
        </>
      )}

      {!loading && fetched && buildings.length === 0 && (
        <div
          css={css({
            display: "flex",
            alignItems: "flex-start",
            gap: "0.55rem",
            color: "#b06000",
          })}
        >
          <SearchX size={16} css={{ flexShrink: 0, marginTop: "2px" }} />
          <span>{t("noBuildings")}</span>
        </div>
      )}
    </div>
  );
}
