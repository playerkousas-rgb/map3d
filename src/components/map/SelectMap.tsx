import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  MapContainer,
  Rectangle,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L, { LatLng, LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { css } from "@emotion/react";
import { CircleMinus, MousePointerClick, Ruler } from "lucide-react";
import { useI18n } from "@/i18n";
import { MapSearch } from "./MapSearch";
import { DataSourceControls, DataSourceLayers, type SourceStatus } from "./DataSources";
import { LocalGeoJsonControls, LocalGeoJsonLayer, type LocalOverlay } from "./LocalGeoJson";
import { AreaSize, fmtSize, measureArea } from "@/utils/measure";

const IconSize = css({
  width: "14px",
  height: "14px",
});

/** Leaflet scale bar (m) so the user can judge distance at a glance. */
function ScaleBar() {
  const map = useMap();
  useEffect(() => {
    // Share Leaflet's bottom-right stack with attribution. Control.addTo()
    // inserts bottom controls before existing children; clear:both in Leaflet's
    // own CSS keeps the scale above even multi-line credits, without measuring.
    const control = L.control.scale({ metric: true, imperial: false, position: "bottomright" });
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map]);
  return null;
}

/** Rectangle stroke follows the size verdict: blue ok / amber slow / red too big. */
const LEVEL_COLOR: Record<AreaSize["level"], string> = {
  ok: "#007bff",
  warn: "#f9ab00",
  big: "#ea4335",
};

function RectangleSelector({
  isDrag = true,

  drawBounds,
  level = "ok",

  onChange,
  onDrawChange,
}: {
  isDrag: boolean;

  drawBounds: LatLngBounds | null;
  /** size verdict — tints the rectangle so oversized selections stand out */
  level?: AreaSize["level"];

  onChange: (bounds: LatLngBounds) => void;
  onDrawChange: (bounds: LatLngBounds) => void;
}) {
  const [firstPoint, setFirstPoint] = useState<LatLng | null>(null);

  const lastLatlngRef = useRef<LatLng | null>(null);

  const adjustLng = (latlng: LatLng): LatLng => {
    const adjustedLng = ((((latlng.lng + 180) % 360) + 360) % 360) - 180;
    return new L.LatLng(latlng.lat, adjustedLng);
  };

  const map = useMapEvents({
    mousedown(e) {
      if (!isDrag) {
        setFirstPoint(e.latlng);
      }
    },
    mousemove(e) {
      if (firstPoint) {
        lastLatlngRef.current = adjustLng(e.latlng);
        onDrawChange(new L.LatLngBounds(firstPoint, e.latlng));
        onChange(
          new L.LatLngBounds(adjustLng(firstPoint), adjustLng(e.latlng))
        );
      }
    },
    mouseup(e) {
      if (firstPoint) {
        onDrawChange(new L.LatLngBounds(firstPoint, e.latlng));
        onChange(
          new L.LatLngBounds(adjustLng(firstPoint), adjustLng(e.latlng))
        );
        setFirstPoint(null);
      }
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    const handleTouchStart = (e: TouchEvent) => {
      if (!isDrag && e.touches.length > 0) {
        const touch = e.touches[0];
        const latlng = map.mouseEventToLatLng(touch as any);
        setFirstPoint(latlng);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (firstPoint && e.touches.length > 0) {
        const touch = e.touches[0];
        const latlng = map.mouseEventToLatLng(touch as any);
        lastLatlngRef.current = latlng;

        onDrawChange(new L.LatLngBounds(firstPoint, latlng));
        onChange(new L.LatLngBounds(adjustLng(firstPoint), adjustLng(latlng)));
      }
    };

    const handleTouchEnd = () => {
      if (firstPoint) {
        const latlng = lastLatlngRef.current || firstPoint;

        onDrawChange(new L.LatLngBounds(firstPoint, latlng));
        onChange(new L.LatLngBounds(adjustLng(firstPoint), adjustLng(latlng)));
        setFirstPoint(null);
      }
    };

    container.addEventListener("touchstart", handleTouchStart);
    container.addEventListener("touchmove", handleTouchMove);
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, [map, isDrag, firstPoint, onChange, onDrawChange]);

  useEffect(() => {
    if (map) {
      isDrag ? map.dragging.enable() : map.dragging.disable();
    }
  }, [isDrag, map]);

  return drawBounds ? (
    <Rectangle bounds={drawBounds} pathOptions={{ color: LEVEL_COLOR[level] }} />
  ) : null;
}

export function MapComponent({
  onDone,
  onRemove,
  isActive = true,
  initialArea = null,
  searchContext = "map",
}: {
  onDone: (e) => void;
  onRemove: () => void;
  /** true while the parent fullscreen view is visible (Leaflet needs a nudge after display:none) */
  isActive?: boolean;
  /** Changing mode resets search only, not the map/layers/selected area. */
  searchContext?: string;
  /** previous selection (northEast, southWest) so a remounted map still shows the rectangle */
  initialArea?: [any, any] | null;
}) {
  const { t } = useI18n();
  const hintId = useId();
  const [isDrag, setIsDrag] = useState(true);
  const [bounds, setBounds] = useState<LatLngBounds | null>(
    initialArea ? new LatLngBounds(initialArea[0], initialArea[1]) : null,
  );
  const [drawBounds, setDrawBounds] = useState<LatLngBounds | null>(
    initialArea ? new LatLngBounds(initialArea[0], initialArea[1]) : null,
  );
  const [map, setMap] = useState<L.Map | null>(null);
  const [localOverlay, setLocalOverlay] = useState<LocalOverlay | null>(null);
  const [sources, setSources] = useState<string[]>(["osm"]);
  const [sourceStatuses, setSourceStatuses] = useState<Record<string, SourceStatus>>({});
  const [sourceRetries, setSourceRetries] = useState<Record<string, number>>({});
  const reportSource = useCallback((id: string, status: SourceStatus) => {
    setSourceStatuses(prev => prev[id] === status ? prev : { ...prev, [id]: status });
  }, []);

  const handleClickSwitchDrag = () => {
    setIsDrag(!isDrag);
  };

  // The map lives inside a FullscreenModal that is merely display:none'd
  // between steps. When it becomes visible again, Leaflet still thinks the
  // container is 0×0 — without invalidateSize() the tiles render blank or
  // misaligned, which looks like the app is broken. Also re-center on the
  // user's previous rectangle so they can edit it right away.
  useEffect(() => {
    if (!isActive || !map) return;
    const id = window.setTimeout(() => {
      try {
        map.invalidateSize();
        // Restoration is not a user pan: do not leave a zoom animation running
        // across a rapid player-link remount of this map.
        if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18, animate: false });
      } catch {
        /* map container may already be gone during unmount */
      }
    }, 60);
    return () => window.clearTimeout(id);
    // Only re-sync when the view is re-activated — not on every draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, map]);

  const handleClickRemoveBox = () => {
    onRemove();
    setBounds(null);
    setDrawBounds(null);
    setIsDrag(true);
  };

  // Live size of the current selection — keeps the user aware of scale and
  // warns (colour-coded) before they fire off an Overpass query that would
  // time out.
  const size: AreaSize | null = bounds ? measureArea(bounds.getNorthEast(), bounds.getSouthWest()) : null;
  const level = size?.level ?? "ok";

  const handleChangeDone = (e) => {
    setBounds(e);
    onDone([e._northEast, e._southWest]);
  };

  const handleChangeDraw = (e) => {
    setDrawBounds(e);
    onDone([e._northEast, e._southWest]);
  };

  return (
    <>
    <div
      css={css({
        position: "relative",
      })}
    >
      <div
        css={css({
          position: "absolute",
          zIndex: 9999,
          right: "1rem",
          top: "1rem",
          display: "flex",
          justifyContent: "flex-end",
          gap: "0.5rem",
        })}
      >
        <button
          css={css({
            display: bounds == null || isDrag == true ? "none" : "flex",
            color: "#ffffff",

            backgroundColor: "#ef4444",
            backdropFilter: "blur(8px)",
            border: "none",
            padding: "0.5rem 1rem",
            minHeight: "var(--tap)",
            borderRadius: "8px",
            outline: "#ef4444c2 solid 0.1rem",
            cursor: "pointer",
            transition: "0.2s",
            alignItems: "center",
            gap: "0.5rem",
            ":hover": {
              backgroundColor: "#ef4444",
            },
          })}
          onClick={handleClickRemoveBox}
        >
          <CircleMinus css={IconSize} /> {t("removeBox")}
        </button>

        <button
          css={css({
            color: isDrag ? "#ffffff" : "#000000",

            backgroundColor: isDrag ? "#007bffe8" : "#ffffff96",
            backdropFilter: "blur(8px)",
            border: "none",
            padding: "0.5rem 1rem",
            minHeight: "var(--tap)",
            borderRadius: "8px",
            outline: isDrag
              ? "#086ad4c2 solid 0.1rem"
              : "rgba(240, 240, 244, 0.51) solid 0.1rem",
            cursor: "pointer",
            transition: "0.2s",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            ":hover": {
              backgroundColor: isDrag ? "#085fbd" : "#ebeef0c2",
            },
          })}
          aria-describedby={hintId}
          onClick={handleClickSwitchDrag}
        >
          {isDrag ? <SelectBox /> : t("backToDrag")}
        </button>
      </div>

      {isActive && <MapSearch key={searchContext} map={map} />}

      <MapContainer
        // Leaflet 1.9.4 leaves a 250ms zoom-transition callback after remove().
        // This map is keyed/remounted on player exit: instant zoom avoids that
        // stale callback without patching private Leaflet methods or swallowing errors.
        zoomAnimation={false}
        ref={setMap}
        center={initialArea ? undefined : [22.32, 114.17]}
        bounds={initialArea ? new LatLngBounds(initialArea[0], initialArea[1]) : undefined}
        zoom={13}
        style={{
          // --map-h shortens on phones so the map, the search box and the
          // buttons below it all fit on one screen.
          height: "var(--map-h)",
          width: "100%",
          borderRadius: "12px",
        }}
      >
        <DataSourceLayers selected={sources} retries={sourceRetries} onStatus={reportSource} />
        <LocalGeoJsonLayer overlay={localOverlay} />
        <ScaleBar />
        <RectangleSelector
          drawBounds={drawBounds}
          level={level}
          isDrag={isDrag}
          onChange={handleChangeDone}
          onDrawChange={handleChangeDraw}
        />
      </MapContainer>
      {/* Step-by-step hint + live measurement so users know the scale
          of what they are circling (and before a query can time out) */}
      <div
        id={hintId}
        data-selection-hint
        css={css({
          // Normal flow keeps guidance clear of dynamic Leaflet credits.
          width: "fit-content",
          boxSizing: "border-box",
          margin: "0.5rem auto 0",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.9rem",
          borderRadius: "12px",
          backgroundColor: !bounds
            ? "#ffffffee"
            : level === "big"
              ? "#fce8e6ee"
              : level === "warn"
                ? "#fef7e0ee"
                : "#e6f4eaee",
          backdropFilter: "blur(8px)",
          border: !bounds
            ? "1px solid rgba(240, 240, 244, 0.51)"
            : level === "big"
              ? "1px solid #f9c9c3"
              : level === "warn"
                ? "1px solid #fde293"
                : "1px solid #b7e1c3",
          boxShadow: "0 1px 8px rgba(0,0,0,0.12)",
          fontSize: "13px",
          color: !bounds
            ? "#3c4043"
            : level === "big"
              ? "#c5221f"
              : level === "warn"
                ? "#b06000"
                : "#1e8e3e",
          fontWeight: 500,
          pointerEvents: "none",
          maxWidth: "100%",
          overflowWrap: "anywhere",
          textAlign: "center",

        })}
      >
        <MousePointerClick css={css({ width: "14px", height: "14px", flexShrink: 0 })} />
        {!bounds && <span>{t("mapHintEmpty")}</span>}
        {bounds && size && (
          <span
            css={css({
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              fontWeight: 700,
            })}
          >
            <Ruler css={css({ width: "13px", height: "13px", flexShrink: 0 })} />
            {fmtSize(size)}
          </span>
        )}
        {bounds && (
          <span>
            {level === "big"
              ? t("sizeBig")
              : level === "warn"
                ? t("sizeWarn")
                : t("mapHintReady")}
          </span>
        )}
      </div>

    </div>
    <DataSourceControls selected={sources} statuses={sourceStatuses} onSelect={setSources}
      onRetry={id => setSourceRetries(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }))}>
      <LocalGeoJsonControls overlay={localOverlay} onChange={setLocalOverlay} onFit={() => {
        if (!map || !localOverlay) return;
        map.fitBounds(localOverlay.bounds, { padding: [24, 24], maxZoom: 15, animate: false });
        map.getContainer().scrollIntoView({ block: "center" });
      }} />
    </DataSourceControls>
    </>
  );
}

function SelectBox() {
  const { t } = useI18n();
  return (
    <>
      <MousePointerClick css={IconSize} />
      <span>{t("selectBox")}</span>
    </>
  );
}
