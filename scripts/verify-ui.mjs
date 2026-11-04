import { verifyModelCameraUi } from "./verify-model-camera-ui.mjs";
import { verifyTerrainIntegrityUi } from "./verify-terrain-integrity-ui.mjs";
import { verifySceneRecoveryUi } from "./verify-scene-recovery-ui.mjs";
import { verifyPlaceSearchMatrix } from "./verify-place-search-matrix.mjs";
import { verifyMapFooterUi } from './verify-map-footer-ui.mjs';
import { verifyGpxSafetyUi } from './verify-gpx-safety-ui.mjs';
import { verifyGpxLayoutUi } from './verify-gpx-layout-ui.mjs';
import { verifyExportVisibilityUi } from './verify-export-visibility-ui.mjs';
import { verifyBuildingHolesUi } from './verify-building-holes-ui.mjs';
/** Optional real-browser smoke test. Run a dev server first, then npm run verify:ui.
 * Uses Chromium installed by `npx playwright-core install chromium`, or
 * CHROMIUM_EXECUTABLE / CHROMIUM_ARGS for a provided executable. All external
 * service requests are mocked: this verifies UI behaviour, NOT live coverage.
 */
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import DxfParser from 'dxf-parser';
import { verifyOverlayUi } from './verify-overlay-ui.mjs';
import { verifyCourseUi } from './verify-course-ui.mjs';
import { verifyDraftUi } from './verify-draft-ui.mjs';
import { verifyCourseBudgetUi } from './verify-course-budget-ui.mjs';
import { verifyDraftTabsUi, verifyMapLifecycleUi } from './verify-draft-tabs-ui.mjs';

const base = process.env.UI_BASE_URL ?? 'http://localhost:5173';
const output = path.resolve(process.env.UI_ARTIFACT_DIR ?? 'node_modules/.cache/ui-artifacts');
await fs.mkdir(output, { recursive: true });
const launchOptions = {
  executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
  args: JSON.parse(process.env.CHROMIUM_ARGS ?? '[]'),
  headless: true,
};
let browser;
let checks = 0;
const pass = label => { checks++; console.log(`✓ ${label}`); };
// A neutral 1px image, not a pretend real map. No public service is contacted.
const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGN4+uYpAAVwArfgOL+2AAAAAElFTkSuQmCC', 'base64');
const vector = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: '<img src=x onerror=alert(1)>' },
  geometry: { type: 'Polygon', coordinates: [[[114.14, 22.30], [114.18, 22.30], [114.18, 22.34], [114.14, 22.30]]] } }] };
