/**
 * Scene settings for the 3D orienteering view: which official layer is painted
 * on the ground, what geometry is drawn, and how tall the terrain is.
 *
 * It also reports what actually loaded. The building, road and terrain services
 * are public and best-effort, so "0 buildings" is shown as a fact rather than
 * leaving a planner wondering why the city is empty.
 */

import { css } from "@emotion/react";
import { Check } from "lucide-react";
import { GroundLayer, useCourseStore } from "@/state/courseStore";
import { useSceneStore } from "@/state/sceneStore";
import { useI18n, TranslationKey } from "@/i18n";
import { SceneRecoveryRow } from "./SceneRecoveryRow";
import { LANDSD_LINKS } from "@/utils/hkgeo";

function Chip({
  active,
  onClick,
  children,
  wide = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      css={css({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "5px",
        minHeight: "38px",
        padding: "0 11px",
        borderRadius: "999px",
        border: "1px solid #dfe3e8",
        backgroundColor: "#ffffff",
        color: "#3c4043",
        fontSize: "12.5px",
        fontWeight: 500,
        cursor: "pointer",
        flex: wide ? 1 : "0 0 auto",
        transition: "0.15s",
        ":active": { backgroundColor: "#eef3f8" },
      })}
    >
      {active && <Check css={css({ width: "14px", height: "14px" })} />}
      {children}
    </button>
  );
}

const LAYERS: { id: GroundLayer; label: TranslationKey }[] = [
  { id: "hm20c", label: "orthoLayerHm20c" },
  { id: "imagery", label: "orthoLayerImagery" },
  { id: "countryside", label: "orthoLayerCountryside" },
  { id: "plain", label: "orthoLayerPlain" },
];

