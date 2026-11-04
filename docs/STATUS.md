# map3d 工作進度與待辦

更新：**2026-11-04（香港時間）** · 工作分支 `arena/67142253-map3d` · v0.1.0

> 這是原始碼與本地測試的進度，不是正式環境驗收證書。本輪沒有部署、推送分支或執行遠端 Actions。整個 APP **尚未全部完成**，不以猜測百分比表示進度；模擬網絡測試不能當作供應商可用性證明。

## 本輪完成：建築／GPX完整模型取景與復位操作

使用者確認優先補實際APP功能，本輪重新檢查選區／匯入→3D→匯出。建築模式不再以固定原點相機開場；建築與GPX共用真模型bounds取景、完整模型／俯視／縮放44px控制。GPX按完整模型會收合遮住畫面的設定卡，保留參數並可重新展開；不改定向／player相機或course資料。

**1786 program／13lint／13writer patch／完整521dev＋120built CSP PASS**，新增70／30／30，舊測試不刪。原生鍵盤連按、右鍵pan及復位後逐byte相同PNG驗真相機；12對實際STL下載在改視角前後逐byte不變。**17CADfixtures＋9negative＋63真DXF PASS**。三寬度與短螢幕、雙語、hit-test／設定及匯出不重疊均驗過。

[實作、固定來源、取景公式、失敗記錄及全部證據](model-camera-controls.md)。最終verify→check→完整dev→built production→CAD→audit同chain exit0／1563516ms（約26分04秒），是最終GPX收卡／boundingBox cache修正後的全新重跑。build18files／1544.9kB／gzip476.4kB，原cap不變；prod audit0／full12moderate。原193圖＋24張新增相機圖、63DXF保留；最後390／768／1440畫面已開啟確認。

無新依賴／provider／backend／proxy／CSP origin，CI20／10min及分階段規則不改；**遠端CI runtime／部署／實機仍未驗收**。既有Nominatim公開上線blocker與完整LoD2等未完成項不變；未commit／push／部署，不冒稱整個APP全部完成。

## 先前完成：雙坡／單坡屋頂 roof:levels=0 不再當缺值

| 工作 | 實際完成與邊界 |
|---|---|
| 真缺口 | gabled／skillion用`levels*2.2 || angle/default`，把有效0丟掉，可能多出屋頂／總高、降低eaves、誤報缺方向或拒絕高底部。 |
| 修正 | 缺值用undefined、零保留0；沿用APP既有height→levels→angle/default優先序，不聲稱完整上游priority。缺／壞資料、舊cap、正值與其他roof不改。 |
| 兩場景／匯出 | 零rise真平頂、正確total／min_level與底高、holes／原tags保留；不存在的非零skillion方向錯誤不再誤報。 |
| 完整回歸 | **1716 program／13lint／13writer patch／491dev＋90production CSP PASS**，新增94／12／3，所有先前案例保留。 |
| 獨立CAD | **17fixtures＋9negative＋63真下載 PASS**；新增2個zero fixtures，原63下載另核對平頂24／26m與原angle30m，raw ownership無repair。 |

[源碼、0與null／undefined的界線、before失敗與完整證據](zero-roof-levels.md)。完整UI→CAD→audit同chain exit0／1152500ms（約19分13秒，不含另跑verify/check）；check PASS，build18files／1542.0kB／gzip475.7kB，prod audit0／full12moderate。193PNG＋63DXF，三寬度受影響畫面已開啟；本地字型缺字補妥後42項focused亦過。

本輪無新依賴／provider／proxy／backend／CSP origin，不改CI20／10min排程；未commit／push／部署／遠端Actions。既有Nominatim營運政策、完整LoD2、實機／外部產品畫面對照等仍未驗收，整個APP未全部完成。

## 先前完成：四坡屋頂 roof:angle 高度推導

| 工作 | 實際完成與邊界 |
|---|---|
| 新功能 | 無洞、四個真角的合法投影矩形可由roof:angle推導四坡；沿用height／levels優先序、方向／共線節點、roof-inclusive總高及架空檢查。 |
| 真源碼 | OSM2World固定revision的tan(angle)×頂點到有限屋脊線段最大距離，不猜width/2；有界適配，不是四個坡面精確等角或完整LoD2。 |
| 兩模式／提示 | legacy與UTM皆造斜屋頂／實際DXF；geometry-resolved高度metadata不改OSM tags。雙語fallback不再誤稱所有angle-only不支援。 |
| 本地證據 | **1622 program／13 lint／13 writer patch PASS**；完整**479dev＋87production CSP PASS**，最後同步／文案／排程修正後另跑24affected dev＋18search及完整87production，不混稱同次chain。 |
| CAD／CI | **15fixtures＋9negative＋63真DXF PASS**；舊14fixtures保留。CI仍20／10min，把完整built-production移到CAD job、取同次dist再驗全部下載；預設local runner仍跑兩階段。 |

[固定源碼、公式、成功與失敗記錄、排程及限制](hipped-angle.md)。無新runtime dependency／provider／backend／proxy／CSP origin；check PASS，build18files／1542.0kB／gzip475.7kB，prod audit0／full12moderate。三寬度場景與修正文案已開啟；主artifact193normal PNG＋63DXF，另保留失敗診斷圖。

原單job兩browser階段超時風險沒有靠增加上限／skip／retry掩蓋；額外並行無加速亦已撤回，搜尋矩陣現逐寬度並在主suite之前。**遠端Actions／artifact傳送與runtime headroom仍未驗收**。公開搜尋的供應商政策仍有下方blocker；整個APP未全部完成，未commit／push／部署。

## 先前完成：地點搜尋回應完整性與過期請求取消

| 工作 | 實際完成與邊界 |
|---|---|
| 真缺口 | parseFloat 接受部分數字；回應／bbox沒有完整驗證，清除與模式／頁面轉換未一致取消，並發start spacing未包住實際fetch。 |
| 修復 | 整批候選有限值／範圍／嚴格座標與bbox驗證、有界stream；非法資料不移圖／不快取為成功或空結果。編輯／Clear／Escape／地圖操作／模式／view／player／unmount取消與revision防晚回。 |
| 保留行為 | 明確submit、單結果auto-fly、多候選、純文字標籤、英／繁中、44px／16px手機控制、cache／attribution／browser-direct；無新provider／dependency／proxy／CSP origin。 |
| 完整回歸 | **1499 program／13 lint／13 writer patch／473 dev＋84 production CSP PASS**；新增72／18／18，所有先前案例保留。搜尋矩陣當時有界並行；後續已改為逐寬度、在主suite前執行，詳見最新四坡角度milestone。 |
| CAD與品質 | **14fixtures＋9negative＋63真DXF PASS**、raw ownership無repair；check與audit PASS，prod0／full12moderate。 |

