# 單坡屋頂（skillion）：來源、模型與 CAD 驗證

2026-11-03（香港） · v0.1.0 · 本地工作分支 `arena/67142253-map3d`

## 這輪實際完成

`roof:shape=skillion` 不再一律當平頂。兩種場景共用同一個單坡高度模型，保留平面／凹輪廓、中庭、內島、內牆及原有底蓋政策；現有 DXF／mesh 匯出直接使用該幾何。沒有引入新依賴或模型代理。

這只是增加一種屋頂，不是完整 LoD2、CityGML、building parts、hipped／dome／複雜屋脊或 CAD solid 認證。

## 查看過的上游來源

先重新開啟參考政策 AGENTS `206cb0c24d028651d804ec19942dc9791b499fdd`，再查看本地共用 builder／資料 collector／真場景與下載測試。環境沒有 browser.open，使用 fetch_page／GitHub CLI，而非聲稱使用不存在的工具。

搜尋到的實際上游為 **tordanik/OSM2World**，不是不存在的 OSM2World/OSM2World 路徑；讀取固定 revision **`1d31c252cbef964b489a55e5fb8242ee253375b1`**：

- [SkillionRoof.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/roof/SkillionRoof.java)：根據 slope direction 找高邊，按距離／全坡長線性降低；`roof:angle` 使用 `tan(angle) × roofLength`，不是雙坡的半跨距；無有效方向時回傳完整 roof rise，形成總高度平頂。
- [SkillionRoofTest.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core-jvm/src/test/java/org/osm2world/world/modules/building/roof/SkillionRoofTest.java)：梯形南向坡及全坡長45°的實際測試。
- [VectorXZ.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/math/VectorXZ.java)：其方向向量是 `(sin θ, cos θ)`、+Z向北；本 APP 是-Z向北，必須轉換符號。
- [ValueParseUtil.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/util/ValueParseUtil.java)：非負數值方位取mod360，及16個羅盤方向。
- [Roof.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/roof/Roof.java)：另有依邊線及方向精度 snapping。本 APP **沒有搬入 snapping**，而是使用解析後的明確方位；也沒有移植 Java polygon／material runtime 或宣稱相同視覺結果。
- 同版 LICENSE.txt 為 MIT，**Copyright 2010–2026 OSM2World contributors**；來源與完整許可已加入根目錄 `THIRD_PARTY_NOTICES.md`。梯形測試期待值轉換座標後適配，不假裝是未參考來源的成果。

## 共用模型

- `parseRoofDirection` 支援16個羅盤點、大小寫／空白正規化及有限非負十進制度數（mod360）。負數、清單、非有限／溢位、hex、指數字串、附帶°的字串不猜測。雙坡模型亦使用此共用 parser，原有數值方位語義保留並補齊羅盤名稱。
- 單坡下坡向量在本 APP 為 `(sin θ, -cos θ)`。先投影**外環**求全坡長；洞口不改變屋面整體跨度。
- 單坡面最高點為 ground + roof-inclusive total height，最低點為 ground + total − roof rise。全屋面是一個 affine plane，不沿中央分裂成雙坡，不在洞口重新起坡。
- 內外牆的頂端接到同一平面。Map Shape／Path 與 merged UTM 模型繼續經原有共用 footprint validator／triangulator，沒有另寫一份僅供測試的模型。
- 屋頂高度依序採 `roof:height`、`roof:levels × 2.2m`、`roof:angle`、既有的 `min(3m, span/4)` 估計。2.2m及最後估計是 **map3d 的既有政策，不是 OSM2World／OSM 的強制標準**。
- 角度推算：skillion為全坡長；gabled仍為半跨距。沿用本 APP 的角度<85°、總高度2–400m、至少2m façade等保守限制，沒有擅自放寬成任意屋頂。
- 顯式 `roof:height=0`（含0ft）及 `roof:angle=0` 保留零起伏，不再因正數length parser回退成非零估計；零起伏也不顯示不必要的缺方向警告。

### 沒有有效方向時不猜

具有正起伏、但沒有有效 `roof:direction` 的 skillion，保留有效建築輪廓，**暫以總高度平頂**顯示，不任意用 longest edge 決定有向坡面。仍保留原始標籤／由標籤推估的屋頂高度資料；這不表示平頂已重現真實屋頂。

兩個實際 fetch collector 的 `CellProgress.flatSkillionRoofs` 以**渲染 footprint component**計數，與略過無效 OSM 物件的 `skippedBuildings` 分開。地圖載入卡、定向載入卡及場景設定有中英文提示；多個 island component 若都缺方向會各自計數。計數不是已成功渲染數，仍要看既有 fetched/drawn 差額。

## 驗證

- **663/663 DOM-free PASS（新增53）**：16方位、數值正規化／壞值、顯式高度／英尺、全坡長vs半跨距、levels與總高度、零起伏及clamp；八個主／對角方向×四種外／內環方向組合的屋頂淨面積、單一平面、normal、牆接面、洞口與屋頂射線；來源梯形、凹輪廓、missing-direction平頂與診斷。
- 真正 map helper／merged builder → dxf-writer → dev-only dxf-parser，檢查 CAD 的軸向、公尺、R2010及每個 roof vertex 的東向下降方程。實際 mocked fetch/cache→兩種collector亦驗證標籤與獨立 fallback count。
- **224/224 Chromium PASS（新增12）**，保留前212項。390／768／1440每寬度新增四項：實際圈選、mock Overpass、有效單坡中庭／內島與一棟缺方向建築的載入／兩種警告、兩個React場景及兩份真正下載的 DXF。每份下載都核對淨面積、occupied/empty位置、每個屋頂三角形符合東向單坡方程，以及缺方向建築的8m平頂真的存在，而非只顯示提示。
- 原有兩頁 Web Locks、1MB lossless backup、24次Leaflet zoom/player/remount、短尺寸／fallback相機及嚴格pageerror阻擋皆保留。未關閉web security、未新增錯誤過濾。
- 本輪68張mock-network PNG：`/home/user/artifacts/map3d-v0.1.0-skillion/`。已開啟三寬度`skillion-ortho-*`（斜視）及390px`skillion-map-status-*`；斜率只有3m/full span，不能只靠縮小截圖判定數值正確，實際CAD平面斷言才是數值證據。
- 最終完整UI重跑（370.1s）：`/tmp/map3d-skillion-ui-final.log`（較早完整重跑另有ui-full記錄）。最終verify/check/audit：`/tmp/map3d-skillion-{verify,check,audit}-final.log`；後續零起伏警告修正亦由unit與最新瀏覽器重跑確認。
- `npm run verify`、`npm run check`、13項lint契約、repository/build budgets與`git diff --check`通過。無新package或lockfile變動；正式audit0，全圖仍12moderate／0high／0critical。既有i18n Fast Refresh與lottie eval warning未隱藏。

## 邊界

仍只有flat／gabled／skillion的支援子集；未標屋頂不臆造坡面，其他屋頂保留原有flat fallback。Missing direction不會被上述羅盤解析自動補全。沒有近邊方向snapping、building parts／min_height、巢狀OSM relation、複雜屋脊／其他屋頂或保證watertight CAD solid。

本輪是合成建築／mock或中止網絡，不是OSM2World／TopoExport同資料同角度截圖對照、live CORS／供應商、真實香港建築、物理裝置、Safari／Firefox或獨立CAD桌面驗收。沒有推送、遠端CI或部署。
