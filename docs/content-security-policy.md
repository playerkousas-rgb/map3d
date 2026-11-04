# Production CSP：靜態主機政策與真實瀏覽器驗證

2026-11-03（香港） · v0.1.0 · `arena/67142253-map3d` · © SCOUT SYSTEM

## 本輪做了什麼，沒有做什麼

`vercel.json` 新增 **enforced Content-Security-Policy HTTP header**；不是 report-only。`vite preview` 從同一個檔案讀取根路徑的實際安全headers，供本地production build驗證。未增加GIS代理、後端、帳號、秘密、CSP report收集服務或新的runtime依賴。

**沒有推送／部署／遠端CI**，所以這是「設定＋本地production驗證完成」，不是宣稱正式網站已送出這個header。單純把dist放到不送headers的其他靜態主機，不會自動得到此政策；必須在該主機設定HTTP response header並重新驗收。沒有以meta policy假裝可替代所有header功能。

開工先重開參考政策 AGENTS `206cb0c24d028651d804ec19942dc9791b499fdd`，查看README／SCOPE／APP_AUDIT、實際資料source registry、Overpass mirrors、elevation／geocoder／tiles、匯出器／analytics與hosting config。環境沒有browser.open，使用fetch_page及本地源碼。另讀取 [MDN CSP header reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)，核對directive類型與response-header定位；沒有把文件的通用範例不加審核貼進APP。

## 政策與理由

| Directive | 本輪政策／邊界 |
|---|---|
| default-src | `'self'`，未另開放的fetch類型以同源為基線。 |
| script-src | 僅`'self'`，**沒有unsafe-inline、unsafe-eval、data:、blob:、https:或wildcard**。本地bundled chunks及既有同源可選analytics endpoint仍可載入。不是nonce/hash strict CSP，也不是禁止同源腳本執行。 |
| script-src-attr | `'none'`，inline event handler不能執行；React的event listeners不依賴inline attributes。 |
| style-src | `'self' 'unsafe-inline'`，明確保留Emotion注入style及Leaflet位置style所需例外。這是**style例外，不是script例外**；沒有宣稱已實作nonce-based style隔離。 |
| img-src | self／data／blob，及OSM與OpenTopoMap的a/b/c瓦片、地政總署、NASA GIBS的**精確HTTPS origins**。非任意https圖片。Data／blob讓本地產生的texture／image可用，不因此容許blob腳本。 |
| connect-src | self，四個實際Overpass mirrors、Open-Meteo、OpenTopoData、Nominatim、raw.githubusercontent.com的精確HTTPS origins。保持browser direct，沒有透過hosting provider轉發資料。 |
| base-uri／object-src／form-action | none；防止外部base改寫、plugin object及native form submission。搜尋表單原本就preventDefault後用fetch，已實際驗證。這不是禁止使用者點外部資料來源文件連結。 |
| frame-src／worker-src／media-src | none。目前無iframe產品功能、runtime worker或影音功能；未實作的WASM／worker／offline service worker未被當作已支援。日後引入需重新審查。 |
| frame-ancestors | self與明列的arena.ai／*.arena.ai／*.e2b.app預覽例外，不開放任意origin。**含多租戶預覽域例外，不是完整anti-clickjacking認證或存取控制**。實際Arena嵌入行為及部署後response仍待驗收。 |
| font-src／manifest-src | self，系統字型／本地manifest與icons，不新增遠端字型能力。 |

下載參考WorldPop／HydroRIVERS不是browser-rendered資料來源，因此沒有因CSP而賦予其fetch／image能力；普通外部navigation/download link不等於connect-src。現有nosniff、referrer與camera/microphone/geolocation permissions policy、immutable assets/icons cache及Host防護均保留。

### 為什麼沒有把dev server當成production證據

Vite的React Refresh有dev-only inline bootstrap。把production CSP直接套到HMR，再為修畫面加unsafe-inline，反而會削弱production script政策。因此只在**built dist + Vite preview**套用真hosting header；原本296項dev/HMR regression不能被算成296項CSP驗證。

`npm run verify:ui:isolated` 現在先完成原有dev gate、關閉dev server，再開production preview執行獨立CSP gate。CI沿用同一入口，總timeout由10增至15分鐘以容納雙階段；沒有執行遠端workflow。新增 `npm run verify:csp` 可單獨驗證已build的dist。Build與browser gate不要並行寫dist。

