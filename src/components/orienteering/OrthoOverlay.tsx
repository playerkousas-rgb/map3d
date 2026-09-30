/**
 * Floating controls over the 3D orienteering scene.
 *
 * On a phone the camera has to be drivable with one thumb and the screen must
 * stay clear, so: back and compass in the top corners, a vertical rail of
 * camera buttons on the right sitting just above the bottom sheet, and the
 * mandatory Lands Department credit always on screen.
 *
 * The compass turns with the camera, so a planner can always tell which way
 * north is in the scene — the whole point of an orienteering map.
 */

import { css } from "@emotion/react";
import { ArrowLeft, Focus, Map as MapIcon, Minus, Mountain, Navigation, Plus } from "lucide-react";
import { InfoPill, RoundButton } from "@/components/ui/Touch";
import { useViewStore } from "@/state/viewStore";
import { useCourseStore } from "@/state/courseStore";
import { useI18n } from "@/i18n";

const ICON = css({ width: "20px", height: "20px" });

export function OrthoOverlay({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const azimuth = useViewStore((state) => state.azimuth);
  const request = useViewStore((state) => state.request);
  const courseName = useCourseStore((state) => state.course.name);

  const circle = css({
    position: "absolute",
    top: "calc(var(--topnav-h) + 10px)",
    zIndex: 1100,
  });

  return (
    <>
      <div css={[circle, css({ left: "calc(var(--safe-left) + 10px)" })]}>
        <RoundButton aria-label={t("orthoBackToMap")} title={t("orthoBackToMap")} onClick={onBack}>
          <ArrowLeft css={ICON} />
        </RoundButton>
      </div>

      <div
        css={[circle, css({ right: "calc(var(--safe-right) + 10px)" })]}
      >
        <RoundButton
          aria-label={t("orthoNorth")}
          title={`${t("orthoNorth")} · ${azimuth}°`}
          onClick={() => request("reset")}
        >
          <span
            css={css({
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: `rotate(${-azimuth}deg)`,
              transition: "transform 0.18s linear",
            })}
          >
            <Navigation css={css({ width: "22px", height: "22px", color: "#e53935" })} />
          </span>
        </RoundButton>
        <span
          css={css({
            position: "absolute",
            left: "50%",
            top: "-16px",
            transform: "translateX(-50%)",
            fontSize: "10px",
            fontWeight: 700,
            color: "#5f6368",
          })}
        >
          {t("orthoNorth")}
        </span>
      </div>

      <div
        css={css({
          position: "absolute",
          right: "calc(var(--safe-right) + 10px + var(--sheet-w, 0px))",
          bottom: "calc(var(--sheet-h, 0px) + 14px)",
          zIndex: 1100,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          transition: "bottom 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)",
        })}
      >
        <RoundButton aria-label={t("orthoRecenter")} title={t("orthoRecenter")} onClick={() => request("reset")}>
          <Focus css={ICON} />
        </RoundButton>
        <RoundButton aria-label={t("orthoTopView")} title={t("orthoTopView")} onClick={() => request("top")}>
          <MapIcon css={ICON} />
        </RoundButton>
        <RoundButton aria-label={t("orthoTiltView")} title={t("orthoTiltView")} onClick={() => request("tilt")}>
          <Mountain css={ICON} />
        </RoundButton>
        <RoundButton aria-label={t("orthoZoomIn")} title={t("orthoZoomIn")} onClick={() => request("zoomIn")}>
          <Plus css={ICON} />
        </RoundButton>
        <RoundButton aria-label={t("orthoZoomOut")} title={t("orthoZoomOut")} onClick={() => request("zoomOut")}>
          <Minus css={ICON} />
        </RoundButton>
      </div>

      <div
        css={css({
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: "calc(var(--sheet-h, 0px) + 16px)",
          zIndex: 1100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
          pointerEvents: "none",
          transition: "bottom 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)",
          maxWidth: "min(92vw, 520px)",
        })}
      >
        <InfoPill
          css={css({ fontSize: "12px", textAlign: "center", justifyContent: "center" })}
        >
          {courseName ? `${courseName} · ` : ""}
          {t("orthoHintTilt")}
        </InfoPill>
        <span
          css={css({
            fontSize: "10.5px",
            color: "#3c4043",
            backgroundColor: "#ffffffd9",
            padding: "2px 8px",
            borderRadius: "6px",
          })}
        >
          {t("orthoAttribution")}
        </span>
      </div>
    </>
  );
}
