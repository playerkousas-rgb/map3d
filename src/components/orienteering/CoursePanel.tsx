/**
 * The orienteering panel: course name, controls, legs and scene settings.
 *
 * On a phone this is the bottom sheet (see {@link BottomSheet}) — the 3D view
 * stays visible above it while the planner edits. On a wide screen the same
 * markup becomes a side panel, so nothing about the course is desktop-only.
 *
 * Everything shown here works from a control's coordinate: the code, the
 * printed clue, the HM20C grid reference and the leg distance/bearing all come
 * from the shared course + geodesy modules, so the panel and the 3D scene can
 * never disagree.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import { Download, Eye, FileUp, Redo2, Share2, Table, Trash2, Undo2, Upload } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { TapButton } from "@/components/ui/Touch";
import { CourseToolbar } from "./CourseToolbar";
import { SceneSettings } from "./SceneSettings";
import { CourseSummary } from "./CourseSummary";
import { useCourseStore } from "@/state/courseStore";
import { useExportStore } from "@/state/exportStore";
import { useI18n } from "@/i18n";
import {
  controlKindLabel,
  controlSymbol,
  courseStats,
  orderedControls,
  type CourseControl,
} from "@/utils/course";
import { formatDeg, gridRefs, parseGridInput } from "@/utils/hkgeo";
import { downloadBlob } from "@/utils/exporters";
import { buildShareUrl } from "@/utils/shareLink";
import { useCourseImport } from "@/hooks/useCourseImport";
import { DraftStatus } from "./DraftStatus";
import { CourseLimitsStatus } from "./CourseLimitsStatus";
import { fmtLength } from "@/utils/measure";

export function CoursePanel() {
  const { lang, t } = useI18n();
  const zh = lang === "zh";
  const course = useCourseStore((state) => state.course);
  const selectedId = useCourseStore((state) => state.selectedId);
  const snap = useCourseStore((state) => state.panelSnap);
  const setPanelSnap = useCourseStore((state) => state.setPanelSnap);
  const setScene = useCourseStore((state) => state.setScene);
  const showRoute = useCourseStore((state) => state.scene.showRoute);

  const stats = useMemo(() => courseStats(course), [course]);
  const ordered = useMemo(() => orderedControls(course), [course]);
  const selected = course.controls.find((c) => c.id === selectedId) ?? null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"controls" | "scene">("controls");
  const [importError, setImportError] = useState(false);
  const readOnly = useCourseStore((state) => state.readOnly);
  const importCourseFile = useCourseImport(!readOnly, setImportError);
  const canUndo = useCourseStore((state) => state.past.length > 0);
  const canRedo = useCourseStore((state) => state.future.length > 0);
  const area = useCourseStore((state) => state.area);
  const [shareNote, setShareNote] = useState<"copied" | "failed" | "empty" | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  useEffect(() => {
    if (!shareNote) return;
    const timer = window.setTimeout(() => setShareNote(null), 3500);
    return () => window.clearTimeout(timer);
  }, [shareNote]);

  const handleShare = async () => {
    if (!area || course.controls.length === 0) {
      setShareNote("empty");
      return;
    }
    try {
      const url = await buildShareUrl(area, course);
      const title = course.name || t("orthoTitle");
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
      if (nav.share) {
        try {
          await nav.share({ title, text: `${title}\n${t("orthoShareText")}`, url });
          return;
        } catch (err) {
          // The user closed the sheet — not an error; anything else falls back
          // to the clipboard below.
          if ((err as DOMException)?.name === "AbortError") return;
        }
      }
      await navigator.clipboard.writeText(url);
      setShareNote("copied");
    } catch (err) {
      console.warn("[map3d] share failed:", err);
      setShareNote("failed");
    }
  };

  return (
    <BottomSheet
      ariaLabel={t("modeOrtho")}
      peekHeight={220}
      desktopWidth={360}
      snap={snap}
      onSnapChange={setPanelSnap}
      header={
        <div css={css({ display: "flex", flexDirection: "column", gap: "8px" })}>
          <DraftStatus />
          <CourseLimitsStatus />
          {readOnly ? (
            <div css={css({ display: "flex", flexDirection: "column", gap: "4px" })}>
              <div
                css={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11.5px",
                  fontWeight: 700,
                  color: "#0b62c4",
                })}
              >
                <Eye css={css({ width: "14px", height: "14px" })} />
                {t("orthoPlayerBadge")}
              </div>
              <div title={course.name} css={css({ fontSize: "15px", fontWeight: 700, color: "#202124",
                overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical", overflow: "hidden" })}>
                {course.name || t("orthoTitle")}
              </div>
              <p css={css({ margin: 0, fontSize: "12px", color: "#5f6368" })}>{t("orthoPlayerHint")}</p>
            </div>
          ) : (
          <div css={css({ display: "flex", alignItems: "center", gap: "6px" })}>
            <input
              value={course.name}
              onChange={(event) => useCourseStore.getState().setName(event.target.value)}
              placeholder={t("orthoCourseNamePlaceholder")}
              aria-label={t("orthoCourseName")}
              css={css({
                flex: 1,
                minWidth: 0,
                height: "38px",
                padding: "0 12px",
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
            <TapButton
              aria-label={t("orthoUndo")}
              title={t("orthoUndo")}
              disabled={!canUndo}
              onClick={() => useCourseStore.getState().undo()}
            >
              <Undo2 css={css({ width: "18px", height: "18px" })} />
            </TapButton>
            <TapButton
              aria-label={t("orthoRedo")}
              title={t("orthoRedo")}
              disabled={!canRedo}
              onClick={() => useCourseStore.getState().redo()}
            >
              <Redo2 css={css({ width: "18px", height: "18px" })} />
            </TapButton>
          </div>
          )}

          {!readOnly && <CourseToolbar />}

          <div
            css={css({
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              fontSize: "12px",
              color: "#5f6368",
            })}
          >
            <div css={css({ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 })}>
              <strong css={css({ color: "#202124" })}>
                {stats.controlCount} {t("orthoControlCount")}
              </strong>
              <span>{fmtLength(stats.totalM)}</span>
              {course.playMode === "score" && <span>{stats.totalScore} pt</span>}
            </div>
            <div css={css({ display: "flex", gap: "4px", flexShrink: 0 })}>
              {(["controls", "scene"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  aria-pressed={tab === value}
                  css={css({
                    minHeight: "32px",
                    padding: "0 10px",
                    borderRadius: "999px",
                    border: "1px solid " + (tab === value ? "#007bfe" : "transparent"),
                    backgroundColor: tab === value ? "#e8f1ff" : "transparent",
                    color: tab === value ? "#0b62c4" : "#5f6368",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  })}
                >
                  {t(value === "controls" ? "orthoTabControls" : "orthoTabScene")}
                </button>
              ))}
            </div>
          </div>
        </div>
      }
    >
      {tab === "scene" ? (
        <SceneSettings />
      ) : (
        <div css={css({ display: "flex", flexDirection: "column", gap: "10px", paddingBottom: "8px" })}>
          {importError && (
            <p role="alert" css={css({ margin: 0, fontSize: "12px", color: "#c5221f" })}>
              {t("orthoImportFailed")}
            </p>
          )}

          {selected ? (
            readOnly ? <ControlDetails control={selected} /> : <ControlEditor control={selected} />
          ) : (
            <p css={css({ margin: 0, fontSize: "12px", color: "#9aa0a6" })}>{t("orthoSelectPrompt")}</p>
          )}

          {ordered.length === 0 ? (
            <p css={css({ margin: 0, fontSize: "13px", color: "#5f6368", lineHeight: 1.5 })}>
              {t("orthoEmpty")}
            </p>
          ) : (
            <ol
              css={css({
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              })}
            >
              {ordered.map((control, index) => (
                <ControlRow
                  key={control.id}
                  control={control}
                  leg={index > 0 ? stats.legs[index - 1] : null}
                  selected={control.id === selectedId}
                  zh={zh}
                />
              ))}
            </ol>
          )}

          {!readOnly && (
            <TapButton active onClick={handleShare}>
              <Share2 css={css({ width: "16px", height: "16px" })} />
              {t("orthoShare")}
            </TapButton>
          )}
          <TapButton onClick={() => setSummaryOpen(true)}>
            <Table css={css({ width: "16px", height: "16px" })} />
            {t("orthoSummary")}
          </TapButton>
          {shareNote && (
            <p
              role="status"
              css={css({
                margin: 0,
                fontSize: "12px",
                color: shareNote === "copied" ? "#1e8e3e" : "#c5221f",
              })}
            >
              {t(
                shareNote === "copied"
                  ? "orthoShareCopied"
                  : shareNote === "empty"
                    ? "orthoShareEmpty"
                    : "orthoShareFailed",
              )}
            </p>
          )}

          <div css={css({ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "2px" })}>
            {!readOnly && (
            <TapButton onClick={() => fileRef.current?.click()}>
              <FileUp css={css({ width: "16px", height: "16px" })} />
              {t("orthoImport")}
            </TapButton>
            )}
            <TapButton
              onClick={() => {
                const text = useCourseStore.getState().exportCourseJson();
                if (text !== null) downloadBlob(
                  new Blob([text], { type: "application/json" }),
                  `${(course.name || "course").replace(/[^\w\u4e00-\u9fff-]+/g, "-")}.json`,
                );
              }}
            >
              <Download css={css({ width: "16px", height: "16px" })} />
              {t("orthoExport")}
            </TapButton>
            <TapButton
              onClick={() =>
                useExportStore
                  .getState()
                  .requestExport("glb", (course.name || "course").replace(/[^\w\u4e00-\u9fff-]+/g, "-"))
              }
            >
              <Upload css={css({ width: "16px", height: "16px" })} />
              {t("orthoExportModel")}
            </TapButton>
            <TapButton onClick={() => useExportStore.getState().requestExport(
              "dxf", (course.name || "course").replace(/[^\w\u4e00-\u9fff-]+/g, "-"),
            )}>
              <Download css={css({ width: "16px", height: "16px" })} />
              DXF · R2010
            </TapButton>
            {!readOnly && (
            <TapButton
              tone="danger"
              onClick={() => {
                if (window.confirm(zh ? "清除所有檢查點？" : "Clear every control?")) {
                  useCourseStore.getState().clearControls();
                }
              }}
            >
              <Trash2 css={css({ width: "16px", height: "16px" })} />
              {t("orthoClearAll")}
            </TapButton>
            )}
            <label
              css={css({
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                color: "#5f6368",
                padding: "0 6px",
              })}
            >
              <input
                type="checkbox"
                checked={showRoute}
                onChange={() => setScene({ showRoute: !showRoute })}
                css={css({ width: "18px", height: "18px" })}
              />
              {t("orthoShowRoute")}
            </label>
          </div>

          {!readOnly && (
          <select
            value={course.playMode}
            onChange={(event) =>
              useCourseStore.getState().replaceCourse({
                ...course,
                playMode: event.target.value === "score" ? "score" : "linear",
              })
            }
            aria-label={t("orthoPlayMode")}
            css={css({
              height: "38px",
              borderRadius: "10px",
              border: "1px solid #dfe3e8",
              backgroundColor: "#ffffff",
              fontSize: "13px",
              color: "#202124",
              padding: "0 10px",
            })}
          >
            <option value="linear">{t("orthoLinearMode")}</option>
            <option value="score">{t("orthoScoreMode")}</option>
          </select>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              await importCourseFile(file);
            }}
          />
          <CourseSummary isOpen={summaryOpen} onClose={() => setSummaryOpen(false)} course={course} />
        </div>
      )}
    </BottomSheet>
  );
}

function ControlRow({
  control,
  leg,
  selected,
  zh,
}: {
  control: CourseControl;
  leg: { distanceM: number; magneticDeg: number } | null;
  selected: boolean;
  zh: boolean;
}) {
  const select = useCourseStore((state) => state.select);
  const refs = gridRefs(control.lat, control.lng);

  return (
    <li>
      <button
        type="button"
        onClick={() => select(selected ? null : control.id)}
        css={css({
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "8px 10px",
          minHeight: "var(--tap)",
          borderRadius: "12px",
          border: `1px solid ${selected ? "#007bfe" : "#e8eaed"}`,
          backgroundColor: selected ? "#f0f7ff" : "#ffffff",
          textAlign: "left",
          cursor: "pointer",
        })}
      >
        <span
          css={css({
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "34px",
            height: "34px",
            flexShrink: 0,
            borderRadius: "50%",
            border: "2px solid #c2185b",
            color: "#c2185b",
            fontSize: control.code.length > 2 ? "10px" : "13px",
            fontWeight: 700,
          })}
        >
          {control.code || controlSymbol(control.kind)}
        </span>
        <span css={css({ flex: 1, minWidth: 0 })}>
          <span
            css={css({
              display: "block",
              fontSize: "13.5px",
              fontWeight: 600,
              color: "#202124",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            })}
          >
            {control.name || controlKindLabel(control.kind, zh)}
            {control.score > 0 && ` · ${control.score} pt`}
          </span>
          <span
            css={css({
              display: "block",
              fontSize: "11.5px",
              color: "#5f6368",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            })}
          >
            {refs.fig6}
            {leg && ` · ${fmtLength(leg.distanceM)} · ${formatDeg(leg.magneticDeg)}`}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Read-only card shown to players: everything printed on the control card. */