export function SceneSettings() {
  const { t } = useI18n();
  const scene = useCourseStore((state) => state.scene);
  const setScene = useCourseStore((state) => state.setScene);
  const status = useSceneStore();

  const layerNote = (
    value: "ready" | "loading" | "error" | "idle",
    count: number,
    key: TranslationKey,
    drawn: number | null,
  ) => {
    if (value === "idle") return `${t(key)} · ${t("orthoNotLoaded")}`;
    if (value === "loading") return `${t(key)} · ${t("orthoLoadingShort")}`;
    if (value === "error") return `${t(key)} · ${t("orthoFailedShort")}`;
    const fetched = count.toLocaleString("en-US");
    // Only ever a difference when the safety ceiling was reached — then say so
    // instead of letting the missing geometry look like a loading failure.
    if (drawn !== null && drawn < count) {
      return `${t(key)} ${drawn.toLocaleString("en-US")} / ${fetched} · ${t("orthoDrawnPartial")}`;
    }
    return `${t(key)} ${fetched}`;
  };

  return (
    <div css={css({ display: "flex", flexDirection: "column", gap: "14px", paddingBottom: "8px" })}>
      <section css={css({ display: "flex", flexDirection: "column", gap: "8px" })}>
        <h3 css={css({ margin: 0, fontSize: "12px", fontWeight: 700, color: "#5f6368" })}>
          {t("orthoLayer")}
        </h3>
        <div css={css({ display: "flex", flexWrap: "wrap", gap: "6px" })}>
          {LAYERS.map((layer) => (
            <Chip
              key={layer.id}
              active={scene.groundLayer === layer.id}
              onClick={() => setScene({ groundLayer: layer.id })}
            >
              {t(layer.label)}
            </Chip>
          ))}
        </div>
        {(scene.groundLayer === "hm20c" || scene.groundLayer === "imagery") && (
          <a
            href={LANDSD_LINKS.terms}
            target="_blank"
            rel="noreferrer"
            css={css({ fontSize: "11px", color: "#9aa0a6", textDecoration: "underline" })}
          >
            {t("orthoTerms")}
          </a>
        )}
        {scene.groundLayer !== "plain" && status.groundFailed && (
          <p css={css({ margin: 0, fontSize: "11.5px", color: "#b06000", lineHeight: 1.45 })}>
            {t("orthoGroundFallback")}
          </p>
        )}
      </section>

      <section css={css({ display: "flex", flexDirection: "column", gap: "8px" })}>
        <h3 css={css({ margin: 0, fontSize: "12px", fontWeight: 700, color: "#5f6368" })}>
          {t("orthoShowBuildings")} · {t("orthoShowRoads")} · {t("orthoTerrainRange")}
        </h3>
        <div css={css({ display: "flex", flexWrap: "wrap", gap: "6px" })}>
          <Chip active={scene.showBuildings} onClick={() => setScene({ showBuildings: !scene.showBuildings })}>
            {t("orthoShowBuildings")}
          </Chip>
          <Chip active={scene.showRoads} onClick={() => setScene({ showRoads: !scene.showRoads })}>
            {t("orthoShowRoads")}
          </Chip>
          <Chip active={scene.showTerrain} onClick={() => setScene({ showTerrain: !scene.showTerrain })}>
            {t("orthoShowTerrain")}
          </Chip>
          <Chip active={scene.showContours} onClick={() => setScene({ showContours: !scene.showContours })}>
            {t("orthoShowContours")}
          </Chip>
          <Chip active={scene.showHillshade} onClick={() => setScene({ showHillshade: !scene.showHillshade })}>
            {t("orthoShowHillshade")}
          </Chip>
          <Chip active={scene.showGrid} onClick={() => setScene({ showGrid: !scene.showGrid })}>
            {t("orthoShowGrid")}
          </Chip>
        </div>
        <p css={css({ margin: "6px 0 0", fontSize: "12px", lineHeight: 1.5, color: "#5f6368" })}>
          {t("orthoTerrainFlatHint")}
        </p>
      </section>

      <section css={css({ display: "flex", flexDirection: "column", gap: "4px" })}>
        <div css={css({ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#5f6368" })}>
          <span>{t("orthoExaggeration")}</span>
          <span>× {scene.terrainExaggeration.toFixed(1)}</span>
        </div>
        <input
          aria-label={t("orthoExaggeration")}
          aria-valuetext={`× ${scene.terrainExaggeration.toFixed(1)}`}
          type="range"
          min={0.5}
          max={3}
          step={0.1}
          value={scene.terrainExaggeration}
          disabled={!scene.showTerrain}
          onChange={(event) => setScene({ terrainExaggeration: parseFloat(event.target.value) })}
          css={css({ width: "100%", height: "44px", ":disabled": { opacity: 0.4 } })}
        />
      </section>

      <section
        aria-label={t("orthoDataStatus")}
        css={css({
          display: "flex",
          flexDirection: "column",
          gap: "3px",
          fontSize: "11.5px",
          color: "#5f6368",
          borderTop: "1px solid #eceef1",
          paddingTop: "10px",
        })}
      >
        <SceneRecoveryRow part="buildings" label="orthoBuildingCount" state={status.buildings} failed={status.buildingCells.failed} total={status.buildingCells.total}>
          {layerNote(
            status.buildings,
            status.buildingCount,
            "orthoBuildingCount",
            scene.showBuildings ? status.drawnBuildings : null,
          )}
        </SceneRecoveryRow>
        {!!status.buildingCells.flatHippedRoofs && (
          <span role="status" css={css({ color: "#b06000" })}>
            {status.buildingCells.flatHippedRoofs} {t("buildingHippedFlat")}
          </span>
        )}
        {!!status.buildingCells.flatPyramidalRoofs && (
          <span role="status" css={css({ color: "#b06000" })}>
            {status.buildingCells.flatPyramidalRoofs} {t("buildingPyramidalFlat")}
          </span>
        )}
        {!!status.buildingCells.flatSkillionRoofs && (
          <span role="status" css={css({ color: "#b06000" })}>
            {status.buildingCells.flatSkillionRoofs} {t("buildingSkillionFlat")}
          </span>
        )}
        {!!status.buildingCells.skippedBuildings && (
          <span role="status" css={css({ color: "#b06000" })}>
            {status.buildingCells.skippedBuildings} {t("buildingGeometrySkipped")}
          </span>
        )}
        <SceneRecoveryRow part="roads" label="orthoRoadCount" state={status.roads} failed={status.roadCells.failed} total={status.roadCells.total}>
          {layerNote(
            status.roads,
            status.roadCount,
            "orthoRoadCount",
            scene.showRoads ? status.drawnRoads : null,
          )}
        </SceneRecoveryRow>
        <SceneRecoveryRow part="terrain" label="orthoTerrainRange" state={status.terrain}>
          {status.terrain === "ready"
            ? `${t("orthoTerrainRange")} ${status.terrainMin}–${status.terrainMax} m · ${status.terrainSource}`
            : status.terrain === "loading"
              ? `${t("orthoTerrainRange")} · ${t("orthoLoadingShort")}`
              : `${t("orthoTerrainRange")} · ${t(status.terrain === "idle" ? "orthoNotLoaded" : "orthoFailedShort")}`}
        </SceneRecoveryRow>
        {status.terrain === "error" && <span role="status" css={css({ color: "#b06000" })}>{t("orthoTerrainUnavailableHint")}</span>}
        <span css={css({ color: "#9aa0a6", marginTop: "6px" })}>{t("orthoAttribution")}</span>
      </section>
    </div>
  );
}
