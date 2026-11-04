# 選圖 footer：原生比例尺、完整來源與提示

2026-11-03（香港） · map3d v0.1.0 · © SCOUT SYSTEM

## 實際起點與來源

本輪檢查磁碟發現程式／文件仍停留在GPX milestone（1032 program／338 dev＋30 production），缺少前兩次回覆提及的集合與提示排版實作。已向使用者說明；不以聊天記錄代替檔案，也不沿用不存在的舊證據。本輪補回實作並重建對應測試後，連同比例尺一起重新執行完整驗證。以下數字全是**本輪實際跑出**，不是在先前回答的368＋36上再累加。

先讀本地README／AGENTS／SCOPE／APP_AUDIT，重開參考政策AGENTS `206cb0c24d028651d804ec19942dc9791b499fdd`。本環境沒有browser.open，用fetch_page／GitHub CLI及安裝的原始碼核對：

- [Leaflet1.9.4 Control.js](https://github.com/Leaflet/Leaflet/blob/d15112c9e8ac339f0f74f563959d0423d291308d/src/control/Control.js)：bottom control會插到corner第一個child，新增較晚的scale位於既有attribution前面。
- [Control.Scale.js](https://github.com/Leaflet/Leaflet/blob/d15112c9e8ac339f0f74f563959d0423d291308d/src/control/Control.Scale.js)：使用原生m/km量測與move／remove lifecycle，不自行估算scale。
- [leaflet.css](https://github.com/Leaflet/Leaflet/blob/d15112c9e8ac339f0f74f563959d0423d291308d/dist/leaflet.css)：同corner的controls以float＋clear:both正常堆疊；scale有原生5px bottom margin。
- 原有 [GeoJSON.js](https://github.com/Leaflet/Leaflet/blob/d15112c9e8ac339f0f74f563959d0423d291308d/src/layer/GeoJSON.js)具備GeometryCollection→FeatureGroup遞迴，不需自製renderer。
- [RFC7946 §3.1.6／3.1.8](https://www.rfc-editor.org/rfc/rfc7946.html#section-3.1.8)：集合成員是Geometry objects、可空、可異質但建議避免巢狀；環完整position閉合，winding向後相容。不把APP上限說成RFC規則。

沒有複製／修改Leaflet source、移動其DOM或使用私有_map／_controlCorners。

## 真重現與修正

先補回提示正常flow，才比較比例尺這一個變數。390×900、原生local GeoJSON後：

| DOM rect | 修正前 | 修正後 |
|---|---|---|
| scale | x21／y380.48／w57／h18.19 | x307／y346.89／w57／h18.19 |
| attribution | x16／y370.08／w358／h33.59 | 不變 |
| 結果 | 左右兩個獨立corner互疊，scale文字被credit蓋住 | scale.bottom365.08 < credit.top370.08，**5px間距** |

`SelectMap.tsx`的ScaleBar只把公開option **position:bottomleft → bottomright**，與原生attribution共用同一個stack。正常float／clear會依實際credit高度堆疊；來源變更或換行自動重排，不用固定bottom猜高度、ResizeObserver、同步state、MutationObserver、隱藏／截短版權或自製比例尺。

桌面比例尺亦改在右下方、來源註記上方；不假裝仍在左下。既有metric:true／imperial:false及effect cleanup保留。

### 補回的兩項功能

1. **提示正常flow**：原提示移到MapContainer後，8px間距、fit-content／border-box／max-width100%、flex wrap。保留尺寸與各等級文案／顏色，以useId＋aria-describedby連到模式button。地圖高度不變；短螢幕需捲到下方閱讀，不承諾整張map和提示永遠同屏。
2. **有界集合**：FeatureCollection內可含混合／巢狀GeometryCollection；保留properties／grouping／Polygon holes。validator與bounds同一walker，bbox不能偽造bounds；root仍須FeatureCollection。8層collection／整檔20,000 Geometry objects，保留2,000,000bytes／10,000 Features／150,000positions。所有Feature與sibling共用budget，空集合也計Geometry。保留null Feature geometry；null collection child拒絕。結構空集合可合法，但empty-only本地檔無可畫bounds時拒絕。Nested CRS、完整2／3維閉環、非法或超額child整份拒絕，不截斷／跳過壞資料。不做拓撲／winding修復或antimeridian切割，不是完整RFC validator。

依然只有一個暫存本地2D overlay；不upload／persist／加入course backup、3D或exports。Catalogue仍10datasets／7providers／8browser configurations＋2bulk references。沒有新的provider／origin／runtime dependency／backend／資料代理。

## 本輪驗證

### 49個重建program contracts

六種primitive／Multi* nested cases、混合集合結構／properties／holes不變、確切all-child bounds與偽bbox、8／9層、空／null、20種非法child／座標／dimension／環／CRS、cyclic raw bounds安全拒絕、20k geometry與150k position精確邊界及跨Feature／sibling全局限制；真local Blob stream、empty-only拒絕、mock remote Response stream成功／整份失敗。

原1032項全保留，**1081/1081 PASS**；13 lint-config contracts另計，不把DOM assertions灌入program總數。

### 每寬度10項dev（共30項重建／新增）

`scripts/verify-map-footer-ui.mjs`在390／768／1440真Chromium跑：

1. Native mixed/nested file→五個紫色SVG children，Polygon兩個subpaths＋evenodd；無popup／properties HTML／hidden3D或自動fit。
2. Nested壞點、9層、empty-only逐一拒絕；每次先用valid replacement清掉前次alert，不讓舊alert假滿足新case，舊幾何／filename保留。
3. 原生fit納入每個child的SVG extent。
4. 同corner／scale在完整credit上方、兩者都在map內、scale及每個來源link的每行rect中心可hit；提示在map外正常flow、有description、無水平overflow。390真local credit換成兩行。
5. Native zoom in／out，m/km數值真的更新。
6. NASA basemap＋remote Natural Earth＋local的attribution增減，文字完整保留／scale自動堆疊。
7. 中英文切換及**真正resize height320**，含原生footer與link hit tests，非注入假safe-area。
8. 真框選／即時尺寸／藍色選框、移除及提示狀態。
9. Collection replacement／remove清理所有children與credit；合成sentinel不進非GET payload。
10. 還原原先source選擇／小view／移除暫存file，確認恰好一個scale與attribution，不污染後續測試。

原338dev全保留，**368/368 PASS**。新helper不是舊遺失的測試檔逐字還原；數字巧合相同不代表可以把不同輪次相加。

### 每寬度2項production（共6項）

Built dist＋actual hosting HTTP CSP下：native mixed collection→hole／fit→壞child保留，以及真scale／多行source-link hit／正常flow。Native小view還原後才接既有legacy map→CAD，避免寬fit讓後續選區正確出現big-area dialog而重複Next Step。沒有用first()跳過警告或改產品限額。

原30production保留，**36/36 PASS**；正常流程零uncaught pageerror／CSP violation，負面native inline／handler／eval／remote／base／fetch阻擋仍保留。Providers模擬，不是live相容性證明。

**同一次完整isolated入口exit0，368dev＋36production全部跑完，約611.6秒。** 沒有skip／auto retry／pageerror過濾。CI timeout15→20分鐘保留兩個完整stage，非降低斷言。

測試setup初版曾把隱藏dialog中的Next Step當作可用viewport邊界，導致scroll定位錯誤／hit test失敗；改為只計算真有client rect的button。Resize／scroll量測前後等待render frames，沒有固定睡眠或弱化hit test。這些是測試定位，不是產品量測排版。

### 其餘檢查與證據

- 本輪新環境 `npm ci --no-audit --no-fund`。`npm run verify`、`npm run check`、`npm run audit:deps`與`git diff --check`通過。
- **18files／1531.1kB／gzip472.1kB**，原2929.7kB budget不變；既有i18n Fast Refresh及上游lottie eval warning未隱藏。
- Prod audit**0**；full**12moderate／0high／0critical**例外仍在，不等於零漏洞，沒有force／不相容override。
- 本輪重新取回Natural Earth pinned `ca96624a56bd078437bca8184e78163e5039ad19`三份原始GeoJSON，新validator／bounds實跑 **177countries／24lakes／13rivers**通過；這只是parsing，不是browser live CORS。
- Browser binary為臨時Sparticuz Chromium153.0.0，ignored cache；不使用disable-web-security／bypassCSP。NotoSansCJKtc-Regular只供臨時fontconfig，**本輪完整368＋36也使用此字型環境**；無app font下載、CSP font origin或manifest依賴。
- `/home/user/artifacts/map3d-v0.1.0-map-footer/` **138 PNG**：既有121＋新dev12＋production3＋比例尺before／after2。兩張before／after為相同native point fixture與viewport、補回提示後僅scale位置不同；其他source／短中文圖不假裝同scope地理對照。已開啟before／after、三寬度sources及390短中文圖。
- Logs：`/tmp/map3d-map-footer-{verify,check,audit}-final.log`、完整 `/tmp/map3d-map-footer-ui-full.log`、focused `/tmp/map3d-map-footer-focused.log`、before／after rect `/tmp/map3d-map-footer-{before,after}.log`。Screenshot／font／binary／下載資料不進Git。

## 尚未完成

以上完成的是已重現的選圖兩項footer互遮與缺失實作補回，不是整個APP／所有高度／任意插件的認證。極短viewport不保證所有controls同屏；Safari／Firefox／screen reader／實機、live provider／效能／地理精度／授權個別用途、GeoLibre／TopoExport外部同範圍截圖、獨立CAD及完整LoD2／十個渲染供應商仍待。未commit／push／遠端Actions／部署，無新增帳號或backend。
