import { css, keyframes } from "@emotion/react";
import { Space } from "../three/Space";
import { GpxSpace, GpxModelSettings } from "../three/GpxSpace";
import { FullscreenModal } from "../components/FullscreenModal";
import { Title } from "@/components/text/Title";
import { Description } from "@/components/text/Description";
import { Column } from "@/components/flex/Column";
import { Row } from "@/components/flex/Row";
import { MapComponent } from "@/components/map/SelectMap";
import { useRef, useState } from "react";
import {
  Button,
  NextButton,
  PrevButton,
} from "@/components/button/BottomButton";
import { FetchStatus, Building } from "@/components/map/Processing";
import { Steps } from "@/components/text/Steps";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Map,
  Mountain,
  FileUp,
  Printer,
} from "lucide-react";
import { useAreaStore } from "@/state/areaStore";
import { useExportStore } from "@/state/exportStore";
import { Modal } from "@/components/modal/Modal";
import { TopNav } from "@/components/nav/TopNav";
import { useI18n, TranslationKey } from "@/i18n";
import { parseGpx, GpxTrack } from "@/utils/gpx";
import { ExportFormat } from "@/utils/exporters";
import { normalizeBBox, overpassQuery } from "@/utils/overpass";
import { fmtSize, measureArea } from "@/utils/measure";
import { fillTrackElevation, ElevationSource } from "@/utils/elevation";

const IconSize = css({
  width: "14px",
  height: "14px",
});

const spinAnimation = keyframes`
from { transform: rotate(0deg); }
to { transform: rotate(360deg); }
`;

type View = "front" | "processing" | "map3d" | "gpx3d";
type Mode = "map" | "gpx";

/** Refuse absurdly large files before reading them into memory. */
const MAX_GPX_BYTES = 50 * 1024 * 1024;

const EXPORT_FORMATS: { format: ExportFormat; label: string }[] = [
  { format: "glb", label: "GLB" },
  { format: "gltf", label: "glTF" },
  { format: "obj", label: "OBJ" },
  { format: "stl", label: "STL" },
];

