# 建築中庭：OSM → 兩個場景 → DXF

日期：2026-11-03（香港） · v0.1.0 · 本地實作／驗證，未部署。

> 此文件記錄前輪460／13／200檢查時的中庭實作。後續已補齊交替包含的中庭內島，並修正來源座標去重前預算；最新610／13／212檢查及邊界見 [內島續作](building-islands.md)。

## 原始碼根因與參考

本輪沿既有查詢逐段追蹤，不只給幾何函數新增參數：

1. `sceneData.ts` 已查詢 `way[building]` 與 `relation[building]`，使用 `out body geom`，但兩個 collector 都只讀 `element.geometry`。Relation 的 member geometry 因此被忽略。
2. `Space.tsx` 只建立外框 Shape，Building 又只讀 `shape.getPoints()`；定向模式的 BuildingInput 也只有外環。
3. 共用 builder 的屋頂、地圖模式底蓋均向 `ShapeUtils.triangulateShape` 傳入空 holes，且只有外牆。

實際查看的上游實作：

- [Overpass JSON 輸出，a0db4f392f744d5e1304331edbf542ef6d6ce2fa](https://github.com/drolbr/Overpass-API/blob/a0db4f392f744d5e1304331edbf542ef6d6ce2fa/src/overpass_api/output_formats/output_json.cc)：relation 寫出 `members[].type/ref/role/geometry`；不完整幾何的點可以是 `null`，不能過濾 null 後擅自連線。
- [Three.js r173 ShapeUtils](https://github.com/mrdoob/three.js/blob/r173/src/extras/ShapeUtils.js)，並另讀已安裝的同名原始碼：會修改傳入陣列以移除閉合端點；索引指向「外環 + 各內環」的攤平頂點，不是只指向外環。
- 再開啟先前已讀的參考政策 AGENTS，revision `206cb0c24d028651d804ec19942dc9791b499fdd`；延續其增量、驗證、輕量與誠實標示原則。不引入無關登入／GAS／backend。環境沒有 browser.open，使用 fetch_page／GitHub CLI 讀取原始碼，沒有聲稱使用不存在的工具。

原有 OSM 高度語義及 dxf-writer 來源見 [建築與 DXF](buildings-and-dxf.md)。這不是複製 TopoExport 的內部演算法。

## 完成的資料路徑

- 新增 `osmBuildings.ts`，兩個實際 fetch collector 共用，不再各自只處理 way。
- 支援已真正閉合的 standalone way，以及 `type=multipolygon` relation 的 outer／inner way member。反向、分段的 boundary 按**精確端點**拼接；legacy 空 role 作 outer。
- 初輪保留數個互不相交的 outer component；後續改為最近父環分配，亦接受有中間 inner 的 island outer，見內島續作。同 relation 的數值 id 共用負值，避免與正值 way id 相撞；渲染另用 `type/id/component-index` key。component index 不是可跨 OSM 編輯持久化的語義 ID。
- Multipolygon 已宣告的 outer member way 不重複繪製，包括 relation 本身無法處理時，避免它退回實心輪廓。Inner member 若自己另有 building 標籤，仍按獨立建築處理，不一律刪除洞內的另一棟建築。
- RawBuilding／SceneBuilding／BuildingInput、地圖 Shape.holes／Path 都攜帶 holes。`mapBuildingGeometry.ts` 提取了地圖元件真正使用的轉換，供 DOM-free 測試直接驗證，而不是測試另一份替代演算法。
- 共用 `footprint.ts` 檢查有限座標、非零面積、自交、邊界相觸／相交、洞口包含關係。輸入副本交給 Earcut，不修改 provider 或 caller 的點序。
- 平頂與雙坡屋頂都排除洞口；內牆指向中庭，與每個環自己的順逆方向無關；雙坡內牆在屋脊交點分段，接到同一屋面。
- 地圖建築底蓋從 builder 的**已驗證 footprint**取得洞口，即使呼叫者只傳原有 outer 參數，也不會意外封洞。定向模式沿用原本無底蓋的合併表面表示。
- 定向模式以外環減內環的淨面積套用既有 12m² 門檻，地面最低點也包含洞口邊界；無效幾何不增加 drawn count。
- 所有既有模型匯出共用實際 mesh；DXF 仍交由 **dxf-writer** 輸出 R2010／3DFACE，保留地圖壓縮還原與定向 UTM 公尺單位。

## 不以填平代替不支援

解析拒絕保留 `key/reason` 診斷；實際 fetch progress 將拒絕的 **OSM 物件數**傳給地圖載入卡、定向載入卡及場景設定，顯示中英文警告。不是 component 數，也不把正常去重的 outer way 計為錯誤。選取／刪除地圖範圍時清除舊計數；定向重試沿用原有 generation 防過期機制。

本輪採取保守子集：

- 不替 open way／缺片 member／null 座標補線，不以三角化結果掩蓋自交。
- 目前不支援巢狀 OSM relation、相觸／重疊洞口、沒有中間 outer 的直接巢狀 inner、非 boundary way member、未知 role，或跨 ±180° 經度的輪廓。初輪拒絕的合法 outer island 已由續作補齊。
- 為約束新增拓撲檢查成本，單一 way／relation 最多 **2,048 個來源座標項**，最多 **65 個組合後環**；重複閉合／片段接點亦計入來源預算。超限整個物件拒絕並計數，不截斷點列或填滿外框。直接 builder 入口亦有相同等級的頂點／環預算。這不是 provider 載入筆數限制，也不是裝置效能認證。
- 建築 parts、完整 S3DB／CityGML、其他屋頂種類／屋脊網絡仍未實作。未標屋頂不會臆造雙坡屋頂。
- Relation 與 member way 跨 cell 逐步到達時，當前場景仍屬暫存進度；只有收到 relation 後才能知道 member 的歸屬。不能據此保證供應商回傳完整或每個中間影格皆為最終拓撲。

因此仍標示 **部分 LoD2**。拒絕計數不等於已修復 OSM 原始資料；獨立 CAD 桌面互通、地理精度、保證封閉實體與 3D 列印成功都未驗收。

## 已執行的驗證

- 新增 **91** 項 DOM-free 檢查，總計 **460/460 PASS**：真正分段／反向 JSON member、閉合 way、雙外框、去重與 id 衝突、null／缺片／branch／open／巢狀／外部洞口／相觸／自交／預算等拒絕路徑。
- 外框與洞口獨立反轉 × 平頂／雙坡共八組：屋頂投影面積、朝向中庭的內牆、朝下的底蓋、射線穿過洞口但命中實心區、多洞、caller 不變；另驗證內環地面高度、淨面積門檻與無效繪製計數。
- 實際 mock fetch 經共享 Overpass cache 到兩個 collector，驗證 holes 與拒絕 progress；不是只測 parser。
- 經兩個真正場景 geometry builder → dxf-writer → dev-only **dxf-parser**，核對版本、單位、屋頂淨面積及底蓋政策。
- 完整隔離 Vite／Chromium **200/200 PASS**（新增 **12**，每個 390／768／1440 寬度各四項）：實際圈選、mock provider 回應、載入／警告、React 場景、兩種模式的 DXF 按鈕與實際下載檔。每份下載均由獨立 parser 驗證洞口已從 CAD 屋頂面積扣除。
- 舊 188 項瀏覽器案例全部保留，包括真正的兩頁 Web Locks、1MB 完整備份、24 次 Leaflet zoom／player／remount、短尺寸／fallback 相機及嚴格未處理錯誤阻擋。未關閉 web security，未新增錯誤過濾。
- `npm run verify`、`npm run check`、`npm run audit:deps`、`git diff --check` 通過。13 項 lint 契約另計；正式依賴 audit **0**，全圖仍 **12 moderate／0 high／0 critical**，無新依賴。

本機記錄：`/tmp/map3d-courtyard-ui-full.log`（完整 UI，326.9s），`/tmp/map3d-holes-check.log`（首次完整 check），最終記錄見 STATUS。56 張當輪 mock-network PNG 位於 `/home/user/artifacts/map3d-v0.1.0-courtyards/`，不入 Git；已開啟三寬度 `courtyard-ortho-*`，中庭可見，另查看 390px `courtyard-map-status-*` 的拒絕警告。其他既有回歸截圖亦在同目錄。

這些是合成建築與模擬／中止外部網絡的本 APP 畫面，不是香港真實建築、實體手機、Safari／Firefox、live CORS、GeoLibre／TopoExport 同資料角度對照或 CAD 桌面驗收。沒有推送、遠端 CI 或部署。
