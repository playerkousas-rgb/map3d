/** Responsive scene controls. The camera palette is a native, modeless popover
 * rather than a 252px rail pushed off-screen by an expanded sheet. Credits get
 * their own reserved space; nonessential hints yield on compact scene areas.
 */
import { css } from "@emotion/react";
import { useId } from "react";
import { createPortal } from "react-dom";
import { useCameraPalette } from "@/hooks/useCameraPalette";
import { ArrowLeft, Camera, Focus, Map as MapIcon, Minus, Mountain, Navigation, Plus } from "lucide-react";
import { InfoPill, RoundButton, TapButton } from "@/components/ui/Touch";
import { useViewStore, type ViewCommandKind } from "@/state/viewStore";
import { useCourseStore } from "@/state/courseStore";
import { useI18n, type TranslationKey } from "@/i18n";

const ICON = css({ width: 20, height: 20 });
const actions: { kind: ViewCommandKind; label: TranslationKey; icon: typeof Focus }[] = [
  { kind: "reset", label: "orthoRecenter", icon: Focus },
  { kind: "top", label: "orthoTopView", icon: MapIcon },
  { kind: "tilt", label: "orthoTiltView", icon: Mountain },
  { kind: "zoomIn", label: "orthoZoomIn", icon: Plus },
  { kind: "zoomOut", label: "orthoZoomOut", icon: Minus },
];
const attribution = css({
  fontSize: "10.5px", lineHeight: "14px", textAlign: "center", color: "#3c4043",
  backgroundColor: "#ffffffeb", padding: "3px 8px", borderRadius: 6,
  overflowWrap: "anywhere", boxSizing: "border-box", maxWidth: "100%", flexShrink: 0,
});

export function OrthoOverlay({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const azimuth = useViewStore(state => state.azimuth);
  const request = useViewStore(state => state.request);
  const courseName = useCourseStore(state => state.course.name);
  const cameraId = useId();
  const triggerId = useId();
  const palette = useCameraPalette(cameraId, triggerId);
  const cameraOpen = palette.open;

  const cameraPanel = (
    <div id={cameraId} popover={palette.native ? "auto" : undefined} hidden={!palette.native && !cameraOpen}
      data-camera-mode={palette.native ? "native" : "fallback"} role="group" aria-label={t("orthoCamera")}
      className="camera-palette" onToggle={event => {
        if (!palette.native) return;
        const open = event.newState === "open";
        if (open) event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
        palette.setOpen(open);
      }}
      css={css({
        position: "fixed", inset: "unset", margin: 0, boxSizing: "border-box",
        top: "calc(var(--viewport-top, 0px) + var(--topnav-h) + 64px)",
        right: "calc(var(--sheet-w, 0px) + var(--safe-right) + 10px)",
        width: "min(276px, calc(100vw - var(--sheet-w, 0px) - var(--safe-left) - var(--safe-right) - 20px))",
        maxHeight: "calc(var(--viewport-h, 100dvh) - var(--topnav-h) - 84px)",
        padding: 8, border: "1px solid #dce1e6", borderRadius: 14,
        background: "#fffffff5", color: "#37474f", boxShadow: "0 4px 24px #26344130",
        pointerEvents: "auto", gap: 8, overflow: "hidden", zIndex: 1300,
        ":popover-open": { display: "flex", flexDirection: "column" },
        "&[data-camera-mode='fallback']:not([hidden])": { display: "flex", flexDirection: "column" },
      })}>
      <div css={css({ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 6, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain" })}>
        {actions.map(({ kind, label, icon: Icon }) => (
          <TapButton key={kind} stacked aria-label={t(label)} title={t(label)}
            popoverTarget={palette.native ? cameraId : undefined} popoverTargetAction={palette.native ? "hide" : undefined}
            onClick={() => { request(kind); palette.hide(); }}
            css={css({ width: "100%", minHeight: 52, padding: 4, fontSize: "10.5px", lineHeight: "12px",
              backgroundColor: "#f0f4f8", ":focus-visible": { outlineOffset: -3 } })}>
            <Icon css={ICON} /><span>{t(label)}</span>
          </TapButton>
        ))}
      </div>
      <div className="camera-attribution" css={attribution}>{t("orthoAttribution")}</div>
    </div>
  );

  return (
    <>
      <div
        className="scene-overlay"
        css={css({
          position: "absolute", top: "calc(var(--topnav-h) + var(--viewport-top, 0px))",
          bottom: "var(--scene-bottom, 0px)", left: "var(--safe-left)",
          right: "calc(var(--safe-right) + var(--sheet-w, 0px))", zIndex: 1100,
          pointerEvents: "none", containerType: "size", containerName: "map-scene",
          transition: "bottom 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)",
        })}
      >
        <div className="scene-actions" css={css({ position: "absolute", top: 10, left: 10, right: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 })}>
          <RoundButton css={css({ pointerEvents: "auto", flexShrink: 0 })}
            aria-label={t("orthoBackToMap")} title={t("orthoBackToMap")} onClick={onBack}>
            <ArrowLeft css={ICON} />
          </RoundButton>
          <div css={css({ display: "flex", gap: 8 })}>
            <RoundButton css={css({ pointerEvents: "auto", flexShrink: 0 })}
              aria-label={t("orthoCamera")} title={t("orthoCamera")}
              id={triggerId} onClick={palette.toggle} popoverTarget={palette.native ? cameraId : undefined}
              aria-controls={cameraId} aria-expanded={cameraOpen}>
              <Camera css={ICON} />
            </RoundButton>
            <RoundButton css={css({ pointerEvents: "auto", flexShrink: 0 })}
              aria-label={t("orthoNorth")} title={`${t("orthoNorth")} · ${azimuth}°`} onClick={() => request("reset")}>
              <span css={css({ display: "flex", transform: `rotate(${-azimuth}deg)`, transition: "transform 0.18s linear" })}>
                <Navigation css={css({ width: 22, height: 22, color: "#e53935" })} />
              </span>
            </RoundButton>
          </div>
        </div>

        <div className="scene-credit" aria-hidden={cameraOpen || undefined}
          css={css({ position: "absolute", bottom: 10, left: 10, right: 10,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            visibility: cameraOpen ? "hidden" : "visible" })}>
          <InfoPill css={css({ fontSize: 12, lineHeight: "16px", textAlign: "center", maxWidth: "min(100%, 520px)",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            overflowWrap: "anywhere", boxSizing: "border-box",
            "@container map-scene (max-height: 200px)": { display: "none" },
            "@supports not (container-type: size)": { display: "none" } })}>
            {courseName ? `${courseName} · ` : ""}{t("orthoHintTilt")}
          </InfoPill>
          <div className="scene-attribution" css={attribution}>{t("orthoAttribution")}</div>
        </div>
      </div>
      {createPortal(cameraPanel, document.body)}
    </>
  );
}
