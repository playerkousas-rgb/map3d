# 地點搜尋：完整回應驗證與取消安全 — 2026-11-03

> 後續四坡角度milestone已更新測試排程：搜尋逐寬度、在主suite之前；CI仍20／10min，但完整production移到CAD job並取同次dist。下面1499／473＋84與並行時間是搜尋milestone歷史，不代表最新排程仍並行。見[最新實測與失敗記錄](hipped-angle.md)。

## 來源先行與實際缺口

環境沒有使用者指定的 `browser.open`；本輪用 `fetch_page` 開官方文件與政策，再以 GitHub CLI 讀固定源碼，沒有冒稱已瀏覽外部產品。

- [參考政策 AGENTS](https://github.com/playerkousas-rgb/readme/blob/206cb0c24d028651d804ec19942dc9791b499fdd/AGENTS.md)：採用來源、輕量、安全與如實交付要求，不引入 GAS／帳號／後端架構。
- Nominatim 固定 revision `edbe8c7d49f23da84f73a2e17f5ec8c179ec793b`：[JSONv2 Output](https://github.com/osm-search/Nominatim/blob/edbe8c7d49f23da84f73a2e17f5ec8c179ec793b/docs/api/Output.md)、[實際 JSON serializer](https://github.com/osm-search/Nominatim/blob/edbe8c7d49f23da84f73a2e17f5ec8c179ec793b/src/nominatim_api/v1/format_json.py)、[Search](https://github.com/osm-search/Nominatim/blob/edbe8c7d49f23da84f73a2e17f5ec8c179ec793b/docs/api/Search.md)。serializer 確認 lat/lon 為十進位字串，bbox 為 south/north/west/east。Output 文件 latitude 範圍文字的 typo 不照抄；有效緯度仍為 ±90。viewbox 的 x 是經度、y 是緯度；沒有 bounded=1 只是 bias，不是硬篩選。
- [官方公用服務政策](https://operations.osmfoundation.org/policies/nominatim/) 於本輪重新讀取；**操作限制與尚未符合的上線條件見下方，不能以本地測試代替合規。**

APP 原搜尋以 `parseFloat` 接收 lat/lon，會接受 `22oops`；沒有完整檢查有限值／合法範圍、bbox 或完整陣列。清除只加 request revision，不真正取消 fetch；編輯、模式／頁面轉換及保留在 DOM 的舊地圖，沒有一致失效邊界。原並發 start-spacing 等待未包住真正 fetch 啟動，有同時啟動的風險。這些是直接查本 APP 的缺口，不是假設供應商實際回過壞資料。

## 實作與界線

- `geocode.ts` 先驗證完整 JSONv2 array，任一候選錯誤就讓整次搜尋失敗，不發布有效前綴、不當空結果、不寫成功快取。緯度 ±90／經度 ±180、嚴格十進位字串或有限數值；拒絕 NaN／Infinity、空字串、部分數字、物件或越界值。
- bbox 必須剛好四個合法座標，south≤north、west≤east；不排序、不猜修復、不把跨日期線盒子假裝普通盒子。合法但零面積 bbox 改用有效點；缺 bbox 也可定位點。**不**保證 centroid 必在 bbox 內，不做行政區／地名真實性驗證。
- 缺失／空白 display_name 回退有限座標文字；錯型或過長名稱拒絕。React 維持純文字渲染，HTML 看起來像標籤也不執行。
- APP 自訂安全上限：**1100ms start interval、15000ms active timeout、256000 response bytes、5 results、1000 query UTF-16 units、4096 name units、30 LRU entries**。這些不是官方所有 API 的通用上限，也不是全站配額保證。回應在 stream 讀取時逐段計 bytes；無效 JSON／UTF-8／HTTP 錯誤／超量不快取。合法空結果仍可快取。
- 失敗或取消不能毒化 queue；在保留的 queue turn 內真正啟動 fetch，於同步啟動後記錄時間。等待 queue、active fetch、讀取 body 皆可取消；即使測試 transport 忽略 AbortSignal，caller 仍及時拒絕，晚回 body 取消且不得快取。立即觀察尚待 await 的 response rejection，避免取消當下產生 unhandled rejection。
- `MapSearch` 在編輯、Clear、Escape、map click／move／zoom、map replacement／unmount 時取消並加 revision。`SelectMap` 按 mode／view／language／player key 重新建立搜尋控制，processing／3D／player 時不掛載搜尋；必要時停止原地圖 flight。fetch completion 同時檢查 revision、controller identity、signal、map connected 與 player hash，舊結果／錯誤不可重新出現或移動舊地圖。
- 保留原生 Enter／click submit、單結果 auto-fly、多候選 list、英／繁中、44px 控制與16px手機輸入、Clear focus、來源 attribution、viewbox bias、快取與 browser-direct。輸入本身不發請求，取消也不自動重試。無新 runtime dependency／provider／proxy／backend／CSP origin。

## 重要：公用 Nominatim 尚不是公開上線核准

[官方政策](https://operations.osmfoundation.org/policies/nominatim/) 要求：**全網站／全 APP 所有使用者合計最多 1 request/second**、有識別用途的 Referer 或 User-Agent、適當 attribution、避免個人／機密資料；禁止 autocomplete、systematic/bulk scraping 等用途。政策另要求可按服務要求切換、不必軟體更新，並限制 no-code／low-code／vibe-coding 平台將公用 API 作為泛用搜尋服務；應用開發者必須作**知情、明確的服務採用決策並承擔合規責任**。

本 APP 既有公用 endpoint 未換；本輪只有明確手動 submit、page/module queue、有限快取與 attribution，**沒有跨分頁／使用者的總流量控制，也沒有不更新 bundle 的遠端 endpoint 切換**。不能宣稱已符合全站配額、得到官方授權或可直接大規模公開部署。營運者須在公開使用前確認政策與服務選擇，解決總量／切換條件；如果無法滿足，須先停用公用搜尋或經核准使用適合的服務。本輪沒有擅自加 Vercel proxy／新 provider，也沒有部署。OSMF 建議 proxy 並不凌駕本專案 browser-direct 的產品限制；此衝突保留為上線 blocker，而非聲稱已解決。

## 全新實測

| Gate | 結果 |
|---|---|
| Program | **1499/1499 PASS**，原1427全保留，新增72。含完整 parser、response budget／timeout／stream cancel、cache隔離與失敗重試、三並發真時鐘 start spacing≥1100ms、queued abort、忽略 signal 的晚回與無 stale cache。真 spacing 後其他測試暫改 Date.now 加快限速等待並於 finally 還原，不能把它們冒稱全為真時鐘 timeout。 |
| check | `npm run check` PASS：typecheck／lint、13 lint-config／13 writer-patch 契約、release 與 build budget；沒有放寬 guard。 |
| dev Chromium | **473 PASS**，原455全保留，新增18；390／768／1440，各六個原生案例。非法緯度顯示錯誤／同 query 可重試、HTML 純文字候選、Clear 真 abort／focus／無 autocomplete／不改 viewport、edit 與 latest-only、GPX mode unmount、保留地圖進 processing／3D 仍取消。 |
| built production CSP | **84 PASS**，原66全保留，同18新案例；真 dist、`bypassCSP:false`、文件 exact hosting CSP、每次 navigation 的零違反與零 pageerror。無 dev source import；原正向與 native 攻擊阻擋案例保留。 |
| 獨立CAD | **14 fixtures＋9 negative controls＋63 actual browser downloads PASS**；raw owner/handle 先於 ezdxf1.4.5 read／audit／roundtrip，無 repair。搜尋本輪沒有新增 DXF 格式或下載案例。 |
| Dependencies | `npm run audit:deps` exit0；production0，full12moderate（既有 dev toolchain minimatch，未用不相容 override 隱藏）。 |

原先把新搜尋案例加入既有 width loop，完整 `verify→dev/production UI→CAD` exit0／1245189ms，已近／超過原 CI 時間預算。新 `verify-place-search-matrix.mjs` 只把這18個新增案例放進另一 Chromium 的三個隔離 context，有界並行並與既有順序 suite 重疊。原案例、assertions、pageerror、exact CSP 及20min CI上限不改；`allSettled` 等全部 context 收尾後聚合失敗，沒有 skip／retry。

最終完整 `verify→dev/production UI→CAD` **exit0／1170965ms（約19分31秒，含CAD、不含另跑的check）**；新 matrix 另跑過完整84項 production suite。這是本地時間，不保證遠端CI在安裝與check開銷後可於20分鐘完成；遠端 Actions 未跑，時間餘裕仍須確認。

- **193 PNG＋63 DXF**：`/home/user/artifacts/map3d-v0.1.0-place-search/`，含12張新搜尋畫面。已開啟390錯誤、768最新候選及1440 built-production最新候選：錯誤／來源可讀、控制未水平溢出。背景圖磚為 mock，不能作 live 地圖或外部產品視覺對照證據。
- build **18 files／1541.3kB／gzip475.4kB**，原2929.7kB cap 不變。
- logs：`/tmp/map3d-search-verify-final.log`、`/tmp/map3d-search-check-final.log`、`/tmp/map3d-search-ui-final.log`、`/tmp/map3d-search-cad-final.log`、`/tmp/map3d-search-audit-final.log`。瀏覽器／Python／字型與產物不入Git。

原生 browser abort 後不能真的交付 payload；browser證明 active request取消、無舊候選且request viewbox不變，忽略signal的晚回由program測試補足，不冒稱二者相同。

```sh
npm run verify
npm run check
npm run audit:deps
# 已安裝Chromium與docs/cad-conformance.md指定的test-only Python requirements：
npm run verify:ui:isolated
CAD_BROWSER_DIR=node_modules/.cache/ui-artifacts npm run verify:cad
```

沒有 live provider／CORS／配額、真手機／Safari／Firefox、桌面CAD、外部 GeoLibre／TopoExport 截圖比較、遠端CI或部署驗收。完整LoD2、一般roof／building parts等仍未完成。此搜尋安全里程碑已完成，但不是整個APP完成或公用provider合規證書。
