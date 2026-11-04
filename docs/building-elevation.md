# 架空建築底部：min_height／building:min_level

2026-11-03（香港） · v0.1.0 · `arena/67142253-map3d`

## 原始碼依據，而非固定每層高度猜測

本輪先重開參考政策 AGENTS `206cb0c24d028651d804ec19942dc9791b499fdd`，查看本地 builder、兩場景／collector，再以 GitHub CLI 讀取 OSM2World 固定 revision **`1d31c252cbef964b489a55e5fb8242ee253375b1`**。環境沒有 browser.open，使用 fetch_page／gh 替代，沒有聲稱使用不存在的工具。

- [LevelAndHeightData.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/LevelAndHeightData.java)：明確 `min_height` 優先，否則 `heightWithoutRoof / buildingLevels × buildingMinLevel`。
- [LevelAndHeightDataTest.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core-jvm/src/test/java/org/osm2world/world/modules/building/LevelAndHeightDataTest.java)：12.5m／5層／min_level2 的底部是 **5m**，不是固定2.2m×2。已適配此期待值。
- [BuildingPart.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/BuildingPart.java)：使用地面 datum 與 level heights 建模。本 APP 沒有移植其完整 parts／室內樓層／Java runtime。
- 同版 MIT 及2010–2026 contributors 版權保留於 `THIRD_PARTY_NOTICES.md`。

上游另有缺少樓層標籤的推論及不一致 min_height 的調整（例如壓到 eaves−0.1m）。**沒有照搬這些修補推論**：本 APP 的有限子集要求正的 `building:min_level` 有有效 `building:levels`，無效區間整物件拒絕，不改寫其高度或填到地面。

## 模型與拒絕政策

- 共用 `resolveBuildingProfile` 同時解屋頂跨度、屋面函式及底部，避免 collector 用預設12m跨度、場景用真跨度時接受結果不同。兩個 collector 分別傳入實際 UTM／legacy map metric 投影；獨立 parser 呼叫不傳投影時才使用 local metric approximation。
- `height` 仍為 ground-to-top、包含屋頂的總高度。`min_height` 只改**牆底／底蓋**，不加到總高度／屋頂上。沒有相關標籤時保持原有地面底部。
- `min_height` 支援既有公尺／英尺長度格式及顯式零；優先於 `building:min_level`，即使較低優先標籤無效。負數、空值、清單、非有限／溢位／未知單位及非字串 JSON metadata 不靜默丟棄後當零。
- `building:min_level` 必須為0–200整數；零不用虛構總層數。正值需要既有支援格式的有限正 `building:levels`（≤200，且min≤total），底部為扣除屋頂後的 façade height／levels×min。這不把室內 `min_level` 標籤誤當建築底部。
- 底部必須低於總高度，且不得高於 eaves；等於 eaves 的 roof-only 體積可保留。只吸收≤1e-7m的浮點越界，不做上游0.1m幾何修補。屋頂估算、2–400m總高度限制及原有roof-rise clamp保持不變。
- 同一 relation 的任一 component 區間無效，整 relation 拒絕；無效關係仍先 claim tagged outer，避免以另一條 way 填回地面。兩種載入卡／場景設定沿用 `skippedBuildings`，中英文提示擴至輪廓或垂直區間。這是來源物件略過數，不是所有未繪製建築的總數。
- Map 保持 hole-aware 向下底蓋，但底蓋跟隨已驗證 `bottomY`，不相信外部 caller 傳另一個 base。UTM merged 模型維持原有**開底**政策，不宣稱封閉 solid。
- UTM 地面 datum 仍是外環與洞口頂點的最小 terrain height；架空底部在這個 datum 上加 clearance。不是每點離地相同高度、坡地精密淨空、柱子、橋樑或結構／通行保證。Legacy map datum 仍為0m。

## 實際驗證

- **762/762 DOM-free PASS，新增99項**：來源5m例、英尺／零值／優先序、按 façade 高度計算、壞值與roof overlap、整關係拒絕及 tagged-outer 防回填；flat／gabled／skillion × 外內環四方向組合的牆底／屋頂／向下底蓋、真射線穿越架空層與中庭、輸入不變；真 map helper／merged UTM／地形 datum／dxf-writer→獨立 parser，及實際 mock fetch／cache／雙 collector diagnostics。
- **242/242 Chromium PASS，新增18項**：保留前224項；390／768／1440每寬六項，真正圈選→mock Overpass→React兩場景→兩份真正 DXF 下載。主單坡中庭 `min_height=5`；鄰棟缺方向平頂 `(8−2)/3×2=4m`。每份下載核對各自底部、屋頂仍12–15m／8m、洞口淨面積／指定實空位置、map raised underside vs UTM open underside，以及3個略過物件的可見警告。
- CAD fixture 空間界限區分建築與 legacy printable frame；排除 upward z=0 terrain surface，但**不排除從0m開始的混合高度牆或向下底蓋**。之前測試保留的微小 selection 會使真 frame 落進 fixture，因此新測試用可見 zoom-out 再圈選，保持60m建築在選區內；沒有因失敗降低高度要求。
- 外部網絡為mock／中止，terrain unavailable，截圖是合成輪廓而非真香港供應商／TopoExport／GeoLibre比較。已開啟三寬度 `elevation-ortho-*.png` 及390px載入警告；截圖只是版面檢查，精確淨空由射線與CAD座標驗證。
- 最終 verify／check／audit 記錄：`/tmp/map3d-elevation-{verify,check,audit}-final.log`；完整瀏覽器 `/tmp/map3d-elevation-ui-full.log`（382523ms，包含runner開關）。截圖在 `/home/user/artifacts/map3d-v0.1.0-elevation/`，不進Git。無新增依賴。

## 仍未完成

完整building parts／nested relations／其他屋頂／LoD2與CityGML、每點坡地淨空／支柱、獨立CAD桌面互通與watertight／可製造solid、外部產品截圖比較、live provider CORS、實機Safari／Firefox／輔助技術驗收、遠端CI與正式部署仍未完成。沒有推送或部署；完整依賴圖仍有12項moderate開發依賴例外，production audit0不代表full audit0。整個APP尚未全部完成。
