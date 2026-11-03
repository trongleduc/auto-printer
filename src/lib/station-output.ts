"use client";

/**
 * How this station outputs a sheet. Stored in this browser only, because the
 * output folder can only be granted on the station PC itself.
 * - "printer": window.print() (needs Chrome's --kiosk-printing to skip the dialog)
 * - "pdf":     build a PDF and write it into a folder picked once with the
 *              File System Access API (Chrome/Edge). No dialog, no file name prompt.
 */
export type OutputMode = "printer" | "pdf";
export type OutputPrefs = { mode: OutputMode; perDay: boolean };

const PREFS_KEY = "station-output";
const DEFAULT_PREFS: OutputPrefs = { mode: "printer", perDay: true };

export function loadPrefs(): OutputPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<OutputPrefs> | null;
    return {
      mode: raw?.mode === "pdf" ? "pdf" : "printer",
      perDay: typeof raw?.perDay === "boolean" ? raw.perDay : DEFAULT_PREFS.perDay,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: OutputPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: the choice lasts until the page reloads */
  }
}

// ─── File System Access (not in TypeScript's DOM lib) ─────────────────────

type PermissionMode = { mode: "readwrite" };
export type DirHandle = FileSystemDirectoryHandle & {
  queryPermission(d: PermissionMode): Promise<PermissionState>;
  requestPermission(d: PermissionMode): Promise<PermissionState>;
};
type Picker = (o?: { id?: string; mode?: "readwrite"; startIn?: string }) => Promise<DirHandle>;

export const folderSupported = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

/** Must be called from a click. */
export async function pickFolder(): Promise<DirHandle> {
  const picker = (window as unknown as { showDirectoryPicker: Picker }).showDirectoryPicker;
  const handle = await picker({ id: "auto-printer-output", mode: "readwrite", startIn: "documents" });
  await saveFolder(handle);
  return handle;
}

export async function folderPermission(h: DirHandle): Promise<PermissionState> {
  return h.queryPermission({ mode: "readwrite" });
}

/** Must be called from a click. Chrome offers "Allow on every visit" so this is needed only once. */
export async function requestFolderPermission(h: DirHandle): Promise<boolean> {
  return (await h.requestPermission({ mode: "readwrite" })) === "granted";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Writes `To-0012_2026-11-03_14-05.pdf`, optionally inside a `2026-11-03` subfolder. Returns the path written. */
export async function writeSheetFile(
  root: DirHandle,
  sheetNumber: number,
  bytes: Uint8Array,
  perDay: boolean,
  when = new Date(),
): Promise<string> {
  const day = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  const name = `To-${String(sheetNumber).padStart(4, "0")}_${day}_${pad(when.getHours())}-${pad(when.getMinutes())}.pdf`;
  const dir = perDay ? await root.getDirectoryHandle(day, { create: true }) : root;
  const file = await dir.getFileHandle(name, { create: true });
  const w = await file.createWritable();
  try {
    await w.write(bytes as Uint8Array<ArrayBuffer>);
  } finally {
    await w.close();
  }
  return perDay ? `${day}/${name}` : name;
}

export function exampleFileName(perDay: boolean): string {
  return `${perDay ? "2026-11-03/" : ""}To-0012_2026-11-03_14-05.pdf`;
}

// ─── IndexedDB: the folder handle survives reloads ────────────────────────

const DB_NAME = "auto-printer";
const STORE = "kv";
const FOLDER_KEY = "output-folder";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function saveFolder(h: DirHandle) {
  await tx("readwrite", (s) => s.put(h, FOLDER_KEY));
}

export async function loadFolder(): Promise<DirHandle | null> {
  try {
    return ((await tx("readonly", (s) => s.get(FOLDER_KEY))) as DirHandle | undefined) ?? null;
  } catch {
    return null;
  }
}

// ─── current state, read fresh by the station on every poll ───────────────

/** "none": no folder picked; "prompt": picked but Chrome needs a click to allow it again. */
export type FolderState = "none" | "prompt" | "granted" | "denied";
export type OutputState = { prefs: OutputPrefs; folder: DirHandle | null; folderState: FolderState };

/** Settings are edited in /admin (on this PC); the station re-reads them so changes apply without a reload. */
export async function readOutput(): Promise<OutputState> {
  const prefs = loadPrefs();
  const folder = folderSupported() ? await loadFolder() : null;
  const folderState: FolderState = folder ? await folderPermission(folder).catch(() => "prompt" as const) : "none";
  return { prefs, folder, folderState };
}

export const outputReady = (o: OutputState) =>
  o.prefs.mode === "printer" || (!!o.folder && o.folderState === "granted");
