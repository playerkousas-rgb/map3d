# 四坡屋頂：保留直邊上的 OSM 共線節點

2026-11-03（香港） · v0.1.0 · `arena/67142253-map3d` · © SCOUT SYSTEM

## 修正的真實限制

OSM 矩形建築的直邊可能插有入口或其他共線節點。先前四坡 helper 要求恰好4個節點，即使仍是四個真角也會平頂。本輪允許**四個真角＋有界近共線的邊上節點**，不刪掉來源座標，也不把梯形／凹形／曲邊換成矩形。

預設屋脊亦改用**完整角到角邊長**：例如12×8m矩形的兩條長邊各拆成3段4m，不能因某條8m短邊比每條4m分段長，就把屋脊錯選為短軸。既有 [ridge direction優先序](hipped-ridge-direction.md)、height／levels明確rise、min_height、fallback計數及投影限制不變。

## 實際讀過的源碼

環境沒有 browser.open。實際使用 fetch_page 開啟並以GitHub CLI讀取 [OSM2World SimplePolygonXZ.java@1d31c252cbef964b489a55e5fb8242ee253375b1](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/math/shapes/SimplePolygonXZ.java)；`getSimplifiedPolygon` 以相鄰線段normalized dot移除近共線點，先0.05，面積差大時再用0.001。已讀 [RoofWithRidge.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/roof/RoofWithRidge.java) 使用簡化輪廓選方向／求交，並保留原輪廓作其他幾何依據。

