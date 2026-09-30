import { css, keyframes } from "@emotion/react";
import { Space } from "../three/Space";
import { OrthoSpace } from "../three/OrthoSpace";
import { CoursePanel } from "../components/orienteering/CoursePanel";
import { OrthoOverlay } from "../components/orienteering/OrthoOverlay";
import { OrthoProcessing } from "../components/orienteering/OrthoProcessing";
import { isSceneSettled, useSceneStore } from "@/state/sceneStore";
import { useCourseStore } from "@/state/courseStore";
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
  Compass,
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

type View = "front" | "processing" | "map3d" | "gpx3d" | "orthoProcessing" | "ortho3d";
type Mode = "map" | "gpx" | "ortho";

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

  // --- orienteering mode state ---
  const setOrthoArea = useCourseStore((state) => state.setArea);
  const orthoName = useCourseStore((state) => state.course.name);
  const orthoControls = useCourseStore((state) => state.course.controls.length);
  const orthoFileRef = useRef<HTMLInputElement>(null);
  const [orthoError, setOrthoError] = useState(false);
  const loadOrthoScene = useSceneStore((state) => state.load);
  const orthoBuildingsState = useSceneStore((state) => state.buildings);
  const orthoBuildingCount = useSceneStore((state) => state.buildingCount);
  const orthoSettled = useSceneStore((state) => isSceneSettled(state));

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

  // Step ② of the orienteering flow: fetch the 3D scene (buildings, roads,
  // terrain) first, then step ③ opens the city and the controls get placed.
  const handleFetchOrthoScene = () => {
    if (areaData.length < 2) return;
    const area: [{ lat: number; lng: number }, { lat: number; lng: number }] = [
      { lat: areaData[0].lat, lng: areaData[0].lng },
      { lat: areaData[1].lat, lng: areaData[1].lng },
    ];
    setOrthoArea(area);
    loadOrthoScene(area);
    setView("orthoProcessing");
  };

  const handleOpenOrtho3d = () => {
    // The whole point of the 3D view is the city, so if buildings arrived make
    // sure the layer is on even if it was switched off in an earlier session.
    if (orthoBuildingCount > 0 && !useCourseStore.getState().scene.showBuildings) {
      useCourseStore.getState().setScene({ showBuildings: true });
    }
    setView("ortho3d");
  };

  const handleClickOrthoNext = () => {
    if (view === "front") handleFetchOrthoScene();
    else if (view === "orthoProcessing" && orthoSettled) handleOpenOrtho3d();
  };

  const handleClickPrevStep = () => {
    // From the finished 3D scene, jump straight back to the map: the
    // previously circled rectangle is preserved, so the user can redraw it.
    if (view === "map3d") setView("front");
    else if (view === "ortho3d") setView("front");
    else if (view === "orthoProcessing") setView("front");
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
      minHeight: "var(--tap)",
      flex: 1,
      justifyContent: "center",
      borderRadius: "10px",
      border: "none",
      fontSize: "14px",
      fontWeight: 500,
      cursor: "pointer",
      transition: "0.2s",
      "@media (max-width: 720px)": {
        padding: "0.55rem 0.5rem",
        fontSize: "12.5px",
        gap: "0.35rem",
      },
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
            {mode === "ortho" && <Steps current={1} variant="ortho" />}
          </Column>

          <Row gap="0.5rem">
            <button css={modeTabStyle(mode === "map")} onClick={() => setMode("map")}>
              <Map css={IconSize} /> {t("modeMap")}
            </button>
            <button css={modeTabStyle(mode === "gpx")} onClick={() => setMode("gpx")}>
              <Mountain css={IconSize} /> {t("modeGpx")}
            </button>
            <button css={modeTabStyle(mode === "ortho")} onClick={() => setMode("ortho")}>
              <Compass css={IconSize} /> {t("modeOrtho")}
            </button>
          </Row>

          {mode !== "gpx" ? (
            <div
              css={css({
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                // In orienteering mode the course name and the action buttons
                // sit under the map, so the map gives up some height and
                // everything fits on one screen without zooming out.
                ...(mode === "ortho"
                  ? {
                      "--map-h": "min(52vh, 560px)",
                      "@media (max-width: 720px)": { "--map-h": "38dvh" },
                    }
                  : {}),
              } as Parameters<typeof css>[0])}
            >
              <MapComponent
                onRemove={handleRemove}
                onDone={handleDone}
                isActive={view === "front"}
                initialArea={
                  areaData.length === 2 ? [areaData[0], areaData[1]] : null
                }
              />

              {mode === "ortho" && (
                <Column gap="0.6rem">
                  <Description>{t("orthoStepSelect")}</Description>
                  <input
                    value={orthoName}
                    onChange={(event) => useCourseStore.getState().setName(event.target.value)}
                    placeholder={t("orthoCourseNamePlaceholder")}
                    aria-label={t("orthoCourseName")}
                    maxLength={80}
                    css={css({
                      height: "var(--tap)",
                      padding: "0 14px",
                      borderRadius: "10px",
                      border: "1px solid #dfe3e8",
                      backgroundColor: "#ffffff",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#202124",
                      outline: "none",
                      ":focus": { borderColor: "#007bfe" },
                    })}
                  />
                  <Row gap="0.5rem">
                    <button
                      type="button"
                      disabled={isNextButtonDisabled}
                      onClick={handleFetchOrthoScene}
                      css={css({
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        minHeight: "var(--tap)",
                        padding: "0 1rem",
                        borderRadius: "10px",
                        border: "none",
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#ffffff",
                        backgroundColor: isNextButtonDisabled ? "#9fb6cc" : "#007bfe",
                        cursor: isNextButtonDisabled ? "not-allowed" : "pointer",
                      })}
                    >
                      <Compass css={IconSize} /> {t("orthoOpen3d")}
                    </button>
                    <button
                      type="button"
                      onClick={() => orthoFileRef.current?.click()}
                      css={css({
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        minHeight: "var(--tap)",
                        padding: "0 1rem",
                        borderRadius: "10px",
                        border: "1px solid #dfe3e8",
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "#202124",
                        backgroundColor: "#ffffff",
                        cursor: "pointer",
                      })}
                    >
                      <FileUp css={IconSize} /> {t("orthoImport")}
                    </button>
                  </Row>
                  {orthoControls > 0 && (
                    <Description>
                      {orthoControls} {t("orthoControlCount")} ·{" "}
                      {isNextButtonDisabled ? t("orthoStepSelect") : ""}
                    </Description>
                  )}
                  {orthoError && (
                    <div role="alert" css={css({ color: "#c5221f", fontSize: "13px" })}>
                      {t("orthoImportFailed")}
                    </div>
                  )}
                  <input
                    ref={orthoFileRef}
                    type="file"
                    accept="application/json,.json"
                    css={css({ display: "none" })}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      try {
                        useCourseStore.getState().importCourse(await file.text());
                        setOrthoError(false);
                      } catch (err) {
                        console.warn("[map3d] course import failed:", err);
                        setOrthoError(true);
                      }
                    }}
                  />
                </Column>
              )}
            </div>
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

      {/* ---------- Orienteering: get the 3D scene ---------- */}
      <FullscreenModal isOpen={view === "orthoProcessing"}>
        <Column gap="1rem">
          <Column gap="0.5rem">
            <Title>{t("orthoProcessingTitle")}</Title>
            <Description>{t("orthoProcessingDesc")}</Description>
            <Steps current={2} variant="ortho" />
          </Column>
          <OrthoProcessing />
        </Column>
      </FullscreenModal>

      {/* ---------- Step buttons (map mode) ---------- */}
      <PrevButton
        isShow={view !== "front" && view !== "ortho3d"}
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
        isShow={mode === "ortho" && (view === "front" || view === "orthoProcessing")}
        disabled={
          view === "front"
            ? isNextButtonDisabled
            : !orthoSettled
        }
        onClick={handleClickOrthoNext}
      >
        {view === "orthoProcessing" && !orthoSettled ? (
          <>
            <Loader2
              css={[IconSize, css({ animation: `${spinAnimation} 1s linear infinite` })]}
            />
            {t("fetching")}
          </>
        ) : view === "orthoProcessing" && orthoBuildingsState === "error" ? (
          <>
            {t("orthoContinueAnyway")} <ChevronRight css={IconSize} />
          </>
        ) : (
          <>
            {t("nextStep")} <ChevronRight css={IconSize} />
          </>
        )}
      </NextButton>

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
            top: "calc(var(--topnav-h) + 8px)",
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
            // On a phone the GPX settings panel takes this corner of the screen.
            ...(view === "gpx3d" ? { "@media (max-width: 720px)": { display: "none" } } : {}),
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
            top: "calc(var(--topnav-h) + 10px)",
            right: "calc(1rem + var(--safe-right))",
            zIndex: 999,
            width: "260px",
            maxHeight: "calc(100dvh - var(--topnav-h) - 8rem)",
            overflowY: "auto",
            backgroundColor: "#ffffffdd",
            backdropFilter: "blur(12px)",
            borderRadius: "12px",
            padding: "1rem",
            boxShadow: "0 2px 14px rgba(0,0,0,0.12)",
            fontSize: "13px",
            fontFamily: "system-ui, -apple-system, sans-serif",
            "@media (max-width: 720px)": {
              left: "calc(8px + var(--safe-left))",
              right: "calc(8px + var(--safe-right))",
              width: "auto",
              maxHeight: "48dvh",
            },
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
      {view === "ortho3d" ? (
        <>
          <OrthoSpace />
          <OrthoOverlay onBack={() => setView("front")} />
          <CoursePanel />
        </>
      ) : view === "gpx3d" && gpxTrack ? (
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
