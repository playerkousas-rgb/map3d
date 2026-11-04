import { css } from "@emotion/react";
import { useMemo, useState } from "react";
import { Copy, Download, Table } from "lucide-react";
import { Modal } from "@/components/modal/Modal";
import { TapButton } from "@/components/ui/Touch";
import { Title } from "@/components/text/Title";
import { Description } from "@/components/text/Description";
import { useI18n } from "@/i18n";
import { courseStats, orderedControls, type Course } from "@/utils/course";
import { formatDeg, gridRefs } from "@/utils/hkgeo";
import { fmtLength } from "@/utils/measure";
import { downloadBlob } from "@/utils/exporters";

function toCsvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function CourseSummary({
  isOpen,
  onClose,
  course,
}: {
  isOpen: boolean;
  onClose: () => void;
  course: Course;
}) {
  const { t, lang } = useI18n();
  const zh = lang === "zh";
  const ordered = useMemo(() => orderedControls(course), [course]);
  const stats = useMemo(() => courseStats(course), [course]);
  const [copied, setCopied] = useState(false);
  const [includePrivate, setIncludePrivate] = useState(false);

  const rows = useMemo(() => {
    return ordered.map((control, index) => {
      const leg = index > 0 ? stats.legs[index - 1] : null;
      const refs = gridRefs(control.lat, control.lng);
      return {
        index: index + 1,
        control,
        leg,
        refs,
      };
    });
  }, [ordered, stats.legs]);

  const plainText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`${course.name || t("orthoTitle")} — ${course.playMode === "score" ? t("orthoScoreMode") : t("orthoLinearMode")}`);
    lines.push(`${t("orthoControlCount")}: ${stats.controlCount} · ${t("orthoTotalDistance")}: ${fmtLength(stats.totalM)}${course.playMode === "score" ? ` · ${stats.totalScore} pt` : ""}`);
    if (course.meet) lines.push(`${t("orthoMeet")}: ${course.meet}`);
    if (course.cutoff) lines.push(`${t("orthoCutoff")}: ${course.cutoff}`);
    if (course.sos) lines.push(`${t("orthoSos")}: ${course.sos}`);
    lines.push("");
    lines.push([zh ? "序" : "#", zh ? "代碼" : "Code", zh ? "名稱" : "Name", "Grid", zh ? "距離" : "Leg", zh ? "方位" : "Bearing", zh ? "分數" : "Score", zh ? "提示" : "Clue"].join("\t"));
    for (const { control, leg, refs } of rows) {
      const legText = leg ? fmtLength(leg.distanceM) : "—";
      const bearingText = leg ? formatDeg(leg.magneticDeg) : "—";
      lines.push(
        [
          String(rows.findIndex((r) => r.control.id === control.id) + 1),
          control.code || control.kind,
          control.name || "",
          refs.fig8,
          legText,
          bearingText,
          course.playMode === "score" && control.kind === "control" ? String(control.score) : "—",
          control.clue || "",
          includePrivate && control.note ? `note:${control.note}` : "",
        ]
          .filter(Boolean)
          .join("\t"),
      );
    }
    return lines.join("\n");
  }, [course, stats, rows, t, zh, includePrivate]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: try to copy via execCommand
      const ta = document.createElement("textarea");
      ta.value = plainText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadCsv = () => {
    const header = [zh ? "序號" : "No", zh ? "代碼" : "Code", zh ? "類型" : "Kind", zh ? "名稱" : "Name", zh ? "方格" : "Grid", "Lat", "Lng", zh ? "距離(m)" : "Leg(m)", zh ? "磁方位" : "Magnetic", zh ? "分數" : "Score", zh ? "提示" : "Clue"];
    const csvRows = [header.map(toCsvCell).join(",")];
    for (const { control, leg } of rows) {
      csvRows.push(
        [
          toCsvCell(control.code),
          toCsvCell(control.kind),
          toCsvCell(control.name),
          toCsvCell(gridRefs(control.lat, control.lng).fig8),
          toCsvCell(String(control.lat)),
          toCsvCell(String(control.lng)),
          toCsvCell(leg ? String(Math.round(leg.distanceM)) : ""),
          toCsvCell(leg ? String(Math.round(leg.magneticDeg)) : ""),
          toCsvCell(course.playMode === "score" && control.kind === "control" ? String(control.score) : ""),
          toCsvCell(control.clue),
        ].join(","),
      );
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `${(course.name || "course").replace(/[^\w\u4e00-\u9fff-]+/g, "-")}.csv`);
  };

  return (
    <Modal label={t("orthoSummary")} isOpen={isOpen} onClose={onClose}>
      <div css={css({ display: "flex", flexDirection: "column", gap: "12px" })}>
        <Title>{t("orthoSummary")}</Title>
        <Description>{t("orthoSummaryDesc")}</Description>

        <div
          css={css({
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 0",
            borderTop: "1px solid #eceef1",
            borderBottom: "1px solid #eceef1",
            fontSize: "12px",
            color: "#5f6368",
          })}
        >
          <span>
            <strong css={css({ color: "#202124" })}>{ordered.length}</strong> {zh ? "點" : "points"} · {fmtLength(stats.totalM)}
            {course.playMode === "score" && ` · ${stats.totalScore} pt`}
          </span>
          <label css={css({ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#5f6368" })}>
            <input type="checkbox" checked={includePrivate} onChange={(e) => setIncludePrivate(e.target.checked)} />
            {zh ? "包含私人備註（不建議分享）" : "Include private notes"}
          </label>
        </div>

        {ordered.length === 0 ? (
          <p css={css({ margin: 0, fontSize: "13px", color: "#9aa0a6" })}>{t("orthoEmpty")}</p>
        ) : (
          <div
            css={css({
              maxHeight: "min(48dvh, 420px)",
              overflow: "auto",
              border: "1px solid #e8eaed",
              borderRadius: "10px",
            })}
          >
            <table
              css={css({
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12.5px",
                lineHeight: 1.4,
              })}
            >
              <thead css={css({ position: "sticky", top: 0, backgroundColor: "#f8fafc", zIndex: 1 })}>
                <tr>
                  <th css={css({ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #e8eaed", fontWeight: 700 })}>#</th>
                  <th css={css({ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #e8eaed", fontWeight: 700 })}>{zh ? "代碼" : "Code"}</th>
                  <th css={css({ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #e8eaed", fontWeight: 700 })}>{zh ? "檢查點" : "Control"}</th>
                  <th css={css({ textAlign: "left", padding: "8px 6px", borderBottom: "1px solid #e8eaed", fontWeight: 700 })}>Grid</th>
                  <th css={css({ textAlign: "right", padding: "8px 6px", borderBottom: "1px solid #e8eaed", fontWeight: 700 })}>{zh ? "分段" : "Leg"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ control, leg, refs }, idx) => (
                  <tr key={control.id} css={css({ ":nth-of-type(even)": { backgroundColor: "#fbfcfe" } })}>
                    <td css={css({ padding: "7px 6px", borderBottom: "1px solid #f1f3f5", color: "#5f6368" })}>{idx + 1}</td>
                    <td css={css({ padding: "7px 6px", borderBottom: "1px solid #f1f3f5", fontWeight: 700, color: "#c2185b", whiteSpace: "nowrap" })}>
                      {control.code || control.kind}
                    </td>
                    <td css={css({ padding: "7px 6px", borderBottom: "1px solid #f1f3f5", minWidth: "120px" })}>
                      <div css={css({ fontWeight: 600, color: "#202124", overflowWrap: "anywhere" })}>
                        {control.name || control.clue || "—"}
                      </div>
                      <div css={css({ fontSize: "11px", color: "#80868b" })}>
                        {control.clue && control.name ? control.clue : ""}
                        {includePrivate && control.note ? ` · ${control.note}` : ""}
                      </div>
                    </td>
                    <td css={css({ padding: "7px 6px", borderBottom: "1px solid #f1f3f5", fontFamily: "ui-monospace, monospace", fontSize: "11.5px", whiteSpace: "nowrap" })}>
                      {refs.fig8}
                      <div css={css({ fontSize: "10.5px", color: "#9aa0a6" })}>{control.lat.toFixed(5)}, {control.lng.toFixed(5)}</div>
                    </td>
                    <td css={css({ padding: "7px 6px", borderBottom: "1px solid #f1f3f5", textAlign: "right", whiteSpace: "nowrap" })}>
                      {leg ? (
                        <>
                          <div>{fmtLength(leg.distanceM)}</div>
                          <div css={css({ fontSize: "11px", color: "#80868b" })}>{formatDeg(leg.magneticDeg)}</div>
                        </>
                      ) : (
                        <span css={css({ color: "#9aa0a6" })}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(course.meet || course.cutoff || course.sos) && (
          <div css={css({ fontSize: "11.5px", color: "#5f6368", backgroundColor: "#f8fafc", borderRadius: "8px", padding: "8px 10px" })}>
            {course.meet && <div><strong>{t("orthoMeet")}:</strong> {course.meet}</div>}
            {course.cutoff && <div><strong>{t("orthoCutoff")}:</strong> {course.cutoff}</div>}
            {course.sos && <div><strong>{t("orthoSos")}:</strong> {course.sos}</div>}
          </div>
        )}

        <div css={css({ display: "flex", flexWrap: "wrap", gap: "8px" })}>
          <TapButton active onClick={handleCopy}>
            <Copy css={css({ width: "16px", height: "16px" })} />
            {copied ? t("orthoSummaryCopied") : t("orthoCopySummary")}
          </TapButton>
          <TapButton onClick={handleDownloadCsv}>
            <Download css={css({ width: "16px", height: "16px" })} />
            {t("orthoDownloadCsv")}
          </TapButton>
          <TapButton onClick={onClose}>
            <Table css={css({ width: "16px", height: "16px" })} />
            {t("closeDialog")}
          </TapButton>
        </div>
        {copied && (
          <p role="status" css={css({ margin: 0, fontSize: "11.5px", color: "#1e8e3e" })}>
            {t("orthoSummaryCopied")}
          </p>
        )}
        <p css={css({ margin: 0, fontSize: "11px", color: "#9aa0a6", lineHeight: 1.45 })}>
          {zh
            ? "摘要排除私人備註（勾選才顯示），不含地形/建築高度保證。分享前請檢查官方地圖及實地。"
            : "Summary excludes private notes unless checked; no terrain/building accuracy guarantee. Verify with official maps and ground checks."}
        </p>
      </div>
    </Modal>
  );
}
