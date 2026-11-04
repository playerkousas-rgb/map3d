import { css } from "@emotion/react";
import { hasDraftWriteLock, useCourseStore } from "@/state/courseStore";
import { useI18n } from "@/i18n";
import { downloadBlob } from "@/utils/exporters";

/** Only problems are announced as alerts. A successful write is not a permanent backup. */
export function DraftStatus() {
  const { lang } = useI18n();
  const status = useCourseStore(s => s.storageStatus);
  const raw = useCourseStore(s => s.unreadableDraft);
  const external = useCourseStore(s => s.externalDraft);
  const externalInvalid = useCourseStore(s => s.externalInvalid);
  const readOnly = useCourseStore(s => s.readOnly);
  if (readOnly) return null;
  const zh = lang === "zh";
  const backup = (text: string, name: string) => downloadBlob(new Blob([text], { type: "application/json" }), name);
  const downloadCurrent = () => {
    const text = useCourseStore.getState().exportCourseJson();
    if (text !== null) backup(text, "course-backup.json");
  };
  const backupLabel = zh ? "下載目前 JSON 備份" : "Download current JSON backup";
  if (status === "saving") return <div role="status" data-draft-status="saving">
    <p>{zh ? "正在等候草稿寫入鎖並儲存；尚未確認完成…" : "Waiting for the draft lock and saving; not yet confirmed…"}</p>
    <button onClick={downloadCurrent} css={css({ minHeight: "44px", padding: "6px 12px", cursor: "pointer" })}>{backupLabel}</button>
  </div>;
  if (status === "ready") return hasDraftWriteLock() ? null : <p role="status" data-storage-locks="unavailable">{zh ? "此瀏覽器不支援跨分頁寫入鎖；請只開一個編輯分頁。" : "This browser has no cross-tab write lock. Edit in one tab only."}</p>;
  const invalid = status === "invalid";
  const conflict = status === "conflict";
  return <div role="alert" data-draft-status={status} css={css({ padding: "10px", border: "1px solid #b06000", borderRadius: "8px", background: "#fff4db", color: "#613900", fontSize: "13px", lineHeight: 1.5 })}>
    <p css={css({ margin: "0 0 8px" })}>{conflict
      ? (zh ? "另一分頁已修改或刪除已存草稿。此頁資料仍保留，但已暫停自動儲存。請先下載備份，再選擇載入已存版本或確認以此頁取代；不會自動合併。" : "Another tab changed or deleted the saved draft. This page is preserved, but autosave is paused. Back up first, then load the saved version or explicitly replace it with this page. No automatic merge.")
      : invalid ? (zh ? "無法讀取原有草稿；原始資料尚未被覆蓋。請先下載原始資料，或確認以目前草稿取代。" : "The saved draft could not be read and has not been overwritten. Download the original data before replacing it.")
      : (zh ? "草稿未能儲存在此瀏覽器；目前變更只暫存在此頁。請立即下載 JSON 備份，勿直接重新整理或關閉。" : "The draft could not be saved in this browser. Changes exist only in this page. Download a JSON backup before reloading or closing.")}</p>
    {conflict && externalInvalid && <p>{zh ? "已存版本無法讀取，未載入；此頁資料未變更。請下載已存版本原文留作修復，或明確確認取代。" : "The saved version is unreadable and was not loaded. This page is unchanged. Download its raw data for repair, or explicitly replace it."}</p>}
    <div css={css({ display: "flex", flexWrap: "wrap", gap: "8px", "& button": { minHeight: "44px", border: "1px solid #b06000", borderRadius: "6px", padding: "6px 10px", color: "inherit", background: "white", cursor: "pointer" } })}>
      <button onClick={downloadCurrent}>{backupLabel}</button>
      {raw !== null && <button onClick={() => backup(raw, "unreadable-draft-original.json")}>{zh ? "下載原始資料" : "Download original data"}</button>}
      {conflict ? <>
        {typeof external === "string" && <button onClick={() => backup(external, "other-tab-draft-original.json")}>{zh ? "下載已存版本原文" : "Download saved version data"}</button>}
        <button onClick={() => {
          const observed = useCourseStore.getState().externalDraft;
          if (observed === undefined) return;
          if (window.confirm(zh ? "放棄此頁的修改，載入目前已存版本？請先下載此頁備份。若已存版本已被刪除，會載入空白草稿。" : "Discard this page's changes and load the saved version? Back up this page first. A deleted saved version becomes an empty draft.")) useCourseStore.getState().loadExternalDraft(observed);
        }}>{zh ? "載入已存版本…" : "Load saved version…"}</button>
        <button onClick={() => {
          const observed = useCourseStore.getState().externalDraft;
          if (observed === undefined) return;
          if (window.confirm(zh ? "以此頁草稿取代已存版本？建議先備份雙方；若另一分頁再有修改，會重新要求確認。" : "Replace the saved version with this page? Back up both versions first. Another intervening write requires a new confirmation.")) useCourseStore.getState().overwriteExternalDraft(observed);
        }}>{zh ? "以此頁取代已存版本…" : "Replace saved version with this page…"}</button>
      </> : <button onClick={() => {
        if (invalid) {
          if (window.confirm(zh ? "確定以目前草稿覆蓋無法讀取的原始資料？建議先下載原始資料。" : "Replace the unreadable original with the current draft? Download the original data first.")) useCourseStore.getState().replaceUnreadableDraft();
        } else useCourseStore.getState().retrySave();
      }}>{invalid ? (zh ? "取代原始草稿…" : "Replace original draft…") : (zh ? "重試儲存" : "Retry saving")}</button>}
    </div>
    {!hasDraftWriteLock() && <p>{zh ? "此瀏覽器不支援跨分頁寫入鎖，檢查與寫入不是原子操作；請關閉其他編輯分頁。" : "Without Web Locks, checking and writing are not atomic. Close other editing tabs."}</p>}
  </div>;
}
