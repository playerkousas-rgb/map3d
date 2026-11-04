import assert from 'node:assert/strict';
import path from 'node:path';

/** Runs inside Chromium. Only DOM geometry/hit tests and public state APIs;
 * no mocked bounding boxes, private Leaflet hooks or pageerror filtering.
 */
function inspectOverlay(onlyValidity = false) {
  const doc = globalThis.document;
  const root = doc.documentElement;
  const read = name => Number.parseFloat(root.style.getPropertyValue(name)) || 0;
  const top = read('--viewport-top');
  const bottom = top + (read('--viewport-h') || globalThis.innerHeight);
  const nav = doc.querySelector('[data-topnav]')?.getBoundingClientRect();
  const panel = doc.querySelector('[data-course-panel]');
  const pane = panel?.getBoundingClientRect();
  const scene = doc.querySelector('.scene-overlay')?.getBoundingClientRect();
  const canvas = doc.querySelector('canvas')?.getBoundingClientRect();
  const palette = doc.querySelector('.camera-palette');
  const open = palette?.dataset.cameraMode === 'fallback' ? !palette.hidden : palette?.matches(':popover-open');
  const creditElement = doc.querySelector(open ? '.camera-attribution' : '.scene-attribution');
  const credit = creditElement?.getBoundingClientRect();
  const buttons = [...doc.querySelectorAll(open ? '.camera-palette button' : '.scene-actions button')];
  const measurements = buttons.map(button => {
    const r = button.getBoundingClientRect();
    const hit = doc.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { label: button.getAttribute('aria-label'), x: r.x, y: r.y, width: r.width, height: r.height,
      valid: r.width >= 44 && r.height >= 44 && r.left >= scene.left - 1 && r.right <= scene.right + 1 &&
        r.top >= nav.bottom - 1 && r.bottom <= bottom + 1 && (hit === button || button.contains(hit)) };
  });
  const hint = doc.querySelector('.scene-credit > div:first-child');
  const hintVisible = hint && globalThis.getComputedStyle(hint).display !== 'none';
  const hintRect = hint?.getBoundingClientRect();
  const headerBottom = Math.max(...[...doc.querySelectorAll('.scene-actions button')].map(el => el.getBoundingClientRect().bottom));
  const safeBottom = Number.parseFloat(globalThis.getComputedStyle(root).getPropertyValue('--safe-bottom')) || 0;
  const targetBottom = bottom - (panel?.dataset.coursePanel === 'sheet' ? read('--sheet-h') : safeBottom);
  const layoutSettled = scene && Math.abs(scene.bottom - targetBottom) < 1 &&
    (panel?.dataset.coursePanel !== 'sheet' || Math.abs(pane.top - targetBottom) < 1);
  const disclosureSynced = doc.querySelector('.scene-actions [aria-controls]')?.getAttribute('aria-expanded') === String(Boolean(open));
  const geometry = layoutSettled && disclosureSynced && Boolean(nav && pane && scene && credit) && globalThis.getComputedStyle(creditElement).visibility === 'visible' && buttons.length === (open ? 5 : 3) &&
    measurements.every(m => m.valid) && nav.top >= top - 1 && pane.top >= nav.bottom - 1 &&
    scene.width > 0 && scene.height >= 100 && credit.left >= scene.left - 1 && credit.right <= scene.right + 1 &&
    credit.top >= (open ? nav.bottom : headerBottom) && credit.bottom <= bottom &&
    (panel.dataset.coursePanel !== 'sidebar' || (scene.right <= pane.left + 1 && canvas.right <= pane.left + 1 && canvas.width > 0)) &&
    (open || panel.dataset.coursePanel !== 'sheet' || credit.bottom <= pane.top - 1) &&
    (open || !hintVisible || (hintRect.top >= headerBottom && hintRect.left >= scene.left - 1 && hintRect.right <= scene.right + 1));
  return onlyValidity ? geometry : { valid: geometry, buttons: measurements, open, panel: panel?.dataset.coursePanel,
    canvasRight: canvas?.right, paneTop: pane?.top, sceneHeight: scene?.height, creditTop: credit?.top, creditBottom: credit?.bottom,
    top, bottom, navBottom: nav?.bottom, sheetWidth: read('--sheet-w'), sheetHeight: read('--sheet-h') };
}

