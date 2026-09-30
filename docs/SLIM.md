# 瘦身防呆原則 · Keep-it-slim rules

> 這份文件是「防增肥」的規矩。**改版前先讀一次**，`npm run check` 會強制執行大部分條款；
> 條款本身寫在 `scripts/slim-guard.mjs` 的 `LIMITS`，要放寬必須在 PR 裡說明原因。
>
> This is the anti-bloat contract for the repo and the Vercel deployment. Most of it is
> enforced by `npm run check`; the numbers live in `scripts/slim-guard.mjs`.

## 為什麼 Vercel 會爆 · Why Vercel storage fills up

Vercel 的儲存配額主要被三樣東西吃掉，**都不是網站本身的大小**：

| 來源 | 說明 | 我們的對策 |
| --- | --- | --- |
| **每一次部署都會被保留** | 每個 push（包括每條分支的 preview）都產生一份完整的 build 輸出 + 上傳的原始檔 | `scripts/vercel-ignore-build.mjs`：只改文件不建置；自動化分支（`arena/*`、`dependabot/*`…）不做 preview |
| **上傳的原始檔** | Vercel 會把 `.vercelignore` 沒排除的所有檔案上傳一次 | `.vercelignore` 排除 `.git`、`node_modules`、`dist`、log/備份/上傳資料夾、docs、截圖 |
| **Build 輸出** | `dist/` 內所有檔案 | `vercel.json` 只服務 `dist/`；slim-guard 限制 dist 總量 3 MB、單檔 1.2 MB、40 個檔案 |

另外請在 Vercel Dashboard 做兩件設定（無法寫在 repo 裡）：

1. **Settings → Git → Ignored Build Step** 保持 `node scripts/vercel-ignore-build.mjs`（`vercel.json` 已指定，確認沒被 Dashboard 覆蓋）。
2. **Settings → Deployment Retention** 把 Preview / 舊 Production 的保留期調到最短（例如 preview 7 天）。這是清掉歷史部署最有效的一步。

## 紅線（slim-guard 會直接 fail）· Hard rules

1. **禁止提交**：`*.bak *.tmp *.old *.orig *.log *~ .DS_Store`、`dist/`、`node_modules/`、`uploads/`、`.env*.local`。
2. **單檔 ≤ 1 MB**（`package-lock.json` 除外）；**任何圖片 ≤ 300 kB**（截圖請縮到 ≤ 1400 px 寬並存成 WebP）；**整個 repo ≤ 3 MB**（不含 `.git` / `node_modules` / `dist`）。
3. **禁止提交重型媒體 / 設計原稿 / 壓縮檔 / 3D 模型**（mp4、psd、fig、sketch、zip、pdf、glb、stl、hdr…）。放 GitHub Release 或雲端硬碟，用連結。
4. **`public/` 每個檔案 ≤ 500 kB，且必須被 `index.html` / `src/` 引用**（favicon、robots.txt 等慣例檔案例外）。沒被引用的資源等於白上傳。
5. **`src/` 內每個檔案都必須從 `src/main.tsx` 可達**（import 圖）。用不到的元件、hook、util 就刪掉 —— 不要「先留著」。
6. **只在建置時用到的套件一律放 `devDependencies`**：Vite、TypeScript、`@types/*`、ESLint、Babel plugin、Tailwind/PostCSS、測試框架。
7. **`dependencies` ≤ 15 個**（超過只警告，但要有理由）。新增前先問：能不能用現有套件 / 瀏覽器原生 API（`fetch`、`CompressionStream`、`Intl`…）做到？
8. **`package-lock.json` 必須與 `package.json` 同步，且不能有孤兒項目**（`npm install` 後一起提交）。
9. **`.vercelignore` 必須包含** `.git node_modules dist *.log *.bak *.tmp *.old uploads/`，且**不得**排除任何建置輸入（`index.html`、`src/`、`package*.json`、`vite.config.ts`、`tsconfig*.json`、`vercel.json`、`scripts/`）。
10. **`vercel.json`**：`outputDirectory` 必須是 `dist`，`buildCommand` 必須固定為 `npm run build`。
11. **dist 不得含 source map、`.d.ts`、junk 檔**。

## 綠燈習慣 · Good habits

- **截圖**：`README` 只放一張，WebP、≤ 1400 px、≤ 100 kB。放在 `.github/`（已被 `.vercelignore` 排除，也不會觸發建置）。
- **文件**：放 `docs/`；只改文件的 push 不會觸發 Vercel 建置。
- **第三方大型資源**（HDR 環境貼圖、字型、底圖）一律走 CDN / 外部 API，**不要下載進 repo**。
- **新的 3D / 地圖功能**先看 `dist` 增長：`npm run build` 結尾會列出每個 chunk 的大小。`three` 已經 ~730 kB，不要再引入第二個 3D / 幾何函式庫。
- **不要提交測試資料**（GPX、JSON 路線、Overpass 回應）。需要範例就放在 `scripts/verify-orient.ts` 裡以程式產生。
- **每次改版前後跑一次** `npm run check`（= lint + guard + verify + build）。CI 與 Vercel build 也會跑同一套，過不了就上不去。
- **清垃圾**：`npm run clean`（`-- --dry-run` 只列出；`-- --all` 連 `node_modules` 一起清）。

## 要放寬限制時 · Raising a budget

1. 先確認真的沒有更省的做法（壓縮、lazy-load、改用 CDN、刪掉沒用的）。
2. 只改 `scripts/slim-guard.mjs` 的 `LIMITS` 那一個數字，並在 commit / PR 說明原因與新數值。
3. 不要用 `SLIM_GUARD=warn` 繞過 —— 那是緊急逃生門，不是常態。

## 目前基準 · Current baseline (2026-09)

| 項目 | 數值 |
| --- | --- |
| Repo（不含 .git / node_modules / dist） | ~0.58 MB、74 個檔案 |
| 最大單檔 | `package-lock.json` 155 kB；程式碼最大 `src/ui/App.tsx` 34 kB |
| `dist/` | 7 個檔案、~1.46 MB（gzip ~0.42 MB） |
| `dependencies` | 10 個 |