try {
  await verifyPlaceSearchMatrix({base,output,pass});
  for (const width of [390, 768, 1440]) {
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    let geoRequests = 0;
    let wmsObserved = false;
    let hiddenHdrRequest = false;
    page.on('pageerror', error => {
      errors.push(error.message);
      console.error('[browser pageerror]', error.stack ?? error.message);
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin) return route.continue();
      if (url.hostname === 'raw.githubusercontent.com') {
        geoRequests++;
        return route.fulfill(geoRequests === 1 ? { status: 503, body: 'test unavailable' }
          : { status: 200, contentType: 'application/geo+json', body: JSON.stringify(vector), headers: { 'access-control-allow-origin': '*' } });
      }
      if (url.hostname === 'gibs.earthdata.nasa.gov') {
        wmsObserved ||= url.searchParams.get('layers') === 'MODIS_Terra_CorrectedReflectance_TrueColor' &&
          url.searchParams.get('time') === '2013-11-04' && url.searchParams.get('srs') === 'EPSG:3857';
      }
      hiddenHdrRequest ||= url.pathname.endsWith('.hdr');
      if (url.pathname.endsWith('.png') || url.hostname === 'gibs.earthdata.nasa.gov') {
        return route.fulfill({ status: 200, contentType: 'image/png', body: tile, headers: { 'access-control-allow-origin': '*' } });
      }
      return route.abort();
    });
    if (width === 390 && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) {
      const rejected = await context.request.get(base, { headers: { host: 'attacker.invalid' } });
      assert.equal(rejected.status(), 403, 'arbitrary Host must not bypass DNS-rebinding protection');
      const preview = await context.request.get(base, { headers: { host: 'map3d-smoke.e2b.app' } });
      assert(preview.ok(), 'Arena preview suffix must remain accepted');
      pass('dev server: unknown hosts rejected; Arena preview hosts accepted');
      // Fake canary only: never inspect or log any real environment/credentials.
      const name = `.env.map3d-smoke-${randomUUID()}`;
      const canary = path.join(process.cwd(), name);
      const marker = `MAP3D_TEST_ONLY=${randomUUID()}`;
      await fs.writeFile(canary, marker, { flag: 'wx' });
      try {
        for (const route of [`/${name}`, `/${name}?raw`, `/${name}?raw??`, `/@fs${canary}?raw`]) {
          const response = await context.request.get(new URL(route, base).href);
          assert.equal(response.status(), 403, `Vite must deny ${route}`);
          assert(!(await response.text()).includes(marker), 'fake env contents must never be served');
        }
      } finally { await fs.unlink(canary); }
      pass('dev server: fake .env canary denied for direct, raw and @fs requests');
    }
    await page.goto(base);
    await page.getByRole('heading', { name: 'Generate 3D Map', level: 1 }).waitFor();
    assert.equal(await page.locator('canvas').count(), 0);
    assert(!hiddenHdrRequest, 'front screen must not start a hidden WebGL/HDR scene');
    pass(`${width}px: front screen has h1, no hidden 3D canvas/CDN lighting`);
    await page.locator('.gis-controls summary').click();
    const countries = page.getByRole('checkbox', { name: 'Natural Earth · countries', exact: true });
    await countries.check();
    const countryRow = countries.locator('xpath=ancestor::div[contains(@class,"gis-source")]');
    await countryRow.getByText('Failed / missing tiles', { exact: true }).waitFor();
    await countryRow.getByRole('button', { name: 'Retry', exact: true }).click();
    await countryRow.getByText('Loaded', { exact: true }).waitFor();
    assert.equal(geoRequests, 2);
    assert.equal(await page.locator('.leaflet-overlay-pane path').count(), 1);
    assert.equal(await page.locator('.leaflet-popup').count(), 0);
    pass(`${width}px: failed GeoJSON retries once and renders a safe Leaflet overlay`);
    await countries.uncheck();
    assert.equal(await page.locator('.leaflet-overlay-pane path').count(), 0);
    assert(!(await page.locator('.leaflet-control-attribution').innerText()).includes('Natural Earth'));
    pass(`${width}px: removing an overlay removes its geometry and attribution`);
    const local = page.locator('.gis-local');
    const localFile = local.getByLabel('Import GeoJSON', { exact: true });
    let uploaded = false;
    const detectUpload = request => { if (request.method() !== 'GET' && request.postData()?.includes('LOCAL_GIS_NEVER_UPLOAD')) uploaded = true; };
    page.on('request', detectUpload);
    const localData = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { name: '<img src=x onerror=alert(1)>', marker: 'LOCAL_GIS_NEVER_UPLOAD' }, geometry: { type: 'Point', coordinates: [114.17, 22.32] } },
      { type: 'Feature', properties: null, geometry: { type: 'LineString', coordinates: [[114.16, 22.31], [114.18, 22.33]] } }
    ] };
    const initialMapTransform = await page.locator('.leaflet-map-pane').getAttribute('style');
    await localFile.setInputFiles({ name: 'clipped.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(localData)) });
    await local.getByRole('status').filter({ hasText: 'clipped.geojson' }).waitFor();
    assert.equal(await page.locator('.leaflet-overlay-pane path').count(), 2);
    assert.equal(await local.locator('img').count(), 0);
    assert.equal(await page.locator('.leaflet-map-pane').getAttribute('style'), initialMapTransform, 'import must not pan/fit the map');
    assert((await page.locator('.leaflet-control-attribution').innerText()).includes('Local GeoJSON'));
    assert(!uploaded);
    await local.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `local-gis-${width}.png`) });
    pass(`${width}px: local point/line GeoJSON renders without upload, remote HTML or automatic map movement`);
    await localFile.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...localData, crs: { properties: { name: 'EPSG:3857' } } })) });
    await local.getByRole('alert').waitFor();
    assert.equal(await page.locator('.leaflet-overlay-pane path').count(), 2);
    await localFile.setInputFiles({ name: 'too-large.json', mimeType: 'application/json', buffer: Buffer.alloc(2_000_001, ' ') });
    await local.getByRole('alert').waitFor();
    assert((await local.getByRole('status').innerText()).includes('clipped.geojson'));
    pass(`${width}px: projected/oversized local data fails visibly without replacing the valid overlay`);
    await local.getByRole('button', { name: 'Remove local layer', exact: true }).click();
    assert.equal(await page.locator('.leaflet-overlay-pane path').count(), 0);
    assert(!(await page.locator('.leaflet-control-attribution').innerText()).includes('Local GeoJSON'));
    await localFile.setInputFiles({ name: 'replacement.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(localData)) });
    await local.getByRole('button', { name: 'Zoom to local layer', exact: true }).click();
    await page.screenshot({ path: path.join(output, `local-map-${width}.png`) });
    await local.getByRole('button', { name: 'Remove local layer', exact: true }).click();
    page.off('request', detectUpload);
    pass(`${width}px: explicit local-layer fit, removal/attribution cleanup and reimport work`);
    await page.getByRole('radio', { name: 'NASA MODIS · 2013-11-04', exact: true }).check();
    await page.waitForFunction(() => [...globalThis.document.querySelectorAll('.gis-source')].some(el => el.textContent.includes('NASA MODIS') && el.textContent.includes('Loaded')));
    assert(wmsObserved, 'WMS layers, date and projection must come from the catalogue');
    pass(`${width}px: Leaflet WMS request uses the registered layer, historical date and EPSG:3857`);
    assert.equal(await page.getByRole('checkbox', { name: /WorldPop/ }).count(), 0);
    assert.equal(await page.getByRole('checkbox', { name: /Hydro/ }).count(), 0);
    pass(`${width}px: bulk download references have no misleading load switches`);
    await verifyMapFooterUi(page, { output, width, pass });
    await page.locator('.gis-controls summary').evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: path.join(output, `gis-${width}.png`) });
    const overflow = await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth);
    assert(!overflow, 'document must not overflow horizontally');
    const controls = await page.locator('.gis-source button').evaluateAll(buttons => buttons.map(b => b.getBoundingClientRect().height));
    assert(controls.every(height => height >= 44));
    pass(`${width}px: no horizontal page overflow; source action targets meet 44px`);
    await page.evaluate(async () => {
      const { useExportStore } = await import('/src/state/exportStore.ts');
      useExportStore.getState().requestExport('dxf', 'test');
      const id = useExportStore.getState().requestId;
      useExportStore.getState().start(id);
      useExportStore.getState().finish(id, false);
    });
    await page.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).waitFor();
    await page.getByRole('alert').getByRole('button', { name: 'Dismiss', exact: true }).click();
    assert.equal(await page.locator('.export-status').count(), 0);
    pass(`${width}px: export failure feedback is visible, retryable and dismissible`);
    const manifestResponse = await context.request.get(`${base}/manifest.webmanifest`);
    assert(manifestResponse.ok());
    const manifest = await manifestResponse.json();
    for (const icon of manifest.icons) assert((await context.request.get(new URL(icon.src, base).href)).ok());
    pass(`${width}px: manifest and all four install icons return HTTP 200`);
    await page.getByRole('button', { name: 'GPX → 3D Print Model', exact: true }).click();
    await page.locator('input[type=file][accept*=gpx]').setInputFiles({ name: 'smoke.gpx', mimeType: 'application/gpx+xml',
      buffer: Buffer.from('<gpx version="1.1"><trk><name>Smoke track</name><trkseg><trkpt lat="22.30" lon="114.16"><ele>20</ele></trkpt><trkpt lat="22.301" lon="114.161"><ele>40</ele></trkpt><trkpt lat="22.302" lon="114.162"><ele>25</ele></trkpt></trkseg></trk></gpx>') });
    await page.getByRole('button', { name: 'Export', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export 3D Model', exact: true });
    await dialog.waitFor();
    assert(await dialog.evaluate(el => el.matches(':modal')), 'must use native top-layer modality');
    const first = dialog.getByRole('button').first();
    const last = dialog.getByRole('button').last();
    await last.focus();
    await page.keyboard.press('Tab');
    assert(await first.evaluate(el => el === globalThis.document.activeElement), 'Tab must wrap inside dialog');
    await page.keyboard.press('Shift+Tab');
    assert(await last.evaluate(el => el === globalThis.document.activeElement), 'Shift+Tab must wrap inside dialog');
    await page.waitForFunction(() => {
      const style = globalThis.getComputedStyle(globalThis.document.activeElement);
      return parseFloat(style.outlineWidth) >= 3 && style.outlineStyle === 'solid';
    });
    const ring = await last.evaluate(el => {
      const style = globalThis.getComputedStyle(el);
      return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
    });
    assert(ring.width >= 3 && ring.style === 'solid', 'keyboard focus ring must not be overwritten by component styles');
    await page.getByRole('button', { name: 'Export', exact: true, includeHidden: true }).evaluate(el => el.focus());
    assert(await dialog.evaluate(el => el.contains(globalThis.document.activeElement)), 'background must remain inert');
    pass(`${width}px: named dialog traps focus, keeps background inert and shows a visible keyboard focus ring`);
    await page.screenshot({ path: path.join(output, `export-${width}.png`) });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    const opener = page.getByRole('button', { name: 'Export', exact: true });
    assert(await opener.evaluate(el => el === globalThis.document.activeElement), 'Escape restores opener focus');
    pass(`${width}px: Escape closes dialog and restores the opener`);
    await opener.click();
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert(await opener.evaluate(el => el === globalThis.document.activeElement));
    pass(`${width}px: explicit close action works and restores focus`);
    await opener.click();
    await page.mouse.click(2, 898);
    await dialog.waitFor({ state: 'hidden' });
    await opener.click();
    await dialog.waitFor();
    pass(`${width}px: backdrop close and immediate reopen do not trigger stale timers`);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'DXF · R2010', exact: true }).click();
    const download = await downloadEvent;
    assert(download.suggestedFilename().endsWith('.dxf'));
    const dxf = new DxfParser().parseSync(await fs.readFile(await download.path(), 'utf8'));
    assert.equal(dxf.header.$ACADVER, 'AC1024');
    assert.equal(dxf.header.$INSUNITS, 6);
    assert(dxf.entities.length > 0 && dxf.entities.every(e => e.type === '3DFACE'));
    const coords = dxf.entities.flatMap(e => e.vertices.slice(0, 4));
    assert(Math.max(...coords.map(p => Math.abs(p.x))) < 0.2, 'GPX miniature millimetres must convert to DXF metres');
    await page.getByText(/Download requested/).waitFor();
    assert(!hiddenHdrRequest);
    pass(`${width}px: actual GPX → 3D → DXF download parses as R2010, 3DFACE and metric miniature`);
    await page.screenshot({ path: path.join(output, `gpx-${width}.png`) });
    await verifyModelCameraUi(page, { output, width, pass, mode: "gpx" });
    await verifyGpxLayoutUi(page, { output, width, pass });
    await verifyGpxSafetyUi(page, { base, output, width, pass });
    await verifyCourseUi(page, { base, output, width, pass });
    await verifyDraftUi(page, { base, output, width, pass });
    await verifyCourseBudgetUi(page, { output, width, pass });
    await verifyDraftTabsUi(page, { base, output, width, pass, errors });
    await verifyMapLifecycleUi(page, { width, pass, errors });
    await verifyOverlayUi(page, { base, output, width, pass });
    await verifyBuildingHolesUi(page, { base, output, width, pass });
    await verifyBuildingHolesUi(page, { base, output, width, pass, islands: true });
    await verifyBuildingHolesUi(page, { base, output, width, pass, islands: true, skillion: true });
    await verifyBuildingHolesUi(page, { base, output, width, pass, pyramidal: true });
    await verifyBuildingHolesUi(page, { base, output, width, pass, hipped: true });
    await verifyBuildingHolesUi(page, { base, output, width, pass, hipped: true, ridge: true });
    await verifyBuildingHolesUi(page, { base, output, width, pass, hipped: true, nodes: true });
    await verifyBuildingHolesUi(page, { base, output, width, pass, skillion: true, elevation: true });
    await verifyExportVisibilityUi(page, { output, width, pass });
    await verifyTerrainIntegrityUi(page, { base, output, width, pass });
    await verifySceneRecoveryUi(page, { base, output, width, pass });
    assert.deepEqual(errors, []);
    pass(`${width}px: no uncaught browser errors in tested paths`);
    await context.close();
    await browser.close();
    browser = null;
  }
  console.log(`\n${checks} browser checks passed. Mocked-network screenshots: ${output}`);
} finally {
  await browser?.close();
}
