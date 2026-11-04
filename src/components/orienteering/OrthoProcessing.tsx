/**
 * Step ② of the orienteering flow: get the 3D scene *before* placing points.
 *
 * Buildings, roads and terrain are fetched here with a visible line each, so
 * the planner sees the city arrive (and can retry a line that failed) rather
 * than landing on an empty ground and wondering where the buildings went.
 */

import { css, keyframes } from "@emotion/react";
import { AlertTriangle, Building2, CheckCircle2, Loader2, Mountain, RotateCw, Route } from "lucide-react";
import { LoadState, ScenePart, useSceneStore } from "@/state/sceneStore";
import type { CellProgress } from "@/utils/sceneData";
import { useI18n, TranslationKey } from "@/i18n";

const spin = keyframes`
from { transform: rotate(0deg); }
to { transform: rotate(360deg); }
`;

const ICON = css({ width: "16px", height: "16px", flexShrink: 0 });

export function OrthoProcessing() {
  const { t } = useI18n();
  const status = useSceneStore();
  const retry = useSceneStore((state) => state.retry);

  // A big box is fetched as several small Overpass cells; show the tally so a
  // long wait reads as "working" rather than "stuck", and say so out loud when
  // only part of the area came back.
  const tally = (state: LoadState, cells: CellProgress, count: number) => {
    if (state === "loading" && cells.total > 1) {
      return `${cells.done}/${cells.total} · ${count.toLocaleString("en-US")}`;
    }
    if (state === "ready" && cells.failed > 0) {
      return `${count.toLocaleString("en-US")} · ${t("orthoCellsPartial")}`;
    }
    if (state === "ready") return count.toLocaleString("en-US");
    return "";
  };

  const rows: {
    part: ScenePart;
    icon: React.ReactNode;
    label: TranslationKey;
    state: LoadState;
    detail: string;
  }[] = [
    {
      part: "buildings",
      icon: <Building2 css={ICON} />,
      label: "orthoBuildingCount",
      state: status.buildings,
      detail:
        status.buildings === "ready" && status.buildingCount === 0
          ? t("orthoNoBuildingsHere")
          : tally(status.buildings, status.buildingCells, status.buildingCount),
    },
    {
      part: "roads",
      icon: <Route css={ICON} />,
      label: "orthoRoadCount",
      state: status.roads,
      detail: tally(status.roads, status.roadCells, status.roadCount),
    },
    {
      part: "terrain",
      icon: <Mountain css={ICON} />,
      label: "orthoTerrainRange",
      state: status.terrain,
      detail:
        status.terrain === "ready"
          ? `${status.terrainMin}–${status.terrainMax} m · ${status.terrainSource}`
          : "",
    },
  ];

  return (
    <div
      role="status"
      aria-live="polite"
      css={css({
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        padding: "1rem 1.1rem",
        borderRadius: "12px",
        backgroundColor: "#ffffffcc",
        border: "1px solid #e8eaee",
        boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
        fontSize: "14px",
        color: "#3c4043",
        maxWidth: "520px",
      })}
    >
      {rows.map((row) => (
        <div
          key={row.part}
          css={css({
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            minHeight: "var(--tap)",
          })}
        >
          <span
            css={css({
              color:
                row.state === "ready"
                  ? "#1e8e3e"
                  : row.state === "error"
                    ? "#c5221f"
                    : "#007bff",
              display: "flex",
            })}
          >
            {row.state === "loading" ? (
              <Loader2 css={[ICON, css({ animation: `${spin} 1s linear infinite` })]} />
            ) : row.state === "ready" ? (
              <CheckCircle2 css={ICON} />
            ) : row.state === "error" ? (
              <AlertTriangle css={ICON} />
            ) : (
              row.icon
            )}
          </span>
          <span css={css({ display: "flex", alignItems: "center", gap: "0.4rem", color: "#5f6368" })}>
            {row.icon}
            {t(row.label)}
          </span>
          <span css={css({ flex: 1, textAlign: "right", fontWeight: 600, color: "#202124" })}>
            {row.state === "loading"
              ? t("orthoLoadingShort")
              : row.state === "error"
                ? t("orthoFailedShort")
                : row.detail}
          </span>
          {row.state === "error" && (
            <button
              type="button"
              onClick={() => retry(row.part)}
              css={css({
                display: "flex",
                alignItems: "center",
                gap: "0.3rem",
                minHeight: "36px",
                padding: "0 10px",
                borderRadius: "8px",
                border: "1px solid #dfe3e8",
                backgroundColor: "#ffffff",
                color: "#007bff",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
              })}
            >
              <RotateCw css={css({ width: "13px", height: "13px" })} /> {t("orthoRetry")}
            </button>
          )}
        </div>
      ))}

      {status.terrain === "error" && <p css={css({ fontSize: "12.5px", color: "#b06000", margin: 0 })}>{t("orthoTerrainUnavailableHint")}</p>}
      {!!status.buildingCells.flatHippedRoofs && (
        <div css={css({ fontSize: "12.5px", color: "#b06000" })}>
          {status.buildingCells.flatHippedRoofs} {t("buildingHippedFlat")}
        </div>
      )}
      {!!status.buildingCells.flatPyramidalRoofs && (
        <div css={css({ fontSize: "12.5px", color: "#b06000" })}>
          {status.buildingCells.flatPyramidalRoofs} {t("buildingPyramidalFlat")}
        </div>
      )}
      {!!status.buildingCells.flatSkillionRoofs && (
        <div css={css({ fontSize: "12.5px", color: "#b06000" })}>
          {status.buildingCells.flatSkillionRoofs} {t("buildingSkillionFlat")}
        </div>
      )}
      {!!status.buildingCells.skippedBuildings && (
        <div css={css({ fontSize: "12.5px", color: "#b06000" })}>
          {status.buildingCells.skippedBuildings} {t("buildingGeometrySkipped")}
        </div>
      )}
      <div css={css({ fontSize: "12.5px", color: "#80868b", paddingTop: "0.25rem" })}>
        {status.buildings === "loading" || status.roads === "loading" || status.terrain === "loading"
          ? t("fetchSeconds")
          : status.buildings === "error"
            ? t("orthoBuildingsFailedHint")
            : t("orthoReadyFor3d")}
      </div>
    </div>
  );
}
