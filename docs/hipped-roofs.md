# 四坡屋頂（hipped）：來源、有界模型與下載驗證

2026-11-03（香港） · v0.1.0 · `arena/67142253-map3d` · © SCOUT SYSTEM

> 後續已補上 [明確屋脊方向／優先序](hipped-ridge-direction.md)：最新1260 program／404 dev＋42 production CSP通過。下方1172／386＋39與142PNG是首次四坡milestone歷史紀錄；支援範圍已更新，不將已完成ridge tag重列待辦。

> 再後續已支援 [直邊共線節點](hipped-collinear-nodes.md)：四個真角可有額外有界近共線節點，保留來源；n節點→n+2屋面。最新1342 program／422 dev＋45 production CSP，原四節點6屋面規則是n=4特例。

> 後續已新增 [roof:angle有限屋脊距離高度推導](hipped-angle.md)：1622program／479dev＋87production CSP；下面初次angle-only平頂的測試紀錄屬歷史，現有支援範圍如下。

## 源碼先行，不猜屋脊

本輪重新讀取參考政策 [AGENTS@206cb0c](https://github.com/playerkousas-rgb/readme/blob/206cb0c24d028651d804ec19942dc9791b499fdd/AGENTS.md)。環境沒有 browser.open，實際使用 fetch_page／GitHub CLI 讀取來源，不聲稱使用不存在的工具；不引入參考專案的 GAS／登入／後端架構。

實際查看 **OSM2World `1d31c252cbef964b489a55e5fb8242ee253375b1`**：

- [HippedRoof.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/roof/HippedRoof.java)：relative offset 為 1/3，兩端收短，ridgeAlongDirection=false。
- [AbstractHippedRoof.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/roof/AbstractHippedRoof.java)：中央 ridge、四條 hip segments、兩個端部坡面；側坡高度以距屋脊的垂直距離決定。
- [RoofWithRidge.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/roof/RoofWithRidge.java)：每端 inset 為 `min(capSegmentLength × relativeOffset, 0.4 × fullRidgeLength)`。不是 length/3，也不是假定等坡度的 width/2。上游另有一般輪廓、ridge direction、angle 等能力，本 APP 不聲稱全部移植。
- [LICENSE.txt](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/LICENSE.txt) 已重新取回確認為 MIT，Copyright 2010–2026 OSM2World contributors。許可及新增適配來源保留於 `THIRD_PARTY_NOTICES.md`。

`src/utils/builders/hippedRoof.ts` 是獨立 TypeScript 四角矩形子集，沒有搬入 Java runtime、完整 heightfield／skeleton 或上游 constrained triangulation。

## 實際支援範圍

- `roof:shape=hipped`，通過既有 footprint validator 的**四個真角（可有有界近共線邊節點）、無洞、投影後矩形**。相鄰邊正交與屋脊／邊對齊的相對 tolerance 均為 `1e-4`；不把梯形／凹形換成 bounding rectangle。
- 預設沿最長邊；`roof:orientation=along/across` 可選屋脊軸；有效數字或16方位 `roof:direction` 表示坡面下坡方向，屋脊與其垂直，而且必須對齊真實矩形邊。後續亦支援沿屋脊 `roof:ridge:direction`，有效slope direction優先，其次ridge，再其次orientation；無效的active標籤或不對齊方向保守平頂，低優先序標籤在高優先序有效時忽略。見[完整優先序](hipped-ridge-direction.md)。
- 用相對原點座標計算。令 length 為屋脊方向跨度、width 為橫向跨度，兩端各縮入 **`min(width/3, 0.4*length)`**。40×20m、沿長邊時 inset=20/3m、ridge=80/3m；across 時 inset=8m、ridge=4m。沒有額外共線節點時，四坡不是四個三角形：兩個端坡三角形＋兩個側坡四邊形，共 **6 個屋面三角形、2 個屋脊端點**。
- 屋脊端點另須通過真實外環 `pointInRing`；極薄、微斜輪廓若因數值 tolerance 使端點落到外面，保守拒絕四坡，不向外溢出。
- 有效 `roof:height`優先，其次 `roof:levels`（0–200，既有2.2m估計），再其次合法0至小於90°的 `roof:angle`。角度僅由已驗證hip的有限屋脊距離推導，沒有可用幾何就不猜span；[公式與限制](hipped-angle.md)。
- 保留 roof-inclusive total height、既有總高度2–400m及至少2m façade的 rise clamp。eaves=total−rise，屋脊=total；由 building levels 推算總高度時只加一次rise。牆到eaves，不造雙坡式山牆。
- `min_height`／`building:min_level` 保持原有架空 semantics：牆底／map底蓋抬高，屋脊總高度不再加一次。UTM仍以最小terrain datum建模、開底，不保證逐點淨空、watertight或可製造solid。

### 投影限制不能用放寬驗證掩蓋

同一個 UTM grid rectangle 換到 legacy map 的局部投影後，可能略微不正交而超過 `1e-4`。因此**兩模式可有不同的額外 flat fallback 數量**，不保證每個物理矩形在所有投影中都能造四坡。本輪保留嚴格檢查，測試明確覆蓋這個差異；另用原生經緯度矩形驗證兩 collector 都可成功。不修改 validator 來迎合 fixture。

## 不支援時保留資料並清楚提示

- 非矩形／多於四個真角（非單純共線節點）、holes、缺rise／有效angle、非法angle、方向不支援：保留有效原輪廓，**在 roof-inclusive total height 顯示平頂**，不填平中庭、不丟掉有效建築。
- 有效顯式 roof height／levels=0 是有意平頂，即使有holes亦不誤報。
- Parser的 `flatHippedRoof` metadata 不污染原OSM tags；`flatHippedRoofs` 按有效component計數，與skillion／pyramidal fallback及skipped來源物件分開。兩collector、cache progress、兩載入UI及SceneSettings皆有中英提示。
- 原有不完整／自交／非法拓撲及2,048來源座標／65環安全預算不變。非法垂直區間依既有政策拒絕，不能以flat fallback繞過驗證。

## 首次四坡驗證紀錄（歷史）

| Gate | 本輪完整結果 |
|---|---|
| `npm run verify` | **1172/1172 PASS**，相對前輪1081新增91項；新增 `scripts/verify-hipped.ts` 已納入標準入口 |
| `npm run check` | lint、13項lint-config、guard、verify、release、TypeScript及build通過 |
| 完整 Chromium | **386 dev＋39 built-production CSP PASS**，同一次 isolated runner exit0，625059ms；比前輪增加18 dev＋3 production |
| Build | 18 files／1533.8kB／gzip473.0kB；原2929.7kB預算不變 |
| Audit | production 0；full 12 moderate／0 high／0 critical，未以forced override隱藏 |
| `git diff --check` | PASS |

新增程式測試包括旋轉／反向／along／across、源碼inset數值、6屋面／8牆三角形、面積／normal／共邊／材質slot／不修改來源；height／feet／levels／zero／clamp、架空高度；中庭／無效方向／極薄斜形fallback；真parser、兩collector、cache；兩場景mesh→dxf-writer→獨立dxf-parser的公尺R2010驗證。

開發版瀏覽器在390／768／1440各測兩場景，經真正圈選與mock Overpass載入，保留中庭與angle-only平頂、雙語fallback數量；實際下載DXF再獨立讀回6向上屋面、2屋脊端點、inset、面積、eaves5m／ridge8m及洞口。首次fixture沿用金字塔的x<-45 selector誤切新12m屋頂，已改為真實projected max+1，未修改產品幾何以湊測試。

正式版原生 Overpass→WebGL→DXF 流程在未放寬CSP下驗證 `height=10, roof:height=2, min_height=2`：6屋面、eaves8m／ridge10m、兩端點；原有GPX、下載、攻擊阻擋、兩頁Web Locks、1MB備份及24次Leaflet週期完整保留，未關閉web security或過濾pageerror。

**142張mock-network PNG**：`/home/user/artifacts/map3d-v0.1.0-hipped/`（含 `csp/`）。已實際開啟 `hipped-ortho-{390,768,1440}.png` 及 `hipped-map-status-390.png`：左方是四坡、中間是中庭flat fallback、右方angle-only平頂，提示可換行且控制可見。屋頂在整體畫面中很小，截圖只證明版面／合成場景，不能憑像素聲稱精確幾何或外部產品相似；精度由CAD讀回與程式測試約束。

Logs：`/tmp/map3d-hipped-{verify,check,audit}-final.log`、完整瀏覽器 `/tmp/map3d-hipped-ui-full.log`。臨時 Chromium153／Noto CJK、下載資料、DXF與PNG不進Git；無新app依賴、provider、backend、proxy或CSP origin。

## 還未完成

一般多邊形／帶洞四坡、方向吸附／真北校正／一般非矩形angle推算、building parts／nested relations、完整LoD2／CityGML、桌面CAD驗收、GeoLibre／TopoExport同範圍同視角截圖比較、live provider／CORS驗證、Safari／Firefox／實體裝置／輔助技術驗收、遠端CI及正式部署仍未完成。本輪未commit／push／deploy，不把合成測試或有界四坡支援當作整個APP完成。
