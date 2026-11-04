# DXF 原始引用修正與獨立 CAD 結構驗證

> 最新場景內復原工作將browser-dir gate擴充為至少63份，必須含六個dev／production復原檔，獨立驗證minZ50／屋面Z62；詳見[目前1427／455＋66完整證據](scene-data-recovery.md)。本文件下方仍保留原CAD階段的歷史實測。

> 地形完整性階段曾把browser-dir gate擴充為至少57份，必須包含390／768／1440的6份terrain備援／參考平面下載，獨立檢查絕對Z50／0。完整重跑結果1400program／437dev＋48production、14fixtures／9negative／57真下載見[本輪證據](terrain-elevation-integrity.md)。下方51份及1342／422＋45是原CAD里程碑的歷史實測，舊51檔目錄不再足以通過目前browser-dir gate；重跑請使用當次完整UI產物。


2026-11-03（香港） · v0.1.0 · `arena/67142253-map3d` · © SCOUT SYSTEM

## 本輪不是再加一種屋頂

本輪補強建築／CAD差額：在既有dxf-parser幾何回讀之外，使用獨立 **ezdxf 1.4.5** 檢查原始DXF引用、讀入後audit及重新儲存／讀取。確實找到並修正writer metadata問題，但**不是AutoCAD／LibreCAD／FreeCAD桌面驗收**，也不是完整LoD2／BIM／watertight認證。

## 源碼與發現

