/**
 * The tool rail: what a tap on the 3D ground does next.
 *
 * Six thumb-sized buttons in one row — the whole course is built by switching
 * between these and tapping the ground, so they are the most-reached-for
 * control in the app and never hide behind a menu.
 */

import { css } from "@emotion/react";
import { Circle, CircleDot, MousePointer2, Move, Trash2, Triangle } from "lucide-react";
import { TapButton } from "@/components/ui/Touch";
import { OrthoTool, useCourseStore } from "@/state/courseStore";
import { useI18n, TranslationKey } from "@/i18n";

const ICON = css({ width: "19px", height: "19px" });

const TOOLS: { tool: OrthoTool; icon: React.ReactNode; label: TranslationKey; hint: TranslationKey }[] = [
  { tool: "view", icon: <MousePointer2 css={ICON} />, label: "orthoToolView", hint: "orthoSelectPrompt" },
  { tool: "start", icon: <Triangle css={ICON} />, label: "orthoToolStart", hint: "orthoPlaceHint" },
  { tool: "control", icon: <Circle css={ICON} />, label: "orthoToolControl", hint: "orthoPlaceHint" },
  { tool: "finish", icon: <CircleDot css={ICON} />, label: "orthoToolFinish", hint: "orthoPlaceHint" },
  { tool: "move", icon: <Move css={ICON} />, label: "orthoToolMove", hint: "orthoMoveHint" },
  { tool: "delete", icon: <Trash2 css={ICON} />, label: "orthoToolDelete", hint: "orthoDeleteHint" },
];

export function CourseToolbar() {
  const { t } = useI18n();
  const tool = useCourseStore((state) => state.tool);
  const setTool = useCourseStore((state) => state.setTool);
  const active = TOOLS.find((item) => item.tool === tool) ?? TOOLS[0];

  return (
    <div css={css({ display: "flex", flexDirection: "column", gap: "4px" })}>
      <div
        role="toolbar"
        aria-label={t("modeOrtho")}
        css={css({
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: "2px",
          backgroundColor: "#f4f6f8",
          borderRadius: "14px",
          padding: "3px",
        })}
      >
        {TOOLS.map((item) => (
          <TapButton
            key={item.tool}
            stacked
            active={tool === item.tool}
            tone={item.tool === "delete" && tool === "delete" ? "danger" : "default"}
            aria-pressed={tool === item.tool}
            onClick={() => setTool(item.tool)}
          >
            {item.icon}
            <span>{t(item.label)}</span>
          </TapButton>
        ))}
      </div>
      <p
        css={css({
          margin: 0,
          fontSize: "11.5px",
          color: tool === "view" ? "#9aa0a6" : "#007bff",
          fontWeight: tool === "view" ? 400 : 600,
          textAlign: "center",
        })}
      >
        {t(active.hint)}
      </p>
    </div>
  );
}