本APP**沒有照搬上游較寬的dot門檻、面積差10%或一般simplification**，而是獨立實作嚴格四真角子集。來源MIT notice保留並補記適配，沒有Java runtime／新依賴。亦取回參考政策 [AGENTS@206cb0c](https://github.com/playerkousas-rgb/readme/blob/206cb0c24d028651d804ec19942dc9791b499fdd/AGENTS.md)，不引入無關GAS／backend。

## 模型與安全邊界

`hippedOutline` 只建立一個四真角**參考陣列**，不修改原陣列或點：

- 有限座標、每條來源邊長>1e-8；相鄰方向必須向前，normalized cross≤1e-6才是近共線候選，折返不算共線。
- 最終須只有4個真角；每條角到角run的內點參數嚴格遞增且位於(0,1)。每點距**完整chord**不超過最長整邊×1e-7。局部小轉角不能累積成一條曲線而偷偷通過。
- 原本矩形正交／方向對齊的 **1e-4** 不變，屋脊端點仍須位於真實外環內。這些是建模數值容差，不是OSM資料或測量精度承諾。
- 所有原節點仍用於屋面boundary及牆分段，近共線點不被吸附或移動到chord上。各投影可能因數值／曲率超界而有不同保守fallback，仍非保證每個物理矩形都成功。
- footprint整體合法性、自交／holes與2,048來源座標／65環budget仍先驗證；不能先刪節點來繞過原安全預算。

屋脊inset依舊是 `min(width/3,0.4*length)`。對n個有效邊界節點，四個主坡面被分成 **n+2屋面三角形、2n牆三角形**，仍只有2個屋脊端點；只有原本n=4才是6屋面三角形。

### 地圖底蓋不新增 T-junction

Earcut可能略過共線邊界點。如果屋簷／牆保留它們而底蓋略過，就會形成新的底蓋T-junction。對**本輪成功且n>4的無洞四坡**，地圖底蓋改把已驗證屋面三角形投影到既有bottomY並反轉朝向，讓邊界分段完全一致。沒有把中庭投影填平；其他屋頂、四節點四坡、hole-aware cap均維持原路徑。UTM仍維持既有開底表示，不新增假封閉實體。

程式fixture的closed map mesh每條幾何邊恰好共享兩次；這是限定fixture的拓撲驗證，不等同整個APP所有輸出的watertight／可製造認證。

## 本輪驗證

| Gate | 結果 |
|---|---|
| `npm run verify` | **1342/1342 PASS**，比1260新增**82**；`verify-hipped-nodes.ts` 已接標準入口 |
| `npm run check` | lint／13 lint-config／guard／verify／release／TypeScript／build全過 |
| 完整 Chromium | **422 dev＋45 production-CSP PASS**，比前輪增加18＋3；同次isolated exit0，**863999ms** |
| Build | **18files／1535.1kB／gzip473.5kB**；原2929.7kB cap不變 |
| Audit | production0；full12moderate／0high／0critical |
| `git diff --check` | PASS |

新增程式case包含16節點、從邊中點起始、正反向×旋轉×along/across、default整邊選軸、不同分段位置、不修改來源、n+2／2n三角形、屋面向上淨面積、有限normal、抬高bottom／eaves／ridge、closed-map各邊共享恰好兩次／材質slot；凹口、凸出、折返、梯形、非有限點、99個局部微轉累積曲線的拒絕；細小投影噪音但不移動來源；中庭flat／zero；真parser保留節點；兩場景adapter→dxf-writer→獨立dxf-parser驗公尺R2010、所有eaves節點及兩ridge端點。先前「多一個共線點必須fallback」已按新支援範圍改為真凹口fallback，並另有正向節點測試，不冒稱舊限制未改。

新增dev fixture在390／768／1440各測兩場景，保留原default／ridge／angle-only案例並增加獨立nodes案例。真正圈選→mock Overpass→collectors/cache/WebGL→真下載DXF；8個來源節點、10屋面、2ridge端點、正確完整長邊軸、eaves5m／ridge8m、所有boundary節點、net area及中庭hole／angle-only平頂均獨立檢查。

正式版原生Overpass另有 `height=16, roof:height=2, min_height=5` 的8節點fixture：真DXF驗10屋面、8個14m eaves、2個16m峰點及東西向完整長邊軸；CSP／原有42case保留，不放寬來源或過濾pageerror。

### 瀏覽器與截圖證據

**154張mock-network PNG**：`/home/user/artifacts/map3d-v0.1.0-hipped-nodes/`（含 `csp/`）。已開啟 `hipped-nodes-ortho-{390,768,1440}.png`、`hipped-nodes-map-status-390.png`；左側為保留節點的四坡，中間為中庭flat、右側angle-only flat，提示換行、控制可見。共線細節與小屋脊不能憑低解析整景截圖證明，精確節點／拓撲由CAD與程式驗證。這不是GeoLibre／TopoExport同場景對照或live tile證據。

Test-only Chromium153／AL2023 libraries／NotoCJK在ignored cache／tmp。本輪standalone CSP的舊供應binary啟動參數仍有SIGSEGV；臨時launcher改用最小no-sandbox＋SwiftShader參數，不加single-process／in-process-gpu／不安全內容或web-security停用旗標後，standalone及最終完整兩階段通過。正式測試未加retry／skip／pageerror過濾。正常開發仍build後執行 `npm run verify:ui:isolated`，可用既有CHROMIUM_EXECUTABLE／CHROMIUM_ARGS供應受限環境binary。

Logs：`/tmp/map3d-collinear-{verify,check,audit}-final.log`；完整 `/tmp/map3d-collinear-ui-full.log`；focused `/tmp/map3d-collinear-focused.log`；standalone `/tmp/map3d-collinear-csp.log`。binary／font／資料／PNG／DXF／logs不入Git。

## 仍未完成

曲邊／一般多邊形／帶洞四坡、方向吸附／真北校正、angle推算、building parts／nested relations、完整LoD2／CityGML、桌面CAD、外部產品同範圍同視角比較、live供應商／CORS、實機／Safari／Firefox／輔助技術、遠端CI及部署仍未完成。本輪無新app依賴／provider／origin／backend／proxy，沒有commit／push／deploy；整個APP尚未全部完成。
