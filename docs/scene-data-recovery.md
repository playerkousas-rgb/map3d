# 3D 場景內逐層資料復原 — 2026-11-03

## 真正的缺口與源碼核對

本輪依使用者選擇「繼續完成整個 APP」實作下一項，不只重跑前輪 DEM 修復。

先重新開啟政策 AGENTS@`206cb0c24d028651d804ec19942dc9791b499fdd`（[固定來源](https://github.com/playerkousas-rgb/readme/blob/206cb0c24d028651d804ec19942dc9791b499fdd/AGENTS.md)），並讀 README／SCOPE／APP_AUDIT；環境沒有 `browser.open`，使用 `fetch_page`，不冒稱瀏覽外部應用。再直接查本 APP：

- `SceneSettings.tsx` **本來就有**建築／道路 loading/error 文字；不是全部失敗都顯示0。本輪最初概述的「可能只顯示0」經查碼後更正，不能當作既有 bug 的證據。
- 真缺口是 `OrthoProcessing.tsx` 有個別 Retry，但進入3D後 `SceneSettings` **沒有重試入口**；地形錯誤提示說可重試，卻要離開場景才能操作。
- `sceneStore.retry(part)` 已有本層載入、防止 loading 重複請求、generation／area freshness；不應另做整個 scene reset。
- `sceneData.fetchCells` 逐格回報 `failed/total`；已有資料仍可能 `ready` 且部分格失敗。場景原先未顯示這個失敗區塊數。這不同於 footprint略過、屋頂flat fallback或draw ceiling。
- `overpass.overpassQuery` 保留成功 query 的 LRU 快取與 mirror fallback；重試整層時可重用命中快取的成功格，並非新做「只fetch失敗格」或繞過供應商限制。

沒有複製外部UI、改OSM語義或引入新provider／backend／proxy。

## 實作

- 新 `SceneRecoveryRow.tsx` 在「場景資料」命名區域中，讓建築／道路／地形各自顯示 live 狀態；失敗或 ready-but-partial 可按 **重試 建築物／道路／地形**。成功的0筆資料不會被當失敗；idle改為「尚未載入」，不錯稱不可用。
- ready-but-partial 顯示 `failed/total 個區塊未能載入`，仍保留有效部分與既有略過／roof fallback／drawn診斷。
- 新 `canRetrySceneLayer` 只把真正error或ready且failed>0列為復原條件。不把來源完整但輪廓不支援、關閉圖層或draw ceiling當作網絡錯誤。
- 重試仍走既有 `sceneStore.retry(part)`，不切頁、不重建課程、不清掉其他成功圖層。該層沿用既有逐步替換政策：建築／道路重試會清本層後逐格回填；地形重試清field，等待期間為平坦參考，不提供舊網格假成功。**不**承諾整層新舊資料的無縫雙緩衝保留。
- 載入中按鈕保持名稱，`aria-busy`／`aria-disabled` 明示；click handler與store雙重阻擋重複請求，不只改灰樣式。按鈕≥44×44px、支援原生Enter／Space及英／繁中；成功後移除不再需要的復原按鈕，live文字宣布新狀態。不自動把焦點拉去另一個編輯欄位。
- 地形高度原生slider補上翻譯名稱、`aria-valuetext` multiplier與44px高度。沒有改高程單位、預設倍率或export政策。

資料復原不會修改控制點／備註／課程名稱／選區／場景開關；但有效DEM到達後，既有建築、道路及marker自然按新地面重新定位。這是資料替換，不是改課程經緯度。

## 本輪實測

| Gate | 結果與邊界 |
|---|---|
| Program | **1427/1427 PASS**，原1400全保留，新增27。涵蓋四種state×failed計數、真空資料成功、無area不發請求、真partial建築、全roads失敗、逐層retry、不重複loading、其他資料reference／request保持、晚回舊area不覆寫。 |
| check | `npm run verify`＋完整`npm run check` PASS；原13lint-config／13writer-patch契約保留，typecheck／release／budget都過。 |
| dev Chromium | **455 PASS**，原437全保留，新增18；390／768／1440原生匯入／搜尋／圈選／partial資料→3D→三層重試，沒有注入store action。dev讀store作斷言，不把它當模型匯出證據。 |
| production CSP | **66 PASS**，原48全保留，新增相同18；真dist／原enforced header／bypassCSP:false。原生DOM／下載與localStorage內容驗證，不載入dev source modules；所有既有攻擊阻擋與正向零CSP違反保留。 |
| 真下載 | 新增6份：dev／production各三寬度 `scene-recovered-*.dxf`／`production-scene-recovered-*.dxf`。dxf-parser讀到公尺INSUNITS、最低地面Z50及建築屋面Z62；其他控制點marker可高於屋頂，**不**錯誤假設整份檔最高Z一定62。 |
| 獨立CAD | **14應用fixtures＋9損壞拒絕控制＋63真下載 PASS**。browser-dir現在須含六個明確recovery檔，加原57檔；raw先於reader、audit0errors／0fixes與座標roundtrip。六個新檔另獨立核對`minZ=50`及`zLevels=[50,62]`，拒絕殘留0米地面／舊12米屋頂冒充新資料。 |

全鏈 `verify && check && full dev/production UI && independent CAD` **exit0／1121773ms（包含check與CAD）**。沒有skip／重跑掩蓋／pageerror過濾／CSP放寬。原CI browser20min／獨立CAD10min預算不改；遠端CI仍未執行，不能由本地時間保證遠端runner速度。

- **181 PNG＋63 DXF**：`/home/user/artifacts/map3d-v0.1.0-scene-recovery/`。已開啟390／768錯誤復原列與1440復原後畫面；三按鈕與警告可讀、無水平溢出。手機展開表單會遮住大部分地面，並非宣稱設定與整幅地面同時可見；模型高度靠下載檔驗證。
- build **18files／1537.9kB／gzip474.3kB**，原2929.7kB cap不變。`npm run audit:deps` prod0／full12moderate；既有開發工具例外保留。
- logs：`/tmp/map3d-recovery-{verify,check,audit}-final.log`、`/tmp/map3d-recovery-ui-full.log`、`/tmp/map3d-recovery-cad-full.log`；browser、字型、Python工具、fixtures及產物不入Git。

### 測試時確實遇到並處理

搜尋單一結果會直接fly而不顯示候選按鈕；改用兩候選且以原生zoom停止flight。最初拖曳起點命中手機搜尋列，沒有圈出區域；移到實際地圖中段，不強制點擊遮擋元素。store已ready不代表React DOM已更新，改等待成功文字／按鈕移除，不加任意sleep。marker會隨區域縮放高於屋頂，改為驗證地面與屋面確切高度存在，不放寬既有CAD誤差。額外SSR試驗遇Node ESM打包的ReactDOMServer動態require util不相容，已移除該試驗；沒有改工具鏈或把三個未跑斷言計入1427，UI由真瀏覽器驗證。

## 重跑與仍未完成

```sh
npm run verify
npm run check
npm run audit:deps
# 安裝Chromium及docs/cad-conformance.md指定的test-only Python requirements後：
npm run verify:ui:isolated
CAD_BROWSER_DIR=node_modules/.cache/ui-artifacts npm run verify:cad
```

這不是live供應商／CORS／rate-limit、外部GeoLibre／TopoExport截圖對照、桌面CAD、實機／Safari／Firefox或遠端CI／部署驗收。沒有一般更新成功圖層的強制refresh／清快取功能、failed-cell-only scheduler、圖層雙緩衝、完整LoD2／parts／通用屋頂。整個APP仍未全部完成，未commit／push／部署。
