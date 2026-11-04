/** Browser-direct GIS catalogue. No application proxy, secrets or bundled datasets.
 * Evidence and limitations: docs/data-sources.md.
 */
interface SourceInfo {
  id: string;
  name: string;
  nameZh: string;
  provider: string;
  attribution: string;
  docs: string;
  note: string;
  noteZh: string;
}
export type DataSource = SourceInfo & (
  | { kind: "xyz"; role: "base"; url: string; maxNativeZoom: number }
  | { kind: "wms"; role: "base"; url: string; layers: string; time: string; maxNativeZoom: number }
  | { kind: "geojson"; role: "overlay"; url: string; color: string }
  | { kind: "download"; role: "reference"; url: string }
);

const NE_REV = "ca96624a56bd078437bca8184e78163e5039ad19";
const ne = (file: string) => `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_REV}/geojson/${file}.geojson`;
const coarse = { note: "1:110m global reference; not suitable for local navigation.", noteZh: "1:110m 全球概覽，不適合街道或定向導航。" };
export const DATA_SOURCES: readonly DataSource[] = [
  { id: "osm", kind: "xyz", role: "base", name: "OpenStreetMap", nameZh: "OpenStreetMap 街道圖", provider: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", maxNativeZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', docs: "https://www.openstreetmap.org/copyright",
    note: "Community map; not an official survey.", noteZh: "社群地圖，並非官方測量成果。" },
  { id: "hk-map", kind: "xyz", role: "base", name: "Hong Kong basemap", nameZh: "香港地政總署底圖", provider: "Lands Department",
    url: "https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/basemap/WGS84/{z}/{x}/{y}.png", maxNativeZoom: 20,
    attribution: "Map from Lands Department", docs: "https://portal.csdi.gov.hk/csdi-webpage/doc/TNC",
    note: "Hong Kong coverage. Map API terms apply.", noteZh: "香港範圍，須遵守地政總署 Map API 條款。" },
  { id: "hk-imagery", kind: "xyz", role: "base", name: "Hong Kong aerial photography", nameZh: "香港航空照片", provider: "Lands Department",
    url: "https://mapapi.geodata.gov.hk/gs/api/v1.0.0/xyz/imagery/WGS84/{z}/{x}/{y}.png", maxNativeZoom: 20,
    attribution: "Aerial Photograph from Lands Department", docs: "https://portal.csdi.gov.hk/csdi-webpage/doc/TNC",
    note: "Hong Kong coverage; not live imagery.", noteZh: "香港範圍，並非即時影像。" },
  { id: "opentopo", kind: "xyz", role: "base", name: "OpenTopoMap", nameZh: "OpenTopoMap 地形圖", provider: "OpenTopoMap",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", maxNativeZoom: 17,
    attribution: '© OpenStreetMap contributors · <a href="https://opentopomap.org/about">OpenTopoMap</a> (CC-BY-SA)', docs: "https://opentopomap.org/about",
    note: "General topographic reference; coverage and availability may vary.", noteZh: "一般地形參考，覆蓋及服務可用性可能有變。" },
  { id: "nasa-modis", kind: "wms", role: "base", name: "NASA MODIS · 2013-11-04", nameZh: "NASA MODIS · 2013-11-04", provider: "NASA GIBS",
    url: "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi", layers: "MODIS_Terra_CorrectedReflectance_TrueColor", time: "2013-11-04", maxNativeZoom: 9,
    attribution: '<a href="https://www.earthdata.nasa.gov/engage/open-data-services-and-software/earthdata-developer-portal/gibs-api">NASA ESDIS GIBS</a>',
    docs: "https://nasa-gibs.github.io/gibs-api-docs/access-basics/",
    note: "Fixed historical day, not current imagery. Clouds/no-data possible; low resolution.", noteZh: "固定歷史日期，非最新影像；可能有雲或缺資料，解像度較低。" },
  { id: "ne-countries", kind: "geojson", role: "overlay", name: "Natural Earth · countries", nameZh: "Natural Earth · 國界", provider: "Natural Earth",
    url: ne("ne_110m_admin_0_countries"), color: "#7052a3", attribution: "Natural Earth · public domain", docs: "https://www.naturalearthdata.com/downloads/110m-cultural-vectors/", ...coarse },
  { id: "ne-rivers", kind: "geojson", role: "overlay", name: "Natural Earth · rivers", nameZh: "Natural Earth · 河流", provider: "Natural Earth",
    url: ne("ne_110m_rivers_lake_centerlines"), color: "#1769aa", attribution: "Natural Earth · public domain", docs: "https://www.naturalearthdata.com/downloads/110m-physical-vectors/", ...coarse },
  { id: "ne-lakes", kind: "geojson", role: "overlay", name: "Natural Earth · lakes", nameZh: "Natural Earth · 湖泊", provider: "Natural Earth",
    url: ne("ne_110m_lakes"), color: "#00838f", attribution: "Natural Earth · public domain", docs: "https://www.naturalearthdata.com/downloads/110m-physical-vectors/", ...coarse },
  { id: "worldpop", kind: "download", role: "reference", name: "WorldPop · population", nameZh: "WorldPop · 人口分佈", provider: "WorldPop",
    url: "https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/0_Mosaicked/", attribution: "WorldPop · check individual dataset licence", docs: "https://hub.worldpop.org/",
    note: "Download catalogue, NOT WMS. TIFF is ~829 MB; global ZIP ~71 GB. Requires GIS preprocessing; not downloaded by this app.",
    noteZh: "下載目錄，並非 WMS。TIFF 約 829 MB、全球 ZIP 約 71 GB。須先用 GIS 處理，本 APP 不會自動下載。" },
  { id: "hydrorivers", kind: "download", role: "reference", name: "HydroSHEDS · HydroRIVERS", nameZh: "HydroSHEDS · HydroRIVERS 河網", provider: "HydroSHEDS",
    url: "https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_as_shp.zip", attribution: "HydroSHEDS · Lehner & Grill (2013); HydroSHEDS licence", docs: "https://www.hydrosheds.org/products/hydrorivers",
    note: "Asia Shapefile ZIP ~91 MB; not GeoJSON. Clip/reproject/convert in GIS first. HydroSHEDS terms apply.",
    noteZh: "亞洲 Shapefile ZIP 約 91 MB，並非 GeoJSON。須先裁切、轉投影及轉格式；受 HydroSHEDS 授權條款約束。" },
];

export function getDataSource(id: string): DataSource {
  const source = DATA_SOURCES.find(s => s.id === id);
  if (!source) throw new Error(`Unknown GIS source: ${id}`);
  return source;
}

/** Fail closed: ignore stale/unknown IDs, never activate downloads as layers. */
export function normalizeSourceSelection(ids: readonly string[]): string[] {
  const known = ids.map(id => DATA_SOURCES.find(s => s.id === id)).filter((s): s is DataSource => !!s && s.kind !== "download");
  const base = known.find(s => s.role === "base")?.id ?? "osm";
  return [base, ...new Set(known.filter(s => s.role === "overlay").map(s => s.id))];
}
