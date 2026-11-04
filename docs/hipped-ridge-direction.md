# 四坡屋頂的明確屋脊方向：來源、優先序與 CAD 驗證

2026-11-03（香港） · v0.1.0 · `arena/67142253-map3d` · © SCOUT SYSTEM

> 後續已擴充 [保留共線邊界節點](hipped-collinear-nodes.md)：最新1342／422＋45。以下1260／404＋42為方向milestone歷史紀錄，方向規則不變。

## 本輪完成什麼

在既有[有界矩形四坡模型](hipped-roofs.md)中補上 `roof:ridge:direction`。先前此標籤一律使四坡退回平頂；現在可指定**沿屋脊的方位**，與 `roof:direction` 的下坡方位分開。未新增一般多邊形／帶洞四坡、angle 推算或完整 LoD2。

## 直接讀取的源碼

環境沒有 browser.open；實際用 fetch_page 分兩段完整讀取並以 GitHub CLI 取回 [OSM2World RoofWithRidge.java@1d31c252cbef964b489a55e5fb8242ee253375b1](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/roof/RoofWithRidge.java)。亦重新取回參考政策 [AGENTS@206cb0c](https://github.com/playerkousas-rgb/readme/blob/206cb0c24d028651d804ec19942dc9791b499fdd/AGENTS.md)，不引入其無關GAS／backend架構。

實際依據：

1. `ridgeDirectionFromTags` 依序嘗試 slope direction、ridge direction、orientation。
2. `ridgeVectorFromRoofDirection` 在一般 hipped 類型用 direction 的 rightNormal，表示屋脊垂直於下坡方向。
3. `ridgeVectorFromRidgeDirection` 使用方向向量本身，表示**沿屋脊**，不能再轉90°。
4. 上游 `snapDirection` 可能吸附到邊方向，無效標籤亦可能轉用下一種推算；本 APP **沒有移植吸附／一般方向修復**。以下 fail-closed 是本 APP 的保守政策，不假稱完整上游行為。

既有 OSM2World MIT notice 延續，新增方向適配來源記入 `THIRD_PARTY_NOTICES.md`；無新增 Java runtime 或依賴。

## 支援及優先序

只限 `roof:shape=hipped`，仍須投影後四個真角（後續允許有界近共線節點）、無洞矩形及有效明確 `roof:height`／`roof:levels`。

| 輸入 | 實際結果 |
|---|---|
| 有有效 `roof:direction` | 用下坡方位的垂直軸；忽略低優先序 ridge／orientation，即使它們無效 |
| 無 slope tag、有有效 `roof:ridge:direction` | 沿屋脊方位；覆蓋低優先序 orientation |
| 兩種方向皆無 | 維持沿最長邊，或有效 `orientation=across` |
| 正在使用的方向格式無效或與矩形邊不對齊 | 保留原輪廓總高度平頂，計入既有 `flatHippedRoofs`，不嘗試較低優先序來掩蓋資料問題 |
| 例如 slope=`bad`、ridge=`E` | 明確平頂；不把壞的高優先序標籤偷偷修成四坡 |
| 例如 slope=`N`、ridge=`bad`、orientation=`bad` | slope有效且與邊對齊便可建模；低優先序資料不參與選軸 |
| 有效顯式 rise=0 | 有意平頂，不因方向／中庭而誤報 |

方向解析沿用既有16方位、大小寫／首尾空白處理、有限非負十進位角度及mod360；不接受 `-90`、`90deg`、Infinity、NaN、科學記數或空字串。數字及羅盤都仍須對齊實際矩形邊，並非只接受東西南北：旋轉矩形的相符斜向亦可。未知 orientation 只有在它是實際選軸來源時才拒絕。

場景使用 +X east、−Z north、+Y up，所以屋脊 bearing β 對應 `(sin β, −cos β)`；原有 slope direction 則沿垂直屋脊軸。**此處是實際場景投影座標軸的方位，不是新增UTM convergence校正／測量級真北保證。** 兩個投影仍有差異，斜交或超過1e-4時保守fallback，未放寬驗證。

例如40×20m的東西向矩形：預設沿長邊ridge=80/3m；指定ridge=N改用短軸，inset=min(40/3,0.4×20)=8m，每端收短後ridge=4m。不是只讀到tag但仍默默畫預設長軸。

`roof:direction`／ridge 的新優先序只改 hipped 子集；gabled、skillion、pyramidal 的既有幾何不變。屋面6三角形、eaves牆、rise clamp、roof-inclusive total、min_height、材質、原始tags及洞口fallback政策全部保留。

## 實際驗證

- **1260/1260 program PASS**，比前輪1172新增**88**項。涵蓋11種羅盤／數字／空白方向、旋轉22.5／45／67.5／123.4°×正反向、大座標偏移、6屋面／8牆、淨面積／不修改來源；優先序衝突、無效／斜交方向、有意零與中庭；其他三種屋頂不受影響；兩個實際幾何adapter→dxf-writer→獨立dxf-parser驗證4m短軸ridge，不只測profile欄位。
- **404 dev＋42 production-CSP browser checks PASS**；完整 isolated runner同一命令 exit0，**898315ms**，比前輪增加**18 dev＋3 production**。保留所有舊case，不skip／過濾pageerror／放寬CSP。
- 新開發版case在390／768／1440各測兩場景：真正圈選→mock Overpass→真parser／collectors／cache／WebGL→按鈕實際下載metric R2010 DXF，再獨立核對短邊ridge的兩端點、6向上屋面、eaves5／ridge8、淨面積、中心中庭hole及invalid-ridge平頂與可見數量。預設hipped／angle-only case仍獨立保留，沒有拿新case取代舊case。
- 新fixture依各場景**投影後真實短邊**獨立計算tag及期望端點，不呼叫產品profile／roof helper造期望值；不能把相同UTM／legacy數字當成相同geodetic bearing。
- 正式版額外原生建築 `height=13, roof:height=3, min_height=2, ridge=N, orientation=along`：實際DXF有6屋面、2個13m端點、10m eaves，東西座標相同、南北ridge=**2.2264m**，證明ridge確實覆蓋along。既有pyramid／default hip／GPX、攻擊阻擋及正向零CSP violation完整保留。
- `npm run check`：lint／**13 lint-config checks**／guard／verify／release／TypeScript／build通過。build **18 files／1534.0kB／gzip473.0kB**，原2929.7kB預算未變。
- 乾淨 `npm ci --no-audit --no-fund`、`npm ls --all`、`npm run audit:deps`、`git diff --check`通過。production **0**；full **12 moderate／0 high／0 critical**，不是全依賴零漏洞。

### 瀏覽器環境與畫面

本輪重建ignored Chromium153.0.0／AL2023 libraries及Noto CJK字型。首次啟動缺libnspr4，改用該臨時package自帶libraries；focused首次完成390px後single-process context關閉導致後續page無法建立，調整臨時launcher每寬度新browser。CSP standalone在1440px啟動時另有single-process SIGSEGV；移除臨時launcher的single-process及allow-running-insecure-content（web security亦始終未停用）後，standalone及**最終完整兩階段**全部通過。不改產品／正式測試來吞錯，無skip／retry wrapper。正常開發仍用Playwright安裝Chromium後build並執行 `npm run verify:ui:isolated`；供應binary可用既有環境變數。

**148 PNG**：`/home/user/artifacts/map3d-v0.1.0-ridge-direction/`，含 `csp/`。已實際開啟 `hipped-ridge-ortho-{390,768,1440}.png` 與 `hipped-ridge-map-status-390.png`；左方為短軸屋脊，中間中庭平頂，右方invalid-ridge平頂。警告可換行、控制可見；小屋頂無法靠像素精確判讀端點，幾何精度由CAD回讀約束。合成tile／資料不當作live provider、外部參考產品對照或實機證據。

Logs：`/tmp/map3d-ridge-{verify,check,audit}-final.log`、`/tmp/map3d-ridge-deps-final.log`、`/tmp/map3d-ridge-ui-full.log`；focused／standalone CSP為 `/tmp/map3d-ridge-focused.log`、`/tmp/map3d-ridge-csp.log`。字型、binary、下載、截圖與logs不進Git，不是app依賴。

## 仍未完成

一般多邊形／帶洞四坡、方向吸附／真北校正、angle-only rise、building parts／nested relations、完整LoD2／CityGML、桌面CAD、GeoLibre／TopoExport同範圍同角度截圖對照、live providers／CORS、Safari／Firefox／實體裝置／輔助技術、遠端CI與部署仍未驗收。本輪沒有新增provider／backend／proxy／origin，也沒有commit／push／deploy；整個APP仍未全部完成。
