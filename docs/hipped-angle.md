# 四坡屋頂 roof:angle：有限屋脊距離推導 — 2026-11-03

v0.1.0 · `arena/67142253-map3d` · © SCOUT SYSTEM

## 這次有新增產品功能，不只是重跑搜尋測試

在既有的無洞、四個真角、投影後矩形四坡屋頂中，只有 `roof:angle`、沒有可用 `roof:height`／`roof:levels` 的建築，現在可生成斜屋頂，不再一律平頂。兩個3D場景、原生圈選／Overpass流程、fallback計數與DXF均納入。共線邊節點、方向優先序、原有高度／架空語義保留，沒有增加provider／dependency／proxy／backend／CSP origin。

## 源碼先行，沒有用半個屋寬猜公式

環境沒有 `browser.open`；使用 `fetch_page` 開來源頁、GitHub CLI 讀固定原始碼。OSM2World HEAD 本輪仍為 `1d31c252cbef964b489a55e5fb8242ee253375b1`：

- [RoofWithRidge.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/roof/RoofWithRidge.java)：建構時取輪廓頂點到**有限 ridge 線段**的最大距離；`calculatePreliminaryHeight` 先讀 `roof:height`，否則 `tan(angle) * maxDistanceToRidge`。不是距離無限延伸直線，也不是直接 `width/2`。
- [Roof.java](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/roof/Roof.java)：`parseRoofAngle` 接受 `0 ≤ angle < 90°`。
- 既有 Hipped／AbstractHipped／ridge 語義及 MIT notice 保留於 [來源文件](hipped-roofs.md) 與 `THIRD_PARTY_NOTICES.md`。是有界 TypeScript 適配，不是 Java runtime／完整 heightfield／general skeleton 移植。

40×20m、along 的既有兩端 inset 為20/3m。故最大角點距離為 `hypot(20/3,10) ≈ 12.0185m`，45° preliminary rise 亦約12.0185m，**不是10m**。across 時 inset8m、橫跨度40m，距離為 `hypot(8,20)`。

這是上游的 preliminary **高度估計**，不是保證四個坡面各自都精確等於標籤角度。既有roof-inclusive總高度／至少2m façade的clamp也可能改變最終坡度，不把它當測量／等坡屋頂模型。

## APP 行為與限制

- `hippedRoof.ts` 使用真實來源節點到既有兩端點線段的clamped投影距離；不刪來源節點、不重新選方向、不用bounding box修復梯形，不放寬 `1e-4` 矩形／對齊及屋脊端點包含檢查。
- `buildingBuilder.ts` 先建立合法hip plan，再向dimensions提供實際距離；tag-only `buildingDimensions(tags)` 不用既有預設12m span 猜四坡角度。缺幾何時正角度不推導。
- 沿用本 APP 的優先序：有效 `roof:height`（含0）→有效 `roof:levels`（含0；既有2.2m估計）→有效 `roof:angle`。這不是宣稱上游所有level／height優先序已完整移植。
- 角度採嚴格十進位文字、0至小於90；拒絕負值、90／以上、NaN／Infinity、部分數字、指數或附單位文字。正角度需要無洞、對齊且合法的矩形hip；不支援形狀／方向或壞角度仍保留真輪廓、total-height平頂及獨立警告。有效0是有意平頂，不誤報。
- 明確height仍是含屋頂總高度；沒有height而有building:levels時，facade加一次實際rise，不能少算或重複。既有2–400m總高與至少2m façade保留。
- `osmBuildings` 另帶 `resolvedHeightM` metadata，讓UTM collector的heightM反映geometry-derived總高；不回寫原始OSM `height`／`roof:height`。架空底部相對facade計算，底高超過新eaves仍拒絕，不以角度推導繞過垂直區間驗證。
- 英／繁中四坡fallback訊息同步提及有效angle；不再錯說所有angle-only都不支援。pyramidal angle-only仍不支援；gabled／skillion既有解讀不改。
- 同一物理矩形在legacy局部投影與UTM中仍可能有不同fallback，不聲稱投影間普遍等價或真北bearing校正。

## 驗證與實際遇到的問題

| Gate | 本輪結果 |
|---|---|
| Program | **1622/1622 PASS**；原1499保留。新增114項角度／parser／collector／兩模式CAD契約，另9項CI stage／handoff契約。旋轉／反向／along／across、30／45／60°、finite segment而非無限直線、共線節點、顯式height／levels／zero、floor-derived總高／min_level、非法底高、壞角度、洞／梯形／不對齊fallback、steep-angle clamp皆覆蓋。 |
| check | `npm run check` PASS，13lint-config／13writer-patch、lint／typecheck／verify／release／budget保留。未放寬CSP或guard。 |
| dev Chromium | 完整 **479 PASS**（原473＋6），390／768／1440、兩模式的實際DXF各新增一組角度斷言。改正最終測試同步／文案後，另跑24項hipped＋angle及18項搜尋矩陣；沒有把focused數字當作額外全套數字。 |
| built production CSP | 完整 **87 PASS**（原84＋3），原生Overpass→WebGL→DXF角度屋頂；exact hosting header／bypassCSP:false、全部正向與攻擊阻擋、無source import保留。 |
| CAD | **15應用fixtures＋9negative controls＋63真瀏覽器DXF PASS**，新增獨立`hip-angle.dxf` fixture：6屋面／2端點／4eaves、面積200m²、底5／頂30m及獨立公式eaves。原14fixtures全保留。瀏覽器仍63份；既有6份hipped及3份production legacy現在亦須含30m angle roof。raw owner/handle先於ezdxf1.4.5讀入、audit／roundtrip，無repair。 |
| Audit／build | prod0／full12moderate（既有dev minimatch例外）；18files／1542.0kB／gzip475.7kB，原2929.7kB cap不改。 |