## 驗證與可重現步驟

```sh
npm run verify
npm run check
npm run audit:deps
npx playwright-core install chromium
npm run verify:ui:isolated   # 296 dev + 27 built-production CSP checks
# 或已build後單跑：
npm run verify:csp
```

可沿用既有 `CHROMIUM_EXECUTABLE`／JSON `CHROMIUM_ARGS` 指定測試binary。CSP gate使用`bypassCSP:false`，不關閉web security；不把DevTools evaluation的eval結果誤當browser enforcement。

### DOM-free／配置契約

**966/966 PASS（新增41項）**：單一enforced header、無重複directive、精確script基線與style-only例外；逐筆核對現有source registry的rendered影像／GeoJSON origins、每個Overpass mirror與實際terrain／elevation／geocoder常數；排除bulk資料權限、萬用HTTPS／wildcards與HTTP，保留Arena例外與舊安全headers；HTML沒有inline executable bootstrap／弱meta policy，preview讀取真hosting config。

這些契約不自行重寫一個CSP parser來宣稱browser合規；真正阻擋由下一階段瀏覽器測試。

### 真正production build測試

**27/27 Chromium PASS**，390／768／1440×900各九項：

1. 回應中的CSP與vercel.json完全相同、built chunks／入口可載入；unknown Host拒絕，Arena preview Host接受。不是Vite/src轉譯或dev preamble。
2. 真Nominatim搜尋表單→mock回應→選結果，form-action none不破壞既有preventDefault流程。
3. 真GeoJSON overlay fetch與NASA歷史WMS image、Leaflet／Emotion樣式可運作。
4. Legacy map圈選→真Overpass collector／金字塔架空建築→真正下載metric R2010 DXF，12m頂端存在。
5. 原生GPX file input→WebGL→**DXF／GLB／STL真Blob下載**，獨立DXF parser／GLB header／STL binary record回讀，沒有unsafe-eval或blob script逃生口。
6. 定向課程file input、實際圈選→mock Overpass與Open-Meteo→terrain/course場景→真正CAD下載。
7. 真Clipboard分享→player fragment navigation；原私人draft仍在localStorage。
8. 上述正向流程**零CSP violation、零uncaught pageerror**。沒有filter掉app錯誤。
9. 另開明確攻擊階段：動態inline script／onclick、外站script、外部base、未列入connect origin的fetch；以及**從允許的同源外部腳本呼叫new Function**。這避免CDP可能允許unsafe evaluation的假陰性。檢查native securitypolicyviolation、未執行的canaries、EvalError、未變的baseURI，以及不准origin的實際network requests=0。攻擊刻意產生的console/CSP事件與正常app違規分開，不是假稱整個測試全程零事件。

測試的same-origin eval probe由Playwright route只在測試時供應，**沒有放進public或production dist**。外部providers與可選analytics以fixtures替代，不送live telemetry、不接觸真供應商；這不能證明服務CORS／供應商可用性／正式CDN重導向全通。所有mirrors的政策由41項contract涵蓋，production UI實際走主Overpass與Open-Meteo；不是宣稱逐個mirror／OpenTopoData都做了live failover驗收。

舊 **296/296 dev Chromium** 同輪完整保留，與27項分開報告（合計323，不冒稱323都在production CSP下）。Lint-contract仍13/13。臨時Sparticuz single-process環境初期不能安全重用已關閉context，gate改成每寬度fresh browser；另有一次sandbox browser launch SIGSEGV未被過濾／自動重試掩蓋。最終完整雙階段一輪通過，無uncaught app錯誤；這不是實機或其他browser認證。

## 截圖與記錄

- `/tmp/map3d-csp-{verify,check,audit}-final.log`
- 完整雙階段 `/tmp/map3d-csp-ui-full.log`：296＋27 PASS（467049ms，含runner）。
- 截圖檢視發現player panel可先於lazy WebGL出現；補上canvas及兩個animation frame就緒等待，避免截到白色Suspense暫態，沒有改app或放寬任何斷言。最後再單跑production **27/27 PASS**（55967ms），`/tmp/map3d-csp-ui-final.log`；完整296項沒有為這個test-only等待再次跑八分鐘。
- `/home/user/artifacts/map3d-v0.1.0-csp/`：83張原回歸＋`csp/`內9張production GIS／GPX／player，共92張mock-network PNGs，不進Git。已開啟三寬度production GPX、390px GIS及等待WebGL就緒後的1440px player。當時觀察到768px GPX操作提示被固定設定卡遮擋；**後續GPX版面增量已修正**（[根因與317＋27新回歸](gpx-model-layout.md)）。本頁保留CSP增量當時的296＋27數量與92張截圖，不重新宣稱全部是在本輪建立或全APP版面無缺陷。

