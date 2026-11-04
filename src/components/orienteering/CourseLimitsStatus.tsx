import { useLayoutEffect, useRef } from "react";
import { css } from "@emotion/react";
import { useCourseStore } from "@/state/courseStore";
import { useI18n } from "@/i18n";

/** Validation failures are distinct from storage failures: rejected edits never replace the draft. */
export function CourseLimitsStatus() {
  const error = useCourseStore(s => s.courseError);
  const readOnly = useCourseStore(s => s.readOnly);
  const { lang } = useI18n();
  const warning = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!error || readOnly || !warning.current?.getClientRects().length) return;
    const focus = document.activeElement;
    // A taller header must not cover the field that just rejected an edit.
    if (focus instanceof HTMLElement && focus.closest("[data-course-editor]")) {
      (focus.closest("label") ?? focus).scrollIntoView({ block: "nearest" });
    }
  }, [error, readOnly]);
  if (!error || readOnly) return null;
  const zh = lang === "zh";
  const messages = {
    COURSE_TOO_LARGE: zh ? "課程 JSON 超過 1 MB（UTF-8）上限。請先縮短備註或移除不需要的點；修改未套用，原有資料保留。" : "The course JSON would exceed 1 MB (UTF-8). Shorten notes or remove unneeded controls. The change was not applied; existing data is preserved.",
    TOO_MANY_CONTROLS: zh ? "每個課程最多 2,000 個點。新增未套用，原有資料保留；可先刪除不需要的點。" : "A course can contain at most 2,000 controls. The addition was not applied; existing data is preserved. Remove unneeded controls first.",
    TEXT_TOO_LONG: zh ? "每個文字欄位最多 4,000 個 UTF-16 字元單位（部分 emoji 計兩個）。修改未套用，原有資料保留。" : "Each text field is limited to 4,000 UTF-16 units (some emoji count twice). The change was not applied; existing data is preserved.",
    INVALID_COURSE: zh ? "課程欄位、座標、分數或點 ID 無效。操作已阻擋；請使用有效值，點 ID 不可重複。" : "Invalid course fields, coordinates, score or control IDs. The operation was blocked; use valid values and unique control IDs.",
  };
  return <div ref={warning} role="alert" data-course-error={error} css={css({ padding: "10px", border: "1px solid #b3261e", borderRadius: "8px", background: "#fff0ee", color: "#8c1d18", fontSize: "13px", lineHeight: 1.5 })}>
    <p css={css({ margin: "0 0 8px" })}>{messages[error]}</p>
    <button onClick={() => useCourseStore.getState().dismissCourseError()} css={css({ minHeight: "44px", padding: "6px 12px", border: "1px solid currentColor", borderRadius: "6px", background: "white", color: "inherit", cursor: "pointer" })}>{zh ? "關閉限制提示" : "Dismiss course limit warning"}</button>
  </div>;
}
