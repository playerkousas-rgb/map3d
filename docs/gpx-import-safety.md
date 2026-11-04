# GPX 匯入防呆與海拔完整性

2026-11-03（香港） · v0.1.0 · `arena/67142253-map3d` · © SCOUT SYSTEM

## 來源與已確認的舊行為

重新讀取參考政策 [AGENTS，206cb0c](https://github.com/playerkousas-rgb/readme/blob/206cb0c24d028651d804ec19942dc9791b499fdd/AGENTS.md)，再讀本地README／SCOPE／APP_AUDIT、GPX parser／model geometry／elevation clients／App file handler及既有course/GIS的bounded讀取／stale-safe模式。環境無browser.open，以fetch_page讀頁面，APP行為使用真Chromium。

核對 [Topografix GPX1.1 schema documentation](https://www.topografix.com/GPX/1/1/) 的root／namespace、route、track／segment、WGS84／metric及decimal coordinate限制：latitude [-90,90]、longitude [-180,180)。trkseg代表邏輯連續區段，GPS中斷應另起segment；不是把所有trkpt跨段連起來。參考schema語義，沒有引入XSD library、抄整份schema或冒稱完整GPX驗證器。

舊源碼實際存在：

- parseFloat接受`22abc`數字前綴；只跳過NaN，Infinity／超出經緯度範圍仍可進模型。非法點被略過也可能接出假的捷徑。
- `<ele>`不存在／非法可被轉成0，與已知200m點形成假的海平面陡降。用max>min判斷有海拔，會把合法的全零／恆定海拔誤當缺資料。
- 全文件取trkpt，忽略root、namespace、trkseg邊界，可能接起互不連續的軌跡；stride抽稀還可能產生3001點。
- File.text()只有讀取前50MiB檢查，沒有實際串流byte guard、取消或latest-selection保護；延遲讀取可覆蓋新選檔／切換模式。
- DEM response中的null／非法值經finiteOr0成為看似成功的海平面補值。

## 新的明確支援子集

### 格式／數值

- 接受GPX1.1、GPX1.0 namespace及既有無namespace相容檔；支援prefixed elements，但只讀相同namespace的**直接子元素**，不從extensions／外層HTML搜出一條假軌跡。
- 只接受**一個track的一個segment，或一條route**。多個tracks／segments／routes、混合track+route明確拒絕，包括空的額外段；不選第一段或暗中連接。Waypoint-only沒有可製作的路徑。這是產品保守子集，不是聲稱標準禁止多段。
- 有version時只接受1.0／1.1；為既有簡檔允許省略version／creator。沒有完整XSD驗證或全部extension支援。
- xs:decimal形式需整個字串符合、有限且範圍合法；不接受NaN／Infinity／exponent／hex／逗號／尾隨文字。不略過壞點；**整檔拒絕，先驗證全部source points才抽稀**。
- 明列模型用海拔範圍**-12,000～10,000m**，含負高程；這是地面GPX miniature產品限制，非GPX schema的decimal上限，也不是航空／太空軌跡支援。
- 無可用水平位移（離首點皆≤1cm）或經度跨度>180°拒絕；不製作只有底板的假路徑，也不把跨換日線軌跡用局部平面拉成環球底板。沒有新增antimeridian unwrap。
- DTD／ENTITY在DOMParser前拒絕；XML syntax用native DOMParser檢查，重複／含子元素的ele拒絕。一般XML names不插入live HTML，只顯示文字。

### 資源限制與簡化

單一來源 `GPX_LIMITS`：**10,000,000 bytes UTF-8／50,000原始點／3,000模型點／4,000 UTF-16字元名稱**。

- 從舊50MiB放寬門檻改成10MB保守限制，是刻意收緊；並非仍宣稱所有50MB檔案都可讀。
- 讀取前拒絕非有限／空／超大size；讀取中累計真實bytes，錯報size不能繞過；fatal UTF-8 decoding不以替代字元默默修補。跨chunk的中文字仍可解碼。這不支援UTF-16／ZIP／壓縮GPX或streaming XML；bytes先有界讀完才建立DOM，依然會消耗DOM記憶體，不能當無限大檔載入器。
- 均勻index抽稀保留首尾、順序及唯一index，最多**恰好3000點**；不是保形Douglas-Peucker或峰值保存。UI顯示source→model點數及距離／爬升為近似值；統計依模型點，不冒稱原始高精度里程。名稱過長拒絕而非裁切，合法長名稱沿用換行。

### 缺海拔不等於海平面

- 每點有合法ele，即使全0／恆定負數也屬完整海拔，不顯示「缺海拔」補值提示。
- 任何點缺ele：保留missing count，**整個模型先平放**，不把已知／未知混為陡坡。部分缺失有獨立中英說明；全部缺失沿用flat模型說明。沒有估測缺失值或宣稱原始高度完整。
- 使用者主動補海拔仍會替換所有模型點的海拔，最多400個sample再按距離插值；不是只填未知的原始點。UI提示這個取代行為。
- Primary或fallback的null／非有限／超範圍數據現在拒絕；primary失敗可走既有fallback，兩者都無資料就報錯並保留原track。合法全0 provider結果仍可成功。沒有新增服務／origin／代理，沒有宣稱live覆蓋或精度驗收。

### 非同步與私隱

`useGpxImport`：每次新選檔中止舊串流；提交的view／mode變更或unmount取消pending讀取。發布前檢查generation／active／AbortSignal及player hash，舊success／error不能劫持新模式。保留同檔重選、drop與picker共用handler。錯誤保存翻譯key並以role=alert顯示，切語言可即時翻譯。沒有關閉來源驗證或用timeout重試掩蓋race。

檔案本體在browser本地處理，不上傳至新backend；**主動補值仍會將抽樣座標傳到既有公開elevation API**，需自行評估行蹤私隱。這不是加密／帳號權限／機密儲存認證；原可選analytics與course sharing邊界沒有改寫。

## 本輪測試與證據

- 新增 **66 program checks**：嚴格decimal／邊界、原始點全驗證、完整／缺失／部分海拔、source／model budgets、首尾／順序、統計、antipodal haversine clamp、UTF-8真bytes／false size／chunk分割／cancel及mock DEM null/fallback/全部失敗不改原資料。Node不冒充DOMParser。
- 新增 **21 dev-browser checks**（390／768／1440各7）：每寬度22個native XML fixtures、真file input拒絕／同名檔重選復原、翻譯alert／合法零海拔、部分海拔warning與真正binary STL回讀、多segment拒絕、真3001點→3000可見近似提示、延遲File.stream的latest selection及切換模式取消。Race測試用真File input、只延遲來源stream，不修改app／忽略pageerrors。
- 新增 **3 production-CSP checks**（每寬度1）：native partial GPX→flat warning→真STL下載，最大Y=9mm（4mm底板＋2mm track＋3mm marker）；不會產生200m假落差。使用built dist＋真hosting header，沒有給eval／inline script額外權限。原27項保留，正向流程仍零CSP violations／uncaught pageerrors。
- 完整回歸最終 **1032/1032 program、13/13 lint、338/338 dev Chromium＋30/30 production CSP PASS**（不是368項全部跑在production）。`npm run verify`、`npm run check`、`npm run audit:deps`及`git diff --check`通過。
- Full run初期在既有GPX layout的合成insets setup撞到resize：獨立rect reads跨越media query／inset更新，panel舊top58與nav新bottom76被混讀。把真resize與第二個inset條件分開，以render frames同步，**保留所有幾何／hit-test斷言**；沒有重寫app佈局、跳過檢查或自動retry。最後完整一輪成功，641422ms含verify/check/build及runner。
- Build **18files／1530.6kB／gzip471.8kB**，budget2929.7kB不變；新runtime依賴0。Prod audit0，full仍12moderate／0high／0critical，不force override／抑制。
- Logs：`/tmp/map3d-gpx-safety-{verify,check,audit}-final.log`、`/tmp/map3d-gpx-safety-ui-full.log`；artifact root `/home/user/artifacts/map3d-v0.1.0-gpx-safety/`，**121 PNG**（前輪109＋新native9＋production partial3）。已開啟三寬度partial及390多段拒絕圖；測試使用synthetic GPX／mock services，圖片與binary不進Git。

## 仍未做

多段獨立網格／多軌選擇、跨換日線／完整geodesic投影、峰值保形抽稀、原始里程精算、其他GPX extensions與大型streaming XML；原3D幾何／print watertight認證亦未完成。本輪不是完整GIS／LoD2、實機／Safari／Firefox／screen reader、live DEM／CORS／provider可用性、獨立CAD／實物列印或外部產品截圖比較。無commit／push／部署／遠端CI，整個APP尚未全部完成。
