import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const maxBytes = 1_000_000;
function boundaryBackup() {
  const course = { name: 'Budget boundary', playMode: 'linear', controls: Array.from({ length: 80 }, (_, i) => ({
    id: `budget-${i}`, kind: i === 0 ? 'start' : 'control', lat: 22.32 + i * .000001, lng: 114.17,
    code: i === 0 ? 'S' : String(i), name: `Budget control ${i}`, clue: '', note: '界'.repeat(4000), score: 0,
  })) };
  const stringify = () => JSON.stringify({ app: 'map3d-orienteering', version: 1, exportedAt: '2026-11-03T00:00:00.000Z', course });
  let remaining = maxBytes - Buffer.byteLength(stringify());
  for (const c of course.controls) {
    const size = Math.min(remaining, 4000);
    c.clue = 'a'.repeat(size); remaining -= size;
  }
  assert.equal(remaining, 0);
  assert.equal(Buffer.byteLength(stringify()), maxBytes);
  return stringify();
}

/** Exercise real controlled text inputs, rejected edits, download and reimport at the byte boundary. */
export async function verifyCourseBudgetUi(page, { output, width, pass }) {
  const name = page.getByRole('textbox', { name: 'Course name', exact: true });
  const file = page.locator('input[type=file][accept="application/json,.json"]').last();
  const upload = async text => {
    const history = await page.evaluate(async () => (await import('/src/state/courseStore.ts')).useCourseStore.getState().past.length);
    await file.setInputFiles({ name: 'budget.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await page.waitForFunction(async history => (await import('/src/state/courseStore.ts')).useCourseStore.getState().past.length === history + 1, history);
    await page.waitForFunction(async () => (await import("/src/state/courseStore.ts")).useCourseStore.getState().storageStatus !== "saving");
  };
  // Hash only synthetic fixture data to compare course, selection, history and disk without moving MBs over CDP.
  const snapshot = () => page.evaluate(async () => {
    const state = (await import('/src/state/courseStore.ts')).useCourseStore.getState();
    const value = JSON.stringify({ course: state.course, selectedId: state.selectedId, past: state.past, future: state.future, tool: state.tool, disk: globalThis.localStorage.getItem('map3d.orienteering.v1') });
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new globalThis.TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).join(',');
  });
  const visibleClue = () => page.waitForFunction(() => {
    const label = [...globalThis.document.querySelectorAll('[data-course-editor] label')].find(el => el.textContent.trim() === 'Clue');
    const body = label?.closest('[data-course-scroll]');
    const input = label?.querySelector('input');
    if (!label || !body || !input) return false;
    const rect = label.getBoundingClientRect();
    const container = body.getBoundingClientRect();
    const field = input.getBoundingClientRect();
    const editor = label.closest("[data-course-editor]").getBoundingClientRect();
    return field.left >= editor.left && field.right <= editor.right && rect.top >= container.top - 1 && rect.bottom <= container.bottom + 1 &&
      globalThis.document.elementFromPoint(field.x + field.width / 2, field.y + field.height / 2) === input;
  });
  const course = { name: 'Budget editable', playMode: 'linear', meet: '', controls: [
    { id: 'edit', kind: 'control', lat: 22.32, lng: 114.17, code: '', name: 'Budget editable control', clue: 'Existing clue', note: 'PRIVATE NOTE', score: 0 },
  ] };
  await upload(JSON.stringify(course));
  let before = await snapshot();
  await name.fill('a'.repeat(4001));
  const fieldWarning = page.locator('[data-course-error="TEXT_TOO_LONG"]').last();
  await fieldWarning.waitFor();
  assert.equal(await name.inputValue(), course.name);
  assert.equal(await snapshot(), before);
  await fieldWarning.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(output, `course-limit-front-${width}.png`) });
  await page.getByRole('button', { name: 'Dismiss course limit warning', exact: true }).click();
  await fieldWarning.waitFor({ state: 'detached' });
  pass(`${width}px: actual front name input rejects 4,001 units visibly without truncating course/history/storage`);

  await page.getByRole('button', { name: 'Select Box', exact: true }).click();
  const map = page.locator('.leaflet-container');
  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  await page.mouse.move(box.x + box.width * .4, box.y + box.height * .4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .6, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Get 3D scene', exact: true }).click();
  await page.getByRole('button', { name: 'Open 3D anyway', exact: true }).click();
  await name.waitFor();
  if (width < 900) await page.getByRole('button', { name: 'Resize course panel', exact: true }).press('End');
  await page.getByRole('button', { name: /Budget editable control/ }).click();
  if (width < 900) await page.getByRole('button', { name: 'Resize course panel', exact: true }).press('End');
  const clue = page.getByLabel('Clue', { exact: true });
  before = await snapshot();
  await clue.fill('a'.repeat(4001));
  await fieldWarning.waitFor();
  await visibleClue();
  assert.equal(await clue.inputValue(), 'Existing clue');
  assert.equal(await snapshot(), before);
  await clue.fill('😃'.repeat(2000));
  await fieldWarning.waitFor({ state: 'detached' });
  assert.equal((await clue.inputValue()).length, 4000);
  pass(`${width}px: panel keeps the focused clue fully visible, rejects overflow atomically and accepts 4,000 UTF-16 units`);

  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const text = await fs.readFile(await (await downloadEvent).path(), 'utf8');
  const current = await page.evaluate(async () => (await import('/src/state/courseStore.ts')).useCourseStore.getState().course);
  assert.deepEqual(JSON.parse(text).course, JSON.parse(JSON.stringify(current)));
  assert.equal(JSON.parse(text).course.controls[0].code, '');
  assert.equal(JSON.parse(text).course.meet, '');
  await upload(text);
  const reimported = await page.evaluate(async () => (await import('/src/state/courseStore.ts')).useCourseStore.getState().course);
  assert.deepEqual(JSON.parse(JSON.stringify(reimported)), JSON.parse(text).course);
  pass(`${width}px: actual JSON download/reimport preserves emoji, blank code, empty metadata and private note exactly`);

  await upload(boundaryBackup());
  assert.equal(await name.inputValue(), 'Budget boundary');
  await page.getByRole('button', { name: /Budget control 79/ }).click();
  if (width < 900) await page.getByRole('button', { name: 'Resize course panel', exact: true }).press('End');
  before = await snapshot();
  await clue.fill('界');
  const byteWarning = page.locator('[data-course-error="COURSE_TOO_LARGE"]').last();
  await byteWarning.waitFor();
  await visibleClue();
  assert.equal(await clue.inputValue(), '');
  assert.equal(await snapshot(), before);
  assert.equal(await byteWarning.getByRole('button', { name: 'Dismiss course limit warning', exact: true }).evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.width >= 44 && rect.height >= 44;
  }), true);
  await page.screenshot({ path: path.join(output, `course-limit-panel-${width}.png`) });
  pass(`${width}px: exact 1 MB multibyte draft rejects total-byte growth without touching selection/history/storage`);
  const boundaryDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const boundaryText = await fs.readFile(await (await boundaryDownload).path(), 'utf8');
  assert.equal(Buffer.byteLength(boundaryText), maxBytes);
  assert(!boundaryText.includes('\n'), 'near-limit backup must omit formatting whitespace, not data');
  const originalBoundary = JSON.parse(boundaryBackup()).course;
  assert.deepEqual(JSON.parse(boundaryText).course, originalBoundary);
  await upload(boundaryText);
  assert.equal(await byteWarning.count(), 0);
  const importedBoundary = await page.evaluate(async () => (await import('/src/state/courseStore.ts')).useCourseStore.getState().course);
  assert.deepEqual(JSON.parse(JSON.stringify(importedBoundary)), originalBoundary);
  pass(`${width}px: actual exact-byte compact download reimports all 80 controls and every private field unchanged`);
}
