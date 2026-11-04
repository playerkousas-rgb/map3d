# 中庭內島與交替包含拓撲

日期：2026-11-03（香港） · v0.1.0 · 工作分支 `arena/67142253-map3d`

## 本輪完成／沒有完成

在先前 [中庭資料流程](building-courtyards.md) 上，補齊同一 OSM multipolygon 中 **outer → inner → outer → inner** 的幾何層級。中庭內的 island outer 可以保留，island 自己的中庭也不會被填平。

這是**同一 relation 的 way rings 包含關係**，不是支援 relation member 再引用另一 relation，也不是 building parts／重疊量體布林運算。產品仍是部分 LoD2；沒有新增 backend、代理、依賴、部署或遠端 CI。

## 先查看的來源

- 再次開啟參考政策 AGENTS，revision `206cb0c24d028651d804ec19942dc9791b499fdd`，沿用現有專案的輕量／安全／防呆與增量驗證要求，不搬入 GAS／帳號架構。
- 再次開啟 [Three r173 ShapeUtils](https://github.com/mrdoob/three.js/blob/r173/src/extras/ShapeUtils.js)：它接收單個 outer 與該 outer 的直接 holes。不能把所有層級的 inner 都傳給最外面的 Shape。
- 查看 [osmtogeojson index.js，c97381a0c86c0a021641dd47d7bea01fb5514716](https://github.com/tyrasd/osmtogeojson/blob/c97381a0c86c0a021641dd47d7bea01fb5514716/index.js) 及同版 test/osm.test.js：其 multipolygon 流程拼合 outer／inner、建立 outer clusters，再找 inner 的 outer。該版 `findOuter` 使用第一個符合頂點包含條件的 outer，並可忽略找不到 outer 的 inner。**沒有將這兩個行為照搬為安全保證**；本 APP 的巢狀情況需找最近父環，且有任何無效環時整個 relation 拒絕。沒有加入此套件、複製其測試資料或宣稱其演算法已證明本 APP 正確。
- 另讀本地 `osmBuildings.ts`、`footprint.ts`、兩個實際 scene builder、原有 CAD／瀏覽器測試。來源抓取使用 fetch_page／GitHub CLI，沒有聲稱使用環境不提供的 browser.open。

## 實作與安全條件

`normalizeMultipolygon(outers, inners)` 在共用 `footprint.ts` 建立嚴格包含 forest：

1. 先檢查總頂點／環預算；每個 ring 都通過有限座標、非零面積與簡單多邊形驗證，使用副本。
2. 兩兩檢查環邊界，任何接觸／交叉都拒絕。由此才能用內點判斷包含，而不是只因一個頂點在內就接受穿越邊界的環。
3. 每個環的 parent 是包含它的、面積最小的環；不依 provider 順序或輸入方向決定。
4. 根節點只能為 outer，parent／child 的角色必須交替。outer 直接包含 outer、inner 直接包含 inner、orphan inner 仍屬錯誤，不會套用無條件 even-odd 填充來掩蓋錯誤 role。
5. 每個 outer 產生一個 footprint，只攜帶其**直接 inner children**。更深的 outer 自己成為另一個 footprint，保留自己的直接洞口；不需要遞迴展開 relation。
6. `parseOsmBuildings` 將這些 footprints 沿既有兩條 fetch／scene／DXF 路徑交付。任一環無效仍整個 OSM 物件拒絕，一次 diagnostic；不是部分接受後填平遺漏範圍。

獨立的 `normalizeFootprint` 仍拒絕直接巢狀 holes，因為它只處理**一個** outer。需要多層結構時必須先做 multipolygon decomposition，不能移除其拒絕檢查。

Relation id 仍為負值、way 為正值；不同 island component 用 `type/id/component-index` React key。同 relation 的數值 id／標籤共用，不代表同一個 mesh；component index 仍不是跨 OSM member 排序編輯的永久識別。

### 同時修正來源預算計數

上輪 relation 在 `coordinates()` 去除相鄰重複點**後**才累加長度，與文件宣告的「來源座標項」不完全一致。本輪改為先加總 `member.geometry.length`，再驗證／去重。2,048 項的上限現在包含跨片段接點、重複閉合點及相鄰重複點；2,049 項不會因去重而通過。最多 65 個組合環，沒有提升或移除上限。拒絕仍會顯示在既有雙語略過數量中。

這是有限輸入下的保守拓撲檢查，不是任意資料的 DoS／效能／精度認證。原有定向模式 12m² 淨面積門檻與 40,000 draw ceiling 仍存在；過小 island 與其他過小建築一樣可能未繪製，須查看 fetched/drawn 狀態，不能宣稱每個 island 都無條件顯示。

## 真正執行的驗證

### DOM-free：610/610 PASS（新增150）

- 最近父環與來源順序無關；多個 disconnected roots、island 與自己的 courtyard；六層交替 rings 的逐層分解及淨面積。
- 直接重複 role、orphan inner、接觸／跨越中庭邊界、兄弟 island 互交、自交／非有限環、空輸入、頂點／環預算均拒絕。
- 真正的 Overpass member JSON，含反向分段 island、tagged outer 去重、負 relation id／兩個 component keys、整 relation 原子拒絕及 nested relation member 仍不支援。
- 含大量相鄰重複來源點的跨 member 累積預算；精確 2,048 與 2,049 項邊界。
- 四個環各自順逆向的 **16 組組合 × 平頂／雙坡**：投影屋頂／底蓋面積、向上屋頂與向下底蓋，以及射線依序命中／穿過「建築、主中庭、island、island courtyard」。每組輸入點列保持不變。
- 實際 map helper 與 merged UTM builder，經 dxf-writer → dev-only dxf-parser，驗證 R2010／公尺／3DFACE、兩個 component 的屋頂淨面積及不同場景的底蓋政策。

### 真瀏覽器：212/212 PASS（新增12）

完整隔離 Vite／Chromium，**359.4s**。390／768／1440 寬度各新增四項：實際圈選 → mock Overpass 回應 → 地圖模式兩個 component／每個一個 hole／略過一個無效 relation → 實際 DXF 下載，以及定向模式相同的 fetch/store/merged scene 與實際下載。

不只核對總面積：下載檔的 CAD 屋頂三角形也必須在指定位置符合 occupied／empty，防止錯誤區域剛好面積相抵。兩種 fixture（單一中庭、含 island）都檢查主建築、中庭空間、island 位置及中心洞口。

先前 **200 項全部保留**，包括正常中庭、兩頁 Web Locks／1MB lossless backup／24 次 Leaflet zoom-player-remount／短尺寸相機 fallback；嚴格 pageerror 阻擋未改，未關閉 web security。沒有省略舊「nested outer 無中間 inner」拒絕案例；那仍是無效 role hierarchy。

### 圖片與記錄

- 62 張本輪 PNG：`/home/user/artifacts/map3d-v0.1.0-islands/`，不入 Git。
- 已開啟 `island-ortho-390.png`、`island-ortho-768.png`、`island-ortho-1440.png`，可見兩層建築及兩個空區；另開啟 `island-map-status-390.png`，載入數為2、無效物件略過數為1。這是合成幾何，不是香港真實建築照片或外部產品截圖對照。
- 完整 UI：`/tmp/map3d-islands-ui-full.log`；最終 verify/check/audit：`/tmp/map3d-islands-{verify,check,audit}-final.log`。
- `npm run verify`、`npm run check`、13/13 lint 契約及 `git diff --check` 通過；正式 audit0，全圖仍12moderate／0high／0critical。沒有新增 package 或 lockfile 變動。

## 尚未完成

Nested OSM relations、building parts／重疊量體、其他屋頂種類與屋脊網絡、完整 LoD2／CityGML、獨立 CAD 桌面互通與保證 watertight solid；live provider／真實 CORS、物理裝置與 Safari／Firefox、GeoLibre／TopoExport 同範圍角度比較、遠端 CI／部署均未驗收。所有本輪外部回應是 mock／中止，不能當供應商可用性或實機證據。
