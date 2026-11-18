/* globals document window MutationObserver initStoreGate ScoutStoreGate */
/* map3d · Store Gate v1.0 初始化（與 public/store_gate_v1.0.js 配套）
 * A-GROUP-INSTRUCTION.md 第 3 步：閘門腳本與參數必須掛在 index.html <head>，
 * <meta charset> 之後、<title> 之前。此處把參數腳本放成同源外掛，
 * 因為 vercel.json 的 Content-Security-Policy 以 `script-src 'self'` 嚴格執行，
 * 不允許任何 inline script（repo scripts/verify-csp.ts 與 verify-csp-ui.mjs 會守住此條）。
 * 行為與標準 inline 寫法完全相同，只為了讓閘門在生產環境真正執行。
 */
initStoreGate({
  appKey: 'map3d',                    // repo 名細楷（與 docs/51 列表一致，防 sessionStorage key 撞）
  mode: 'entry-gate',                 // 頂層跳板白名單：保留 localStorage、PWA、SameSite=Lax Cookie
  portalIds: ['appstore'],            // SG19：主站 → 攔截卡只出 1 粒 APP STORE 掣
  silentPortalIds: ['library'],       // SG19：圖書館照放行（matchedPortalId: library），但唔畫掣
  allowStandalone: true,              // 已加入主畫面的 PWA 直開自動放行
  autoRedirectSeconds: 0              // 0 = 停低顯示提示卡，唔秒彈走
});

// SG18：子 App「讚好／收藏」一鍵回跳主站（常駐、低調、非阻塞；零寫死網址，零 Supabase 請求）
// ScoutStoreGate 未載入時 a 保持 hidden，絕不出死連；document.documentElement.lang 隨 i18n 切換時同步中英
(function () {
  var a = document.getElementById('storeSupportTop');
  if (!a || typeof ScoutStoreGate === 'undefined') return;
  function refreshLabel() {
    var lang = (document.documentElement && document.documentElement.lang) || '';
    var isEn = String(lang).toLowerCase().startsWith('en');
    a.textContent = isEn ? '❤️ Like / Save' : '❤️ 讚好／收藏';
    a.title = isEn
      ? 'Like or save this app on SCOUT APP STORE (opens in new tab)'
      : '前往主站讚好或收藏此程式（開新分頁）';
    a.ariaLabel = a.title;
  }
  refreshLabel();
  a.href = ScoutStoreGate.getAppStoreUrl('map3d'); // → https://scoutappstore.vercel.app/?app=map3d
  a.hidden = false;
  if (window.MutationObserver && document.documentElement) {
    new MutationObserver(refreshLabel).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang']
    });
  }
})();