[固定官方源碼、實作、政策與實測限制](place-search-safety.md)。193mock PNG＋63DXF，已開啟390／768／1440搜尋畫面。最終verify→完整UI→CAD exit0／1170965ms（約19分31秒，含CAD、不含另跑的check）；build18files／1541.3kB／gzip475.4kB，原cap不變。遠端CI未跑，本地時間不保證加上安裝／check後的20min遠端預算。

**上線blocker：** [Nominatim公用政策](https://operations.osmfoundation.org/policies/nominatim/) 的1req/s是全APP所有使用者合計，不是每分頁；另需開發者知情採用、識別／attribution及免bundle更新的服務切換。本輪的per-page queue沒有解決跨分頁／使用者總量與切換條件，不能當作公開服務合規核准；未擅加proxy／provider／部署。整個APP仍未全部完成。

## 先前完成：3D場景內逐層資料復原

| 工作 | 實際完成與邊界 |
|---|---|
| 真缺口 |進入3D後沒有資料重試入口；ready-but-partial建築／道路未顯示failed/total。原先建築／道路已正確顯示error，並非所有失敗都假顯示0。 |
| 新功能 |場景內個別重試建築／道路／地形；部分失敗區塊明示數量。loading中aria-busy／disabled及雙重guard阻擋重複請求；idle說尚未載入。 |
| 保留資料與可達 |不切頁、不改課程／私人備註／選區／場景開關或重取其他層；原生英／繁中44px按鈕、live狀態及有名稱／multiplier的44px地形slider。 |
| 完整回歸 |**1427 program／13 lint／13 writer patch／455 dev＋66 production CSP PASS**，新增27／18／18，所有前輪案例保留。 |
| 真下載與獨立檢查 |dev／production新增6份復原DXF，最低地面Z50及建築屋面Z62保留；總**14fixtures＋9negative＋63真下載 PASS**，raw先於reader／audit／roundtrip。 |

[源碼核對、真原生復原、快取／替換政策與全部證據](scene-data-recovery.md)。181mock PNG＋63DXF，390／768／1440錯誤／復原畫面已開啟；verify→check→完整UI→CAD同chain exit0／1121773ms（含check及CAD）。build18files／1537.9kB／gzip474.3kB；cap不變，prod audit0／full12moderate。無新依賴／provider／origin／backend／proxy，未commit／push／部署／遠端CI。不是live、桌面CAD、完整LoD2、實機或外部畫面對照驗收，整個APP仍未全部完成。

## 先前完成：地形高程完整性、整批備援與明示平坦參考

| 工作 | 實際完成與邊界 |
|---|---|
| 真發現 |定向DEM把null／無效值變0米，備援亦未檢查結果數量，可能把海平面凹洞／不完整格網當成功。 |
| 修復 |兩來源全格網精確數量＋有限數值及既有−12000至10000m安全界線；真0／負高程保留。主來源任一格失敗即整批備援；雙失敗為error／null field／無成功來源；重試先清掉舊grid。 |
| 可見流程 |英／繁中載入及場景警告明示平坦參考≠測得0米；原生Retry可恢復真0米成功。明確flat helper也不再假標Open-Meteo。 |
| 完整回歸 |**1400 program／13 lint／13 writer patch／437 dev＋48 production CSP PASS**。新增58program／15dev／3production，所有先前案例保留。 |
| 真下載與獨立檢查 |新增6份50m備援／0m參考DXF；dxf-parser＋ezdxf核對絕對Z。總**14fixtures＋9negative＋57真下載 PASS**，raw先於reader／audit／roundtrip。 |

[供應商固定源碼、精確範圍與全部證據](terrain-elevation-integrity.md)。169mock PNG＋57真下載DXF，390／768／1440警告／來源畫面已開啟。完整browser→CAD chain exit0／993661ms（含CAD）；build18files／1536.0kB／gzip473.7kB，cap不變。prod audit0／full12moderate。無新依賴／provider／origin／backend／proxy，未commit／push／部署／遠端CI；liveprovider、外部產品比較、桌面CAD及實機未驗收，整個APP仍未全部完成。

## 先前完成：DXF原始owner／handle修正與獨立CAD gate

| 工作 | 實際完成與邊界 |
|---|---|
| 真發現 |dxf-writer把3DFACE owner指向BLOCK而非BLOCK_RECORD、BLOCK owners為0、plot-style硬編碼1。ezdxf會在讀入時自動改owner，讀後audit0並非原始引用正確。 |
| 修正 |固定writer1.18.4，postinstall對Drawing／Layer作精確SHA256防漂移小patch，正確record ownership及null390；仍用writer序列化，不寫新encoder／不改輸出文字。check／build／dev guard，乾淨npmci驗證。 |
| 獨立驗證 |13patch契約＋Python3.11／ezdxf1.4.5：14應用匯出fixtures、9損壞拒絕控制、51份真瀏覽器DXF全過。先raw引用再讀入，audit0errors／0fixes，重新存讀座標不變。非桌面CAD驗收。 |
| 完整回歸 |原**1342 program／13 lint／422 dev＋45 production CSP**全新重跑；browser＋CAD同chain exit0／899269ms（含CAD）。無skip／過濾pageerror／CSP放寬。 |

[源碼、失敗重現、安裝防護、獨立CAD與全部限制](cad-conformance.md)。154mock PNG＋51真下載DXF，三寬度畫面已開啟；metadata由raw／工具而非畫面證明。CI新增獨立CAD job接同次browser artifact，原20min browser預算不變；只本地驗證，未執行遠端Actions。build18files／1535.2kB／gzip473.5kB，原2929.7kB cap不變；JS prod audit0／full12moderate，非Python安全認證。無新app依賴／provider／origin／backend／proxy，未commit／push／部署。整個APP仍未全部完成。

## 先前完成：四坡直邊共線節點、完整邊長選軸與底蓋分段

| 工作 | 實際完成與邊界 |
|---|---|
| 源碼 |讀pinned SimplePolygonXZ.getSimplifiedPolygon及RoofWithRidge使用方式；不照搬上游寬鬆dot／面積差容差，獨立嚴格四真角子集。 |
| 不誤退平頂 |四個真角可有有界近共線節點，不刪來源座標。預設按整條邊而非分段選軸；n節點→n+2屋面／2n牆。凹口／曲邊／折返／梯形不修成bbox。 |
| 拓撲 |成功n>4無洞map四坡底蓋投影已驗屋面三角形到既有bottomY並反向，保留牆邊分段避免新T-junction。其他／4點／hole caps與UTM開底不變；非全APP watertight認證。 |
| 完整驗證 |**1342 program／13 lint／422 dev＋45 production CSP PASS**，新增82／18／3；同次isolated exit0／863999ms。兩模式真DXF節點／ridge／面積及native production8eaves／10roof通過。 |

[來源、嚴格節點／投影限制與完整證據](hipped-collinear-nodes.md)。154張mock PNG，已開啟三寬度斜視及390px提示；微小節點／屋脊靠CAD而非整景像素證明，未作外部產品比較。verify／check／audit／diff通過，build18files／1535.1kB／gzip473.5kB，原2929.7kB cap不變；prod audit0／full12moderate。無新app依賴／provider／origin／backend／proxy，未commit／push／部署／遠端CI。整個APP仍未全部完成。

## 先前完成：四坡屋頂明確屋脊方向與優先序

| 工作 | 實際完成與邊界 |
|---|---|
| 直接讀源碼 |fetch_page／GitHub CLI重開pinned RoofWithRidge：slope direction→ridge direction→orientation；ridge tag沿屋脊，不再誤轉90°。沒有browser.open，不冒稱使用。 |
| 真實幾何 |只擴充矩形hipped，支援16方位／有限非負十進位bearing且須對齊真實邊；沿用1e-4與ridge containment，不吸附／bbox修形。40×20m的ridge=N真改為4m短軸，其他屋頂不變。 |
| 失敗政策 |有效高優先序忽略低標籤；壞的active方向保守平頂，不以低方向偷偷修復。洞口／零rise／架空／總高度語義不變。場景軸方位不是新增UTM真北校正。 |
| 完整回歸 |**1260 program／13 lint／404 dev＋42 production CSP PASS**，新增88／18／3。完整同次isolated exit0／898315ms；兩場景真下載獨立解析，正式版ridge=N覆蓋along得2.2264m短軸。 |

[來源、優先序、投影限制與全部證據](hipped-ridge-direction.md)。148張mock PNG，已開啟三寬度斜視及390px提示；小屋頂精度由CAD約束，不將畫面當外部產品比較。乾淨npmci／npmls、verify／check／audit／diff通過，build18files／1534.0kB／gzip473.0kB，原2929.7kB cap不變；prod audit0／full12moderate。無新app依賴／provider／origin／backend／proxy，未commit／push／部署／遠端CI。整個APP仍未全部完成。

## 先前完成：有界矩形四坡屋頂與真下載驗證

| 工作 | 實際完成與邊界 |
|---|---|
| 源碼 |讀OSM2World pinned HippedRoof／AbstractHippedRoof／RoofWithRidge及MIT LICENSE.txt；每端縮入min(width/3,.4length)，不是猜等坡度或length/3。 |
| 幾何 |投影後恰好四角無洞矩形、明確height／levels；2屋脊端點、6向上屋面三角形與eaves牆，保留屋頂總高度／架空底部。嚴格1e-4與ridge在真外環內的檢查，不以bbox修形。 |
| 保守失敗 |非矩形／holes／angle-only／缺rise／不支援方向保留原輪廓平頂，以component獨立中英提示。顯式0不誤報；同一物理矩形可能因兩投影差異有不同fallback數量。 |
| 完整驗證 |**1172 program／13 lint／386 dev＋39 production CSP PASS**，新增91／18／3。完整browser同次isolated exit0／625059ms；兩模式真DXF下載獨立讀回，正式版原生流程不放寬CSP。 |

[完整來源、支援範圍、投影限制與驗證](hipped-roofs.md)。文件同步後再跑verify／check／audit及diff check全過；build18files／1533.8kB／gzip473.0kB，原2929.7kB預算不變；production audit0，full仍12moderate。142張mock PNG，已開啟三寬度斜視及390px提示；屋頂很小，截圖不冒充精確幾何或外部產品比較。無新app依賴／provider／backend／proxy，未commit／push／部署／遠端CI。整個APP仍未全部完成。

## 先前完成：原生比例尺／來源註記分層，補回集合與提示

| 工作 | 實際完成與邊界 |
|---|---|
| 工作區核對 |檔案實際停在GPX milestone，前兩次回覆的集合／提示實作不在磁碟；已向使用者說明，補回並重建測試。不以舊聊天數字冒充本輪結果。 |
| 源碼／真比較 |讀Leaflet1.9.4 Control／Scale／CSS；390px local credit真換成兩行蓋住左下scale。比例尺改用公開bottomright，同corner原生stack使其位於credit上方，實測5px間距。保留m/km與全部版權，不加observer／固定高度猜測。 |
| 補回功能 |FeatureCollection內有界混合／巢狀GeometryCollection、all-child bounds／fit、properties／holes保留；8層／20k Geometry加原2MB／10k Features／150k positions，全局budget。壞／過深／empty-only本地檔原子保留舊層。提示移到map下正常flow，以useId連到button。 |
| 全新完整驗證 |實際磁碟baseline增加49program／30dev／6production；**1081／13／368 dev＋36 production CSP PASS**，同一isolated命令exit0／約611.6s。與之前回覆數字相同但本輪重新跑出，不再累加。 |

詳見 [源碼、狀態核對、before／after及全部限制](map-footer-layout.md)。138張mock PNG，已開啟相同point fixture的390 before／after、三寬度sources及390短中文；完整browser run含臨時CJK字型。比例尺現在在右下方，極短尺寸仍需捲動，不保證全map與提示同屏。無新app依賴／provider／CSP origin／backend／proxy／export範圍；未推送、部署或遠端CI。

## 先前完成：GPX匯入防呆、海拔完整性與過期讀取取消

| 工作 | 實際完成與邊界 |
|---|---|
| 來源／驗證 | 核對Topografix GPX1.1的WGS84 decimal、root／namespace與連續segment語義；整檔驗證，不接受parseFloat尾隨文字、非有限或越界座標／海拔，不跳過壞點。不是完整XSD validator。 |
| 不接假路徑 | 只接受一個track segment或一條route；多track／segment／route明確拒絕。不虛構跨段連線，無水平範圍／跨換日線亦先拒絕。 |
| 不造假高程 | 有效恆定／全0仍有海拔；部分缺值整個模型先平放並獨立提示。DEM null／非法值改成失敗／fallback，不再當作成功0m，保留原資料。 |
| 有界／非同步 | 10MB UTF-8／50k source／3k model／4k name；串流真bytes與取消，抽稀保留首尾並顯示近似點數。新選檔／離開GPX取消舊read，不能覆蓋新模式。 |
| 驗證 | 新增66 program＋21 dev browser＋3 production，**1032／13／338 dev＋30 production CSP PASS**；native XML／file input／stream races及partial GPX真正STL回讀最大Y9mm，無200m假落差。 |

詳見 [GPX來源、嚴格子集、限制／私隱及真實驗證](gpx-import-safety.md)。121張mock-network截圖，已開啟三寬度partial及390多段拒絕圖。未新增依賴／代理／後端，無推送、部署或遠端CI。

## 先前完成：GPX提示遮擋、短螢幕與收合設定

| 工作 | 實際完成與邊界 |
|---|---|
| 真重現／源碼 | 768px提示位置命中另一張設定卡標題；App的兩個fixed元素互不避讓，≤720px原本直接隱藏提示。改成卡片內正常排版，不改legacy map提示。 |
| 可達控制 | named scrolling region、三個有名稱／單位的native44px slider；長名稱換行不截斷資料，短尺寸／safe inset保留底部Back／Export。完整負載另抓到dvh延遲更新，補百分比viewport安全上限後通過，未放寬hit test。 |
| 看模型／保留參數 | 新增中英收合／展開原生button、Enter／Space及focus保留；收合後canvas中心可hit，不清除參數／模型。展開仍是overlay，需要時收合，不冒稱canvas已扣除卡片。 |
| 驗證 | 新增21 browser，**966程式／13 lint／317 dev Chromium＋27 production CSP PASS**；STL真下載核對鍵盤調整後4.5mm底板頂面，原296＋27項完整重跑。 |

詳見 [GPX版面根因、實作、失敗修正與驗證](gpx-model-layout.md)。本輪109張mock-network截圖，最終三寬度及390收合版已開啟；不是live／實機／外部產品比較。無新增依賴、推送、部署或遠端CI。

## 先前完成：production CSP與built-dist瀏覽器驗證

| 工作 | 實際完成與邊界 |
|---|---|
| 真hosting政策 | vercel.json加入enforced HTTP CSP；production preview直接讀同一份header。不新增代理／backend／runtime依賴，未部署。 |
| 最小來源權限 | 腳本self-only，無unsafe-inline／eval／blob／data script；style-only unsafe-inline明確支援Emotion／Leaflet。精確列入實際provider origins，保留Arena/e2b嵌入例外，不冒稱nonce strict CSP或完整clickjacking隔離。 |
| 真實阻擋 | built production於390／768／1440通過GIS、GPX、定向、player及DXF／GLB／STL真下載；正常流程零CSP violation／pageerror，另以native probes證明inline／event handler／remote script／eval／base／未列fetch阻擋。外部供應商仍mock。 |
| 驗證 | 新增41程式／27production browser，**966／13／296 dev＋27 production CSP PASS**。原296項完整重跑；不是323項全部套production policy。 |

詳見 [CSP來源、style／preview例外、測試、部署與live限制](content-security-policy.md)。92張截圖（83舊回歸＋9production），已開啟三寬度production GPX；當時發現的768px GPX提示遮擋已在上列本輪修正，前輪記錄不等於本輪尚未完成。無推送、部署或遠端CI。

## 先前完成：有界金字塔屋頂與明確平頂fallback

| 工作 | 實際完成與邊界 |
|---|---|
| 源碼核對 | 固定OSM2World revision的PyramidalRoof／area centroid／HeightfieldRoof／Roof；apex用面積重心，不用bbox或頂點平均。保留MIT；不虛構此類roof:angle推算。 |
| 兩場景／CAD | 無洞凸外環＋明確roof:height或roof:levels，逐邊連到apex；牆到eaves，總高度／架空底部不重複加rise。共線邊／正反向／旋轉保留，沒有新依賴。 |
| 不支援可見 | 凹外框／中庭／無rise／angle-only保留輪廓、平頂總高度及洞口，以獨立flatPyramidalRoofs component數量在兩載入卡／場景設定提示；顯式零不誤報。不是完整LoD2或上游完整triangulation移植。 |
| 驗證 | 新增 **113程式 +18瀏覽器檢查**，總計 **925／13／296 PASS**；真正兩模式CAD下載核對四個centroid-to-eaves面、8m apex／5m eaves，及兩個真實平頂fallback／中庭洞口。 |

詳見 [金字塔來源、有界模型、fallback與下載驗證](pyramidal-roofs.md)。83張mock-network截圖，三寬度斜視與390px提示已開啟；不是供應商／實機／外部產品比較。無推送、部署或遠端CI。

## 先前完成：五格式匯出可見性一致

| 工作 | 實際完成與邊界 |
|---|---|
| 源碼根因 | 查看固定Three r173源碼：glTF預設onlyVisible，OBJ／STL及原DXF則traverse；原collector clone(true)也保留hidden subtree。這是合成hidden hierarchy重現，不誤稱Terrain switch設了visible=false。 |
| 一致入口 | 有效Object3D可見性含外部祖先，snapshot裁掉hidden descendants再交五個encoder；direct API同政策。marked群組／scene root不重複，world transforms及單位保留，不dispose共享資源。 |
| 不改地面政策 | Terrain off一直是壓平、不是隱藏地面；現在有兩語說明。DXF不含地圖影像／標籤／GIS疊圖；不是螢幕截圖或camera／material-opacity過濾。 |
| 驗證 | 新增 **50程式 +36瀏覽器檢查**，總計 **812／13／278 PASS**。真UI關閉／重開建築與DXF；direct／collected×五格式實際下載回讀，hidden descendants不混入，世界座標及12面cube正確。 |

詳見 [匯出來源、可見性政策與驗證](export-visibility.md)。無新依賴、推送或部署；77張mock-network截圖，已查看三寬度說明。這不是材質／動畫能力一致、實機／供應商／獨立CAD桌面或外部產品比較驗收。

## 先前完成：架空建築底部與垂直區間拒絕

| 工作 | 實際完成與邊界 |
|---|---|
| 源碼核對 | 固定revision的OSM2World LevelAndHeightData／測試：min_height優先，否則façade高度／總層數×min_level；保留MIT與來源。沒有搬入缺層數猜測或不一致高度修補。 |
| 共用兩場景／CAD | min_height只抬高內外牆底與map底蓋，屋頂／總高度不加clearance；min_level按扣屋頂後的每層高度計算。UTM仍開底、最小terrain datum，不保證每點坡地淨空／支柱。 |
| 安全拒絕／可見 | 真場景投影與屋頂跨度檢查；無效垂直區間整relation拒絕，非字串metadata不靜默當0；仍claim tagged outer，防止回填至地面。兩語略過提示涵蓋區間。 |
| 驗證 | 新增 **99程式 +18瀏覽器檢查**；總計 **762／13／242 PASS**。真正兩模式下載CAD：5m明確底部／4m層數底部、屋頂不變、洞口與底蓋政策；三寬度截圖已查看。 |

詳見 [架空底部來源、模型與驗證](building-elevation.md)。無新依賴、推送或部署；74張mock-network截圖不是供應商／實機／外部產品比較。完整parts／LoD2、CAD桌面、live providers與部署驗收仍開放。

## 一、先前完成：單坡屋頂與缺方向提示

| 工作 | 實際完成與邊界 |
|---|---|
| 原始碼核對 | 查看OSM2World固定revision的SkillionRoof／測試／方向解析／座標與MIT授權；轉換+Z北到本APP的-Z北，不照搬其邊線snapping或Java依賴。來源／許可記入第三方聲明。 |
| 共用單坡模型 | `roof:shape=skillion` 在兩場景及現有mesh匯出使用單一有向平面；16羅盤／數字方位、全坡長angle推算、牆接面及中庭／內島保留。雙坡仍使用半跨距與中央屋脊。 |
| 不猜方向 | 正起伏但沒有有效下坡方向的skillion保留總高度平頂，兩種載入卡／場景設定分開顯示fallback數量，不當作輪廓略過；顯式零屋頂高度／角度保持零，也不誤報缺方向。 |
| 回歸 | 新增 **53程式 +12瀏覽器檢查**；兩種真正下載DXF逐三角形檢查坡面、洞口位置／淨面積及缺方向的平頂存在。總計 **663／13／224**，無新依賴。 |

詳見 [單坡來源、模型、實際下載與限制](skillion-roofs.md)。已查看三寬度斜視與390px兩種警告；所有網絡仍為mock／中止。這增加一種屋頂，不等於完成parts、其他屋頂或完整LoD2，也沒有實機／獨立CAD桌面／live provider／部署驗收。

## 二、先前完成：中庭內島與嚴格包含拓撲

| 工作 | 實際完成與邊界 |
|---|---|
| 最近父環 | 同一 multipolygon 的 outer／inner 建立包含 forest；角色必須交替，每個 outer 只接自己的直接 inner。支援中庭內島及 island 自己的洞口，不依 member 順序／方向猜測。 |
| 保守拒絕 | 相觸／交叉、outer 直接套 outer、inner 直接套 inner、orphan inner 仍整 relation 拒絕。這不等於支援 nested OSM relation 或 building parts。 |
| 預算修正 | 原先 relation 先去重再累計，與來源座標宣告不符；改為去重前累計 raw geometry.length，測試精確2,048／2,049及跨 member 重複點；不放寬原安全預算。 |
| 端到端回歸 | 新增 **150 程式 +12 瀏覽器檢查**；兩種場景／兩份真正 DXF 下載同時核對屋頂淨面積及指定位置的實心／空洞，舊200項瀏覽器檢查全部保留。前輪 **610／13／212** 通過，其後單坡完整回歸升至663／13／224。 |

詳見 [來源、包含條件、實際下載驗證與限制](building-islands.md)。62張當輪 mock-network截圖，已查看三寬度內島與390px載入警告。仍為部分LoD2，不是nested relations／parts／CAD桌面或實機驗收；沒有新依賴、推送或部署。

## 三、先前完成：建築中庭端到端保留

| 工作 | 實際完成與邊界 |
|---|---|
| 原始碼根因 | 既有查詢包含 relation，但兩個 collector 只讀 way geometry；地圖 Shape、兩種模型與底蓋均未傳遞 holes。查看 Overpass JSON 輸出及已安裝 Three ShapeUtils，按真實 members 結構修正。 |
| 共享解析 | 真正閉合的 way、分段／反向 outer 與 inner、數個互不相交外框；依精確端點拼接，不臆造封口。避免 tagged outer 重複填洞及 way／relation id 衝突。 |
| 幾何／CAD | 兩個場景都保留洞口；平頂／雙坡屋頂、朝中庭內牆及地圖底蓋共用已驗證 footprint。定向模式維持無底蓋，淨面積門檻與地面取樣含內環；DXF 仍用 dxf-writer 與公尺換算。 |
| 失敗可見 | 缺片／null／open／自交／相觸／角色無效／超限等輪廓整物件拒絕，兩種載入卡及場景設定顯示略過數量；不退回填滿外框。2,048 來源座標／65 環為新增拓撲安全預算，不是載入筆數上限。 |
| 回歸 | 新增 **91 程式 +12 瀏覽器檢查**；三寬度真實 UI 載入、兩模式 DXF 實際下載，獨立 parser 檢查扣洞面積。總計 **460／13／200** 於前輪通過，無新依賴（本輪完整回歸升至610／13／212）。 |

詳見 [中庭來源、實作、安全拒絕、驗證與限制](building-courtyards.md)。仍是**部分 LoD2**：building parts、nested OSM relations、完整屋頂及獨立 CAD 桌面互通尚未完成。截圖／網絡為 synthetic fixture，不是 live 供應商或實體裝置驗收。

## 四、先前完成：短螢幕／展開面板的場景操作修正

| 工作 | 實際完成與邊界 |
|---|---|
| 真實重現與根因 | 390×900 展開面板後，舊「重設視角」頂端 **-140px**，五個相機按鈕只有縮小可點。直接檢查 DOM hit test 與元件原始碼，確認固定垂直堆疊超出空間；亦找到桌面 ref 未綁定、提早返回而不發布面板寬度，以及 InfoPill 未轉交 Emotion `className` 的問題。 |
| 相機操作 | 改為可開關的 **相機控制**浮層，五個動作有中英文字標籤及 ≥44px 目標。原生 Popover 支援鍵盤／Escape／點外部關閉及焦點回復；無 Popover API 有可操作的非模態 fallback，不困住焦點、不新增依賴。 |
| 面板／安全區 | 依實際頂欄和可見 viewport 計算三個有序停靠高度，保留控制列與來源註記空間；短橫向用側欄，短高度讓標頭也能捲動。修正 notch 重複計入高度，兩種面板都發布尺寸、離開時清理；追蹤 visualViewport pan／shrink。 |
| 3D 構圖／長名稱 | Canvas 排除側欄寬度，相機依窄長寬比取景，避免中心落在側欄後面。非必要提示在空間不足時隱藏；長名稱僅視覺限制兩行，原文仍完整保存；來源註記不截字。 |
| 新增回歸 | **17 項**版面數學測試、**27 項**瀏覽器檢查。涵蓋五個動作、重複指令、中英切換、鍵盤與實際拖曳、五組短尺寸／旋轉、桌面 Canvas／面板非重疊、清理及私人草稿不變。 |

詳見 [重現座標、原始碼根因、行為、測試與限制](responsive-scene.md)。safe-area／visualViewport 和不支援 Popover 的情況是 Chromium 的模擬／能力分支測試，**不是實體手機或 Safari／Firefox 驗收**。沒有部署、新 backend 或新 runtime dependency。

## 五、先前完成：受支援 lint 工具鏈遷移（非零漏洞宣告）

| 工作 | 實際完成與邊界 |
|---|---|
| 官方相容升級 | ESLint **10.14.0**、@eslint/js **10.0.1**、TypeScript-ESLint **8.72.1**、React Hooks **7.1.1**、React Refresh **0.5.7**、globals **17.14.0**；套件 engines 明列 Node 範圍，沿用 TypeScript 5.7.3。沒有新 runtime dependency 或 React Compiler transform。 |
| 設定／程式遷移 | 使用原生 `defineConfig`，完整保留新版 Hooks recommended 規則。修正 **8 處新增錯誤診斷**：提交後才更新匯入 refs、面板命令／DOM 同步、衍生範圍、宣告式相機距離、非同步地圖材質 request tag／hillshade、外部載入事件與玩家切換；不是關掉規則過關。 |
| 規則回歸 | 新增 **13 項**真正透過 ESLint API 的正／反例；規則錯誤、相依警告、Node／browser globals 與忽略路徑都有檢查，納入 `npm run check`／現有 CI。 |
| 乾淨安裝 | `npm ci --no-audit --no-fund`、`npm ls --all` 通過；無 peer 衝突，不使用 `--force`／`--legacy-peer-deps`／major override。 |
| **未完成：清除 advisory** | 正式依賴 **0**，全依賴仍 **12 moderate／0 high／0 critical**。實查最新版上游仍要求 minimatch 10（鎖為 10.2.6），不能選公告修補版 **11.0.1**。**ESLint 受支援遷移已完成，minimatch 修補路徑仍受上游限制**；沒有隱藏 audit 或把成功退出當成零漏洞。 |

詳見 [版本、上游範圍、安裝失敗／修正與測試證據](dependency-security.md)。

## 六、先前完成：多分頁草稿保護與可重現的地圖卸載修正

| 工作 | 實際完成與邊界 |
|---|---|
| 多分頁寫入 | 有 Web Locks 的同源分頁使用同一把寫入鎖，在鎖內重新比較已讀版本原文；兩頁同時修改時，第一個成功寫入，另一頁保留 RAM 資料並暫停自動儲存，不再默默互相覆蓋。這是合作式協議，不約束繞過鎖的舊版／其他程式。 |
| 衝突處理 | 提供此頁 JSON 備份、已存版本原文下載，以及需確認的「載入已存版本／以此頁取代」。鎖等待期間若版本再變更，舊確認失效；不自動合併。載入後還原場景、地圖矩形與可用操作，清除過時 undo／redo；無法讀取的外部資料不能清掉此頁草稿。 |
| 刪除／背景恢復 | 監聽 storage（含 clear）、focus、visibility 與 pageshow，重讀目前值而非盲信事件內容。外部刪除也視為衝突，舊頁不會自動把刪掉的資料寫回。 |
| 等候鎖／離頁 | 等候時顯示尚未完成，仍可下載記憶體備份；新修改會取消舊排隊請求，避免大 payload 無限積壓。dirty 草稿有原生 beforeunload 提醒，但行動系統回收仍可能不觸發，**不能代替備份**。 |
| 玩家隔離 | 開玩家連結會取消待寫入請求，不把公開課程存成私人草稿；返回後保留未儲存內容、警告與重試。玩家期間外部變更也不替換私人快照。 |
| 無鎖瀏覽器 | 明確顯示「只開一個編輯分頁」警告；降級為比較後寫入，**不是原子操作，也不保證並行寫入安全**。 |
| Leaflet 根因修正 | 新增真實 zoom → 玩家連結 → keyed map remount 壓力案例，成功重現 `_onZoomTransitionEnd` 在移除 `_mapPane` 後呼叫 `_move` 的 stack。選圖地圖改用公開 `zoomAnimation={false}`：縮放即時完成，避免該 CSS 縮放延遲回呼。沒有改 Leaflet 私有欄位、吞錯或延後操作掩蓋問題。 |

詳見 [完整協議、限制、根因與證據](draft-concurrency.md)。當輪重新開啟參考政策 AGENTS，並直接檢視安裝中的 Leaflet 1.9.4／React-Leaflet MapContainer 原始碼；沒有依猜測修補。

## 七、先前完成：課程編輯／備份限制一致性

先前列為 P1 的「能編輯、卻不能重新匯入備份」缺口，現在已補上正常編輯入口及匯出防線。

| 工作 | 現在行為／證據 |
|---|---|
| 共用課程限制 | 課程新增／編輯／移動／取代／undo／redo 在套用前驗證；最多 **2,000 個點（含起終點）**、每文字欄 **4,000 UTF-16 單位**、備份 **1,000,000 UTF-8 bytes**。部分 emoji 佔兩個 UTF-16 單位；不把字數當檔案位元組數。 |
| 拒絕修改具原子性 | 超限、無效座標／分數／欄位、重複 ID 不改動原課程、選取、undo／redo 或 localStorage，只顯示可關閉的中英雙語提示。限制已滿時，刪點／縮短內容仍可釋放空間；2,000 點時移動既有起點仍可成功。 |
| 可往返的 JSON | 一般使用漂亮排版；若只有排版空白令備份超限，改用 compact JSON，而非刪資料。**剛好 1,000,000 bytes** 的多位元組備份可下載、再匯入；超過一 byte 即拒絕。 |
| 匯入正規化也受限 | 舊格式會補 ID／預設欄位，因此「原檔少於 1 MB」不保證正規化後仍可備份；現在匯入前也檢查正規化的完整備份，失敗保留原課程。 |
| 防禦性匯出 | 兩個 JSON 下載入口共用安全序列化；即使外部程式繞過正常編輯入口放入無效狀態，也不產生已知無法重匯入的檔案，而是回報問題。原始損壞草稿下載仍刻意保留原文，不經課程序列化。 |
| 保留空白欄位 | 使用者明確清空的代碼，以及空的 meet／cutoff／sos，現在會原樣往返；只有舊輸入「缺少代碼」時才自動編號。私人備註、CJK／emoji、引號／換行／反斜線亦有逐欄比較。 |
| 介面修正 | 首頁與面板使用相同課程名稱限制，不再由首頁 80 字上限先截短。截圖發現警告變高會遮到焦點欄位，已在版面更新後把欄位與標籤捲入可見區；亦修正輸入框的 border-box／最小寬度，避免超出編輯卡片。 |

詳見 [課程限制與備份契約](course-budgets.md)。這不是任意超大課程的支援承諾，也不保證 2,000 點在所有實體手機都流暢。

## 八、先前草稿修正，持續回歸

- 兩個檔案選擇器具 stale-read 保護：新選檔、課程變更、模式切換、卸載與玩家連結會令舊讀取失效，舊失敗也不蓋過新成功。
- localStorage 滿額／禁止寫入時有警告、下載目前 JSON 及重試；只有瀏覽器接受寫入才清除警告。
- 玩家模式以私人記憶體快照還原尚未儲存的課程、場景及範圍，後續玩家連結不覆蓋快照；公開模式不寫入私人草稿。
- 已存場景／範圍有型別與邊界檢查，空課程保留名稱／活動資料；成功儲存後重新整理可還原可用範圍。
- 無法讀取的原始草稿不被自動覆蓋；提供原文下載，必須確認才取代，失敗寫入仍保留復原資料。

**仍有限制：** 記憶體快照只保護同一頁存活期間；儲存失敗後關閉、重新整理或分頁被系統回收，不能保證復原。localStorage 不是外部備份。原文下載可能本來就是損壞 JSON，也可能含私人備註，請先保存，不能承諾直接匯入。

## 九、累計完成／部分完成矩陣

| 項目 | 已完成且本地驗證 | 尚未完成／未驗證 |
|---|---|---|
| 地形／等高線（Task 1） | 參考 GeoLibre 原始碼的 Horn hillshade 315°／45°、10 米 mesh-aligned 等高線、開關、向上法線與真實拾取 | 外部產品同範圍截圖比較、真實 DEM 精度、Whitebox smoothing／WASM；插值不是測量精度。 |
| 建築／CAD（Task 2） | 共用雙坡／單坡／有界金字塔／矩形四坡（含明確屋脊方向／共線邊節點）、OSM 高度語義、兩場景的 multipolygon 中庭／內島與拒絕警告；按要求使用 dxf-writer（精確版本／hash防護ownership patch），R2010／3DFACE、軸向／單位換算；真下載由dxf-parser與ezdxf raw引用／audit／roundtrip檢查 | **僅部分 LoD2**；building parts、巢狀 OSM relation、完整屋頂／拓撲、CAD 桌面互通驗收未完成。不是 BIM／保證封閉實體。 |
| GIS（Task 3） | **10 筆資料集／7 個供應商／8 個瀏覽器圖層設定＋2 個下載參考**；browser-direct、來源註記、重試及受限本地 WGS84 GeoJSON，含有界GeometryCollection／完整bounds與原子保留 | **不是 10 個完整渲染供應商**。原始 WorldPop TIFF、HydroRIVERS ZIP／Shapefile、人口統計與 live CORS／覆蓋未完成；沒有 Vercel 資料代理。 |
| 課程／分享 | 編輯／undo／redo、正確地面拾取／刪點、JSON／DXF、實際剪貼簿分享、新連結去除私人備註、唯讀隔離；已補齊正常入口的備份預算 | 合作式多分頁鎖／衝突處理已完成；無鎖並行、跨裝置／雲端同步、自動合併／版本歷史未提供。舊分享 URL 不能撤回，唯讀不是權限系統。 |
| UI／無障礙 | 390／768／1440 截圖、44px 操作、可捲動面板、鍵盤握把、原生模態與焦點回復；新增可見相機浮層／降級、短尺寸／旋轉／捲動、Canvas 排除側欄及完整來源註記 | 完整 screen reader、Safari／Firefox、實體觸控及不同螢幕高度矩陣未驗收；部分歷史截圖缺中文字，本輪完整run已加臨時CJK字型。滿高面板提示裁切／相機按鈕離屏的已重現路徑本輪已修正。 |
| 輕量／安全／版本 | 建置預算、版本／manifest／九個圖標／OG、未知 Host／假 `.env` 拒絕；正式依賴 audit 0；受支援 ESLint 10／完整新版 Hooks 規則；production CSP設定與本地built-dist驗證 | 開發工具 **12 moderate／0 high／0 critical**；minimatch 上游相容修補路徑、部署後 CSP headers／live compatibility、OG 與安裝體驗未驗收。 |
| CI／上線 | 已配置 check、audit、Chromium／真下載artifacts及獨立Python CAD artifact接力，等價命令本地通過 | 遠端 Actions、正式部署與上線 smoke test 未執行。 |

相關：[範圍與單位](../SCOPE.md)、[稽核記錄](APP_AUDIT.md)、[資料來源](data-sources.md)、[本地 GIS／分享](local-data-and-sharing.md)、[安全例外](dependency-security.md)。本輪重新開啟先前已讀 `206cb0c` 版本的參考政策 AGENTS；沿用適合現有 browser-only APP 的要求，不引入無關 backend／登入架構。

## 十、前輪footer實際驗證（歷史紀錄）

- 本輪新環境 `npm ci --no-audit --no-fund`乾淨安裝；無新增app依賴。臨時Chromium153.0.0／CJK字型只在ignored cache與tmp，不進root manifests／app／Git。
- `npm run verify`：**1081／1081通過**，重建49項mixed collection／全局budget／bounds／CRS／空檔及mock remote contracts，原1032項保留。不是在前兩次回答數字上再累加。
- `npm run verify:lint`：**13／13通過**；`npm run check`完整lint／設定契約／guard／verify／release／TS／build通過。既有i18n Fast Refresh／上游lottie eval warning未隱藏。
- Build **18files／1531.1kB／gzip472.1kB**，低於原**2929.7kB**預算；`git diff --check`通過。
- Audit：正式依賴**0**；full仍**12moderate／0high／0critical**，不是零漏洞。
- **同一次完整isolated：368／368 dev＋36／36 production CSP PASS**，exit0／約611.6s。較實際GPX baseline338＋30增加30＋6，均含恢復集合／提示及新scale測試；所有舊case完整保留，沒有skip／retry／過濾pageerror。
- 三主寬度390／768／1440×900及真正height320中文resize，驗scale與credit都在map內、scale有5px native gap、每個來源link每行及scale可hit。既有兩頁Web Locks／1MB備份／24次Leaflet週期、短尺寸／合成insets及全部真下載仍保留。合成safe-area／visualViewport不是實機認證。
- **138 PNG**：`/home/user/artifacts/map3d-v0.1.0-map-footer/`（舊121＋dev12＋production3＋before／after2）。已開啟390真before／after及三寬度source／390短中文圖；完整run用臨時CJK字型。Neutral mock tiles不是live底圖或外部產品同角度比較。
- 重新GitHub取回Natural Earth pinned ca96624三檔，新validator／bounds實跑177countries／24lakes／13rivers通過；解析相容不是live browser CORS。
- Logs `/tmp/map3d-map-footer-{verify,check,audit}-final.log`；完整 `/tmp/map3d-map-footer-ui-full.log`；focused `/tmp/map3d-map-footer-focused.log`；前後rect `/tmp/map3d-map-footer-{before,after}.log`。下載source／font／binary／PNG不入Git。
- 無遠端Actions／部署／實機／Safari／Firefox／screen reader驗收；不關閉web security或修改實際CSP來源／例外。

### 先前多分頁／Leaflet 修正證據（本輪完整回歸）

原本只有訊息、尚無唯一根因的 Leaflet 問題，先前透過每寬度 8 次實際縮放／玩家／重掛載（共 24 次）重現，取得 `getPosition → _getMapPanePos → _getNewPixelOrigin → _move → _onZoomTransitionEnd` stack。原始碼確認 250ms 回呼與 `remove()` 刪除 pane 的路徑；自動 fit 不用動畫仍不足，因使用者手動縮放也能觸發。套用選圖地圖的公開無 CSS 縮放動畫設定後，當輪完整 161 項重跑通過，最新422項也保留該 gate，並保留未處理錯誤阻擋。這修復已重現的路徑，不代表所有實體裝置／Leaflet 手勢組合都已驗收。

多分頁測試不是人造 storage event：同一 browser context 開兩個真分頁，共享 storage 與真正 Web Locks；刻意持有鎖讓兩次修改同時排隊，並測試鎖持有人在確認後再更新的交錯情況。另有真正的 beforeunload 對話框取消測試及無 Web Locks 頁面降級測試。既有測試等候明確 save-idle，避免把新的非同步寫入誤當同步完成；沒有放寬資料比對或移除案例。

一般開發執行：`npx playwright-core install chromium`，先build（`npm run build`或`npm run check`），再跑 `npm run verify:ui:isolated`（dev＋production兩階段）。受限環境可依 [稽核](APP_AUDIT.md) 供應 `CHROMIUM_EXECUTABLE`／JSON `CHROMIUM_ARGS`。測試二進位、資料及截圖不入 Git。

## 十一、尚未完成工作與次序

### P1：安全工具鏈與真實瀏覽器驗收

- 公開搜尋前確認Nominatim營運政策：全APP總量、知情服務採用與免bundle更新切換條件；現有per-page queue不是合規保證。見[搜尋政策blocker](place-search-safety.md)。
- 遠端Actions與20min check／10min production＋CAD job實際時間餘裕尚未驗收；不得刪案例、忽略錯誤或增加上限來冒充修復。

1. **上游修補路徑**：受支援 ESLint 10 major 遷移已完成；仍需上游提供可相容安裝的 minimatch 公告修補版本，再乾淨安裝及回歸。目前最新支援範圍不接受 11.0.1，不以不相容 override、降級或 `audit --force` 假修復。
2. **實體／其他瀏覽器**：Safari／Firefox 的鎖、下載、鍵盤、原生離頁、相機浮層／fallback、觸控及 viewport 生命週期；行動系統關頁不可依賴 beforeunload。無 Web Locks 的並行使用仍不保證，應只留一個編輯分頁。
3. **未提供的資料功能**：自動合併／版本歷史／回收桶／跨裝置同步未實作；現有產品仍是單機 browser-only，不能把衝突處理當作雲端或帳號系統。

選圖hint／credit互遮與scale／多行credit擠迫，本輪已實際修復並回歸；GPX768px提示遮擋、可捲動控制與收合觀看先前已修正；不重新列為待辦，也不把這當作全部實機／browser chrome時序都通過。

### P2：原任務功能差額

4. 選定更多真實來源、協議及授權，把「10 筆清單」補成要求的完整渲染來源；另評估 raster／Shapefile／人口分析的記憶體與依賴成本。
5. 建築 parts／巢狀 OSM relations／其他屋頂拓撲、獨立桌面 CAD 軟件驗收（ezdxf raw／audit／roundtrip與51份真下載已完成，不重列為未做）；目前維持「部分 LoD2」標示。
6. 同範圍／資料／角度的 GeoLibre／TopoExport 截圖對照，目前只有本 APP 畫面檢查。

### P3：發布驗收

7. 真實供應商 CORS／錯誤／覆蓋與效能；sandbox 的網域限制不能替代正式網絡驗收。
8. 實體 iOS／Android、Safari／Firefox、screen reader、OS 分享、加入主畫面、部署後 OG。
9. 經授權後執行遠端 CI、正式部署、已配置CSP的edge response／live驗收與上線 smoke test；不擅自新增 backend、登入或資料代理。

**結論：** 正常課程備份預算、支援瀏覽器的合作式多分頁衝突處理，已重現的 Leaflet 卸載錯誤，受支援 lint major 遷移，已重現的場景控制離屏／提示裁切，以及可支援子集的中庭／內島、單坡／有界金字塔／矩形四坡與明確屋脊方向／共線邊節點／有限屋脊距離angle推導、架空底部端到端保留、五格式Object3D可見性一致、production CSP設定及本地production gates、GPX提示／短尺寸與可收合設定、有界匯入／海拔完整性及過期讀取取消、FeatureCollection內有界集合／完整bounds、選圖hint正常flow及原生scale／credit堆疊、DXF原始引用修正及獨立ezdxf gate均已完成並回歸。無鎖並行、完整 GIS／LoD2、開發工具例外及正式環境／實機驗收仍有明確差額。
