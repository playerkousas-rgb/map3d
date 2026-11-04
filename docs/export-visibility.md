# 匯出可見性：五種格式一致的 Object3D 階層政策

2026-11-03（香港） · v0.1.0 · `arena/67142253-map3d` · © SCOUT SYSTEM

## 先核對源碼，區分真問題與原有設計

本輪重開參考政策 AGENTS `206cb0c24d028651d804ec19942dc9791b499fdd`，查看本地 collector、五種編碼器入口、ExportListener、OrthoSpace／Ground／SceneSettings／CourseLayer。環境沒有 browser.open，使用 fetch_page／GitHub CLI，不聲稱使用不存在的工具。

首先更正前輪觀察的解讀：**Terrain 關閉不是隱藏 Ground**。OrthoSpace 原本就將 exaggeration 傳0，Ground 仍是可見、可點選及可匯出的平面。Buildings／Roads 關閉則不建立其 geometry；route 關閉不建立路線。這些原有語意沒有被偷偷改成「移除地面」。畫面及指南新增中英文說明。

真正的不一致在通用匯出路徑：collector 使用 `traverse` 並 `clone(true)`，OBJ／STL 也不會自動略過 hidden descendants；DXF 自行遍歷亦如此。GLTFExporter 預設 `onlyVisible=true`，因此同一個標成 exportable 的階層可能因格式不同而輸出不同成員。這是以合成 hidden 階層重現的真缺陷，**不是宣稱現有 Terrain switch 曾把物件 visible 設為false**。

## 查看過的實際 Three.js 源碼

已安裝 `three@0.173.0`，並以 gh 查看 tag r173 固定 revision **`71c7cbbdb760d118fc299ac817c0846be25288ce`**：

- [Object3D.js](https://github.com/mrdoob/three.js/blob/71c7cbbdb760d118fc299ac817c0846be25288ce/src/core/Object3D.js)：`traverseVisible` 在物件 visible=false 時略過整個 subtree；不是單純對每個 child 檢查自己的 visible。
- [OBJExporter.js](https://github.com/mrdoob/three.js/blob/71c7cbbdb760d118fc299ac817c0846be25288ce/examples/jsm/exporters/OBJExporter.js)：使用 `object.traverse`，不自動裁掉 hidden subtree。
- [STLExporter.js](https://github.com/mrdoob/three.js/blob/71c7cbbdb760d118fc299ac817c0846be25288ce/examples/jsm/exporters/STLExporter.js)：同樣 traverse，依 world matrix 處理 geometry。
- [GLTFExporter.js](https://github.com/mrdoob/three.js/blob/71c7cbbdb760d118fc299ac817c0846be25288ce/examples/jsm/exporters/GLTFExporter.js)：預設 onlyVisible=true，scene／node children 按 visible 處理。

沒有複製或更改上游 exporter；在本 APP 的入口建立一致階層。DXF 仍由 dxf-writer 序列化，不新增手寫 DXF 編碼器或 runtime 依賴。

## 改動與明確邊界

- `isEffectivelyVisible` 查自己及**全部父物件**，包括直接呼叫匯出的 root 外部祖先；不因 detach 就丟掉隱藏父群組的語意。
- `visibleExportSnapshot` 使用 shallow object clones 重建可見樹，先裁掉 hidden descendants，再交給任一 encoder。root 保留原本 world matrix；內層使用原本 local transforms。這不是只改 glTF 的選項。
- `collectExportGroup` 仍是 `userData.exportable===true` allowlist。exportable 群組擁有其 descendants，避免再次收集 marked child；連 scene 本身標記的邊界案例也只收一次。未標記的場景 helper 不會因本輪改動被納入。
- `exportObject` 的直接呼叫亦先建立同一 snapshot；只有 hidden meshes 的輸入會在下載前回報 `There is no model to export`，不以空檔假成功。UI 原有 queue/error/retry feedback 不變。
- `objectToDxf` 直接入口也使用 effective visibility／traverseVisible，避免繞過 collector 後洩漏 hidden subtree。保留 world transforms、實例、metric R2010軸向與單位政策。
- Snapshot 只隔離**階層、visibility、transforms**；geometry／material 仍共享，不複製大型頂點 buffers，也不 dispose 活躍場景資源。不是任意動畫／頂點／材質非同步修改的交易快照。現有 APP 以不可變 geometry replacement 為主。
- **不是螢幕截圖**：不按 camera frustum、背面、遮擋、材料 visible／opacity、GPU clipping 或單個 material group 的繪製狀態過濾；不是通用動畫／skinning相容性保證。這些不等於 Object3D.visible。
- 原有 mesh allowlist／格式能力不變。圖層開啟不表示所有裝飾都匯出：點號 sprite、hit target、hillshade疊面／contour線與2D GIS疊圖等本來就未全部標記exportable。DXF 不保留地圖影像、文字標籤、材質顏色或GIS圖層。GLB/glTF可帶的材質／貼圖不被此說明誤當DXF能力。
- Legacy map 的 printable frame／plate、UTM的可見平地、GPX miniature及其公尺換算仍保留。沒有新增「隱藏地面」功能。

## 實際驗證

- **812/812 DOM-free PASS，新增50項**：32組階層visibility組合逐一比對 collector與實際CAD entity數；hidden scene／external ancestor、marked root去重、世界位移／旋轉／非均勻scale、重開後的新snapshot、共享資源不dispose、OBJ／binary STL面數，以及五格式 hidden-only preflight失敗。
- **278/278 Chromium PASS，新增36項**，保留前242項。在390／768／1440每寬度：
  1. 真正場景關閉Buildings→點DXF→下載回讀，只剩原有z=0地面；重開→下一份DXF恢復15m屋頂。Terrain off仍為平地，沒有改原有政策。
  2. direct／collected兩條路徑 × DXF／OBJ／STL／glTF／GLB，共10份真下載。輸入是一個visible cube、hidden mesh、hidden parent的child及unmarked helper；每份只含12個三角形的正確cube，world X=14..16、Y/Z=−1..1。啟動後改來源visibility／祖先位置，檔案仍保留起始階層／transform。
  3. DXF用獨立dxf-parser；OBJ頂點／面、STL binary record、glTF／GLB JSON／buffers／accessor／node matrix逐項回讀，不只檢查副檔名或檔案存在。
- Browser fixture 只在 `scripts/`，沒有被 app entrypoint 引用或打進 production bundle。使用原生 FileReader／Blob／下載，沒有關閉web security或過濾pageerror。網絡仍為mock／中止，不是live providers。
- 77張mock-network PNGs：`/home/user/artifacts/map3d-v0.1.0-export-visibility/`。三寬度 `export-scope-*.png` 已開啟；成功toast可用Dismiss關閉，截圖關閉它以讀取實際hint。這是版面檢查，精確檔案成員由下載回讀驗證。
- 最終 logs：`/tmp/map3d-export-visible-{verify,check,audit}-final.log`，完整瀏覽器 `/tmp/map3d-export-visible-ui-final.log`。`npm run verify`＋`npm run check`、audit、repository/build預算與diff檢查保留，沒有新增依賴。

## 尚未完成

本輪不代表所有格式材質／動畫能力相同、CAD solid／桌面互通通過、完整LoD2或十個完整GIS provider完成。Safari／Firefox／實體裝置、live CORS與供應商、GeoLibre／TopoExport外部參考截圖比較、遠端CI及部署仍未驗收。Production audit0/full12moderate開發例外仍分開披露；沒有推送或部署，整個APP尚未全部完成。
