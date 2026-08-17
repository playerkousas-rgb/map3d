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
import { BuildingHeights, Building } from "@/components/map/Processing";
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
import { useI18n } from "@/i18n";
import { parseGpx, GpxTrack } from "@/utils/gpx";
import { ExportFormat } from "@/utils/exporters";

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

  // --- gpx mode state ---
  const [gpxTrack, setGpxTrack] = useState<GpxTrack | null>(null);
  const [gpxError, setGpxError] = useState<string | null>(null);
  const [gpxSettings, setGpxSettings] = useState<GpxModelSettings>({
    exaggeration: 1.5,
    trackWidth: 3,
    baseHeight: 4,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setCenter = useAreaStore((state) => state.setCenter);
  const appendAreas = useAreaStore((state) => state.appendAreas);
  const requestExport = useExportStore((state) => state.requestExport);

  const checkIsBig = () => {
    const a = areaData[0].lat - areaData[1].lat;
    const b = areaData[0].lng - areaData[1].lng;
    return a + b > 0.1;
  };

  const handleDone = (data: any) => {
    setAreaData(data);
    setCenter(data);
    setIsNextButtonDisabled(false);
    setBuildings([]);
    setHasFetchedBuildings(false);
  };

  const handleRemove = () => {
    setAreaData([]);
    setIsNextButtonDisabled(true);
    setBuildings([]);
    setHasFetchedBuildings(false);
  };

  const requestBuildings = async () => {
    setIsFetchingBuildings(true);

    const south = areaData[1].lat;
    const west = areaData[1].lng;
    const north = areaData[0].lat;
    const east = areaData[0].lng;
    const query = `[out:json][timeout:25];(way["building"]( ${south},${west},${north},${east} );relation["building"]( ${south},${west},${north},${east} ););out body geom;`;
    try {
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: query,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const data = await response.json();
      const blds: Building[] = data.elements.map((element: any) => ({
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
    if (view === "map3d") setView("processing");
    else if (view === "processing") setView("front");
    else if (view === "gpx3d") {
      setView("front");
      setGpxTrack(null);
    }
  };

  // --- GPX handling ---
  const handleGpxFile = async (file: File) => {
    setGpxError(null);
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
            <MapComponent onRemove={handleRemove} onDone={handleDone} />
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
            <BuildingHeights buildings={buildings} loading={isFetchingBuildings} />
          </Column>
        </Column>
      </FullscreenModal>

      {/* ---------- Step buttons (map mode) ---------- */}
      <PrevButton isShow={view !== "front"} onClick={handleClickPrevStep}>
        <ChevronLeft css={IconSize} /> {view === "gpx3d" ? t("gpxBack") : t("prevStep")}
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

      {/* ---------- Warn modal ---------- */}
      <Modal isOpen={isWarnModal} onClose={() => setIsWarnModal(false)}>
        <Column gap="0.5rem">
          <Title>{t("tooBigTitle")}</Title>
          <Description>{t("tooBigDesc")}</Description>
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
