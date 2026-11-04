import { isDeepStrictEqual } from "node:util";
import { emptyCourse, type Course } from "../src/utils/course";
import { hasDraftWriteLock, ORTHO_STORAGE_KEY, readPlannerDraft, useCourseStore } from "../src/state/courseStore";

export async function verifyDraftConflicts(ok: (condition: boolean, label: string) => void) {
  console.log("\n[11] Draft conflicts, lock queues, explicit recovery and private-player isolation");
  const original = useCourseStore.getState();
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const memory = new Map<string, string>();
  let writes = 0;
  let blocked = false;
  const storage = { getItem: (key: string) => { if (blocked) throw new Error("SecurityError"); return memory.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (blocked) throw new Error("QuotaExceededError"); memory.set(key, value); writes++; } };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
  const scene = original.scene;
  const area: [{ lat: number; lng: number }, { lat: number; lng: number }] = [{ lat: 22.30, lng: 114.16 }, { lat: 22.34, lng: 114.20 }];
  const draft = (name: string) => JSON.stringify({ course: emptyCourse(name), scene, area, revision: name });
  const localData = () => {
    const s = useCourseStore.getState();
    return { course: s.course, scene: s.scene, area: s.area, past: s.past, future: s.future, selectedId: s.selectedId };
  };
  const same = (a: unknown, b: unknown) => isDeepStrictEqual(a, b);
  const reset = (raw: string | null = draft("Base")) => {
    memory.clear(); if (raw !== null) memory.set(ORTHO_STORAGE_KEY, raw);
    useCourseStore.setState({ ...original, ...readPlannerDraft(storage), readOnly: false, externalDraft: undefined, externalInvalid: false, draftDirty: false, saveRequest: original.saveRequest + 100, plannerSnapshot: null, past: [], future: [], selectedId: null, courseError: null });
  };
  const jobs: (() => Promise<void>)[] = [];
  const signals: AbortSignal[] = [];
  const installLocks = () => Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: {
    request: (_key: string, options: { signal: AbortSignal }, callback: () => void) => new Promise<void>((resolve, reject) => {
      signals.push(options.signal);
      jobs.push(async () => { try { callback(); resolve(); } catch (error) { reject(error); } await Promise.resolve(); });
    }),
  } } });
  const flush = async () => { while (jobs.length) await jobs.shift()!(); await Promise.resolve(); };
  try {
    reset();
    const store = useCourseStore.getState();
    ok(!hasDraftWriteLock(), "missing Web Locks is an explicit best-effort capability, not atomic storage");
    store.setName("Local saved");
    const saved = memory.get(ORTHO_STORAGE_KEY)!;
    ok(useCourseStore.getState().storageBase === saved && !useCourseStore.getState().draftDirty, "successful write advances the exact raw baseline and clears unsaved state");
    const before = localData();
    memory.set(ORTHO_STORAGE_KEY, draft("Other tab"));
    store.checkStorage();
    ok(useCourseStore.getState().storageStatus === "conflict" && same(localData(), before), "external change pauses saves without replacing local course, area, scene or history");
    const count = writes;
    store.setName("Local conflict edit"); store.retrySave();
    ok(writes === count && JSON.parse(memory.get(ORTHO_STORAGE_KEY)!).course.name === "Other tab" && useCourseStore.getState().course.name === "Local conflict edit", "editing/retrying during conflict preserves both versions instead of last-writer-wins");
    const observed = useCourseStore.getState().externalDraft!;
    memory.set(ORTHO_STORAGE_KEY, draft("Newer other tab"));
    store.overwriteExternalDraft(observed);
    ok(writes === count && useCourseStore.getState().storageStatus === "conflict" && useCourseStore.getState().externalDraft === memory.get(ORTHO_STORAGE_KEY), "stale overwrite confirmation is rejected if the stored version changes again");
    store.overwriteExternalDraft(memory.get(ORTHO_STORAGE_KEY)!);
    ok(useCourseStore.getState().storageStatus === "ready" && !useCourseStore.getState().draftDirty && JSON.parse(memory.get(ORTHO_STORAGE_KEY)!).course.name === "Local conflict edit", "confirmed exact-version replacement saves the local draft and advances its baseline");
    memory.delete(ORTHO_STORAGE_KEY); store.checkStorage();
    const current = localData();
    store.retrySave();
    ok(useCourseStore.getState().storageStatus === "conflict" && memory.get(ORTHO_STORAGE_KEY) === undefined && same(localData(), current), "remote deletion cannot be silently undone by an old page retry");
    const revision = useCourseStore.getState().draftRevision;
    store.loadExternalDraft(null);
    ok(useCourseStore.getState().storageStatus === "ready" && useCourseStore.getState().storageBase === null && useCourseStore.getState().course.controls.length === 0 && useCourseStore.getState().draftRevision === revision + 1 && !useCourseStore.getState().draftDirty, "explicitly loading deletion yields an empty draft and a map-restoration revision without writing");

    memory.set(ORTHO_STORAGE_KEY, draft("Readable other tab")); store.checkStorage();
    const beforeLoadWrites = writes;
    store.loadExternalDraft(memory.get(ORTHO_STORAGE_KEY)!);
    ok(useCourseStore.getState().course.name === "Readable other tab" && same(useCourseStore.getState().area, area) && useCourseStore.getState().past.length === 0 && writes === beforeLoadWrites, "explicit load restores the validated course/scene/area, clears history, and never writes");
    memory.set(ORTHO_STORAGE_KEY, "{broken remote"); store.checkStorage();
    const own = localData();
    store.loadExternalDraft("{broken remote");
    ok(useCourseStore.getState().storageStatus === "conflict" && useCourseStore.getState().externalInvalid && same(localData(), own), "unreadable external data cannot discard a local draft even after choosing load");
    store.overwriteExternalDraft("{broken remote");
    ok(useCourseStore.getState().storageStatus === "ready" && JSON.parse(memory.get(ORTHO_STORAGE_KEY)!).course.name === "Readable other tab", "unreadable remote raw data may be replaced only through explicit confirmation");

    reset();
    const player: Course = { ...emptyCourse("Public player"), controls: [{ id: "p", kind: "control", lat: 22.32, lng: 114.17, code: "1", name: "Public", clue: "", note: "", score: 0 }] };
    store.enterPlayMode(player, area);
    memory.set(ORTHO_STORAGE_KEY, draft("External while playing")); store.checkStorage();
    const playerDisk = memory.get(ORTHO_STORAGE_KEY);
    store.retrySave(); store.overwriteExternalDraft(playerDisk!); store.loadExternalDraft(playerDisk!);
    ok(useCourseStore.getState().course.name === "Public player" && memory.get(ORTHO_STORAGE_KEY) === playerDisk, "player mode blocks both conflict resolution actions and all writes");
    store.exitPlayMode();
    ok(useCourseStore.getState().course.name === "Base" && useCourseStore.getState().storageStatus === "conflict", "player exit preserves the local planner snapshot and deferred conflict warning");

    reset(); blocked = true;
    const unknown = readPlannerDraft(storage);
    useCourseStore.setState(unknown);
    blocked = false;
    store.setName("Unknown initial baseline");
    ok(useCourseStore.getState().storageStatus === "conflict" && JSON.parse(memory.get(ORTHO_STORAGE_KEY)!).course.name === "Base", "a previously blocked initial read cannot overwrite an existing saved draft when access returns");

    reset(); installLocks();
    ok(hasDraftWriteLock(), "cooperative Web Locks support is detected");
    const lockedDisk = memory.get(ORTHO_STORAGE_KEY);
    store.setName("Queued one"); store.setName("Queued latest");
    ok(signals[0].aborted && !signals[1].aborted, "a newer edit aborts the old waiting lock request instead of retaining an unbounded payload queue");
    ok(useCourseStore.getState().storageStatus === "saving" && useCourseStore.getState().draftDirty && memory.get(ORTHO_STORAGE_KEY) === lockedDisk, "waiting for a lock is pending/dirty, never falsely saved");
    await flush();
    ok(JSON.parse(memory.get(ORTHO_STORAGE_KEY)!).course.name === "Queued latest" && useCourseStore.getState().storageStatus === "ready", "superseded queued writes are skipped; only the latest private snapshot persists");
    store.setName("Queued after remote");
    memory.set(ORTHO_STORAGE_KEY, draft("Concurrent winner"));
    await flush();
    ok(useCourseStore.getState().storageStatus === "conflict" && JSON.parse(memory.get(ORTHO_STORAGE_KEY)!).course.name === "Concurrent winner", "baseline is rechecked inside the lock, not before waiting for it");
    const stale = memory.get(ORTHO_STORAGE_KEY)!;
    store.overwriteExternalDraft(stale);
    memory.set(ORTHO_STORAGE_KEY, draft("Newer concurrent winner"));
    await flush();
    ok(useCourseStore.getState().storageStatus === "conflict" && JSON.parse(memory.get(ORTHO_STORAGE_KEY)!).course.name === "Newer concurrent winner", "a replacement confirmation cannot overwrite a write made while waiting for the lock");
    store.overwriteExternalDraft(memory.get(ORTHO_STORAGE_KEY)!); await flush();
    const beforePlayer = memory.get(ORTHO_STORAGE_KEY);
    store.setName("Unsaved private queue"); store.enterPlayMode(player, area);
    await flush();
    ok(memory.get(ORTHO_STORAGE_KEY) === beforePlayer && useCourseStore.getState().storageStatus === "write-error", "entering a player cancels pending writes without persisting a public course or claiming the private edit was saved");
    store.exitPlayMode();
    ok(useCourseStore.getState().course.name === "Unsaved private queue" && useCourseStore.getState().draftDirty, "cancelled pending private edit returns intact and remains explicitly unsaved");
    store.retrySave(); await flush();
    ok(JSON.parse(memory.get(ORTHO_STORAGE_KEY)!).course.name === "Unsaved private queue" && !useCourseStore.getState().draftDirty, "retry after player exit safely saves the private snapshot");
    store.setName("Lock read failure"); blocked = true; await flush();
    ok(useCourseStore.getState().storageStatus === "write-error" && useCourseStore.getState().draftDirty, "read/write permission failure inside the lock retains unsaved feedback");
    blocked = false; store.retrySave(); await flush();
    ok(useCourseStore.getState().storageStatus === "ready", "recovered storage access can retry with the same validated baseline");
    const beforeLockError = memory.get(ORTHO_STORAGE_KEY);
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: { request: () => Promise.reject(new Error("Lock unavailable")) } } });
    store.setName("Rejected lock"); await Promise.resolve(); await Promise.resolve();
    ok(useCourseStore.getState().storageStatus === "write-error" && useCourseStore.getState().draftDirty && memory.get(ORTHO_STORAGE_KEY) === beforeLockError, "rejected lock acquisition remains unsaved and never falls back to an unlocked write");
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: { request: () => { throw new Error("Synchronous lock failure"); } } } });
    store.setName("Thrown lock");
    ok(useCourseStore.getState().storageStatus === "write-error" && memory.get(ORTHO_STORAGE_KEY) === beforeLockError, "synchronous lock API failure is contained without changing storage or leaving a false pending save");

  } finally {
    blocked = false;
    await flush();
    useCourseStore.setState(original, true);
    if (storageDescriptor) Object.defineProperty(globalThis, "localStorage", storageDescriptor); else Reflect.deleteProperty(globalThis, "localStorage");
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor); else Reflect.deleteProperty(globalThis, "navigator");
  }
}
