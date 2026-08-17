import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

export type Lang = "en" | "zh";

const dict = {
  en: {
    appName: "🗺️ Map3d",
    github: "GitHub",
    options: "Options",
    langToggle: "中文",

    // Front
    frontTitle: "Generate 3D Map",
    frontDesc:
      "Select an area on the map to build real-world 3D buildings and roads, or import a GPX track to create a 3D-printable model. Export as GLB / glTF / OBJ / STL.",
    modeMap: "Map → 3D Buildings",
    modeGpx: "GPX → 3D Print Model",
    importGpx: "Import GPX File",
    gpxHint: "Import a hiking / cycling GPX track and turn it into a printable 3D model.",

    // Map controls
    selectBox: "Select Box",
    backToDrag: "Back to Drag",
    removeBox: "Remove Box",

    // Steps
    processingTitle: "Processing",
    processingDesc:
      "Click Next Step to fetch building information. Once loaded, click Next Step again to view the 3D scene.",
    fetching: "Fetching...",
    fetchingBuildings: "Fetching building information...",
    nextStep: "Next Step",
    prevStep: "Prev Step",
    export: "Export",
    tooBigTitle: "The area is too big",
    tooBigDesc: "Do you want to proceed?",

    // Export
    exportTitle: "Export 3D Model",
    exportDesc: "Choose a format. STL is best for 3D printing.",
    download: "Download",

    // Building info
    buildingInfo: "Building Information",
    tagType: "Type",
    tagHeight: "Height",
    tagLevels: "Levels",
    tagAmenity: "Facility",
    tagDenomination: "Denomination",
    address: "Address",
    additionalInfo: "Additional Information",
    nameTranslations: "Name Translations",

    // GPX
    gpxTitle: "GPX 3D Model",
    gpxStats: "Track Statistics",
    gpxPoints: "Points",
    gpxDistance: "Distance",
    gpxElevGain: "Elevation Gain",
    gpxElevRange: "Elevation Range",
    gpxSettings: "Model Settings",
    gpxExaggeration: "Elevation Exaggeration",
    gpxTrackWidth: "Track Width",
    gpxBaseHeight: "Base Height",
    gpxBack: "Back",
    gpxExportStl: "Export STL (3D Print)",
    gpxParseError: "Failed to parse GPX file. Please check the file format.",
    gpxNoPoints: "No track points found in this GPX file.",
  },
  zh: {
    appName: "🗺️ Map3d",
    github: "GitHub",
    options: "選項",
    langToggle: "EN",

    // Front
    frontTitle: "生成 3D 地圖",
    frontDesc:
      "在地圖上框選區域，生成真實世界的 3D 建築與道路；或匯入 GPX 軌跡製作可 3D 列印的模型。支援匯出 GLB / glTF / OBJ / STL。",
    modeMap: "地圖 → 3D 建築",
    modeGpx: "GPX → 3D 列印模型",
    importGpx: "匯入 GPX 檔案",
    gpxHint: "匯入行山 / 單車 GPX 軌跡，製作成可 3D 列印的立體模型。",

    // Map controls
    selectBox: "框選區域",
    backToDrag: "返回拖曳",
    removeBox: "移除選框",

    // Steps
    processingTitle: "處理中",
    processingDesc:
      "按「下一步」抓取建築物資料，完成後再按一次「下一步」進入 3D 場景。",
    fetching: "抓取中...",
    fetchingBuildings: "正在抓取建築物資料...",
    nextStep: "下一步",
    prevStep: "上一步",
    export: "匯出",
    tooBigTitle: "選取範圍太大",
    tooBigDesc: "確定要繼續嗎？",

    // Export
    exportTitle: "匯出 3D 模型",
    exportDesc: "選擇格式。3D 列印建議使用 STL。",
    download: "下載",

    // Building info
    buildingInfo: "建築物資訊",
    tagType: "類型",
    tagHeight: "高度",
    tagLevels: "樓層",
    tagAmenity: "設施",
    tagDenomination: "教派",
    address: "地址",
    additionalInfo: "更多資訊",
    nameTranslations: "名稱翻譯",

    // GPX
    gpxTitle: "GPX 3D 模型",
    gpxStats: "軌跡統計",
    gpxPoints: "軌跡點",
    gpxDistance: "總距離",
    gpxElevGain: "累計爬升",
    gpxElevRange: "海拔範圍",
    gpxSettings: "模型設定",
    gpxExaggeration: "高程放大倍率",
    gpxTrackWidth: "軌跡寬度",
    gpxBaseHeight: "底板厚度",
    gpxBack: "返回",
    gpxExportStl: "匯出 STL（3D 列印）",
    gpxParseError: "GPX 檔案解析失敗，請確認檔案格式。",
    gpxNoPoints: "這個 GPX 檔案裡找不到軌跡點。",
  },
} as const;

export type TranslationKey = keyof (typeof dict)["en"];

type I18nContextType = {
  lang: Lang;
  t: (key: TranslationKey) => string;
  toggleLang: () => void;
};

const I18nContext = createContext<I18nContextType>({
  lang: "zh",
  t: (key) => dict.zh[key],
  toggleLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("map3d-lang");
    if (saved === "en" || saved === "zh") return saved;
    return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
  });

  const t = useCallback((key: TranslationKey) => dict[lang][key], [lang]);

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === "en" ? "zh" : "en";
      localStorage.setItem("map3d-lang", next);
      return next;
    });
  }, []);

  return (
    <I18nContext.Provider value={{ lang, t, toggleLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
