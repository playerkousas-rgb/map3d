import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { FeatureCollection } from "geojson";
import { getDataSource } from "@/config/dataSources";
import { readLocalGeoJson } from "@/utils/gis";
import { useI18n } from "@/i18n";

type Origin = "own" | "worldpop" | "hydrorivers";
export interface LocalOverlay {
  name: string;
  origin: Origin;
  data: FeatureCollection;
  bounds: [[number, number], [number, number]];
}

export function LocalGeoJsonLayer({ overlay }: { overlay: LocalOverlay | null }) {
  const map = useMap();
  useEffect(() => {
    if (!overlay) return;
    // Never insert a filename or arbitrary feature properties as Leaflet HTML.
    const attribution = overlay.origin === "own" ? "Local GeoJSON (user supplied)"
      : `Local GeoJSON · ${getDataSource(overlay.origin).attribution}`;
    const layer = L.geoJSON(overlay.data, {
      attribution, interactive: false,
      style: { color: "#9b2da8", weight: 2, fillOpacity: 0.12, interactive: false },
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { radius: 5, color: "#9b2da8", interactive: false }),
    }).addTo(map);
    return () => { layer.remove(); layer.off(); };
  }, [map, overlay]);
  return null;
}

export function LocalGeoJsonControls({ overlay, onChange, onFit }: {
  overlay: LocalOverlay | null;
  onChange: (overlay: LocalOverlay | null) => void;
  onFit: () => void;
}) {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const [origin, setOrigin] = useState<Origin>("own");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const cancel = () => { pending.current?.abort(); pending.current = null; setBusy(false); };
  return <fieldset className="gis-local">
    <legend>{zh ? "本地 GeoJSON · 不會上傳" : "Local GeoJSON · no upload"}</legend>
    <div className="gis-source">
      <p>{zh ? "先在 GIS 軟件裁切、轉為 WGS84 經緯度 GeoJSON（最多 2 MB）。支援點、線、面與有界 GeometryCollection。不支援原始 TIFF、ZIP 或 Shapefile；只顯示幾何，不提供人口統計／色階分析。" : "Clip and convert to WGS84 longitude/latitude GeoJSON first (max 2 MB). Points, lines, polygons and bounded GeometryCollections; raw TIFF, ZIP and Shapefiles are not supported. Geometry display only, not population statistics or graduated-value analysis."}</p>
      <label>{zh ? "來源標記（使用者選擇，未驗證）" : "Source label (user selected, unverified)"}
        <select value={origin} onChange={event => setOrigin(event.target.value as Origin)}>
          <option value="own">{zh ? "自備資料" : "User supplied"}</option>
          <option value="hydrorivers">HydroRIVERS</option>
          <option value="worldpop">WorldPop</option>
        </select>
      </label>
      <label>{zh ? "匯入 GeoJSON" : "Import GeoJSON"}
        <input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={async event => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          cancel();
          const controller = new AbortController();
          pending.current = controller;
          setBusy(true); setFailed(false);
          try {
            const parsed = await readLocalGeoJson(file, controller.signal);
            if (!controller.signal.aborted) onChange({ ...parsed, name: file.name.slice(0, 160), origin });
          } catch {
            if (!controller.signal.aborted) setFailed(true);
          } finally {
            if (pending.current === controller) { pending.current = null; setBusy(false); }
          }
        }} />
      </label>
      {busy && <div role="status">{zh ? "讀取及檢查中…" : "Reading and validating…"} <button type="button" onClick={cancel}>{zh ? "取消" : "Cancel"}</button></div>}
      {failed && <p role="alert" className="gis-error">{zh ? "無法載入：請確認格式、WGS84 座標、非空幾何、2 MB 與集合深度／總量限制。原有圖層未變更，可重新選檔。" : "Could not load: check format, WGS84 coordinates, drawable geometry, 2 MB and collection depth/size limits. Existing layer unchanged; choose a file to retry."}</p>}
      {overlay && <>
        <p role="status">{overlay.name} · {overlay.data.features.length} {zh ? "個圖徵" : "features"} · {overlay.origin === "own" ? (zh ? "自備資料" : "User supplied") : overlay.origin}</p>
        <div className="gis-source-actions">
          <button type="button" onClick={onFit}>{zh ? "縮放至本地圖層" : "Zoom to local layer"}</button>
          <button type="button" onClick={() => { cancel(); setFailed(false); onChange(null); }}>{zh ? "移除本地圖層" : "Remove local layer"}</button>
        </div>
      </>}
      <small>{zh ? "只保留一個暫存本地圖層；離開選圖或還原課程範圍時可能清除。不更改選取範圍，不加入 3D 或匯出。來源授權仍由你確認。" : "One temporary local layer; leaving map selection or restoring a course area may clear it. Does not change the selection or enter 3D/exports. You must check source licence terms."}</small>
    </div>
  </fieldset>;
}
