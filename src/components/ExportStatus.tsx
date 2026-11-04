import { useExportStore } from "@/state/exportStore";
import { useI18n } from "@/i18n";

/** Global feedback survives closing the export dialog or switching panels. */
export function ExportStatus() {
  const { lang } = useI18n();
  const state = useExportStore();
  if (state.status === "idle") return null;
  const zh = lang === "zh";
  const busy = state.status === "running" || state.status === "queued";
  const error = state.status === "error";
  const message = busy ? (zh ? "正在準備匯出，請稍候…" : "Preparing export, please wait…")
    : error ? (zh ? "匯出失敗。請確認場景已載入，或嘗試較小範圍／其他格式。" : "Export failed. Check the scene has loaded, or try a smaller area / another format.")
    : (zh ? "已交給瀏覽器下載；如未出現檔案，請檢查下載權限。" : "Download requested. If no file appears, check your browser's download permissions.");
  return <div className="export-status" role={error ? "alert" : "status"}>
    <strong>{state.format.toUpperCase()} · {state.filename}</strong>
    <p>{message}</p>
    {!busy && <div>
      {error && <button type="button" onClick={() => state.requestExport(state.format, state.filename)}>{zh ? "重試" : "Retry"}</button>}
      <button type="button" onClick={state.dismiss}>{zh ? "關閉" : "Dismiss"}</button>
    </div>}
  </div>;
}
