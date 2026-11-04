import { useEffect, useId, type ReactNode } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { DATA_SOURCES, getDataSource, normalizeSourceSelection, type DataSource } from "@/config/dataSources";
import { fetchSourceGeoJson, GIS_LIMITS } from "@/utils/gis";
import { useI18n } from "@/i18n";

export type SourceStatus = "loading" | "ready" | "error";
interface LayerProps {
  selected: string[];
  retries: Record<string, number>;
  onStatus: (id: string, status: SourceStatus) => void;
}

function SourceLayer({ source, onStatus }: { source: DataSource; onStatus: LayerProps["onStatus"] }) {
  const map = useMap();
  useEffect(() => {
    if (source.kind === "download") return;
    const controller = new AbortController();
    let active = true;
    let layer: L.Layer | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const report = (status: SourceStatus) => { if (active) onStatus(source.id, status); };
    const armTimeout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { controller.abort(); report("error"); }, GIS_LIMITS.timeoutMs);
    };
    report("loading");
    armTimeout();
    if (source.kind === "geojson") {
      fetchSourceGeoJson(source, controller.signal).then(data => {
        if (!active) return;
        layer = L.geoJSON(data, { attribution: source.attribution,
          style: { color: source.color, weight: 1.5, fillOpacity: 0.04, interactive: false }, interactive: false });
        layer.addTo(map);
        clearTimeout(timer);
        report("ready");
      }).catch(() => { clearTimeout(timer); report("error"); });
    } else {
      let failures = 0;
      const options = { attribution: source.attribution, maxZoom: 22, maxNativeZoom: source.maxNativeZoom,
        updateWhenIdle: true, keepBuffer: 1 };
      const tiles = source.kind === "wms"
        ? L.tileLayer.wms(source.url, { ...options, layers: source.layers, format: "image/png", transparent: false,
          version: "1.1.1", time: source.time } as L.WMSOptions)
        : L.tileLayer(source.url, options);
      tiles.on("loading", () => { failures = 0; report("loading"); armTimeout(); });
      tiles.on("tileerror", () => { failures++; report("error"); });
      tiles.on("load", () => { clearTimeout(timer); report(failures ? "error" : "ready"); });
      layer = tiles;
      tiles.addTo(map);
    }
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
      // Leaflet removes attribution via its own remove listeners. Keep those
      // alive until removal, then release our remaining event handlers.
      layer?.remove();
      layer?.off();
    };
  }, [map, source, onStatus]);
  return null;
}

export function DataSourceLayers({ selected, retries, onStatus }: LayerProps) {
  return <>{normalizeSourceSelection(selected).map(id => <SourceLayer key={`${id}:${retries[id] ?? 0}`} source={getDataSource(id)} onStatus={onStatus} />)}</>;
}

export function DataSourceControls({ selected, statuses, onSelect, onRetry, children }: {
  children?: ReactNode;
  selected: string[];
  statuses: Record<string, SourceStatus>;
  onSelect: (ids: string[]) => void;
  onRetry: (id: string) => void;
}) {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const groupId = useId();
  const label = (source: DataSource) => zh ? source.nameZh : source.name;
  const statusLabel = { loading: zh ? "載入中" : "Loading", ready: zh ? "已載入" : "Loaded", error: zh ? "載入失敗／部分缺圖" : "Failed / missing tiles" };
  return (
    <details className="gis-controls">
      <summary>{zh ? "GIS 資料來源" : "GIS data sources"} · {DATA_SOURCES.length}</summary>
      <p>{zh ? "圖層直接連到供應商，不經本站伺服器。僅作 2D 參考，不會改動 3D 建築、DEM 或匯出。" : "Layers connect directly to providers, not our server. 2D references only; they do not change 3D buildings, DEM or exports."}</p>
      <fieldset>
        <legend>{zh ? "底圖（選一項）" : "Basemap (choose one)"}</legend>
        {DATA_SOURCES.filter(s => s.role === "base").map(source => row(source))}
      </fieldset>
      <fieldset>
        <legend>{zh ? "參考圖層" : "Reference overlays"}</legend>
        {DATA_SOURCES.filter(s => s.role === "overlay").map(source => row(source))}
      </fieldset>
      <fieldset>
        <legend>{zh ? "下載目錄 · 須先轉換" : "Downloads · preprocessing required"}</legend>
        {DATA_SOURCES.filter(s => s.kind === "download").map(source => (
          <div key={source.id} className="gis-source">
            <strong>{label(source)}</strong>
            <small>{zh ? source.noteZh : source.note}</small>
            <small>{source.attribution}</small>
            <a href={source.docs} target="_blank" rel="noopener noreferrer">{zh ? "官方資料與授權" : "Official data & terms"} ↗</a>
          </div>
        ))}
      </fieldset>
      {children}
    </details>
  );

  function row(source: DataSource) {
    const checked = selected.includes(source.id);
    const status = checked ? statuses[source.id] : undefined;
    return <div key={source.id} className="gis-source">
      <label>
        <input type={source.role === "base" ? "radio" : "checkbox"} name={`${groupId}-basemap`} checked={checked}
          onChange={() => {
            const next = source.role === "base"
              ? [source.id, ...selected.filter(id => getDataSource(id).role === "overlay")]
              : checked ? selected.filter(id => id !== source.id) : [...selected, source.id];
            onSelect(normalizeSourceSelection(next));
          }} />
        <span>{label(source)}</span>
      </label>
      <small>{zh ? source.noteZh : source.note}</small>
      <div className="gis-source-actions">
        <a href={source.docs} target="_blank" rel="noopener noreferrer">{zh ? "來源／條款" : "Source / terms"} ↗</a>
        {status && <span role="status" className={status === "error" ? "gis-error" : ""}>{statusLabel[status]}</span>}
        {status === "error" && <button type="button" onClick={() => onRetry(source.id)}>{zh ? "重試" : "Retry"}</button>}
      </div>
    </div>;
  }
}
