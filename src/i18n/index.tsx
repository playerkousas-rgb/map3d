import {
  createContext,
  useContext,
  useState,
  useCallback, useEffect,
  ReactNode,
} from "react";

export type Lang = "en" | "zh";

const dict = {
  en: {
    appName: "🗺️ Map3d",
    options: "Options",
    langToggle: "中文 / ZH",

    modelView: "Model view",
    modelFit: "Fit model",
    modelTop: "Top view",
    modelZoomIn: "Zoom in",
    modelZoomOut: "Zoom out",

    // Front
    frontTitle: "Generate 3D Map",
    frontDesc:
      "Select an area on the map to build real-world 3D buildings and roads, or import a GPX track to create a 3D-printable model. Export as GLB / glTF / OBJ / STL / DXF.",
    modeMap: "Map → 3D Buildings",
    modeGpx: "GPX → 3D Print Model",
    importGpx: "Import GPX File",
    gpxHint: "Import a hiking / cycling GPX track and turn it into a printable 3D model.",

    // Map controls
    selectBox: "Select Box",
    backToDrag: "Back to Drag",
    removeBox: "Remove Box",
    mapHintEmpty:
      "Click “Select Box”, then drag on the map to circle the area you want.",
    mapHintReady:
      "Area selected ✓ — drag again to adjust it, or press “Next Step” at the bottom right.",
    sizeWarn: "The area is large — the data is loaded in pieces, so give it a moment.",
    sizeBig:
      "Big area — it is loaded in pieces, so this will take a little while (nothing is left out).",

    // Steps
    stepLabel1: "① Circle an area",
    stepLabel2: "② Fetch building data",
    stepLabel3: "③ View & export 3D",
    processingTitle: "Processing",
    processingDesc:
      "Two quick steps: press Next Step to fetch the data, then press it again to open the 3D view.",
    fetching: "Fetching...",
    fetchingBuildings: "Fetching building information...",
    fetchIdle: "Press “Next Step” to fetch building data for the selected area.",
    fetchSeconds: "Small areas take seconds; bigger ones are loaded piece by piece.",
    buildingsLoaded: "Buildings loaded:",
    readyFor3d: "Press “Next Step” again to open the 3D view.",
    noBuildings:
      "No buildings found in this area — continue to see roads, or go back and adjust the area.",
    nextStep: "Next Step",
    prevStep: "Prev Step",
    editArea: "Edit selection",
    sceneHint: "Drag to rotate · Scroll to zoom · Click a building for info",
    sceneHintGpx: "Drag to rotate · Scroll to zoom · Use the panel to tune the model",
    export: "Export",
    tooBigTitle: "Big area selected",
    tooBigDesc:
      "It is loaded piece by piece, so this will take a little while. Nothing is left out — continue?",
    fetchFailed:
      "Couldn't load building data from OpenStreetMap (several servers were tried). Press Next Step to try again.",

    // Place search
    searchPlaceholder: "Search a place or address…",
    search: "Search",
    searchClear: "Clear",
    searchNoResults: "No matching places found.",
    searchFailed: "Search is temporarily unavailable. Please try again later.",

    // Export
    mapDataNotice: "Third-party map and elevation data are indicative only. Verify official maps and ground conditions before navigation or events.",
    panelResize: "Resize course panel",
    closeDialog: "Close dialog",
    exportTitle: "Export 3D Model",
    exportDesc: "Choose a format. Exports enabled model meshes, not the whole screen. DXF omits map imagery, labels and GIS overlays. STL is best for 3D printing.",
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
    gpxHideSettings: "Hide settings",
    gpxShowSettings: "Show settings",
    gpxExaggeration: "Elevation Exaggeration",
    gpxTrackWidth: "Track Width",
    gpxBaseHeight: "Base Height",
    gpxBack: "Back",
    gpxExportStl: "Export STL (3D Print)",
    gpxParseError: "Invalid GPX/XML or point values. Use finite WGS84 decimal coordinates and elevations between -12,000 and 10,000 m.",
    gpxNoPoints: "No track points found in this GPX file.",
    gpxTooLarge: "Choose a non-empty UTF-8 GPX file, at most 10 MB.",
    gpxPointLimit: "This GPX exceeds 50,000 source points. Split or simplify it first.",
    gpxDisconnected: "Use one continuous track segment or one route. Split multiple tracks, segments or routes first; gaps are not joined automatically.",
    gpxNoExtent: "The track has no usable horizontal extent or crosses the antimeridian. Prepare a local continuous track first.",
    gpxPartialElevation: "Some points have no elevation. The entire model is shown flat, not with invented drops to sea level. Terrain lookup replaces all model elevations.",
    gpxSimplified: "Model points simplified (endpoints retained); displayed distance/gain are approximations:",
    gpxNoElevation: "This track has no elevation data, so the model will be flat.",
    gpxFillElevation: "Fill in elevation from terrain data",
    gpxFillingElevation: "Fetching elevation…",
    gpxElevationFailed: "Couldn't fetch elevation data. Please try again later.",
    gpxElevationSource: "Elevation data:",
    gpxProfileStart: "Start",
    gpxProfileEnd: "End",
    // Orienteering 3D
    modeOrtho: "3D Orienteering",
    orthoTitle: "3D Orienteering Course",
    orthoDesc:
      "Design a city orienteering course on the real 3D city — buildings, streets, terrain and the Lands Department map — then look at it from any angle on your phone.",
    orthoStepSelect: "Circle the course area on the map, then press Next Step to get the 3D scene.",
    orthoStepPlace: "In 3D, pick a tool and tap the ground to place the controls.",
    orthoOpen3d: "Get 3D scene",
    orthoStepLabel1: "① Circle the area",
    orthoStepLabel2: "② Get the 3D scene",
    orthoStepLabel3: "③ Place the controls",
    orthoProcessingTitle: "Getting the 3D scene",
    orthoProcessingDesc:
      "The buildings, roads and terrain of the area are being loaded. Once they are in, press Next Step to open the 3D city and place the controls.",
    orthoRetry: "Retry",
    orthoDataStatus: "Scene data",
    orthoNotLoaded: "not loaded",
    orthoCellsUnavailable: "area cells unavailable",
    orthoNoBuildingsHere: "none in this area",
    orthoTerrainUnavailableHint: "Terrain elevations unavailable or incomplete. The reference ground is flat, not a successful 0 m DEM. Retry, or continue without terrain.",
    orthoCellsPartial: "part of the area",
    buildingHippedFlat: "hipped building components shown flat: requires four rectangular corners without holes, aligned directions and valid roof:height, roof:levels or roof:angle (0–<90°).",
    buildingPyramidalFlat: "pyramidal building components shown flat: requires a convex outer without holes and explicit roof:height or roof:levels; roof:angle alone is unsupported.",
    buildingSkillionFlat: "skillion building components shown flat: missing or invalid downhill roof:direction.",
    buildingGeometrySkipped: "OSM building objects skipped: incomplete/unsupported footprint or vertical interval; no filled-outline fallback.",
    orthoSomeCellsFailed: "Part of the area could not be loaded — the rest is fine to use.",
    orthoDrawnPartial: "showing part of them",
    orthoReadyFor3d: "Ready — press “Next Step” to open the 3D scene and place the controls.",
    orthoBuildingsFailedHint:
      "The building data could not be loaded (OpenStreetMap busy). Retry, or continue without buildings.",
    orthoContinueAnyway: "Open 3D anyway",
    orthoShare: "Share with players",
    orthoShareCopied: "Link copied — send it to the players.",
    orthoShareFailed: "Could not create the link.",
    orthoShareEmpty: "Place at least one control before sharing.",
    orthoShareText: "Open this link to see the course in 3D:",
    orthoSummary: "Course summary",
    orthoSummaryDesc: "Printable list of all controls with grid references, leg distance and bearing. Copy or download as CSV.",
    orthoCopySummary: "Copy summary",
    orthoSummaryCopied: "Summary copied",
    orthoDownloadCsv: "Download CSV",
    orthoMeet: "Assembly",
    orthoCutoff: "Finish by",
    orthoSos: "Emergency",
    buildingHeightDetails: "Height & roof",
    buildingTotalHeight: "total",
    buildingEavesHeight: "eaves",
    buildingHeightTagged: "from OSM height",
    buildingHeightFromLevels: "from levels ×3–4 m",
    buildingHeightEstimated: "estimated (no height tag)",
    buildingRoofRise: "Roof rise",
    buildingFlatRoofHint: "No roof tags — shown as flat.",

    orthoPlayerBadge: "Player view · read only",
    orthoPlayerHint: "Tap a control to see its code, clue and grid reference.",
    orthoPlayerExit: "Leave player view",
    orthoPlayerLoading: "Opening the shared course…",
    orthoPlayerInvalid: "This link is not a valid course.",
    orthoPlanOwn: "Plan my own course",
    orthoImport: "Import JSON",
    orthoExport: "Export JSON",
    orthoExportModel: "Export 3D model",
    orthoNew: "New course",
    orthoImportFailed: "That JSON could not be read as a course.",
    orthoCourseName: "Course name",
    orthoCourseNamePlaceholder: "e.g. Sha Tin City Orienteering",
    orthoTabControls: "Controls",
    orthoTabScene: "Scene",
    orthoToolView: "View",
    orthoToolStart: "Start",
    orthoToolControl: "Control",
    orthoToolFinish: "Finish",
    orthoToolMove: "Move",
    orthoToolDelete: "Delete",
    orthoPlaceHint: "Tap the ground to place it",
    orthoMoveHint: "Drag a marker to move it",
    orthoDeleteHint: "Tap a marker to delete it",
    orthoEmpty: "No controls yet — pick △ ○ or ◎ and tap the ground.",
    orthoControlCount: "Controls",
    orthoTotalDistance: "Course length",
    orthoLegDistance: "Leg",
    orthoBearing: "Grid bearing",
    orthoMagnetic: "Magnetic",
    orthoGridRef: "Grid",
    orthoGoToGrid: "Go",
    orthoGridPlaceholder: "KK 0794 6642",
    orthoGridInvalid: "Not a valid grid reference",
    orthoCode: "Code",
    orthoName: "Name",
    orthoClue: "Clue",
    orthoScore: "Score",
    orthoLeaderNote: "Planner note",
    orthoSelectPrompt: "Tap a control to edit it.",
    orthoUndo: "Undo",
    orthoRedo: "Redo",
    orthoClearAll: "Clear all",
    orthoLayer: "Ground layer",
    orthoLayerHm20c: "HM20C / iB20000",
    orthoLayerImagery: "Aerial photo",
    orthoLayerCountryside: "Countryside",
    orthoLayerPlain: "Plain",
    orthoShowBuildings: "Buildings",
    orthoShowRoads: "Roads",
    orthoShowTerrain: "Terrain",
    orthoTerrainFlatHint: "Turning Terrain off flattens the ground; it does not remove it from the view or model export.",
    orthoShowGrid: "1 km grid",
    orthoShowContours: "Contours · 10 m",
    orthoShowHillshade: "Hillshade",
    orthoShowRoute: "Course line",
    orthoExaggeration: "Terrain height",
    orthoNorth: "N",
    orthoCamera: "Camera controls",
    orthoRecenter: "Fit view",
    orthoTopView: "Top view",
    orthoTiltView: "Tilt view",
    orthoZoomIn: "Zoom in",
    orthoZoomOut: "Zoom out",
    orthoBuildingCount: "Buildings",
    orthoRoadCount: "Roads",
    orthoTerrainRange: "Terrain",
    orthoLoadingShort: "Loading…",
    orthoFailedShort: "unavailable",
    orthoGroundFallback:
      "The official map layer could not be drawn on the 3D ground (offline or blocked) — showing a plain ground instead.",
    orthoAttribution: "Map from Lands Department · Aerial Photograph from Lands Department",
    orthoTerms: "Lands Department Map API terms",
    orthoBackToMap: "Pick another area",
    orthoHintTilt: "Drag to orbit · pinch to zoom · two fingers to pan",
    orthoScoreMode: "Score event",
    orthoLinearMode: "In order",
    orthoPlayMode: "Event type",
  },
  zh: {
    modelView: "模型視角",
    modelFit: "完整模型",
    modelTop: "俯視",
    modelZoomIn: "放大",
    modelZoomOut: "縮小",
    appName: "🗺️ Map3d",
    options: "選項",
    langToggle: "EN",

    // Front
    frontTitle: "生成 3D 地圖",
    frontDesc:
      "在地圖上框選區域，生成真實世界的 3D 建築與道路；或匯入 GPX 軌跡製作可 3D 列印的模型。支援匯出 GLB / glTF / OBJ / STL / DXF。",
    modeMap: "地圖 → 3D 建築",
    modeGpx: "GPX → 3D 列印模型",
    importGpx: "匯入 GPX 檔案",
    gpxHint: "匯入行山 / 單車 GPX 軌跡，製作成可 3D 列印的立體模型。",

    // Map controls
    selectBox: "框選區域",
    backToDrag: "返回拖曳",
    removeBox: "移除選框",
    mapHintEmpty: "點擊右上角「框選區域」，再於地圖上拖曳圈出想要的範圍。",
    mapHintReady:
      "已圈選範圍 ✓ 可再拖曳調整，或按右下角「下一步」繼續。",
    sizeWarn: "範圍較大，資料會分批載入，需要一點時間。",
    sizeBig: "範圍很大 — 會分批載入所以要等一會兒（不會漏掉資料）。",

    // Steps
    stepLabel1: "① 圈選範圍",
    stepLabel2: "② 抓取建築資料",
    stepLabel3: "③ 檢視與匯出 3D",
    processingTitle: "處理中",
    processingDesc: "兩個步驟：先按「下一步」抓取資料，完成後再按一次「下一步」開啟 3D 場景。",
    fetching: "抓取中...",
    fetchingBuildings: "正在抓取建築物資料...",
    fetchIdle: "按右下角「下一步」，抓取所選範圍的建築物資料。",
    fetchSeconds: "細範圍只需幾秒；大範圍會逐批載入。",
    buildingsLoaded: "已載入建築物：",
    readyFor3d: "再按一次「下一步」，即可開啟 3D 場景。",
    noBuildings: "此範圍找不到建築物 — 可按下一步查看道路，或返回調整範圍。",
    nextStep: "下一步",
    prevStep: "上一步",
    editArea: "修改圈選範圍",
    sceneHint: "拖曳旋轉 · 滾輪縮放 · 點擊建築物查看資訊",
    sceneHintGpx: "拖曳旋轉 · 滾輪縮放 · 使用設定面板調整模型",
    export: "匯出",
    tooBigTitle: "選取範圍很大",
    tooBigDesc: "會分批載入，所以需要一點時間。資料不會漏掉 — 要繼續嗎？",
    fetchFailed: "未能從 OpenStreetMap 取得建築資料（已嘗試多個伺服器）。請再按一次「下一步」重試。",

    // Place search
    searchPlaceholder: "搜尋地點或地址…",
    search: "搜尋",
    searchClear: "清除",
    searchNoResults: "找不到相關地點。",
    searchFailed: "搜尋服務暫時無法使用，請稍後再試。",

    // Export
    mapDataNotice: "第三方地圖及高程僅供參考。導航或舉辦活動前，請核對官方地圖及實地情況。",
    panelResize: "調整課程面板",
    closeDialog: "關閉對話框",
    exportTitle: "匯出 3D 模型",
    exportDesc: "選擇格式。匯出已開啟的模型網格，不是整個畫面；DXF 不包含地圖影像、文字標籤或 GIS 疊圖。3D 列印建議使用 STL。",
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
    gpxHideSettings: "收合設定",
    gpxShowSettings: "展開設定",
    gpxExaggeration: "高程放大倍率",
    gpxTrackWidth: "軌跡寬度",
    gpxBaseHeight: "底板厚度",
    gpxBack: "返回",
    gpxExportStl: "匯出 STL（3D 列印）",
    gpxParseError: "GPX/XML 或點數值無效。請用有限的 WGS84 十進位座標，海拔限 -12,000 至 10,000 米。",
    gpxNoPoints: "這個 GPX 檔案裡找不到軌跡點。",
    gpxTooLarge: "請選非空的 UTF-8 GPX 檔案，上限 10 MB。",
    gpxPointLimit: "GPX 超過 50,000 個原始點，請先分段或簡化。",
    gpxDisconnected: "只支援一個連續軌跡段或一條路線。請先拆分多軌跡／段落／路線，不會自動連接缺口。",
    gpxNoExtent: "軌跡沒有可用的水平範圍或跨越換日線，請先準備局部連續軌跡。",
    gpxPartialElevation: "部分點缺少海拔：整個模型先平放，不虛構跌至海平面的落差。補值會替換所有模型點海拔。",
    gpxSimplified: "模型點已簡化（保留首尾），所示距離／爬升為近似值：",
    gpxNoElevation: "這條軌跡沒有海拔資料，模型會是平的。",
    gpxFillElevation: "用地形資料自動補回海拔",
    gpxFillingElevation: "正在取得海拔資料…",
    gpxElevationFailed: "未能取得海拔資料，請稍後再試。",
    gpxElevationSource: "海拔資料來源：",
    gpxProfileStart: "起點",
    gpxProfileEnd: "終點",
    // Orienteering 3D
    modeOrtho: "定向 3D",
    orthoTitle: "3D 城市定向",
    orthoDesc:
      "在真實的 3D 城市上設計城市定向：建築、街道、地形與地政總署地圖，再用手機從任何角度查看。",
    orthoStepSelect: "先在地圖上圈出活動範圍，再按「下一步」取得 3D 場景。",
    orthoStepPlace: "在 3D 裡揀工具，點按地面放置檢查點。",
    orthoOpen3d: "取得 3D 場景",
    orthoStepLabel1: "① 圈選範圍",
    orthoStepLabel2: "② 取得 3D 場景",
    orthoStepLabel3: "③ 放置檢查點",
    orthoProcessingTitle: "正在取得 3D 場景",
    orthoProcessingDesc: "正在載入此範圍的建築物、道路及地形。載入完成後按「下一步」，即可開啟 3D 城市並放置檢查點。",
    orthoRetry: "重試",
    orthoDataStatus: "場景資料",
    orthoNotLoaded: "尚未載入",
    orthoCellsUnavailable: "個區塊未能載入",
    orthoNoBuildingsHere: "此範圍沒有建築物",
    orthoTerrainUnavailableHint: "地形高程無法取得或不完整。目前只用平坦參考地面，並非成功取得 0 米 DEM；可重試或不使用地形繼續。",
    orthoCellsPartial: "部分範圍",
    buildingHippedFlat: "個四坡屋頂建築部分暫以平頂顯示：需要無洞四角矩形、對齊方向，以及有效 roof:height、roof:levels 或 roof:angle（0至小於90°）。",
    buildingPyramidalFlat: "個金字塔屋頂建築部分暫以平頂顯示：需要無洞凸外框及明確 roof:height 或 roof:levels；不支援僅有 roof:angle。",
    buildingSkillionFlat: "個單坡建築輪廓因缺少有效的下坡 roof:direction，暫以平頂顯示。",
    buildingGeometrySkipped: "個 OSM 建築物件已略過：輪廓或垂直高度不完整／暫不支援；不會以填滿外框代替。",
    orthoSomeCellsFailed: "部分範圍未能載入 — 其餘部分可以正常使用。",
    orthoDrawnPartial: "只顯示部分",
    orthoReadyFor3d: "已準備好 — 按「下一步」開啟 3D 場景並放置檢查點。",
    orthoBuildingsFailedHint: "未能載入建築物資料（OpenStreetMap 繁忙）。可以重試，或不帶建築物繼續。",
    orthoContinueAnyway: "仍然開啟 3D",
    orthoShare: "分享給玩家",
    orthoShareCopied: "連結已複製 — 傳給玩家即可。",
    orthoShareFailed: "未能建立連結。",
    orthoShareEmpty: "先放置至少一個檢查點才能分享。",
    orthoShareText: "開啟此連結即可在 3D 檢視路線：",
    orthoSummary: "路線總覽",
    orthoSummaryDesc: "全部檢查點清單，含方格座標、分段距離及方位，可複製或下載 CSV。",
    orthoCopySummary: "複製總覽",
    orthoSummaryCopied: "已複製",
    orthoDownloadCsv: "下載 CSV",
    orthoMeet: "集合點",
    orthoCutoff: "關門時間",
    orthoSos: "緊急聯絡",
    buildingHeightDetails: "高度與屋頂",
    buildingTotalHeight: "總高",
    buildingEavesHeight: "簷高",
    buildingHeightTagged: "來自 OSM height",
    buildingHeightFromLevels: "由樓層推算 ×3–4 m",
    buildingHeightEstimated: "推算（無 height 標籤）",
    buildingRoofRise: "屋頂高度",
    buildingFlatRoofHint: "無屋頂標籤 — 以平頂顯示。",

    orthoPlayerBadge: "玩家檢視 · 只能查看",
    orthoPlayerHint: "點按檢查點即可查看編號、提示及格網座標。",
    orthoPlayerExit: "離開玩家檢視",
    orthoPlayerLoading: "正在開啟分享的路線…",
    orthoPlayerInvalid: "此連結不是有效的路線。",
    orthoPlanOwn: "自己規劃路線",
    orthoImport: "匯入 JSON",
    orthoExport: "匯出 JSON",
    orthoExportModel: "匯出 3D 模型",
    orthoNew: "新路線",
    orthoImportFailed: "讀不到這個 JSON 路線檔。",
    orthoCourseName: "路線名稱",
    orthoCourseNamePlaceholder: "例如：沙田城市定向",
    orthoTabControls: "檢查點",
    orthoTabScene: "場景",
    orthoToolView: "檢視",
    orthoToolStart: "起點",
    orthoToolControl: "檢查點",
    orthoToolFinish: "終點",
    orthoToolMove: "移動",
    orthoToolDelete: "刪除",
    orthoPlaceHint: "點按地面放置",
    orthoMoveHint: "拖曳標記移動位置",
    orthoDeleteHint: "點按標記即可刪除",
    orthoEmpty: "未有檢查點 — 揀 △ ○ 或 ◎，再點按地面。",
    orthoControlCount: "檢查點",
    orthoTotalDistance: "路線長度",
    orthoLegDistance: "分段",
    orthoBearing: "方格方位",
    orthoMagnetic: "磁方位",
    orthoGridRef: "方格",
    orthoGoToGrid: "前往",
    orthoGridPlaceholder: "KK 0794 6642",
    orthoGridInvalid: "方格數字格式不正確",
    orthoCode: "編號",
    orthoName: "名稱",
    orthoClue: "檢查點說明",
    orthoScore: "分數",
    orthoLeaderNote: "策劃備註",
    orthoSelectPrompt: "點選檢查點即可編輯。",
    orthoUndo: "返回",
    orthoRedo: "重做",
    orthoClearAll: "清除全部",
    orthoLayer: "底圖",
    orthoLayerHm20c: "HM20C / iB20000",
    orthoLayerImagery: "航空照片",
    orthoLayerCountryside: "郊遊圖",
    orthoLayerPlain: "素色",
    orthoShowBuildings: "建築物",
    orthoShowRoads: "道路",
    orthoShowTerrain: "地形",
    orthoTerrainFlatHint: "關閉地形會壓平地面，不會從畫面或模型匯出中移除地面。",
    orthoShowGrid: "1 公里方格",
    orthoShowContours: "等高線 · 10 米",
    orthoShowHillshade: "地形陰影",
    orthoShowRoute: "路線連線",
    orthoExaggeration: "地形高度",
    orthoNorth: "北",
    orthoCamera: "相機控制",
    orthoRecenter: "重設視角",
    orthoTopView: "俯視",
    orthoTiltView: "斜視",
    orthoZoomIn: "放大",
    orthoZoomOut: "縮小",
    orthoBuildingCount: "建築物",
    orthoRoadCount: "道路",
    orthoTerrainRange: "地形",
    orthoLoadingShort: "載入中…",
    orthoFailedShort: "未能載入",
    orthoGroundFallback: "官方圖層無法貼上 3D 地面（離線或被封鎖），暫時顯示素色地面。",
    orthoAttribution: "Map from Lands Department · Aerial Photograph from Lands Department",
    orthoTerms: "地政總署地圖 API 條款",
    orthoBackToMap: "重新選範圍",
    orthoHintTilt: "拖曳旋轉 · 雙指縮放 · 兩指平移",
    orthoScoreMode: "奪分式",
    orthoLinearMode: "按順序",
    orthoPlayMode: "賽制",
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

const LANG_KEY = "map3d-lang";

// localStorage throws (instead of returning null) when the browser blocks
// site storage, e.g. "block all cookies" — never let that crash the app.
function readSavedLang(): string | null {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

function saveLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* storage unavailable: language just isn't remembered */
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = readSavedLang();
    if (saved === "en" || saved === "zh") return saved;
    return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
  });

  useEffect(() => { document.documentElement.lang = lang === "zh" ? "zh-Hant" : "en"; }, [lang]);

  const t = useCallback((key: TranslationKey) => dict[lang][key], [lang]);

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === "en" ? "zh" : "en";
      saveLang(next);
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