## 部署前仍需做

- 經授權正式部署後檢查edge response、SPA routes／404／cache／analytics、Arena嵌入、真provider CORS／redirect／失敗降級與downloads；不能用本地preview取代live驗收。
- 新增provider／tile subdomain／worker／遠端腳本時，同時審查CSP、更新契約與production測試；不能為一個錯誤直接改成https:／*／unsafe-eval。
- Production自帶上游lottie含eval的build warning仍可見，測到的產品流程沒有執行該路徑；不因此允許unsafe-eval，也不保證任意未用上游功能可在政策下運作。
- CSP是降低風險的一層，不取代輸入驗證、資料權限、URL分享私隱或dependency修補；仍無帳號／認證／加密保證。Production audit0，full仍12moderate／0high／0critical開發依賴例外，沒有新增依賴、force override或公告抑制。
- 真Safari／Firefox／iOS／Android／screen reader、完整GIS／LoD2、獨立CAD桌面及GeoLibre／TopoExport同範圍比較仍未完成。整個APP尚未全部完成。

## Hipped continuation — 2026-11-03

The unchanged built-production policy passed39 browser checks (+3 hipped, one per width) within the same complete run as386 dev checks. Native Overpass/elevation→WebGL→metric DXF verifies the four-slope fixture's six upward faces and two ridge endpoints at10m, with8m eaves and2m raised bottom. No unsafe-eval/blob-script allowance, CSP origin expansion, disabled web security or pageerror filtering. This is mocked-network local built-dist evidence, not live/deployed CSP certification. Details: `hipped-roofs.md`.

## Explicit hipped ridge continuation — 2026-11-03

Unchanged policy now passes42production checks (+3ridge, one per width) in the same complete run as404dev checks. Additional native Overpass building with ridge=N conflicting with orientation=along exports six roof faces, two13m peaks with equal east coordinates and a2.2264m northward ridge, proving direction precedence rather than a silent default. Existing39cases retained, positive flows zero violations/pageerrors. No policy/origin expansion or web-security bypass. See `hipped-ridge-direction.md`; mock/built-dist is not deployed/live certification.

## Hipped boundary-node continuation — 2026-11-03

Exact unchanged production policy passes45checks (+3nodes, one per width) within the complete422dev+45production run. New native Overpass eight-node rectangle actually exports ten roofs/eight14m eaves/two16m peaks with whole-side east-west default axis; no fake scene injection or new source permission. Existing42production cases retained, zero positive-flow violations/pageerrors. Local mocked built-dist, not deployed/live certification. See `hipped-collinear-nodes.md`.

## CAD metadata continuation — 2026-11-03

All45built-production cases and422dev cases rerun after clean install of the hash-guarded dxf-writer patch. No policy/origin/bypass change. Three production-native DXF downloads are additionally preserved and audited together with48dev building downloads by independent Python/ezdxf after raw-reference checks. Python runs only in tests/CI, not in browser/backend; no new script/CDN permission. This is local mocked-network evidence, not deployed/live desktop-CAD compatibility. See `cad-conformance.md`.


## DEM完整性後續 — 2026-11-03

目前完整437dev＋48production-CSP通過；production新增三寬度原生null主來源→完整OpenTopoData備援、50–50m來源標籤及既有CAD下載，不使用dev imports、不增加connect-src或任何header例外。既有攻擊阻擋／零正向CSP違反保留。沒有部署，live headers／provider CORS未驗收。見 `terrain-elevation-integrity.md`。


## 場景內復原後續 — 2026-11-03

目前455dev＋66production-CSP PASS，新增18built原生三寬度建築partial／道路error／DEMerror→場景內逐層重試、重複按鍵防護、私人備份內容保持及真DXF高度讀回。production只DOM／localStorage／下載，不動態載入dev原始碼；原enforced header／origin清單及攻擊阻擋不變。舊player頁在新復原流程導航前亦檢查零違反，新增流程再檢查。仍未部署；見 `scene-data-recovery.md`。