function ControlDetails({ control }: { control: CourseControl }) {
  const { t, lang } = useI18n();
  const zh = lang === "zh";
  const refs = gridRefs(control.lat, control.lng);
  const playMode = useCourseStore((state) => state.course.playMode);
  const label = css({ fontSize: "11px", fontWeight: 600, color: "#5f6368" });
  const value = css({ fontSize: "13.5px", color: "#202124", fontWeight: 500 });

  return (
    <div
      css={css({
        border: "1px solid #d7e5fb",
        backgroundColor: "#f7fbff",
        borderRadius: "14px",
        padding: "10px 12px",
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        columnGap: "12px",
        rowGap: "6px",
        alignItems: "baseline",
      })}
    >
      <span css={label}>{t("orthoCode")}</span>
      <span css={[value, css({ fontWeight: 700, color: "#c2185b" })]}>
        {control.code || controlSymbol(control.kind)} · {controlKindLabel(control.kind, zh)}
      </span>
      {control.name && (
        <>
          <span css={label}>{t("orthoName")}</span>
          <span css={value}>{control.name}</span>
        </>
      )}
      {control.clue && (
        <>
          <span css={label}>{t("orthoClue")}</span>
          <span css={value}>{control.clue}</span>
        </>
      )}
      {playMode === "score" && control.kind === "control" && (
        <>
          <span css={label}>{t("orthoScore")}</span>
          <span css={value}>{control.score} pt</span>
        </>
      )}
      <span css={label}>{t("orthoGridRef")}</span>
      <span css={value}>
        {refs.fig8}
        <span css={css({ display: "block", fontSize: "11px", color: "#9aa0a6" })}>
          {control.lat.toFixed(5)}, {control.lng.toFixed(5)}
        </span>
      </span>
    </div>
  );
}

