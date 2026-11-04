import { css } from "@emotion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { haversine, type GpxPoint } from "@/utils/gpx";
import { useI18n } from "@/i18n";

type Props = {
  points: GpxPoint[];
  hasElevation: boolean;
};

const W = 280;
const H = 88;
const PAD_L = 2;
const PAD_R = 2;
const PAD_T = 8;
const PAD_B = 14;

function buildProfile(points: GpxPoint[]) {
  if (points.length < 2) return null;
  const distances: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversine(points[i - 1], points[i]);
    distances.push(total);
  }
  const eles = points.map((p) => p.ele);
  const minEle = Math.min(...eles);
  const maxEle = Math.max(...eles);
  const range = maxEle - minEle;
  // If every elevation identical, keep a visible midline rather than zero-height collapse.
  const span = range < 1e-9 ? 1 : range;
  const totalDist = total || 1;
  return { distances, minEle, maxEle, range, span, totalDist };
}

export function ElevationProfile({ points, hasElevation }: Props) {
  const { t, lang } = useI18n();
  const zh = lang === "zh";
  const profile = useMemo(() => buildProfile(points), [points]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const handlePointer = useCallback(
    (clientX: number) => {
      if (!profile || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const frac = Math.max(0, Math.min(1, (x / rect.width)));
      // Convert fractional x back to distance, then to nearest index.
      const targetDist = frac * profile.totalDist;
      let best = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < profile.distances.length; i++) {
        const diff = Math.abs(profile.distances[i] - targetDist);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = i;
        }
      }
      setHoverIdx(best);
    },
    [profile],
  );

  if (!profile) return null;

  const { distances, minEle, maxEle, range, span, totalDist } = profile;
  const flat = !hasElevation || range < 0.5;

  // Map helpers: distance → x, elevation → y (inverted, top is higher).
  const toX = (dist: number) => PAD_L + (dist / totalDist) * (W - PAD_L - PAD_R);
  const toY = (ele: number) => {
    if (flat) return PAD_T + (H - PAD_T - PAD_B) / 2;
    return PAD_T + (1 - (ele - minEle) / span) * (H - PAD_T - PAD_B);
  };

  const linePoints = points.map((p, i) => `${toX(distances[i]).toFixed(1)},${toY(p.ele).toFixed(1)}`).join(" ");
  // Fill area under the line down to the mid-flat baseline for filled silhouette.
  const baselineY = flat ? toY(minEle) : PAD_T + (H - PAD_T - PAD_B);
  const areaPoints = `${linePoints} ${toX(totalDist).toFixed(1)},${baselineY.toFixed(1)} ${toX(0).toFixed(1)},${baselineY.toFixed(1)}`;

  const activeIdx = pinned ?? hoverIdx;
  const activePoint = activeIdx !== null ? points[activeIdx] : null;
  const activeDist = activeIdx !== null ? distances[activeIdx] : null;

  const formatDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
  const formatEle = (e: number) => `${Math.round(e)} m`;

  return (
    <div
      role="img"
      aria-label={
        flat
          ? zh
            ? `高程剖面 · ${formatDist(totalDist)} · 未含海拔`
            : `Elevation profile · ${formatDist(totalDist)} · flat`
          : zh
            ? `高程剖面 · ${formatDist(totalDist)} · ${formatEle(minEle)} 至 ${formatEle(maxEle)}`
            : `Elevation profile · ${formatDist(totalDist)} · ${formatEle(minEle)} to ${formatEle(maxEle)}`
      }
      css={css({
        margin: "0 0 0.75rem",
        padding: "8px 8px 6px",
        borderRadius: "10px",
        border: "1px solid #e8eaed",
        backgroundColor: "#ffffff",
        overflow: "hidden",
      })}
    >
      <div
        css={css({
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "4px",
          fontSize: "11.5px",
          color: "#5f6368",
        })}
      >
        <span css={css({ fontWeight: 700, color: "#202124" })}>
          {zh ? "高程剖面" : "Elevation profile"}
        </span>
        <span>
          {formatDist(totalDist)}
          {!flat && ` · ${formatEle(minEle)} – ${formatEle(maxEle)}`}
        </span>
      </div>

      <div
        css={css({
          position: "relative",
          width: "100%",
          // Keep the chart tappable but never force horizontal scroll.
          maxWidth: "100%",
          boxSizing: "border-box",
        })}
        onMouseMove={(e) => handlePointer(e.clientX)}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchMove={(e) => {
          if (e.touches[0]) handlePointer(e.touches[0].clientX);
        }}
        onTouchEnd={() => setHoverIdx(null)}
        onClick={(e) => {
          handlePointer(e.clientX);
          if (hoverIdx !== null) setPinned((prev) => (prev === hoverIdx ? null : hoverIdx));
        }}
        role="button"
        tabIndex={0}
        aria-label={zh ? "高程剖面，點按固定位置" : "Elevation profile, tap to pin position"}
        onKeyDown={(e) => {
          if (!profile) return;
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const cur = pinned ?? hoverIdx ?? 0;
            const next = e.key === "ArrowLeft" ? Math.max(0, cur - 1) : Math.min(points.length - 1, cur + 1);
            setPinned(next);
            setHoverIdx(next);
          } else if (e.key === "Escape") {
            setPinned(null);
            setHoverIdx(null);
          }
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          css={css({ display: "block", width: "100%", height: `${H}px`, userSelect: "none", touchAction: "pan-y" })}
          aria-hidden="true"
        >
          {/* grid */}
          <line x1={PAD_L} y1={baselineY} x2={W - PAD_R} y2={baselineY} stroke="#eceef1" strokeWidth={0.9} />
          <line
            x1={PAD_L}
            y1={PAD_T + (H - PAD_T - PAD_B) / 2}
            x2={W - PAD_R}
            y2={PAD_T + (H - PAD_T - PAD_B) / 2}
            stroke="#f2f3f5"
            strokeWidth={0.7}
            strokeDasharray="2 3"
          />

          {/* fill */}
          <polygon points={areaPoints} fill={flat ? "#f1f3f4" : "#e8f1ff"} stroke="none" opacity={flat ? 1 : 0.95} />

          {/* line */}
          <polyline
            points={linePoints}
            fill="none"
            stroke={flat ? "#9aa0a6" : "#1a73e8"}
            strokeWidth={flat ? 1.4 : 1.7}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* start / end */}
          <circle cx={toX(0)} cy={toY(points[0].ele)} r={3.2} fill="#2fa860" stroke="#ffffff" strokeWidth={1} />
          <circle
            cx={toX(totalDist)}
            cy={toY(points[points.length - 1].ele)}
            r={3.2}
            fill="#3565d4"
            stroke="#ffffff"
            strokeWidth={1}
          />

          {/* hover / pinned indicator */}
          {activeIdx !== null && activePoint && activeDist !== null && (
            <>
              <line
                x1={toX(activeDist)}
                y1={PAD_T}
                x2={toX(activeDist)}
                y2={baselineY}
                stroke="#202124"
                strokeWidth={0.9}
                strokeDasharray="3 3"
                opacity={0.55}
              />
              <circle cx={toX(activeDist)} cy={toY(activePoint.ele)} r={3.8} fill="#ffffff" stroke="#202124" strokeWidth={1.1} />
              <circle cx={toX(activeDist)} cy={toY(activePoint.ele)} r={2} fill="#202124" />
            </>
          )}
        </svg>

        {/* tooltip */}
        {activePoint && activeDist !== null && (
          <div
            role="status"
            aria-live="polite"
            css={css({
              position: "absolute",
              left: `min(calc(${((activeDist / totalDist) * 100).toFixed(2)}% + 6px), calc(100% - 118px))`,
              top: "2px",
              transform: activeDist / totalDist > 0.72 ? "translateX(-92%)" : "none",
              backgroundColor: "#202124",
              color: "#ffffff",
              fontSize: "11px",
              lineHeight: 1.35,
              padding: "5px 7px",
              borderRadius: "8px",
              pointerEvents: "none",
              boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
              whiteSpace: "nowrap",
              maxWidth: "118px",
              overflow: "hidden",
              textOverflow: "ellipsis",
            })}
          >
            <div css={css({ fontWeight: 700 })}>{formatDist(activeDist)}</div>
            <div>{flat ? (zh ? "平坦 / 無海拔" : "flat / no elevation") : formatEle(activePoint.ele)}</div>
          </div>
        )}
      </div>

      <div
        css={css({
          display: "flex",
          justifyContent: "space-between",
          fontSize: "10.5px",
          color: "#80868b",
          marginTop: "3px",
        })}
      >
        <span>
          <span
            css={css({
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "999px",
              backgroundColor: "#2fa860",
              marginRight: "4px",
              verticalAlign: "middle",
            })}
          />
          {t("gpxProfileStart")}
        </span>
        <span>
          {t("gpxProfileEnd")}
          <span
            css={css({
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "999px",
              backgroundColor: "#3565d4",
              marginLeft: "4px",
              verticalAlign: "middle",
            })}
          />
        </span>
      </div>
      {flat && (
        <p
          role="note"
          css={css({
            margin: "6px 0 0",
            fontSize: "11px",
            color: "#8a5a00",
            lineHeight: 1.45,
            backgroundColor: "#fff7e6",
            borderRadius: "8px",
            padding: "6px 8px",
          })}
        >
          {zh ? "目前模型為平坦（沒有海拔）。平坦剖面不會虛構海平面落差。" : "Model is currently flat (no elevation). Flat profile does not invent sea-level drops."}
        </p>
      )}
    </div>
  );
}