function App() {
  const { t } = useI18n();

  const [mode, setMode] = useState<Mode>("map");
  const [view, setView] = useState<View>("front");

  // --- map mode state ---
  const [isNextButtonDisabled, setIsNextButtonDisabled] = useState(true);
  const [areaData, setAreaData] = useState<any[]>([]);
  const [isWarnModal, setIsWarnModal] = useState(false);
  const [isExportModal, setIsExportModal] = useState(false);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [isFetchingBuildings, setIsFetchingBuildings] = useState(false);
  const [hasFetchedBuildings, setHasFetchedBuildings] = useState(false);
  const [fetchError, setFetchError] = useState<TranslationKey | null>(null);

  // --- gpx mode state ---
  const [gpxTrack, setGpxTrack] = useState<GpxTrack | null>(null);
  const [gpxError, setGpxError] = useState<string | null>(null);
  const [gpxSettings, setGpxSettings] = useState<GpxModelSettings>({
    exaggeration: 1.5,
    trackWidth: 3,
    baseHeight: 4,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [elevLoading, setElevLoading] = useState(false);
  const [elevError, setElevError] = useState(false);
  const [elevSource, setElevSource] = useState<ElevationSource | null>(null);
  const elevRequestRef = useRef(0);

  const setCenter = useAreaStore((state) => state.setCenter);
  const appendAreas = useAreaStore((state) => state.appendAreas);
  const requestExport = useExportStore((state) => state.requestExport);

  const checkIsBig = () => {
    if (areaData.length < 2) return false;
    // Data-backed limit: dense-city fetches start timing out past ~3 km per
    // side (0.05° ≈ 7.8k buildings + 17k roads measured in Central, HK).
    return measureArea(areaData[0], areaData[1]).level === "big";
  };

  const handleDone = (data: any) => {
    setAreaData(data);
    setCenter(data);
    setIsNextButtonDisabled(false);
    setBuildings([]);
    setHasFetchedBuildings(false);
    setFetchError(null);
  };

  const handleRemove = () => {
    setAreaData([]);
    setIsNextButtonDisabled(true);
    setBuildings([]);
    setHasFetchedBuildings(false);
    setFetchError(null);
  };

  const requestBuildings = async () => {
    setIsFetchingBuildings(true);
    setFetchError(null);

    const { south, west, north, east } = normalizeBBox(areaData[0], areaData[1]);
    const query = `[out:json][timeout:25];(way["building"]( ${south},${west},${north},${east} );relation["building"]( ${south},${west},${north},${east} ););out body geom;`;
    try {
      const elements = await overpassQuery(query);
      const blds: Building[] = elements.map((element: any) => ({
        id: element.id,
        tags: element.tags,
        geometry: element.geometry
          ? element.geometry.map((pt: any) => ({ lat: pt.lat, lng: pt.lon }))
          : undefined,
      }));
      setBuildings(blds);
      appendAreas(blds);
      setHasFetchedBuildings(true);
    } catch (error) {
      console.error("Error fetching building data:", error);
      setFetchError("fetchFailed");
    } finally {
      setIsFetchingBuildings(false);
    }
  };

  const handleClickNextStep = async () => {
    if (view === "front") {
      if (checkIsBig()) {
        setIsWarnModal(true);
        return;
      }
      setView("processing");
      return;
    }
    if (view === "processing") {
      if (!hasFetchedBuildings) {
        await requestBuildings();
        return;
      }
      setView("map3d");
    }
  };

  const handleClickPrevStep = () => {
    // From the finished 3D scene, jump straight back to the map: the
    // previously circled rectangle is preserved, so the user can redraw it.
    if (view === "map3d") setView("front");
    else if (view === "processing") setView("front");
    else if (view === "gpx3d") {
      setView("front");
      setGpxTrack(null);
      resetElevation();
    }
  };

  // --- GPX handling ---
  const resetElevation = () => {
    elevRequestRef.current++;
    setElevLoading(false);
    setElevError(false);
    setElevSource(null);
  };

  const handleGpxFile = async (file: File) => {
    setGpxError(null);
    if (file.size > MAX_GPX_BYTES) {
      setGpxError(t("gpxTooLarge"));
      return;
    }
    resetElevation();
    try {
      const text = await file.text();
      const track = parseGpx(text);
      setGpxTrack(track);
      setView("gpx3d");
    } catch (err) {
      if (err instanceof Error && err.message === "NO_POINTS") {
        setGpxError(t("gpxNoPoints"));
      } else {
        setGpxError(t("gpxParseError"));
      }
    }
  };

  const handleFillElevation = async () => {
    if (!gpxTrack || elevLoading) return;
    const base = gpxTrack;
    const id = ++elevRequestRef.current;
    setElevLoading(true);
    setElevError(false);
    try {
      const { track, source } = await fillTrackElevation(base);
      if (id !== elevRequestRef.current) return;
      setGpxTrack((current) => (current === base ? track : current));
      setElevSource(source);
    } catch (err) {
      if (id !== elevRequestRef.current) return;
      console.error("Elevation lookup failed:", err);
      setElevError(true);
    } finally {
      if (id === elevRequestRef.current) setElevLoading(false);
    }
  };

  const gpxFilename = () =>
    (gpxTrack?.stats.name || "gpx-model")
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "gpx-model";

  const modeTabStyle = (active: boolean) =>
    css({
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      padding: "0.6rem 1.2rem",
      borderRadius: "8px",
      border: "none",
      fontSize: "14px",
      fontWeight: 500,
      cursor: "pointer",
      transition: "0.2s",
      color: active ? "#ffffff" : "#333333",
      backgroundColor: active ? "#007bffe8" : "#ffffff96",
      outline: active
        ? "#086ad4c2 solid 0.1rem"
        : "rgba(240, 240, 244, 0.51) solid 0.1rem",
      ":hover": {
        backgroundColor: active ? "#085fbd" : "#ebeef0c2",
      },
    });

  return (
    <div css={css({ height: "100%", width: "100%" })}>
      <TopNav />

      {/* ---------- Front: mode select ---------- */}
      <FullscreenModal isOpen={view === "front"}>
        <Column gap="1rem">
          <Column gap="0.5rem">
            <Title>{t("frontTitle")}</Title>
            <Description>{t("frontDesc")}</Description>
            {mode === "map" && <Steps current={1} />}
          </Column>

          <Row gap="0.5rem">
            <button css={modeTabStyle(mode === "map")} onClick={() => setMode("map")}>
              <Map css={IconSize} /> {t("modeMap")}
            </button>
            <button css={modeTabStyle(mode === "gpx")} onClick={() => setMode("gpx")}>
              <Mountain css={IconSize} /> {t("modeGpx")}
            </button>
          </Row>

          {mode === "map" ? (
            <MapComponent
              onRemove={handleRemove}
              onDone={handleDone}
              isActive={view === "front"}
              initialArea={
                areaData.length === 2 ? [areaData[0], areaData[1]] : null
              }
            />
          ) : (
            <Column gap="0.75rem">
              <div
                css={css({
                  border: "2px dashed #c3c8d1",
                  borderRadius: "12px",
                  padding: "3rem 2rem",
                  textAlign: "center",
                  backgroundColor: "#f8f9fb",
                  cursor: "pointer",
                  transition: "0.2s",
                  ":hover": {
                    borderColor: "#007bff",
                    backgroundColor: "#f0f6ff",
                  },
                })}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleGpxFile(file);
                }}
              >
                <FileUp
                  css={css({ width: "36px", height: "36px", color: "#007bff", marginBottom: "0.75rem" })}
                />
                <div css={css({ fontSize: "16px", fontWeight: 600, marginBottom: "0.4rem" })}>
                  {t("importGpx")}
                </div>
                <div css={css({ fontSize: "13px", color: "#71757d" })}>{t("gpxHint")}</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".gpx,application/gpx+xml"
                  css={css({ display: "none" })}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleGpxFile(file);
                    e.target.value = "";
                  }}
                />
              </div>
              {gpxError && (
                <div css={css({ color: "#ef4444", fontSize: "13px" })}>{gpxError}</div>
              )}
            </Column>
          )}
        </Column>
      </FullscreenModal>

      {/* ---------- Processing ---------- */}
      <FullscreenModal isOpen={view === "processing"}>
        <Column gap="1rem">
          <Column gap="0.5rem">
            <Title>{t("processingTitle")}</Title>
            <Description>{t("processingDesc")}</Description>
            <Steps current={2} />
            {fetchError && (
              <div role="alert" css={css({ color: "#ef4444", fontSize: "13px" })}>
                {t(fetchError)}
              </div>
            )}
          </Column>
          <FetchStatus
            buildings={buildings}
            loading={isFetchingBuildings}
            fetched={hasFetchedBuildings}
          />
        </Column>
      </FullscreenModal>

      {/* ---------- Step buttons (map mode) ---------- */}
      <PrevButton
        isShow={view !== "front"}
        onClick={handleClickPrevStep}
      >
        <ChevronLeft css={IconSize} />{" "}
        {view === "gpx3d"
          ? t("gpxBack")
          : view === "map3d"
            ? t("editArea")
            : t("prevStep")}
      </PrevButton>

      <NextButton
        isShow={mode === "map" && (view === "front" || view === "processing")}
        disabled={isNextButtonDisabled || isFetchingBuildings}
        onClick={handleClickNextStep}
      >
        {isFetchingBuildings ? (
          <>
            <Loader2
              css={[IconSize, css({ animation: `${spinAnimation} 1s linear infinite` })]}
            />
            {t("fetching")}
          </>
        ) : (
          <>
            {t("nextStep")} <ChevronRight css={IconSize} />
          </>
        )}
      </NextButton>

      <NextButton isShow={view === "map3d" || view === "gpx3d"} onClick={() => setIsExportModal(true)}>
        {t("export")} <Download css={IconSize} />
      </NextButton>

      {/* ---------- 3D scene usage hint ---------- */}
      {(view === "map3d" || view === "gpx3d") && (
        <div
          css={css({
            position: "fixed",
            top: "4rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 998,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.45rem 0.9rem",
            borderRadius: "999px",
            backgroundColor: "#ffffffcc",
            backdropFilter: "blur(8px)",
            border: "1px solid #e8eaed",
            boxShadow: "0 1px 8px rgba(0,0,0,0.08)",
            fontSize: "12.5px",
            color: "#5f6368",
            pointerEvents: "none",
            maxWidth: "calc(100vw - 2rem)",
          })}
        >
          <Map css={css({ width: "13px", height: "13px", flexShrink: 0 })} />
          {view === "map3d" ? <Steps current={3} /> : null}
          <span>{view === "gpx3d" ? t("sceneHintGpx") : t("sceneHint")}</span>
        </div>
      )}

      {/* ---------- Warn modal ---------- */}
      <Modal isOpen={isWarnModal} onClose={() => setIsWarnModal(false)}>
        <Column gap="0.5rem">
          <Title>{t("tooBigTitle")}</Title>
          {areaData.length === 2 && (
            <div
              css={css({
                fontWeight: 700,
                fontSize: "15px",
                color: "#c5221f",
              })}
            >
              {fmtSize(measureArea(areaData[0], areaData[1]))}
            </div>
          )}
          <Description>{t("tooBigDesc")}</Description>
          <Description>{t("sizeBig")}</Description>
          <Button
            isShow={true}
            disabled={isNextButtonDisabled}
            onClick={() => {
              setView("processing");
              setIsWarnModal(false);
            }}
          >
            {t("nextStep")} <ChevronRight css={IconSize} />
          </Button>
        </Column>
      </Modal>

      {/* ---------- Export modal ---------- */}
      <Modal isOpen={isExportModal} onClose={() => setIsExportModal(false)}>
        <Column gap="0.5rem">
          <Title>{t("exportTitle")}</Title>
          <Description>{t("exportDesc")}</Description>

          <Row gap="0.5rem">
            {EXPORT_FORMATS.map(({ format, label }) => (
              <Button
                key={format}
                isShow={true}
                onClick={() => {
                  requestExport(
                    format,
                    view === "gpx3d" ? gpxFilename() : "map3d-buildings"
                  );
                  setIsExportModal(false);
                }}
              >
                {format === "stl" ? <Printer css={IconSize} /> : <Download css={IconSize} />}
                {label}
              </Button>
            ))}
          </Row>
        </Column>
      </Modal>

      {/* ---------- GPX info panel ---------- */}
      {view === "gpx3d" && gpxTrack && (
        <div
          css={css({
            position: "fixed",
            top: "4rem",
            right: "1rem",
            zIndex: 999,
            width: "260px",
            backgroundColor: "#ffffffdd",
            backdropFilter: "blur(12px)",
            borderRadius: "12px",
            padding: "1rem",
            boxShadow: "0 2px 14px rgba(0,0,0,0.12)",
            fontSize: "13px",
            fontFamily: "system-ui, -apple-system, sans-serif",
          })}
        >
          <div css={css({ fontWeight: 600, fontSize: "14px", marginBottom: "0.5rem" })}>
            {gpxTrack.stats.name}
          </div>

          <div css={css({ color: "#5f6368", marginBottom: "0.75rem" })}>
            <StatRow label={t("gpxPoints")} value={String(gpxTrack.stats.pointCount)} />
            <StatRow label={t("gpxDistance")} value={`${gpxTrack.stats.distanceKm.toFixed(2)} km`} />
            <StatRow label={t("gpxElevGain")} value={`${gpxTrack.stats.elevationGain} m`} />
            <StatRow
              label={t("gpxElevRange")}
              value={`${gpxTrack.stats.minEle} ~ ${gpxTrack.stats.maxEle} m`}
            />
          </div>

          {!gpxTrack.stats.hasElevation && (
            <div
              css={css({
                marginBottom: "0.75rem",
                padding: "0.6rem",
                borderRadius: "8px",
                backgroundColor: "#fff7e6",
                color: "#8a5a00",
                fontSize: "12px",
              })}
            >
              <div css={css({ marginBottom: "0.5rem" })}>{t("gpxNoElevation")}</div>
              <button
                css={css({
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.4rem",
                  padding: "0.45rem",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "#ffffff",
                  color: "#007bff",
                  outline: "#007bff55 solid 0.1rem",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "0.2s",
                  ":hover": { backgroundColor: "#f0f6ff" },
                  ":disabled": { cursor: "default", opacity: 0.7 },
                })}
                disabled={elevLoading}
                onClick={handleFillElevation}
              >
                {elevLoading ? (
                  <Loader2
                    css={[IconSize, css({ animation: `${spinAnimation} 1s linear infinite` })]}
                  />
                ) : (
                  <Mountain css={IconSize} />
                )}
                {elevLoading ? t("gpxFillingElevation") : t("gpxFillElevation")}
              </button>
              {elevError && (
                <div role="alert" css={css({ color: "#ef4444", marginTop: "0.4rem" })}>
                  {t("gpxElevationFailed")}
                </div>
              )}
            </div>
          )}

          {elevSource && (
            <div css={css({ color: "#80868b", fontSize: "11px", margin: "-0.4rem 0 0.75rem" })}>
              {t("gpxElevationSource")} {elevSource}
            </div>
          )}

          <div css={css({ fontWeight: 600, marginBottom: "0.4rem" })}>{t("gpxSettings")}</div>

          <SettingSlider
            label={t("gpxExaggeration")}
            min={0.5}
            max={5}
            step={0.1}
            value={gpxSettings.exaggeration}
            display={`× ${gpxSettings.exaggeration.toFixed(1)}`}
            onChange={(v) => setGpxSettings((s) => ({ ...s, exaggeration: v }))}
          />
          <SettingSlider
            label={t("gpxTrackWidth")}
            min={1}
            max={8}
            step={0.5}
            value={gpxSettings.trackWidth}
            display={`${gpxSettings.trackWidth.toFixed(1)} mm`}
            onChange={(v) => setGpxSettings((s) => ({ ...s, trackWidth: v }))}
          />
          <SettingSlider
            label={t("gpxBaseHeight")}
            min={2}
            max={10}
            step={0.5}
            value={gpxSettings.baseHeight}
            display={`${gpxSettings.baseHeight.toFixed(1)} mm`}
            onChange={(v) => setGpxSettings((s) => ({ ...s, baseHeight: v }))}
          />

          <button
            css={css({
              width: "100%",
              marginTop: "0.75rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "0.6rem",
              borderRadius: "8px",
              border: "none",
              backgroundColor: "#007bffe8",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
              transition: "0.2s",
              ":hover": { backgroundColor: "#085fbd" },
            })}
            onClick={() => requestExport("stl", gpxFilename())}
          >
            <Printer css={IconSize} /> {t("gpxExportStl")}
          </button>
        </div>
      )}

      {/* ---------- 3D scenes ---------- */}
      {view === "gpx3d" && gpxTrack ? (
        <GpxSpace points={gpxTrack.points} settings={gpxSettings} />
      ) : (
        <Space />
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div css={css({ display: "flex", justifyContent: "space-between", margin: "2px 0" })}>
      <span>{label}</span>
      <span css={css({ fontWeight: 500, color: "#202124" })}>{value}</span>
    </div>
  );
}

function SettingSlider({
  label,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div css={css({ marginBottom: "0.5rem" })}>
      <div
        css={css({
          display: "flex",
          justifyContent: "space-between",
          color: "#5f6368",
          marginBottom: "2px",
        })}
      >
        <span>{label}</span>
        <span>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        css={css({ width: "100%" })}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export default App;
