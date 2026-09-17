export const HISTORY_KEY = "ecodev-history";
export const HISTORY_LIMIT = 12;
export const CLEAR_HISTORY_CONFIRMATION = "Delete EcoDev analysis history stored in this browser? This will not delete any other browser data.";

export type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadHistory<T>(storage: BrowserStorage): T[] {
  try {
    const saved = storage.getItem(HISTORY_KEY);
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) as T[] : [];
  } catch { return []; }
}

export function appendHistory<T>(storage: BrowserStorage, current: T[], entry: T): T[] {
  const next = [entry, ...current].slice(0, HISTORY_LIMIT);
  try { storage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
  return next;
}

export function clearHistory(storage: BrowserStorage) {
  try { storage.removeItem(HISTORY_KEY); } catch {}
}

export function confirmAndClearHistory(storage: BrowserStorage, confirm: (message: string) => boolean) {
  if (!confirm(CLEAR_HISTORY_CONFIRMATION)) return false;
  clearHistory(storage);
  return true;
}