環境沒有browser.open；實際使用fetch_page／GitHub CLI及已安裝的精確版本源碼。重新取回參考政策 [AGENTS@206cb0c](https://github.com/playerkousas-rgb/readme/blob/206cb0c24d028651d804ec19942dc9791b499fdd/AGENTS.md)。

- [dxf-writer source@34608442ed783de547b4224b6f98dee1996f9800](https://github.com/tarikjabiri/js-dxf/tree/34608442ed783de547b4224b6f98dee1996f9800)：查看 `Drawing.js`、`Layer.js`、`Block.js`、`BlockRecord.js`、`DatabaseObject.js`、`Face.js` 及MIT許可。實際npm **1.18.4** 的Drawing／Layer原始bytes以SHA256固定。
- [ezdxf v1.4.5 source@84ae31976940f99e6d5f4d3b2e9131da02b574fe](https://github.com/mozman/ezdxf/tree/84ae31976940f99e6d5f4d3b2e9131da02b574fe)：查看raw tagger／loader、`sections/entities.py` 及 `entities/blockrecord.py`。`BlockRecord.add_entity()` 在讀入時呼叫 `entity.set_owner(self.dxf.handle, ...)`，所以讀入後audit乾淨**不代表原始owner正確**。同版MIT（2020 Manfred Moitzi），僅測試工具，不bundle。

### 重現到的原始問題

1. `Layer.shapesTags` 把3DFACE的330 owner寫成 `space.handle`（BLOCK begin），不是對應BLOCK_RECORD。
2. BLOCK／ENDBLK的owner仍是0，沒有接到所屬BLOCK_RECORD。
3. Layer的390 plot-style硬編碼1；第一次可能錯指root dictionary，後續drawing的handle從全域counter繼續時，1甚至不存在於當前檔案。

未修補的最小檔在ezdxf讀入後呈現 **audit errors0／fixes0**，但原始owner錯誤；新raw gate直接拒絕（`/tmp/map3d-cad-before.log`）。沒有用recover模式把錯誤「修好」再宣稱原檔通過。

## 如何修正，沒有自寫 DXF 序列化器

Runtime仍是 **dxf-writer**；`objectToDxf()`仍呼叫原本Drawing／drawFace／toDxfString，不用ezdxf產生交付檔，也不事後字串重寫DXF。

`dxf-writer`固定為**精確1.18.4**。`scripts/patch-dxf-writer.mjs` 在root postinstall對兩個庫源檔作小補丁：

- Drawing建立BLOCK_RECORD時，把record handle記入該block，同步BLOCK／ENDBLK owner。
- Layer序列化實體時使用 `space.recordHandle`。
- 390使用null handle0，不再硬編碼一個可能不存在的物件；上游原註解亦明確允許0。未新增自訂plot-style或其他CAD物件。

| 文件 | 原始 SHA256 | 修補後 SHA256 |
|---|---|---|
| Drawing.js | `fd139502d14fc15e52fb0f625bb5fbacef95ef19377779b1775af5113d9c19a1` | `21defc880e93fcf5926d6349e24b518a82f7daacff9f2fa581541090e51e3c51` |
| Layer.js | `1075693555ab112a0f6fbc9d5cc05bdc8233d34529276e3887e277f63ea8be09` | `89726d9b55dc7d76093e1a5c1eb5929615b863edc1d9e00b1633c855ee673993` |

只接受精確原版或精確修補後bytes；全部檔案先驗證才寫入。版本／內容漂移、缺檔一律失敗，不能模糊套patch或無聲略過。可重複執行。升級writer時須重讀源碼／更新patch及驗證，不可只改hash來令CI綠燈。

`npm ci`已實際乾淨重裝並驗證postinstall。若刻意 `--ignore-scripts`，須明確執行 `npm run patch:dxf-writer`；`npm run check`、直接build及dev都有guard，漏patch不會默默輸出舊metadata。許可保留於THIRD_PARTY_NOTICES，不把node_modules或完整庫源碼放入Git。

## 可重現的新增 gate

### 一般應用程式檢查（不需Python）

```sh
npm ci --no-audit --no-fund
npm run verify
npm run check
npm run audit:deps
```

`check`新增 `verify:dxf-writer`，含 **13個補丁契約**：原bytes可逆重建、fresh／mixed狀態、idempotence、check-only、精確output hash、第二檔漂移不先改第一檔、錯版本／錯套件／缺檔／已修補後漂移皆拒絕。1342個原程式檢查與13 lint-config完整保留，**不把不同gate加在一起冒稱DOM-free總數增加**。

### 獨立Python CAD（測試專用）

```sh
python3.11 -m venv node_modules/.cache/cad-venv
node_modules/.cache/cad-venv/bin/python -m pip install -r scripts/cad-requirements.txt
CAD_PYTHON=node_modules/.cache/cad-venv/bin/python npm run verify:cad
```

Python工具不進root npm dependencies、網站或backend。requirements固定ezdxf1.4.5及fonttools4.68.0／numpy2.4.6／pyparsing3.3.3／typing_extensions4.16.0；這是版本可重現，不是假稱完成Python依賴安全認證。`verify:cad`不偷偷安裝工具；缺少時明確失敗。

`cad-fixtures.ts`呼叫真應用程式encoder／adapter產生 **14份**DXF及manifest：indexed、nested world transforms、instances、GPX毫米→公尺、架空中庭、雙坡、金字塔、單坡中庭、兩場景共線節點四坡、visibility、hidden-only、drawRange、連續匯出。

`verify-cad.py` 在任何高階讀取前檢查raw sections、版本／公尺單位、handles唯一、HANDSEED、BLOCK／ENDBLK／model-space entity ownership、owner／dictionary／plot-style引用；之後才ezdxf.read，核對owner未被自動改動、3DFACE三角形重複第四點、有限／非退化幾何、預期座標／world transform／單位／高度／屋脊／boundary count／向上淨屋面積。audit須**errors0／fixes0**，獨立write／read後的面序及全部座標須完全一致。不呼叫recover。

投影fixture首次拿絕對XY原點當期望而失敗，偏移約0.123mm來自既有UTM inverse／forward近似；改用**平移不變的40×20m跨度及絕對Z5–15m**核對，不放寬一般1e-4m幾何門檻、不改投影或屋頂validator。這不增加測量級原點精度承諾。

另有 **9個負向控制**：錯entity owner（會被loader自動改正的情況）、BLOCK owner0、dangling390、重複handle、錯單位、錯版本、NaN頂點、第四點不是重複第三點、截斷EOF，全部必須拒絕。

## 真正瀏覽器下載與 CI

完整既有 **422 dev＋45 built-production CSP** 兩階段重新跑過，未刪case、skip、retry、pageerror過濾或放寬CSP。新增把8種建築fixture×3寬度×兩場景的**48份**實際下載，加上3寬度production原生建築的**3份**下載保存於測試artifact（不入Git）。

```sh
# 先build及安裝Chromium，或供應既有CHROMIUM_EXECUTABLE／CHROMIUM_ARGS
npm run verify:ui:isolated
CAD_PYTHON=node_modules/.cache/cad-venv/bin/python \
  CAD_BROWSER_DIR=node_modules/.cache/ui-artifacts npm run verify:cad
```

**全部51份**真下載另過raw ownership／handle及ezdxf audit／精確座標roundtrip。這些是mock-network fixtures，非任意live OSM場景認證。

CI新增獨立Python3.11 CAD job，等原check／browser job成功後下載同一次browser artifact再驗51份，並上傳14份CAD fixtures。原browser20min budget不變，CAD另10min；只配置並本地跑等價命令，**尚未push／遠端Actions驗證**。既有artifact名browser-screenshots亦含合成DXF，無私人使用者資料。

## 本輪實測與證據

- **1342/1342 program、13 lint-config、13 patch contracts PASS**；`npm run verify`、完整check／build／audit／git diff check全過。
- **422 dev＋45 production PASS**，接續14fixtures／9negative／51browser DXF gate；同一 `FULL_UI=1 ... && ... verify:cad` chain exit0／**899269ms（包含CAD gate）**。
- build **18files／1535.2kB／gzip473.5kB**，原2929.7kB cap不變。正式依賴audit0；full仍12moderate／0high／0critical。沒有新增app依賴／provider／origin／proxy／backend。
- **154 PNG＋51真下載DXF**：`/home/user/artifacts/map3d-v0.1.0-cad-conformance/`。已開啟390／768／1440的hipped-nodes斜視確認畫面與控制無新回歸；metadata修正不能憑截圖證明，精確證據是原始引用與獨立工具。圖片是mock tiles／資料，非外部產品對照。
- logs：`/tmp/map3d-cad-{verify,check,audit}-final.log`、`/tmp/map3d-cad-install-final.log`、`/tmp/map3d-cad-npm-ls-final.log`、`/tmp/map3d-cad-ui-full.log`、`/tmp/map3d-cad-browser-final.log`、`/tmp/map3d-cad-before.log`。工具／binary／font／fixture／下載／圖片不入Git。

**仍未完成：** 桌面CAD互通／廠商格式驗收、任意DXF圖元與命名plot-style支援、完整LoD2／building parts、全場景watertight、live provider／實機／其他browser、外部產品同範圍比較、遠端CI與部署。未commit／push／deploy，整個APP仍未全部完成。