程式測試第一次遇到across steep angle被正確的min_height>eaves guard拒絕：修正fixture底高，不改產品guard。另一次用了equirectangular假設去比UTM角度rise，已改用實際投影來源邊長的獨立公式，不放寬矩形容差或冒稱UTM與局部投影相同。

### 測試排程／CI不是只增加timeout

完整串行dev＋production＋CAD曾exit0／1272098ms。試過把DEM／recovery一起並行，仍exit0但連check達1333823ms，沒有改善，**已撤回**，沒有宣稱成功加速。

最後把工作重新分配到原來的兩個CI job：

1. `check` 仍 **20min**：品質／build／audit、完整dev階段；上傳同次`verified-dist`和dev下載。
2. 依賴check的 `cad` 仍 **10min**：下載這次dist和dev產物，執行**完整production CSP**，再獨立驗證全部63份DXF；保留完整產物。沒有新增總timeout、刪案例或自動重試。
3. `npm run verify:ui:isolated` 預設仍跑**兩階段**；可明確傳 `-- dev`／`-- production`。未知stage或多餘參數拒絕，不可悄悄跳過gate。9項program契約驗證stage預設／選擇／壞值與CI兩階段／dist名稱／20+10預算配置；不是遠端Actions成功證據。

分階段首次完整dev exit0／1088s，production曾exit0／199s；**這些不是最終排程的速度保證**，也不包含遠端安裝成本。最終production與受影響focused已在下列修正後通過；完整dev的記錄與最後focused分別陳述，不能說最後所有步驟是同一次chain。

原本新增搜尋矩陣與主suite同時跑，出現過canvas／screenshot超時。失敗診斷有一次顯示canvas稍後已存在、有正確label及尺寸；另一次為screenshot等待。不能只憑它們宣稱APP根因或改成忽略錯誤。已改為**搜尋各寬度逐一、整個搜尋矩陣在主suite之前**，不再跨瀏覽器競爭3D／截圖；零增加timeout、零retry／錯誤過濾。另發現搜尋fixture只等本來已存在的course欄位可見，沒有等匯入完成；現在受控延後真實`File.text()`後，等待course name確實commit才圈選，不用任意sleep。那不是足以單獨解釋全部canvas超時的根因；診斷仍保留。

遠端CI／Actions artifact實際傳送尚未執行，本地source配置與本地stage成功不能代替遠端job時間驗收。

## 畫面與產物

193張一般mock PNG、63份DXF於 `/home/user/artifacts/map3d-v0.1.0-hipped-angle-final/`；另有除錯failure PNG時不列入成功畫面數。已開啟390／768／1440四坡場景：新增角度建築在左方較高處，手機底板可收合、桌面警告可讀。初次開圖發現舊文案仍說angle-only unsupported，已修正雙語並重跑24項受影響dev／87項production；不是忽略畫面不一致。模型很小，精確屋面／eaves靠真下載CAD檢查，不以截圖冒充量測或外部產品比較。

最終focus圖另在 `/home/user/artifacts/map3d-v0.1.0-hipped-angle/hipped-ortho-{390,768,1440}.png`。測試用Chromium153、Noto CJK、Python及產物不入Git。主要logs：`/tmp/map3d-angle-{verify,check,production,cad,audit}-final.log`、`/tmp/map3d-angle-dev-final.log`、`/tmp/map3d-angle-focused-final.log`、`/tmp/map3d-angle-search-final.log`。先前失敗log可能已由**修正後執行**覆寫；以上問題在此保留，不把失敗當不存在。

```sh
npm run verify
npm run check
npm run audit:deps
# Chromium與scripts/cad-requirements.txt的test-only工具安裝後：
npm run verify:ui:isolated
CAD_BROWSER_DIR=node_modules/.cache/ui-artifacts npm run verify:cad
# CI可分到既有兩個job；default仍等同二者：
npm run verify:ui:isolated -- dev
npm run verify:ui:isolated -- production
```

## 尚未完成

一般／有洞四坡、pyramidal angle、building parts／巢狀relations、完整LoD2／CityGML、桌面CAD／實機／Safari／Firefox、liveprovider、同範圍外部產品截圖對照、遠端CI／部署仍未驗收。公開Nominatim的全APP總量／開發者知情採用／免bundle更新切換仍是[上線blocker](place-search-safety.md)，本輪沒有解決或忽略它。未commit／push／部署；不稱整個APP全部完成。
