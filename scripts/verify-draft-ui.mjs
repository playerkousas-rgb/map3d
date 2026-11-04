import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Controlled File.text promises / storage failures, not timing-based large-file races. */
export async function verifyDraftUi(page, { base, output, width, pass }) {
  const key = 'map3d.orienteering.v1';
  const name = page.getByRole('textbox', { name: 'Course name', exact: true });
  const file = page.locator('input[type=file][accept="application/json,.json"]').last();
  const course = await page.evaluate(async () => (await import('/src/state/courseStore.ts')).useCourseStore.getState().course);
  const upload = async (filename, title) => file.setInputFiles({ name: filename, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...course, name: title })) });
  const waitName = title => page.waitForFunction(title => [...globalThis.document.querySelectorAll('input[aria-label="Course name"]')].some(input => input.value === title), title);
  await page.evaluate(() => {
    const original = File.prototype.text;
    globalThis.__courseReads = new Map();
    File.prototype.text = function () {
      if (!this.name.startsWith('deferred-')) return original.call(this);
      return new Promise((resolve, reject) => globalThis.__courseReads.set(this.name, {
        release: () => original.call(this).then(resolve), reject: () => reject(new Error('controlled read failure')),
      }));
    };
  });
  const release = async (filename, reject = false) => page.evaluate(async ({ filename, reject }) => {
    const task = globalThis.__courseReads.get(filename);
    if (!task) throw new Error('Expected a deferred file read');
    await (reject ? task.reject() : task.release());
    globalThis.__courseReads.delete(filename);
    await new Promise(resolve => globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)));
  }, { filename, reject });
  const latestWins = async prefix => {
    await upload(`deferred-${prefix}-old.json`, 'Stale file');
    await upload(`${prefix}-new.json`, `${prefix} latest`);
    await waitName(`${prefix} latest`);
    await release(`deferred-${prefix}-old.json`);
    assert.equal(await name.inputValue(), `${prefix} latest`);
    await upload(`deferred-${prefix}-error.json`, 'Stale error');
    await upload(`${prefix}-newer.json`, `${prefix} newer`);
    await waitName(`${prefix} newer`);
    await release(`deferred-${prefix}-error.json`, true);
    assert.equal(await name.inputValue(), `${prefix} newer`);
    assert.equal(await page.getByRole('alert').filter({ hasText: 'That JSON could not be read as a course.' }).count(), 0);
    pass(`${width}px: ${prefix} file picker ignores superseded successful AND failed reads`);
  };
  await latestWins('front');
  await upload('deferred-edited.json', 'Overwrite edit');
  await name.fill('User edit wins');
  await release('deferred-edited.json');
  assert.equal(await name.inputValue(), 'User edit wins');
  await upload('deferred-mode.json', 'Overwrite mode');
  await page.getByRole('button', { name: 'Map → 3D Buildings', exact: true }).click();
  await release('deferred-mode.json');
  await page.getByRole('button', { name: '3D Orienteering', exact: true }).click();
  assert.equal(await name.inputValue(), 'User edit wins');
  pass(`${width}px: pending front import cannot overwrite an edit or a switched mode`);

  await page.getByRole('button', { name: 'Get 3D scene', exact: true }).click();
  await page.getByRole('button', { name: 'Open 3D anyway', exact: true }).click();
  await name.waitFor();
  if (width < 900) await page.getByRole('button', { name: 'Resize course panel', exact: true }).press('End');
  await latestWins('panel');
  await upload('deferred-unmounted.json', 'Overwrite closed panel');
  await page.getByRole('button', { name: 'Pick another area', exact: true }).click();
  await release('deferred-unmounted.json');
  assert.equal(await name.inputValue(), 'panel newer');
  pass(`${width}px: unmounted course panel cannot apply a late file read`);

  const playerUrl = await page.evaluate(async () => {
    const state = (await import('/src/state/courseStore.ts')).useCourseStore.getState();
    return (await import('/src/utils/shareLink.ts')).buildShareUrl(state.area, { ...state.course, name: 'Public course' });
  });
  await upload('deferred-player.json', 'Overwrite player');
  await page.goto(playerUrl);
  await page.getByText('Player view · read only', { exact: true }).waitFor();
  await release('deferred-player.json');
  assert.equal(await page.evaluate(async () => (await import('/src/state/courseStore.ts')).useCourseStore.getState().course.name), 'Public course');
  await page.getByRole('button', { name: 'Pick another area', exact: true }).click();
  assert.equal(await name.inputValue(), 'panel newer');
  pass(`${width}px: opening a player link invalidates pending imports and preserves the planner`);

  const disk = await page.evaluate(key => globalThis.localStorage.getItem(key), key);
  await page.evaluate(key => {
    const original = globalThis.Storage.prototype.setItem;
    globalThis.__draftWritesBlocked = true;
    globalThis.Storage.prototype.setItem = function (name, value) {
      if (name === key && globalThis.__draftWritesBlocked) throw new DOMException('Controlled test failure', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, key);
  await name.fill('Unsaved browser draft');
  const warning = page.locator('[data-draft-status="write-error"]');
  await warning.waitFor();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download current JSON backup', exact: true }).click();
  const backup = JSON.parse(await fs.readFile(await (await downloadEvent).path(), 'utf8'));
  assert.equal(backup.course.name, 'Unsaved browser draft');
  assert.deepEqual(backup.course.controls, course.controls);
  pass(`${width}px: failed local save is visible and a real downloaded JSON recovers current private data`);
  const own = await page.evaluate(async () => {
    const s = (await import('/src/state/courseStore.ts')).useCourseStore.getState();
    return { course: s.course, area: s.area, scene: s.scene };
  });
  await page.goto(playerUrl);
  await page.getByText('Player view · read only', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-draft-status]').count(), 0);
  await page.getByRole('button', { name: 'Pick another area', exact: true }).click();
  await warning.waitFor();
  const restored = await page.evaluate(async () => {
    const s = (await import('/src/state/courseStore.ts')).useCourseStore.getState();
    return { course: s.course, area: s.area, scene: s.scene };
  });
  assert.deepEqual(restored, own);
  assert.equal(await page.evaluate(key => globalThis.localStorage.getItem(key), key), disk);
  await warning.evaluate(element => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(output, `draft-save-error-${width}.png`) });
  pass(`${width}px: player round-trip preserves unsaved RAM course, scene, area and save-error warning`);
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await warning.waitFor();
  await page.evaluate(() => { globalThis.__draftWritesBlocked = false; });
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await warning.waitFor({ state: 'detached' });
  await page.waitForFunction(async () => (await import('/src/state/courseStore.ts')).useCourseStore.getState().storageStatus === 'ready');
  assert.equal(JSON.parse(await page.evaluate(key => globalThis.localStorage.getItem(key), key)).course.name, own.course.name);
  await page.reload();
  await page.getByRole('button', { name: '3D Orienteering', exact: true }).click();
  assert.equal(await name.inputValue(), own.course.name);
  assert.equal(await page.getByRole('button', { name: 'Get 3D scene', exact: true }).isEnabled(), true);
  await page.locator('.leaflet-overlay-pane path').first().waitFor({ state: 'attached' });
  assert.deepEqual(await page.evaluate(async () => (await import('/src/state/courseStore.ts')).useCourseStore.getState().area), own.area);
  pass(`${width}px: successful retry survives reload with the private course and usable map selection`);

  const original = '{unreadable original bytes';
  await page.evaluate(({ key, original }) => globalThis.localStorage.setItem(key, original), { key, original });
  await page.reload();
  await page.getByRole('button', { name: '3D Orienteering', exact: true }).click();
  await page.locator('[data-draft-status="invalid"]').waitFor();
  await name.fill('Explicit replacement');
  assert.equal(await page.evaluate(key => globalThis.localStorage.getItem(key), key), original);
  const rawDownloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download original data', exact: true }).click();
  assert.equal(await fs.readFile(await (await rawDownloadEvent).path(), 'utf8'), original);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Replace original draft…', exact: true }).click();
  assert.equal(await page.evaluate(key => globalThis.localStorage.getItem(key), key), original);
  await page.locator('[data-draft-status="invalid"]').evaluate(element => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(output, `draft-recovery-${width}.png`) });
  pass(`${width}px: unreadable draft is not overwritten; original download is exact and replace can be cancelled`);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Replace original draft…', exact: true }).click();
  await page.locator('[data-draft-status]').waitFor({ state: 'detached' });
  await page.reload();
  await page.getByRole('button', { name: '3D Orienteering', exact: true }).click();
  assert.equal(await name.inputValue(), 'Explicit replacement');
  assert.equal(await page.locator('[data-draft-status]').count(), 0);
  pass(`${width}px: explicit replacement survives reload even for a named empty draft`);
  assert.equal(new URL(page.url()).origin, new URL(base).origin);
}