function ControlEditor({ control }: { control: CourseControl }) {
  const { t, lang } = useI18n();
  const zh = lang === "zh";
  const update = useCourseStore((state) => state.updateControl);
  const move = useCourseStore((state) => state.moveControl);
  const remove = useCourseStore((state) => state.removeControl);
  const [gridText, setGridText] = useState("");
  const [gridError, setGridError] = useState(false);
  const refs = gridRefs(control.lat, control.lng);

  const field = css({
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    height: "38px",
    padding: "0 10px",
    borderRadius: "10px",
    border: "1px solid #dfe3e8",
    backgroundColor: "#ffffff",
    fontSize: "13px",
    color: "#202124",
    outline: "none",
    ":focus": { borderColor: "#007bfe" },
  });

  const label = css({ fontSize: "11.5px", fontWeight: 600, color: "#5f6368" });

  return (
    <div data-course-editor=""
      css={css({
        border: "1px solid #d7e5fb",
        backgroundColor: "#f7fbff",
        borderRadius: "14px",
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      })}
    >
      <div css={css({ display: "flex", gap: "8px" })}>
        <label css={css({ display: "flex", flexDirection: "column", gap: "3px", width: "82px" })}>
          <span css={label}>{t("orthoCode")}</span>
          <input
            value={control.code}
            onChange={(event) => update(control.id, { code: event.target.value })}
            inputMode={control.kind === "control" ? "numeric" : "text"}
            css={field}
          />
        </label>
        <label css={css({ display: "flex", flexDirection: "column", gap: "3px", flex: 1, minWidth: 0 })}>
          <span css={label}>{t("orthoName")}</span>
          <input
            value={control.name}
            onChange={(event) => update(control.id, { name: event.target.value })}
            css={field}
          />
        </label>
      </div>

      <label css={css({ display: "flex", flexDirection: "column", gap: "3px" })}>
        <span css={label}>{t("orthoClue")}</span>
        <input
          value={control.clue}
          onChange={(event) => update(control.id, { clue: event.target.value })}
          css={field}
        />
      </label>

      <div css={css({ display: "flex", gap: "8px" })}>
        {useCourseStore.getState().course.playMode === "score" && control.kind === "control" && (
          <label css={css({ display: "flex", flexDirection: "column", gap: "3px", width: "82px" })}>
            <span css={label}>{t("orthoScore")}</span>
            <input
              type="number"
              inputMode="numeric"
              value={control.score}
              onChange={(event) => update(control.id, { score: Number(event.target.value) || 0 })}
              css={field}
            />
          </label>
        )}
        <label css={css({ display: "flex", flexDirection: "column", gap: "3px", flex: 1, minWidth: 0 })}>
          <span css={label}>
            {t("orthoGridRef")} · {refs.fig8}
          </span>
          <div css={css({ display: "flex", gap: "6px" })}>
            <input
              value={gridText}
              placeholder={t("orthoGridPlaceholder")}
              inputMode="text"
              autoCapitalize="characters"
              onChange={(event) => {
                setGridText(event.target.value);
                setGridError(false);
              }}
              css={field}
            />
            <TapButton
              onClick={() => {
                const parsed = parseGridInput(gridText);
                if (!parsed) {
                  setGridError(true);
                  return;
                }
                move(control.id, parsed);
                setGridText("");
              }}
            >
              {t("orthoGoToGrid")}
            </TapButton>
          </div>
        </label>
      </div>
      {gridError && (
        <p role="alert" css={css({ margin: 0, fontSize: "11.5px", color: "#c5221f" })}>
          {t("orthoGridInvalid")}
        </p>
      )}

      <div css={css({ display: "flex", gap: "6px" })}>
        <TapButton tone="danger" onClick={() => remove(control.id)}>
          <Trash2 css={css({ width: "16px", height: "16px" })} />
          {t("orthoToolDelete")}
        </TapButton>
        <span css={css({ flex: 1, fontSize: "11px", color: "#9aa0a6", alignSelf: "center" })}>
          {controlKindLabel(control.kind, zh)} · {control.lat.toFixed(5)}, {control.lng.toFixed(5)}
        </span>
      </div>
    </div>
  );
}
