# 雙坡／單坡屋頂零樓層：0 不是缺資料

2026-11-04（香港） · v0.1.0 · `arena/67142253-map3d` · © SCOUT SYSTEM

## 真缺口與來源

本輪繼續完成APP，直接查 `buildingBuilder.ts` 發現 gabled／skillion 的 `levels(...) * 2.2 || angle/default`：有效 `roof:levels=0` 被truthiness當成缺值，會套用角度或預設3m屋頂；也可能增加total height、降低eaves、誤報缺skillion方向或拒絕原本有效的高底部。

先用新回歸重現，未修版本 **1662/1716 PASS、54 FAIL**（exit1），再修產品碼；不是只新增永遠會過的測試。測試後續亦強化一個明確height11m／min_height9m fixture。

環境沒有 `browser.open`；實際用 `fetch_page` 開來源頁及 GitHub CLI 讀固定原碼：

- [OSM2World LevelAndHeightData.java@1d31c252cbef964b489a55e5fb8242ee253375b1](https://github.com/tordanik/OSM2World/blob/1d31c252cbef964b489a55e5fb8242ee253375b1/core/src/main/java/org/osm2world/world/modules/building/LevelAndHeightData.java)：roofHeight用null表示未知；前置屋頂高度未知時，roof:levels可乘heightPerLevel；結果0仍是有效數值，不是再落入default。原始碼157–188行可直接核對。
- [參考政策AGENTS@206cb0c](https://github.com/playerkousas-rgb/readme/blob/206cb0c24d028651d804ec19942dc9791b499fdd/AGENTS.md)：採用來源、安全、輕量與如實交付，不引入無關GAS／帳號／後端。

**優先序邊界：** 本APP原來已採有效roof:height → roof:levels → angle/default，本輪只讓0也遵守這套既有優先序。上游會先計算preliminary roof height，其angle／level組合可能有不同優先序；這不是聲稱完整移植其建築level模型，也不主張所有OSM的roof:levels=0在任何標籤組合下都必須等於平頂。測試故意放45°衝突標籤，是驗證APP內的既有優先序一致性。

## 修正範圍

- `levels` 對缺失／無效回傳undefined，對有效0回傳0；保留原格式、正值2.2m估計與200上限，不趁機變更所有level解析政策。
- 雙坡／單坡的level rise使用 `??`，不再以 `||` 丟掉0。floor height另以 `?? 0` 保留原building:levels fallback語義。
- roof:height（含0）仍優先；有效零levels不再落入angle或default。未提供／壞levels仍沿用原angle/default；大level的既有cap與最少2m façade／2–400m total不變。
- eaves=total，gabled不造假ridge，skillion零rise不要求方向、不報missing-direction。兩場景、parser／collector／cache、eaves相關垂直區間與DXF共用此解算，不用改OSM tags掩蓋問題。
- 有效高底部仍保留；底高等於／超過total仍拒絕；中庭、holes、winding、底蓋與單位不改。hipped／pyramidal既有zero處理不變。
- 無新runtime依賴／provider／CSP origin／proxy／backend，亦無新UI設定或翻譯字串；原警告保留給真正不支援的非零單坡。

## 最終實測

| Gate | 本輪實際結果 |
|---|---|
| Program | **1716/1716 PASS**，原1622保留＋94新檢查；零的四種拼法、angle缺／45°、兩shape、holes、地面offset、height／levels優先序、壞值fallback、舊大值cap、level-derived total、min_level、有效／非法底高、兩真adapter→writer→獨立dxf-parser與collector/cache均覆蓋。 |
| check | `npm run verify`及`npm run check` PASS；13lint-config／13writer-patch、lint／typecheck／release／budget不放寬。 |
| dev Chromium | 完整 **491 PASS**，原479保留＋12新組；390／768／1440，兩個原生fixture流程×兩場景。每份實際DXF驗zero roof是兩個24m平頂三角形與真footprint面積；既有故障、courtyard、坡面、底高與唯一key檢查全保留。 |
| production CSP | 完整 **90 PASS**，原87保留＋3新組；原生Overpass→WebGL→DXF同時核對gabled24m／skillion26m各兩個平頂面。exact hosting header、bypassCSP:false、零pageerror／正向CSP違反與原攻擊阻擋保留，無source import。 |
| independent CAD | **17 fixtures＋9negative controls＋63真瀏覽器DXF PASS**；原15fixtures全留，新gabled／skillion zero fixtures另驗平頂面數、面積、min3m／max15m及holes。原63下載未刪／重命名：12份dev skillion/elevation須含24m，3份built native須同時含24／26m並保留原30m angle roof。raw owner/handle先於ezdxf1.4.5讀入／audit／roundtrip，無repair。 |
| audit／build | production0／full12moderate（既有dev minimatch例外），未用強制不相容override隱藏。18files／1542.0kB／gzip475.7kB，原2929.7kB cap不變。 |

完整 **dev→built production→CAD→audit 同chain exit0／1152500ms（約19分13秒；不含另跑的verify/check）**。之前受影響focused42組亦通過。沒有skip／自動retry／新增timeout／pageerror過濾／CSP放寬。

CI沿用前輪的check20min（品質＋完整dev）與依賴它的10min（同次dist＋完整production＋CAD）；本輪未改workflow／stage排程。**遠端Actions仍未跑，不能從本地全鏈時間保證遠端安裝、artifact與runtime餘裕。**

## 畫面與產物

- `/home/user/artifacts/map3d-v0.1.0-zero-roof-levels/`：**193 PNG＋63 DXF**；已開啟390 skillion及768／1440 elevation場景，左方新增zero-level建築保留平頂，真正的missing-direction警告仍只有1項。
- 初次畫面檢查發現本地test-only Chromium的fonts.conf未解開，中文字顯示缺字；不是新增APP字型依賴。補齊test-only fontconfig及Noto CJK後，再跑全部42項受影響native流程並重新開三寬度圖。較早完整suite的其他截圖仍可能保留測試字型缺字，不把它們冒稱完整中文／實機驗收。
- 圖片僅證mock場景與版面；精確高度／平頂／洞口靠實際CAD讀回，不以小模型截圖代替量測。沒有外部GeoLibre／TopoExport同範圍視角比較。
- logs：`/tmp/map3d-zero-before.log`、`/tmp/map3d-zero-{verify,check,ui,cad,audit}-final.log`、`/tmp/map3d-zero-focused-font-final.log`。test binary／Python／字型／圖片及下載不入Git。

```sh
npm run verify
npm run check
npm run audit:deps
# 安裝Chromium與scripts/cad-requirements.txt指定的test-only工具後：
npm run verify:ui:isolated
CAD_BROWSER_DIR=node_modules/.cache/ui-artifacts npm run verify:cad
```

## 未完成與未宣稱

這不是一般roof／building parts／完整LoD2、真供應商可用性、桌面CAD、Safari／Firefox／實機／screen-reader、遠端CI或部署驗收。公開Nominatim的全APP流量／知情服務採用／免bundle更新切換仍是既有上線blocker。本輪未commit／push／部署；整個APP仍未全部完成。