export async function verifyOverlayUi(page, { base, output, width, pass }) {
  await page.waitForFunction(async () => (await import('/src/state/courseStore.ts')).useCourseStore.getState().storageStatus !== 'saving');
  const privateDraft = await page.evaluate(() => globalThis.localStorage.getItem('map3d.orienteering.v1'));
  const title = '界🙂'.repeat(1000); // 3,000 UTF-16 units; rendered hint/title must not grow without bound.
  const url = await page.evaluate(async title => (await import('/src/utils/shareLink.ts')).buildShareUrl(
    [{ lat: 22.314, lng: 114.164 }, { lat: 22.316, lng: 114.166 }],
    { name: title, playMode: 'linear', controls: [
      { id: 'overlay-start', kind: 'start', lat: 22.315, lng: 114.165, code: 'S', name: 'Overlay start', clue: '', note: '', score: 0 },
    ] }), title);
  await page.goto(url);
  await page.getByText('Player view · read only', { exact: true }).waitFor();
  await page.locator('canvas[aria-label="3D Orienteering Course"]').waitFor();
  const trigger = page.getByRole('button', { name: 'Camera controls', exact: true });
  const palette = page.getByRole('group', { name: 'Camera controls', exact: true });
  const settle = async () => {
    try { await page.waitForFunction(inspectOverlay, true, { timeout: 10000 }); }
    catch (error) { console.error('[overlay geometry]', await page.evaluate(inspectOverlay)); throw error; }
  };
  const ready = async () => {
    for (const locator of [page.locator('[data-course-panel]'), page.locator('.scene-overlay')]) {
      await locator.evaluate(el => Promise.allSettled(el.getAnimations().map(animation => animation.finished)));
    }
    await settle();
    await page.evaluate(() => new Promise(resolve => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve))));
    await settle();
    assert.equal((await page.evaluate(inspectOverlay)).valid, true, JSON.stringify(await page.evaluate(inspectOverlay)));
  };
  const full = async () => {
    await page.waitForFunction(() => {
      const sidebar = globalThis.innerWidth > 900 || globalThis.matchMedia('(min-width: 500px) and (max-height: 500px) and (orientation: landscape)').matches;
      return globalThis.document.querySelector('[data-course-panel]')?.dataset.coursePanel === (sidebar ? 'sidebar' : 'sheet');
    });
    if (await page.locator('[data-course-panel="sheet"]').count()) {
      await page.getByRole('button', { name: 'Resize course panel', exact: true }).press('End');
    }
    await ready();
  };
  const open = async () => {
    await trigger.click();
    await palette.waitFor();
    await page.waitForFunction(() => globalThis.document.querySelector('.camera-palette')?.matches(':popover-open'));
    await ready();
  };
  const close = async () => {
    await page.keyboard.press('Escape');
    await palette.waitFor({ state: 'hidden' });
    await ready();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  };
  const command = async (label, kind) => {
    const nonce = await page.evaluate(async () => (await import('/src/state/viewStore.ts')).useViewStore.getState().command?.nonce ?? 0);
    await open();
    await palette.getByRole('button', { name: label, exact: true }).click();
    await page.waitForFunction(async ({ nonce, kind }) => {
      const next = (await import('/src/state/viewStore.ts')).useViewStore.getState().command;
      return next?.nonce > nonce && next.kind === kind;
    }, { nonce, kind });
    await palette.waitFor({ state: 'hidden' });
    await ready();
  };

  await full();
  assert.equal(await page.evaluate(async () => (await import('/src/state/courseStore.ts')).useCourseStore.getState().course.name), title);
  await page.screenshot({ path: path.join(output, `overlay-full-${width}.png`) });
  pass(`${width}px: full sheet/sidebar keeps all scene triggers and full attribution visible; 3,000-unit title stays lossless and bounded`);
  for (const [label, kind] of [['Fit view', 'reset'], ['Top view', 'top'], ['Tilt view', 'tilt'], ['Zoom in', 'zoomIn'], ['Zoom out', 'zoomOut'], ['Zoom in', 'zoomIn']]) {
    await command(label, kind);
  }
  pass(`${width}px: all five 44px camera actions are hit-testable and dispatch commands; repeated zoom gets a new nonce`);
  await trigger.focus();
  await trigger.press('Space');
  await palette.waitFor();
  await page.waitForFunction(() => globalThis.document.activeElement?.getAttribute('aria-label') === 'Fit view');
  assert(await palette.getByRole('button', { name: 'Fit view', exact: true }).evaluate(el => el === globalThis.document.activeElement));
  await close();
  assert(await trigger.evaluate(el => el === globalThis.document.activeElement));
  await open();
  await page.screenshot({ path: path.join(output, `overlay-camera-${width}.png`) });
  await page.mouse.click(3, 3); // outside the top-layer palette; does not invoke a background action.
  await palette.waitFor({ state: 'hidden' });
  await ready();
  pass(`${width}px: native camera popover opens by keyboard, focuses an action, restores focus on Escape and light-dismisses`);
  await page.getByRole('button', { name: '中文 / ZH', exact: true }).click();
  await page.getByRole('button', { name: '相機控制', exact: true }).click();
  const chinesePalette = page.getByRole('group', { name: '相機控制', exact: true });
  await chinesePalette.waitFor();
  await ready();
  const chineseNonce = await page.evaluate(async () => (await import('/src/state/viewStore.ts')).useViewStore.getState().command?.nonce ?? 0);
  await chinesePalette.getByRole('button', { name: '縮小', exact: true }).click();
  await page.waitForFunction(async nonce => {
    const next = (await import('/src/state/viewStore.ts')).useViewStore.getState().command;
    return next?.kind === 'zoomOut' && next.nonce > nonce;
  }, chineseNonce);
  await chinesePalette.waitFor({ state: 'hidden' });
  await ready();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await ready();
  pass(`${width}px: real language toggle gives named Chinese camera actions without changing layout or dispatch`);
  if (width < 900) {
    const handle = page.getByRole('button', { name: 'Resize course panel', exact: true });
    for (const key of ['Home', 'ArrowUp', 'End']) { await handle.press(key); await ready(); }
    // Actual captured pointer drag rather than only setting a store value.
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 190, { steps: 10 });
    await page.mouse.up();
    await ready();
    assert.equal(await page.evaluate(async () => (await import('/src/state/courseStore.ts')).useCourseStore.getState().panelSnap), 'half');
    await full();
  } else {
    assert.equal((await page.evaluate(inspectOverlay)).sheetWidth, 360);
  }
  pass(`${width}px: actual sheet stops/drag or desktop width publication keep overlay clear of the panel`);

  if (width === 390) {
    for (const [w, h] of [[320, 568], [390, 568], [390, 320], [844, 390], [568, 320]]) {
      await page.setViewportSize({ width: w, height: h });
      await full();
      const state = await page.evaluate(inspectOverlay);
      assert.equal(state.panel, w >= 500 ? 'sidebar' : 'sheet');
      const scroll = page.locator('[data-course-panel] [data-course-scroll]');
      assert((await scroll.boundingBox()).height > 40, 'short layouts must retain a usable scroll body');
      await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.getByRole('button', { name: 'Export JSON', exact: true }).scrollIntoViewIfNeeded();
      assert(await page.getByRole('button', { name: 'Export JSON', exact: true }).evaluate(el => {
        const r = el.getBoundingClientRect(); const hit = globalThis.document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return hit === el || el.contains(hit);
      }));
      await command('Top view', 'top');
      await page.screenshot({ path: path.join(output, `overlay-short-${w}x${h}.png`) });
      pass(`${w}×${h}: resize/rotation keeps camera, credit and scrolled export reachable without negative sheet stops`);
    }
    await page.setViewportSize({ width: 390, height: 568 });
    await page.evaluate(() => {
      for (const [name, value] of Object.entries({ '--safe-top': '24px', '--safe-bottom': '20px', '--safe-left': '8px', '--safe-right': '8px' })) {
        globalThis.document.documentElement.style.setProperty(name, value);
      }
    });
    await full();
    const safe = await page.evaluate(inspectOverlay);
    assert.equal(safe.navBottom, 76, 'notch padding must be counted once, not twice');
    await command('Zoom out', 'zoomOut');
    await page.screenshot({ path: path.join(output, 'overlay-safe-area-390.png') });
    pass('390×568: simulated safe-area insets keep navigation, camera, credit and sheet in bounds');
    await page.evaluate(() => {
      for (const name of ['--safe-top', '--safe-bottom', '--safe-left', '--safe-right']) globalThis.document.documentElement.style.removeProperty(name);
      const vv = globalThis.visualViewport;
      Object.defineProperty(vv, 'height', { configurable: true, value: 400 });
      Object.defineProperty(vv, 'offsetTop', { configurable: true, value: 80 });
      vv.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('scroll'));
    });
    await full();
    const keyboard = await page.evaluate(inspectOverlay);
    assert.equal(keyboard.top, 80); assert.equal(keyboard.bottom, 480);
    await command('Fit view', 'reset');
    await page.screenshot({ path: path.join(output, 'overlay-visual-viewport-390.png') });
    pass('synthetic visualViewport pan/shrink moves panel and controls into visible bounds (not a real OS keyboard test)');
    await page.evaluate(() => {
      delete globalThis.visualViewport.height; delete globalThis.visualViewport.offsetTop;
      globalThis.visualViewport.dispatchEvent(new Event('resize'));
    });
    await page.setViewportSize({ width, height: 900 });
    await full();
  }
  if (width === 390) {
    // Force only the capability-detection branch in a fresh real page. This is
    // fallback coverage in Chromium, not a claim to have run an older browser.
    await page.addInitScript(() => {
      Object.defineProperty(globalThis.HTMLElement.prototype, 'showPopover', { configurable: true, value: undefined });
    });
    await page.reload();
    await page.getByText('Player view · read only', { exact: true }).waitFor();
    await full();
    assert.equal(await page.locator('.camera-palette').getAttribute('data-camera-mode'), 'fallback');
    await trigger.click(); await palette.waitFor(); await ready();
    await page.waitForFunction(() => globalThis.document.activeElement?.getAttribute('aria-label') === 'Fit view');
    await close();
    assert(await trigger.evaluate(el => el === globalThis.document.activeElement));
    await trigger.click(); await palette.waitFor(); await ready();
    const nonce = await page.evaluate(async () => (await import('/src/state/viewStore.ts')).useViewStore.getState().command?.nonce ?? 0);
    await palette.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await palette.waitFor({ state: 'hidden' }); await ready();
    assert(await page.evaluate(async nonce => {
      const next = (await import('/src/state/viewStore.ts')).useViewStore.getState().command;
      return next?.kind === 'zoomIn' && next.nonce > nonce;
    }, nonce));
    pass('no-Popover capability fallback retains hit-tested actions, keyboard Escape/focus and command dispatch');
    await trigger.click(); await palette.waitFor(); await ready();
    await page.screenshot({ path: path.join(output, 'overlay-camera-fallback-390.png') });
    await page.mouse.click(3, 3); await palette.waitFor({ state: 'hidden' }); await ready();
    pass('fallback palette light-dismisses without a focus trap or an extra runtime dependency');
  }
  await page.getByRole('button', { name: 'Pick another area', exact: true }).click();
  await page.getByRole('heading', { name: 'Generate 3D Map', level: 1 }).waitFor();
  assert.equal(await page.evaluate(() => globalThis.localStorage.getItem('map3d.orienteering.v1')), privateDraft);
  assert(await page.evaluate(() => ['--sheet-h', '--sheet-w', '--viewport-top', '--viewport-bottom', '--viewport-h', '--scene-bottom']
    .every(name => globalThis.document.documentElement.style.getPropertyValue(name) === '')));
  assert.equal(new URL(page.url()).origin, new URL(base).origin);
  pass(`${width}px: leaving the scene removes published layout metrics without changing the private saved draft`);
}
