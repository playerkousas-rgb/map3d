import React, { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  Rectangle,
  TileLayer,
  useMapEvents,
} from "react-leaflet";
import L, { LatLng, LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { css } from "@emotion/react";
import { CircleMinus, MousePointerClick } from "lucide-react";
import { useI18n } from "@/i18n";
import { MapSearch } from "./MapSearch";

const IconSize = css({
  width: "14px",
  height: "14px",
});

function RectangleSelector({
  isDrag = true,

  bounds,
  drawBounds,

  onChange,
  onDrawChange,
}: {
  isDrag: boolean;

  bounds: LatLngBounds | null;
  drawBounds: LatLngBounds | null;

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

    const handleTouchEnd = (e: TouchEvent) => {
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
  }, [map, isDrag, firstPoint, onChange]);

  useEffect(() => {
    if (map) {
      isDrag ? map.dragging.enable() : map.dragging.disable();
    }
  }, [isDrag, map]);

  return drawBounds ? (
    <Rectangle bounds={drawBounds} pathOptions={{ color: "blue" }} />
  ) : null;
}

export function MapComponent({
  onDone,
  onRemove,
  isActive = true,
  initialArea = null,
}: {
  onDone: (e) => void;
  onRemove: () => void;
  /** true while the parent fullscreen view is visible (Leaflet needs a nudge after display:none) */
  isActive?: boolean;
  /** previous selection (northEast, southWest) so a remounted map still shows the rectangle */
  initialArea?: [any, any] | null;
}) {
  const { t } = useI18n();
  const [isDrag, setIsDrag] = useState(true);
  const [bounds, setBounds] = useState<LatLngBounds | null>(
    initialArea ? new LatLngBounds(initialArea[0], initialArea[1]) : null,
  );
  const [drawBounds, setDrawBounds] = useState<LatLngBounds | null>(
    initialArea ? new LatLngBounds(initialArea[0], initialArea[1]) : null,
  );
  const [map, setMap] = useState<L.Map | null>(null);

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
        if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
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

  const handleChangeDone = (e) => {
    setBounds(e);
    onDone([e._northEast, e._southWest]);
  };

  const handleChangeDraw = (e) => {
    setDrawBounds(e);
    onDone([e._northEast, e._southWest]);
  };

  return (
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
          onClick={handleClickSwitchDrag}
        >
          {isDrag ? <SelectBox /> : t("backToDrag")}
        </button>
      </div>

      <MapSearch map={map} />

      {/* Step-by-step hint so users always know what to do next */}
      <div
        css={css({
          position: "absolute",
          zIndex: 9998,
          bottom: "1rem",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
          padding: "0.5rem 0.9rem",
          borderRadius: "999px",
          backgroundColor: bounds ? "#e6f4eaee" : "#ffffffee",
          backdropFilter: "blur(8px)",
          border: bounds
            ? "1px solid #b7e1c3"
            : "1px solid rgba(240, 240, 244, 0.51)",
          boxShadow: "0 1px 8px rgba(0,0,0,0.12)",
          fontSize: "13px",
          color: bounds ? "#1e8e3e" : "#3c4043",
          fontWeight: 500,
          pointerEvents: "none",
          maxWidth: "calc(100% - 2rem)",
          textAlign: "center",
          transition: "0.2s",
        })}
      >
        <MousePointerClick css={css({ width: "14px", height: "14px", flexShrink: 0 })} />
        {bounds ? t("mapHintReady") : t("mapHintEmpty")}
      </div>

      <MapContainer
        ref={setMap}
        center={[22.32, 114.17]}
        zoom={13}
        style={{
          height: "70vh",
          width: "100%",
        }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RectangleSelector
          bounds={bounds}
          drawBounds={drawBounds}
          isDrag={isDrag}
          onChange={handleChangeDone}
          onDrawChange={handleChangeDraw}
        />
      </MapContainer>
    </div>
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
