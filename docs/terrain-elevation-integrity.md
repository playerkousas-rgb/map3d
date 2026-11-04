# 地形高程完整性與失敗語義 — 2026-11-03

> 後續已新增3D場景內逐層重試與partial區塊狀態，目前1427program／455dev＋66production、63真DXF通過；見[最新復原證據](scene-data-recovery.md)。下方1400／437＋48／57檔為本DEM階段歷史實測。

## 實際缺陷

`src/utils/terrain.ts` 的 `finiteOr0` 把供應商的 `null`、缺值、字串與非有限數轉成 0 米。OpenTopoData 路徑還沒有核對結果數量。這可能令無資料格點變成海平面凹洞，或把不完整網格標為成功。先前 GPX 補高程已拒絕這類回應，但定向 DEM 尚未套用；本輪修復的是這個獨立路徑，不是宣稱提升 DEM 精度。

## 先查來源，不推測 NoData

本環境沒有 `browser.open`；使用 `fetch_page` 開啟 GitHub 頁面及 GitHub CLI 讀取固定版本原檔。沒有瀏覽或驗收 live elevation API。

- OpenTopoData [`2f365f8d9018aea7b3d70a762bc8c29515c9dd1b/docs/api.md`](https://github.com/ajnisbet/opentopodata/blob/2f365f8d9018aea7b3d70a762bc8c29515c9dd1b/docs/api.md)：`results` 與輸入順序相同；範圍外高程為 `null`；`nodata_value` 預設 `null`，不是 0。數值替代 sentinel 是另行配置，不應把本來的負高程一概當缺值。
- 同版本 [`opentopodata/api.py`](https://github.com/ajnisbet/opentopodata/blob/2f365f8d9018aea7b3d70a762bc8c29515c9dd1b/opentopodata/api.py)：`DEFAULT_NODATA_VALUE="null"`；`get_elevation()` 以 elevations/dataset_names/lat/lon 的 zip 建構結果，即使個別位置無高程亦可能回 `status:"OK"`。HTTP/外層 OK **不代表每個格點有資料**。
- Open-Meteo [`d36d80237263a83908447730b24b1f7440a3b8a8/Sources/App/Dem/DemController.swift`](https://github.com/open-meteo/open-meteo/blob/d36d80237263a83908447730b24b1f7440a3b8a8/Sources/App/Dem/DemController.swift)：同數量經緯度、最多100個座標；逐座標讀 `Dem90`，回 `elevation` 陣列。[同版本 OpenAPI](https://github.com/open-meteo/open-meteo/blob/d36d80237263a83908447730b24b1f7440a3b8a8/openapi/elevation.yml) 指定元素為 number。
- 重新讀取參考政策 `playerkousas-rgb/readme` 的 AGENTS@`206cb0c24d028651d804ec19942dc9791b499fdd`；採用資料來源、輕量、明示失敗與測試原則，不引入其 GAS／帳號架構。

這些是協議與實作檢閱；沒有複製／移植供應商伺服器程式，沒有新增 SDK、provider、origin 或代理。既有資料來源／授權註記保留。

## 現在的契約

1. 主來源仍為 Open-Meteo，備援仍為 OpenTopoData `srtm30m`；不改資料集、URL、網格排列、取樣順序或單位。
2. 必須為完整陣列，數量恰等於本次請求格點數。主來源顯式 `error:true` 拒絕；備援須 `status:"OK"`。每個高程都須為真正 number、有限且在 **−12,000 至10,000米（含端點）**。
3. 數值安全界線來自 APP 已有 GPX 政策，抽成無 DOM 的 `src/utils/elevationValue.ts` 共用；不是供應商保證、物理精度或新 GPX 限制。GPX 既有 `isGpxElevation` API／語義不變。真0米、負高程均保留，不做 `Number()`／`parseFloat()` 強制轉型。
4. 主來源任何一格不合格，**整張網格丟棄**再取備援整張網格。不混接兩個資料集、不逐格填0、不用部分成功冒充完整 DEM。
5. 備援亦不完整則 Promise 拒絕；sceneStore 為 `terrain:error`、`field:null`、來源空字串。開始新地形嘗試時清掉舊 field／來源／range，避免失敗後把舊區域或舊成功資料繼續標作本次成功。既有 generation／area freshness 及 loading 中不重複 retry 保留。
6. 載入畫面與3D場景設定都有英／繁中警告：目前為平坦參考地面，**不是成功取得0米 DEM**。既有個別 Retry 可恢復；其他資料可繼續使用。內部預設 min/max=0 不在錯誤狀態顯示為成功高程範圍。
7. `flatHeightField()` 的明確 fallback 來源改為 `Flat reference (unmeasured)`，不再錯稱 Open-Meteo；目前場景失敗仍用 `field:null`。成功的全0網格仍正常顯示 provider 與0–0米。

格網維持5×5至10×10、最多100點、座標5位小數及每個來源20秒 timeout。影像、hillshade、等高線與模型匯出沿用同一有效 field；錯誤時明示的平坦地面仍可匯出，不是新增高程資料。沒有改寫 serializer／渲染網格或任何 CAD 單位。

## 實測，不以 store 斷言代替真匯出

- **1400/1400 program PASS**（原1342全保留，新增58）：兩來源型別／完整數量／NoData／上下界／真0與負值、整批備援、不混來源、範圍及雙線性取樣、5–10格網、真 sceneStore error/retry／舊field清除／舊區域晚回應拒絕、明確 flat helper 來源。
- `npm run verify`、完整 `npm run check`：**13 lint-config＋13 dxf-writer patch契約**均過；不增加忽略或放寬 guard。
- **437 dev＋48 built-production CSP PASS**：原422＋45全部保留，再加15＋3；390／768／1440原生匯入／圈選／fetch／Retry／3D／下載。主來源null→備援50米；主來源null＋備援少一格→警告；按Retry→真正全0米成功；兩來源失敗仍能在明示平坦參考場景匯出。
- 新增 **6份真正瀏覽器 DXF**：三寬度各一份有效備援50米地面及一份失敗參考0米地面。dxf-parser 核對所有面頂點的絕對CAD Z；獨立 Python／ezdxf1.4.5 亦對六檔要求 `zBounds=[50,50]`／`[0,0]`，先驗 raw ownership 再 audit／重存讀。
- 獨立CAD總計 **14應用fixtures＋9損壞拒絕控制＋57真下載 PASS**（48 building-mode＋3 production native＋6 terrain）。browser-dir gate 現在至少57份且必須含六個明確命名 terrain 檔，不能拿舊51檔產物冒充本輪驗收。
- 完整 browser→CAD 同一 chain **exit0／993661ms（含CAD）**，沒有 skip／retry／pageerror 過濾／CSP放寬。built native 流程實際經 null 主來源→備援，其來源與50–50米標籤在原 enforced CSP 下成立；正向路徑沒有新增 CSP violation。
- **169 PNG＋57 DXF**：`/home/user/artifacts/map3d-v0.1.0-terrain-integrity/`；已開啟390錯誤及重試、390／768平坦參考、1440備援／production畫面，警告／來源可讀無新增遮擋。窄螢幕截圖使用展開設定表單，並非宣稱地形視圖同時完全可見。
- build **18files／1536.0kB／gzip473.7kB**；原2929.7kB cap不變。npm audit production **0**；full **12 moderate**，既有開發工具例外保留。沒有新依賴、後端、認證、proxy 或部署。
- logs：`/tmp/map3d-terrain-{verify,check,audit}-final.log`、`/tmp/map3d-terrain-ui-full.log`、`/tmp/map3d-terrain-cad-full.log`；瀏覽器／Python／fixture／下載／圖片不入 Git。

### 重跑

```sh
npm run verify
npm run check
npm run audit:deps
# 先依 docs/cad-conformance.md 安裝測試用 Python requirements，並安裝 Chromium。
npm run verify:ui:isolated
CAD_BROWSER_DIR=node_modules/.cache/ui-artifacts npm run verify:cad
```

沙盒另用 ignored Sparticuz Chromium／字型／SwiftShader 啟動相同完整腳本；測試改動已納入正常 runner，不依賴 ignored runner 才會測到。CI既有獨立CAD artifact交接與20min browser／10min CAD預算不變；未執行遠端Actions。

## 仍不能據此聲稱

- 網格完整且數值合理，不保證高程正確／datum一致；依賴供應商文件的輸入順序，沒有額外逐點核對 response location 或 cross-provider vertical datum。整批切換避免混網格，**不**使Copernicus與SRTM等價。
- 既有粗格網／插值限制不變。沒有補洞、加密 DEM、survey-grade accuracy、Whitebox WASM、外部 GeoLibre／TopoExport 同 DEM 截圖比較。
- 供應商為 mock，不是 live CORS／NoData分布／可用性或rate-limit驗收。PNG不是數值證據；數值由原生下載及獨立讀取驗證。
- 未做桌面CAD、完整LoD2／building parts／通用屋頂、實機／Safari／Firefox、外部產品畫面對照、遠端CI或部署。整個 APP 仍未全部完成，未commit／push。
