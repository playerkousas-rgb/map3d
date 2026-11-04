import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const key = 'map3d.orienteering.v1';
const state = page => page.evaluate(async () => {
  const s = (await import('/src/state/courseStore.ts')).useCourseStore.getState();
  return { status: s.storageStatus, course: s.course, area: s.area, scene: s.scene, dirty: s.draftDirty, past: s.past.length, future: s.future.length };
});
const idle = page => page.waitForFunction(async () => (await import('/src/state/courseStore.ts')).useCourseStore.getState().storageStatus !== 'saving');
const ready = page => page.waitForFunction(async () => (await import('/src/state/courseStore.ts')).useCourseStore.getState().storageStatus === 'ready');
const disk = page => page.evaluate(key => globalThis.localStorage.getItem(key), key);
const name = page => page.getByRole('textbox', { name: 'Course name', exact: true });
const confirm = (page, accept = true) => page.once('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
async function holdLock(page) {
  await page.evaluate(key => {
    globalThis.__heldDraftLock = false;
    void globalThis.navigator.locks.request(key, async () => {
      await new Promise(resolve => {
        globalThis.__releaseDraftLock = raw => {
          if (raw !== undefined) globalThis.localStorage.setItem(key, raw);
          resolve();
        };
        globalThis.__heldDraftLock = true;
      });
      globalThis.__heldDraftLock = false;
    });
  }, key);
  await page.waitForFunction(() => globalThis.__heldDraftLock);
}
const releaseLock = (page, raw) => page.evaluate(raw => globalThis.__releaseDraftLock(raw), raw);
async function upload(page, course) {
  const previous = (await state(page)).past;
  await page.locator('input[type=file][accept="application/json,.json"]').last().setInputFiles({ name: 'two-tabs.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(course)) });
  await page.waitForFunction(async previous => (await import('/src/state/courseStore.ts')).useCourseStore.getState().past.length !== previous, previous);
  await ready(page);
}

/** Two real pages in the SAME browser context: shared storage/events and real origin-scoped Web Locks. */
export async function verifyDraftTabsUi(page, { base, output, width, pass, errors }) {
  await page.getByRole('button', { name: 'Pick another area', exact: true }).click();
  const seed = { name: 'Tab base', playMode: 'linear', meet: 'PRIVATE MEET', controls: [
    { id: 'tab-one', kind: 'control', lat: 22.32, lng: 114.17, code: '1', name: 'Tab checkpoint', clue: 'Gate', note: 'PRIVATE TAB NOTE', score: 10 },
  ] };
  await upload(page, seed);
  const peer = await page.context().newPage();
  peer.on('pageerror', error => { errors.push(error.message); console.error('[peer pageerror]', error.stack ?? error.message); });
  try {
    await peer.goto(base);
    await peer.getByRole('button', { name: '3D Orienteering', exact: true }).click();
    assert.equal(await name(peer).inputValue(), seed.name);
    assert(await page.evaluate(() => typeof globalThis.navigator.locks?.request === 'function'));
    const baseline = await disk(page);
    await holdLock(page);
    await name(page).fill('Tab A simultaneous');
    await name(peer).fill('Tab B simultaneous');
    assert.equal((await state(page)).status, 'saving');
    assert.equal((await state(peer)).status, 'saving');
    assert.equal(await disk(page), baseline);
    const pendingDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download current JSON backup', exact: true }).click();
    const pendingBackup = JSON.parse(await fs.readFile(await (await pendingDownload).path(), 'utf8'));
    assert.equal(pendingBackup.course.name, 'Tab A simultaneous');
    assert.deepEqual(pendingBackup.course.controls, seed.controls);
    assert.equal(await disk(page), baseline);
    await releaseLock(page);
    await idle(page); await idle(peer);
    const a = await state(page), b = await state(peer);
    assert.deepEqual([a.status, b.status].sort(), ['conflict', 'ready']);
    assert.equal(a.course.name, 'Tab A simultaneous');
    assert.equal(b.course.name, 'Tab B simultaneous');
    const winner = a.status === 'ready' ? page : peer;
    const loser = a.status === 'conflict' ? page : peer;
    const winnerName = (await state(winner)).course.name;
    const loserName = (await state(loser)).course.name;
    const saved = await disk(page);
    assert.equal(JSON.parse(saved).course.name, winnerName);
    pass(`${width}px: two real tabs queue concurrent writes under Web Locks; exactly one saves and the other retains a conflict draft`);

    const warning = loser.locator('[data-draft-status="conflict"]').last();
    await warning.waitFor();
    const currentDownload = loser.waitForEvent('download');
    await loser.getByRole('button', { name: 'Download current JSON backup', exact: true }).click();
    const localBackup = JSON.parse(await fs.readFile(await (await currentDownload).path(), 'utf8'));
    assert.equal(localBackup.course.name, loserName);
    assert.deepEqual(localBackup.course.controls, seed.controls);
    const remoteDownload = loser.waitForEvent('download');
    await loser.getByRole('button', { name: 'Download saved version data', exact: true }).click();
    assert.equal(await fs.readFile(await (await remoteDownload).path(), 'utf8'), saved);
    await warning.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await loser.screenshot({ path: path.join(output, `draft-conflict-${width}.png`) });
    confirm(loser, false);
    await loser.getByRole('button', { name: 'Replace saved version with this page…', exact: true }).click();
    assert.equal(await disk(page), saved);
    pass(`${width}px: conflict offers real complete backups of BOTH versions and cancellation never overwrites either`);

    await holdLock(winner);
    confirm(loser);
    await loser.getByRole('button', { name: 'Replace saved version with this page…', exact: true }).click();
    assert.equal((await state(loser)).status, 'saving');
    // Controlled cooperating lock owner changes the version before releasing to the confirmer.
    const newer = JSON.stringify({ ...JSON.parse(saved), course: { ...JSON.parse(saved).course, name: 'Newer while lock held' }, revision: `intervening-${width}` });
    await releaseLock(winner, newer);
    await idle(loser);
    assert.equal((await state(loser)).status, 'conflict');
    assert.equal((await state(loser)).course.name, loserName);
    assert.equal(await disk(page), newer);
    pass(`${width}px: a real intervening locked write invalidates stale replacement confirmation`);
    confirm(loser);
    await loser.getByRole('button', { name: 'Replace saved version with this page…', exact: true }).click();
    await ready(loser);
    assert.equal(JSON.parse(await disk(page)).course.name, loserName);
    await winner.locator('[data-draft-status="conflict"]').last().waitFor();
    pass(`${width}px: renewed explicit confirmation replaces only the observed saved version, notifying the other tab`);

    const restoredArea = [{ lat: 22.31, lng: 114.16 }, { lat: 22.33, lng: 114.18 }];
    await loser.evaluate(async area => {
      const s = (await import('/src/state/courseStore.ts')).useCourseStore.getState();
      s.setArea(area); s.setScene({ groundLayer: 'plain', showGrid: false });
    }, restoredArea);
    await ready(loser);
    await winner.waitForFunction(async () => {
      const s = (await import('/src/state/courseStore.ts')).useCourseStore.getState();
      return s.externalDraft === globalThis.localStorage.getItem('map3d.orienteering.v1');
    });
    confirm(winner, false);
    await winner.getByRole('button', { name: 'Load saved version…', exact: true }).click();
    assert.equal(await name(winner).inputValue(), winnerName);
    confirm(winner);
    await winner.getByRole('button', { name: 'Load saved version…', exact: true }).click();
    await ready(winner);
    assert.equal(await name(winner).inputValue(), loserName);
    const loaded = await state(winner);
    assert.deepEqual(loaded.area, restoredArea);
    assert.equal(loaded.scene.groundLayer, 'plain');
    assert.equal(loaded.scene.showGrid, false);
    assert.equal(loaded.past, 0); assert.equal(loaded.future, 0);
    await winner.locator('.leaflet-overlay-pane path').first().waitFor({ state: 'attached' });
    assert.equal(await winner.getByRole('button', { name: 'Get 3D scene', exact: true }).isEnabled(), true);
    pass(`${width}px: explicit load (not automatic merge) restores the external course, scene and usable map area; cancel preserves local data`);

    await loser.evaluate(key => globalThis.localStorage.removeItem(key), key);
    await winner.locator('[data-draft-status="conflict"]').last().waitFor();
    await name(winner).fill('Preserved after deletion');
    assert.equal(await disk(page), null);
    confirm(winner);
    await winner.getByRole('button', { name: 'Load saved version…', exact: true }).click();
    await ready(winner);
    assert.equal((await state(winner)).course.controls.length, 0);
    assert.equal((await state(winner)).area, null);
    assert.equal(await disk(page), null);
    await winner.waitForFunction(() => globalThis.document.querySelector('.leaflet-overlay-pane path') === null);
    assert.equal(await winner.getByRole('button', { name: 'Get 3D scene', exact: true }).isEnabled(), false);
    pass(`${width}px: remote deletion is a conflict, never automatic resurrection; confirmed load clears the map selection`);
    const corrupt = '{other tab unreadable bytes';
    await loser.evaluate(({ key, corrupt }) => globalThis.localStorage.setItem(key, corrupt), { key, corrupt });
    await winner.locator('[data-draft-status="conflict"]').last().waitFor();
    const beforeCorrupt = await state(winner);
    confirm(winner);
    await winner.getByRole('button', { name: 'Load saved version…', exact: true }).click();
    await winner.getByText(/The saved version is unreadable and was not loaded/).waitFor();
    assert.deepEqual((await state(winner)).course, beforeCorrupt.course);
    assert.equal(await disk(page), corrupt);
    pass(`${width}px: unreadable external version is not loaded over the local draft and remains downloadable`);
    confirm(winner);
    await winner.getByRole('button', { name: 'Replace saved version with this page…', exact: true }).click();
    await ready(winner);
    await upload(winner, seed);
    await winner.evaluate(async area => (await import('/src/state/courseStore.ts')).useCourseStore.getState().setArea(area), restoredArea);
    await ready(winner);
    const playerUrl = await winner.evaluate(async () => {
      const s = (await import('/src/state/courseStore.ts')).useCourseStore.getState();
      return (await import('/src/utils/shareLink.ts')).buildShareUrl(s.area, { ...s.course, name: 'Public tab player' });
    });
    const privateDisk = await disk(winner);
    await holdLock(loser);
    await name(winner).fill('Private pending lock');
    assert.equal((await state(winner)).status, 'saving');
    await winner.goto(playerUrl);
    await winner.getByText('Player view · read only', { exact: true }).waitFor();
    await releaseLock(loser);
    assert.equal(await disk(winner), privateDisk);
    await winner.getByRole('button', { name: 'Pick another area', exact: true }).click();
    await winner.locator('[data-draft-status="write-error"]').last().waitFor();
    assert.equal(await name(winner).inputValue(), 'Private pending lock');
    await winner.getByRole('button', { name: 'Retry saving', exact: true }).click();
    await ready(winner);
    assert.equal(JSON.parse(await disk(winner)).course.name, 'Private pending lock');
    pass(`${width}px: player opening cancels a pending locked save, returns private RAM data and retries without writing public data`);

    await holdLock(loser);
    await name(winner).fill('Unsaved unload guard');
    const dialogEvent = winner.waitForEvent('dialog');
    const attemptedReload = winner.evaluate(() => globalThis.location.reload());
    const dialog = await dialogEvent;
    assert.equal(dialog.type(), 'beforeunload');
    await dialog.dismiss();
    await attemptedReload;
    assert.equal(await name(winner).inputValue(), 'Unsaved unload guard');
    assert.equal((await state(winner)).dirty, true);
    await releaseLock(loser); await ready(winner);
    pass(`${width}px: a pending unsaved draft triggers a real beforeunload prompt; cancelling preserves the page`);

    // Fallback gets its own page override; same-origin peers still use real Web Locks.
    const fallback = await page.context().newPage();
    fallback.on('pageerror', error => { errors.push(error.message); });
    try {
      await fallback.addInitScript(() => Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: undefined }));
      await fallback.goto(base);
      await fallback.getByRole('button', { name: '3D Orienteering', exact: true }).click();
      await fallback.locator('[data-storage-locks="unavailable"]').waitFor();
      await name(fallback).fill('Single-tab fallback');
      await ready(fallback);
      assert.equal(JSON.parse(await disk(fallback)).course.name, 'Single-tab fallback');
      pass(`${width}px: no-Web-Locks fallback remains usable but visibly requires a single editing tab`);
    } finally { await fallback.close(); }

    // Return the main page to the current validated baseline for the lifecycle gate.
    await page.bringToFront();
    await page.waitForFunction(async () => {
      const s = (await import('/src/state/courseStore.ts')).useCourseStore.getState();
      return s.storageStatus === 'conflict' || s.storageBase === globalThis.localStorage.getItem('map3d.orienteering.v1');
    });
    if ((await state(page)).status === 'conflict') {
      confirm(page);
      await page.getByRole('button', { name: 'Load saved version…', exact: true }).click();
      await ready(page);
    }
  } finally {
    // Release a held diagnostic lock even if an assertion failed, then close peers.
    await peer.evaluate(() => globalThis.__releaseDraftLock?.()).catch(() => {});
    await page.evaluate(() => globalThis.__releaseDraftLock?.()).catch(() => {});
    await peer.close();
  }
}

/** Actual zoom -> hash player -> keyed map remount, with no pageerror filtering. */
export async function verifyMapLifecycleUi(page, { width, pass, errors }) {
  const initialErrors = errors.length;
  const privateName = await name(page).inputValue();
  const saved = await disk(page);
  const playerUrl = await page.evaluate(async () => {
    const s = (await import('/src/state/courseStore.ts')).useCourseStore.getState();
    return (await import('/src/utils/shareLink.ts')).buildShareUrl(s.area, s.course);
  });
  for (let i = 0; i < 8; i++) {
    await page.locator('.leaflet-control-zoom-in').click();
    await page.goto(playerUrl);
    await page.getByText('Player view · read only', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Pick another area', exact: true }).click();
    assert.equal(await name(page).inputValue(), privateName);
    await page.locator('.leaflet-overlay-pane path').first().waitFor({ state: 'attached' });
    assert.equal(await page.getByRole('button', { name: 'Get 3D scene', exact: true }).isEnabled(), true);
  }
  // Leaflet 1.9.4 has a 250ms zoom-transition fallback callback. Drain its known window.
  await page.evaluate(() => new Promise(resolve => globalThis.setTimeout(resolve, 350)));
  assert.equal(await disk(page), saved);
  assert.equal(errors.length, initialErrors, "zoom teardown must not emit late pageerrors");
  pass(`${width}px: eight actual zoom/player/remount cycles retain private course, area and storage without stale callbacks in the pageerror gate`);
}
