# 金字塔屋頂（pyramidal）：有界支援、來源與 CAD 驗證

2026-11-03（香港） · v0.1.0 · `arena/67142253-map3d` · © SCOUT SYSTEM

## 源碼先行

本輪重開參考政策 AGENTS `206cb0c24d028651d804ec19942dc9791b499fdd`，查看既有 shared builder／兩個 collector／兩場景及真正下載測試。環境沒有 browser.open，使用 fetch_page／GitHub CLI，而非聲稱使用不存在的工具。

讀取 **tordanik/OSM2World revision `1d31c252cbef964b489a55e5fb8242ee253375b1`**：

- [PyramidalRoof.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/roof/PyramidalRoof.java)：apex為外環 `getCentroid()`，每個outer vertex連到apex；apex高度為roof rise，outer vertices為0。不是bbox中心或頂點平均值。
- [SimplePolygonXZ.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/math/shapes/SimplePolygonXZ.java)：面積加權centroid公式。本 APP 適配成相對第一個點的座標，降低大座標的相消誤差。
- [HeightfieldRoof.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/roof/HeightfieldRoof.java)／[Roof.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/roof/Roof.java)：上游透過內部segments和高度場處理；父類的preliminary height未實作此類roof:angle，只讀roof:height並警告沒有angle實作。本 APP沒有虛構一套金字塔angle推算或搬入其完整Java triangulation/runtime。
- 同版 MIT，Copyright2010–2026 OSM2World contributors，完整許可與本輪適配記入 `THIRD_PARTY_NOTICES.md`。上游沒有在該tree找到專門的PyramidalRoofTest；本輪的梯形／幾何／下載fixtures是map3d新增，不冒稱搬自不存在的上游測試。

## 實際支援子集

- `roof:shape=pyramidal`，通過原有footprint驗證的**無洞凸外環**。每條邊與面積重心apex構成一個向上屋面三角形，牆頂在統一eaves高度，不是雙坡中央ridge或skillion平面。合法共線邊點可保留；微小凸性誤差沿用尺度相關數值容差。
- 需要可解析的明確 `roof:height`（支援公尺／英尺／顯式0），或有效 `roof:levels`（0–200，使用既有2.2m估計）。`roof:height`優先，無法解析時可用有效roof:levels；沒有有效rise就不猜。`roof:angle`不能單獨推算此類屋頂；direction／orientation亦不改變centroid fan。
- 這個對明確rise的要求是**本 APP 的保守政策**，不是宣稱上游只能支援此子集。2.2m是既有map3d estimate，不是OSM／OSM2World強制值。
- 屋頂apex仍為ground + roof-inclusive total height；eaves為total−rise。`building:levels`推算總高度時只加一次rise。沿用2–400m總高度及至少2m façade的roof-rise clamp。
- `min_height`／`building:min_level`沿用前輪規則，牆底／map底蓋抬高但不再抬高apex。UTM仍以外內環最小terrain datum建模、開底；不聲稱坡地每點淨空或closed solid。
- 共用profile可評估屋頂內部高度；凸fan各面由邊至重心的比例決定。建模outer wall只需eaves，不用逐點掃所有roof planes。有效fan不會用Earcut的任意兩三角形平面代替尖頂。

## 無法支援時不假裝金字塔

- 凹外框、帶中庭／holes、缺少有效rise、只有angle：保留原本有效輪廓，**明確以總高度平頂fallback**；hole-aware roofs／inner walls／map cap仍保留洞口。不是丟掉建築，也不是跨洞拉一個扇形填平。
- 有效的顯式roof height／levels=0是有意平頂，不誤報「無法支援」。這個例外即使有凹外框／holes亦不需要造尖頂。
- `flatPyramidalRoofs`以有效**component**計數，與skillion缺方向及skipped來源物件分開。Parser依實際metric投影解同一profile，兩個collector／cache、兩種載入卡及SceneSettings都有兩語提示。
- `flatPyramidalRoof`為parser的診斷metadata，不寫入原OSM tags。多component relation各自判定是否fallback；若任一component的垂直區間無效，仍按既有政策整relation拒絕，tagged-outer不回填。
- 原始缺片／自交／角色錯誤／拓撲超限仍是拒絕，不因本輪fallback而繞過footprint validator。2,048來源座標／65環預算不變。

## 實際驗證

- **925/925 DOM-free PASS，新增113項**：rectangle／非對稱梯形 × 正反向 × 旋轉的淨面積、normal、牆頂、apex／邊中點高度及真射線；大offset穩定centroid、共線邊、source頂點不變；height／feet／levels／zero／clamp；凹輪廓／中庭／angle-only／bad rise的平頂及洞口；min_height／min_level；真map helper／merged UTM→dxf-writer→獨立dxf-parser；實際mock fetch／cache／兩collector的獨立fallback計數。
- 非對稱梯形 `(0,0),(20,0),(12,10),(0,10)` 的centroid為 `(49/6,55/12)`，不是vertex mean `(8,5)` 或bbox centre `(10,5)`。用此明確期望值約束源碼語意。
- **296/296 Chromium PASS，新增18項**，保留前278項。390／768／1440各六項：真正圈選→mock Overpass→三棟有效component（凸四邊金字塔／中庭平頂fallback／angle-only平頂fallback）＋一個無效物件；兩場景載入／提示、兩份真下載DXF。每份CAD核對金字塔四個面都含一個8m centroid apex及兩個5m eaves、向上淨面積；15m中庭fallback的洞口／指定實空位置與8m angle-only平頂真的存在。
- 仍保留五格式direct／collected真下載、架空5m／4m、skillion／islands、兩頁Web Locks、1MB備份、24次Leaflet週期、短尺寸／相機及pageerror gate。未關閉web security或新增錯誤過濾。
- **83張mock-network PNGs**：`/home/user/artifacts/map3d-v0.1.0-pyramidal/`；已開啟三寬度pyramidal斜視及390px載入警告。尖頂建築位於左、中間為保留洞口的平頂fallback、右為angle-only平頂。畫面只是合成fixture／版面檢查；精確面方程與洞口由CAD／射線驗證，不當作外部產品比較。
- 最終verify／check／audit logs：`/tmp/map3d-pyramidal-{verify,check,audit}-final.log`；完整Chromium：`/tmp/map3d-pyramidal-ui-full.log`（465338ms，包含runner）。無新runtime／dev依賴，資料／圖片／browser binaries不入Git。

## 仍未完成

完整building parts／nested OSM relations／其他屋頂、帶洞或凹金字塔的constrained roof triangulation、完整LoD2／CityGML、獨立CAD桌面與watertight／可製造solid、GeoLibre／TopoExport同範圍截圖比較、live providers／CORS、Safari／Firefox／實體裝置／輔助技術驗收、遠端CI及正式部署仍未完成。Production audit0／full12moderate開發例外分開披露；本輪無推送／部署，整個APP尚未全部完成。
