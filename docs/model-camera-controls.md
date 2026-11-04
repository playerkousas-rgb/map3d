# 建築／GPX：完整模型取景與可復原的相機操作

2026-11-04（香港） · map3d v0.1.0 · © SCOUT SYSTEM

## 本輪是實際操作流程，不再只修屋頂

使用者重試後確認要「繼續完成APP，優先使用者看得到的功能」。重新讀取選區→載入→3D→匯出原碼：

- 舊建築`Space`只放`<OrbitControls />`、fov90／near.1／far7000，沒有依選區或實際建築高度框住模型；初始相機可能在模型裡面。
- GPX已有初次取景，但沒有拖走後的一鍵復位、俯視或按鈕縮放。兩模式亦缺乏不用滑鼠／雙指的相機操作入口。
- 定向模式已有獨立相機工具，沒有假稱三模式都從零實作；本輪不改其course/player相機或資料。

## 已交付

1. **兩模式自動取景**：模型掛載、真canvas尺寸改變及GPX參數生成新geometry時，以可見、exportable模型的真世界座標AABB框住底板／建築／軌跡／markers。天空、隱藏父層與非模型指南不會把相機拉遠；非同步roads不會在使用者操作中反覆搶回視角，按「完整模型」可重取當下bounds。
2. **同一套44px原生控制**：「完整模型」、俯視、縮小、放大；完整模型有可見文字，其餘有名稱／title及圖示。Enter／Space與原生鍵盤focus可用，連按相同指令也會生效。
3. **真復位**：重設target、position、up、zoom與clip planes；先清理未完成的pan／orbit damping，避免剛復位又漂走。縮放保留目前pan target，有有限min/max；不改模型頂點、geometry units或export transform。
4. **看得到模型**：GPX按「完整模型」會收合設定卡，不刪除軌跡／參數。工具列獨立於卡片，設定可隨時重新展開；卡片短螢幕高度預留工具列，Back／Export保持分離。
5. **隔離與失敗保護**：相機命令留在目前App UI，不寫course draft、localStorage、URL或定向`useViewStore`；新掛載模型忽略前一模型最後的zoom／top命令。空、NaN、無效FOV／aspect不產生壞pose；按鈕不會發出新供應商請求。
6. 英／繁中，原生DOM＋本地既有lucide圖示；無新runtime依賴、provider、proxy、backend、CSP origin或部署設定。

### 源碼／公式，不猜尺寸

環境沒有`browser.open`；使用`fetch_page`實際開頁與GitHub CLI查tag。

