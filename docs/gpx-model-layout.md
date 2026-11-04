# GPX 模型設定：提示遮擋、短螢幕與可收合卡片

2026-11-03（香港） · v0.1.0 · `arena/67142253-map3d` · © SCOUT SYSTEM

## 實查，不用猜

上輪production截圖顯示768px操作提示被設定卡遮住。這輪重開參考政策 [AGENTS，206cb0c](https://github.com/playerkousas-rgb/readme/blob/206cb0c24d028651d804ec19942dc9791b499fdd/AGENTS.md)，讀本地README／SCOPE／APP_AUDIT與`App.tsx`、`GpxSpace.tsx`、TopNav、BottomButton、global CSS、既有responsive-scene實作。環境沒有browser.open，改用fetch_page讀參考頁；APP則用真Chromium及原始碼核對，沒有把文件當作供應商或外部產品實測。

**原生DOM重現：768×900**，提示文字矩形x228.39–560.61、y64.19–98.19；其75%寬度位置的elementFromPoint命中`Layout repro`設定卡標題，而非未遮擋的scene。原提示本來pointer-events:none，所以不能單靠「提示本身沒有被hit」證明遮擋；真正證據是命中另一張覆蓋的卡片及上輪截圖。記錄：`/tmp/map3d-gpx-layout-before.log`。

原因是兩個互不知情的fixed元素：提示以50%視窗寬置中，設定卡在右上；僅在≤720px把GPX提示隱藏，沒有解決768px。手機雖沒有重疊提示，卻完全失去該提示。這不是先前定向相機palette／BottomSheet的同一個問題。

## 實作

- **GPX提示改為設定卡內正常排版的段落**，各寬度都能閱讀／捲動，不再用另一個fixed pill穿過設定卡。不改legacy map的scene hint／Steps。
- 設定卡成為有翻譯名稱／描述的`section` region，可Tab進入再使用原生捲動與表單導航；不是modal，不設focus trap。
- 三個native range有對應的`aria-label`及帶單位的`aria-valuetext`；range、STL與補海拔按鈕至少44px高。沒有自製slider、複製鍵盤事件或新增套件。
- 卡片含padding計算border-box；桌面外寬保留292px，手機兩側保留safe inset。max-height給Back／Export列留下空間；手機也受48dvh限制並獨立overflow-y:auto。長無空格track name以anywhere換行，**不截斷GPX名稱、模型資料或匯出檔名來源**。
- 初次resize回歸另外抓到Chromium有時先更新實際viewport／bottom buttons，卻暫留舊dvh值：320×568時卡片仍高432，bottom494，與top492的按鈕相撞。只等兩個animation frames在完整負載下仍重現，**沒有改成忽略重疊或降低斷言**。將安全上限改成fixed containing viewport的百分比計算，48dvh只是手機額外限制；再完整回歸通過。這不保證所有手機browser chrome／keyboard／visualViewport時序都已驗收。
- 觀看新截圖時發現手機展開卡片會遮住模型，所以新增翻譯的**收合／展開設定**按鈕，原生button＋aria-expanded／controls、Enter／Space、44px及既有focus ring。隱藏的是設定body，不是canvas或模型；參數仍保存在App state，重新開啟不重設。新GPX成功匯入會重新展開。收合時保留全域Export／Back，可讓模型中心接受pointer hit。

**不是重新設計GPX camera或sidebar。** 展開卡片仍是overlay，可能蓋到模型，手機較低的控制需在卡片內捲動；需要看完整模型時先收合。沒有宣稱展開時canvas完全不被遮擋，也沒有以隱藏必需控制假裝修好。

## 測試

新增 `scripts/verify-gpx-layout-ui.mjs`，接在原有GPX→DXF下載之後、既有課程等回歸之前，390／768／1440各七項，共**21項新增browser checks**：

1. named scrolling region、in-flow hint完整可達、無horizontal overflow、卡片不與nav／Back／Export相撞，實際bottom action hit test。
2. 原生Enter／Space收合／展開，焦點保留、隱藏sliders退出accessibility/tab tree、參數保留、收合後canvas中心真elementFromPoint。
3. 從region Tab到toggle再到range；三個ArrowRight實際更新1.6／3.5／4.5及value描述，44px與range hit test。**真下載binary STL並回讀triangle records／finite vertices，底板頂面含4.5mm**，不是只確認按鈕變色。
4. 真resize至320×568、390×320、568×320、844×390；提示／三slider／STL可捲達，底部列仍可hit。等待render frame不是將錯誤filter掉。
5. 合成safe insets：top24／bottom20／left8／right8，檢查後finally清除；不冒稱實體notch測試。
6. 真語言切換，中英文提示及控制名稱／數值描述仍存在。
7. 1,125字元連續track name保留完整DOM文字並換行；缺海拔提示／補值按鈕及設定仍可達。這是layout分支，**沒有在此新增測試中呼叫live elevation service**。

既有production CSP gate仍**27項**，加強GPX步驟以確認真built-dist下三slider及卡片內提示可用；正常flows仍零CSP violations／pageerrors，原生阻擋與真DXF／GLB／STL下載保留。未放寬policy。

### 最終本地結果

- **966/966 program、13/13 lint-contract、317/317 dev Chromium＋27/27 production CSP PASS**。新純UI沒有新增虛構DOM-free數量；原296項dev及27項production完整保留。
- `npm run verify`、`npm run check`、`npm run audit:deps`、`git diff --check`通過。
- Build **18files／1526.2kB／gzip470.0kB**，原budget2929.7kB不變。
- Prod audit **0**；full **12moderate／0high／0critical**開發依賴例外仍在，沒有新依賴、override或抑制。
- Logs：`/tmp/map3d-gpx-layout-{verify,check,audit}-final.log`、`/tmp/map3d-gpx-layout-ui-full.log`。最後整輪（含verify/check/audit＋browser runner）583215ms，沒有自動重試、移除pageerrors或把初期失敗當成功。
- Artifacts：`/home/user/artifacts/map3d-v0.1.0-gpx-layout/`，**109 PNGs**＝原83＋新17（正常3／收合3／中譯3／長名缺海拔3／短尺寸4／insets1）＋production9。已實際開啟最終390／768／1440正常版及390收合版；早期也檢視390×320。測試二進位／fixtures／圖片不進Git。

未新增backend／代理／帳號／外部font或shader，未推送、部署或跑遠端CI。這是synthetic GPX／mock network Chromium證據，不是Safari／Firefox／實機、完整screen reader、live資料、獨立CAD桌面、列印實物或GeoLibre／TopoExport同範圍比較。整個APP、完整GIS／LoD2及正式環境驗收仍未全部完成。