- [Three.js r173 Box3.js](https://github.com/mrdoob/three.js/blob/ee97ad2f948a0feb9c2446247e8cb88741bb2305/src/math/Box3.js)，`gh api .../commits/r173`解析為 **ee97ad2f948a0feb9c2446247e8cb88741bb2305**。`expandByObject`會套world matrix並只在缺少geometry boundingBox時計算；`getBoundingSphere`以AABB中心及半對角線半徑。也核對了本地three0.173.0對應原碼。第一次舊縮寫衍生連結無法解析，改用真tag解析，沒有以錯誤URL冒稱來源成功。
- [參考AGENTS@206cb0c](https://github.com/playerkousas-rgb/readme/blob/206cb0c24d028651d804ec19942dc9791b499fdd/AGENTS.md)已重開：套用來源、可達性、輕量、安全、版號與如實交付；不是把ecportal／GAS架構塞進這個APP。
- `src/utils/modelCamera.ts`：`radius=length(AABB.size)/2`；`horizontalFov=2 atan(tan(verticalFov/2)*aspect)`；`distance=radius/sin(min(verticalFov,horizontalFov)/2)*1.15`。這是本地相機幾何推導及原GPX取景方法的共用化，**不是宣稱Three有同名fit API／上游產品公式**。採保守包圍球，不猜總是12m建築或固定desktop距離；2%–20倍距離縮放界線與可涵蓋它的far plane。
- 使用builder的immutable geometry boundingBox cache，每次僅套最新world transform；不在每個render frame／每次zoom重掃所有vertices。模型重建會取得新geometry/cache。

## 最終證據（不是只檢查按鈕存在）

| Gate | 最終結果 |
|---|---|
| Program | **1786/1786 PASS**，保留1716＋70新檢查。長薄／高塔／一般GPX／單點、三種aspect×斜視／俯視，以真PerspectiveCamera投影全部8角到NDC，驗兩軸FOV與near/far；另驗世界座標、visible/exportable ancestors、cache、pending damping、重複指令、100次縮放上下限及不變的export bounds／vertices。 |
| Quality | `npm run verify`與`npm run check` PASS。13lint-config／13writer patch保留；無新disable，原fast-refresh warning不冒稱已消失。release metadata、預算與typecheck通過。 |
| Dev native | 完整 **521 PASS**（原491＋30），390／768／1440，各兩模式×5組新檢查。初次圖等於顯式Fit；兩次連續鍵盤zoom、zoom out、俯視真的改變中央3D像素；原生右鍵pan真的移動模型；Fit後逐byte還原初始PNG，重複Fit不漂移。 |
| Built CSP native | 完整 **120 PASS**（原90＋30），相同helper以原生DOM／輸入／圖像／下載驗兩模式；沒有source import、camera test global、store injection或bypassCSP。原正向零CSP／pageerror與負向攻擊全留。 |
| 不改匯出 | 兩模式×三寬度×dev/production = **12對實際STL下載逐byte相同**（24次下載）；包含vertices／normals／face count，不只檢查檔名。原五格式／DXF單位及visibility回歸仍完整跑過。 |
| Independent CAD | **17fixtures＋9negative controls＋63真DXF PASS**；ezdxf1.4.5，raw引用先驗，無ownership repair；零roof24／26m、angle30m、復原50m ground／62m roof與舊洞口證據未刪。本輪沒有虛增CADfixture／DXF數。 |
| Build／audit | 18files、**1544.9kB／gzip476.4kB**（相較前輪＋2.9／＋0.7kB）；原2929.7kB cap不放寬。production audit0／full12moderate（既有dev minimatch，未強制不相容override）。 |

**最終verify→check→完整dev→完整built production→CAD→audit：exit0／1563516ms（約26分04秒）**。在GPX收卡與boundingBox cache最終修正後，完整重跑，不拿較早完整結果替代。之前另一次完整521/120及focused42也通過，僅作歷史，沒有只挑成功viewport或自動retry。

過程中lint抓出直接修改hook回傳引擎物件，把Three imperative adapter抽到獨立工具並以committed effects呼叫，保留全部Hooks規則／無suppression。新測試曾誤用舊返回按鈕名稱，讀i18n後改用真正`Edit selection`，不修改產品文字或寬鬆regex使測試過關。未把這些失敗當作APP成功證據。

## 圖像、可重現與邊界

完整產物：`/home/user/artifacts/map3d-v0.1.0-model-camera/`。原193圖保留，另新增24張兩模式／兩語言／兩stage的相機圖；63DXF保留。實際開啟最後390px繁中GPX、768px建築與1440pxbuilt GPX：完整模型及工具列可見，收合卡沒有遮住模型，設定／返回／匯出分開。fixture圖只證此受控場景，不冒充外部產品或真GIS城市畫面。

測試亦實際resize至320×568、390×320、844×390，展開GPX卡時逐一hit-test44px按鈕、卡片／工具列／底部操作不重疊及無頁面水平overflow；語言切換後可用「完整模型」收卡，再開仍保留base4mm。原短螢幕、safe-area與三slider的測試全部保留。

```sh
npm run verify
npm run check
npm run verify:ui:isolated  # 須先裝本機test-only Chromium
CAD_BROWSER_DIR=node_modules/.cache/ui-artifacts npm run verify:cad
npm run audit:deps
```

本地runner／Sparticuz Chromium＋SwiftShader／CJK字型／Python tools／圖像不進Git。logs：`/tmp/map3d-camera-{verify,check,ui,cad,audit}-final.log`。CI仍為20min品質＋dev、10min同次dist production＋CAD；**此次完整本地26分鐘，不代表任何單一20分鐘job已在遠端通過；遠端安裝／artifact／runtime餘裕仍未實測，不能宣稱CI綠。** 沒增加timeout／skip／retry或削減案例。

仍未完成：一般LoD2 roofs／building parts、實際供應商可用性、Safari／Firefox／實機／screen-reader／桌面CAD驗收、外部參考同場景比較、遠端CI及部署。Nominatim全APP流量／知情採用／動態切換仍為既有公開上線blocker。這一輪是把主流程的3D操作補齊，不是宣稱整個APP已完成；未commit／push／部署。
