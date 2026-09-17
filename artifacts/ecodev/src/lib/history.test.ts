import assert from "node:assert/strict";
import test from "node:test";
import { CLEAR_HISTORY_CONFIRMATION, HISTORY_KEY, appendHistory, clearHistory, confirmAndClearHistory, loadHistory } from "./history.ts";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), values };
}

test("browser history is created locally and capped", () => {
  const local = storage();
  let history: Array<{ id: number }> = [];
  for (let id = 0; id < 14; id += 1) history = appendHistory(local, history, { id });
  assert.equal(history.length, 12);
  assert.equal(history[0].id, 13);
  assert.equal(loadHistory<{ id: number }>(local)[11].id, 2);
});

test("clearing history removes only EcoDev's local history key", () => {
  const local = storage();
  local.setItem(HISTORY_KEY, JSON.stringify([{ id: 1 }]));
  local.setItem("unrelated-key", "keep");
  clearHistory(local);
  assert.equal(local.getItem(HISTORY_KEY), null);
  assert.equal(local.getItem("unrelated-key"), "keep");
});

test("history clear requires confirmation and preserves entries when cancelled", () => {
  const local = storage();
  local.setItem(HISTORY_KEY, JSON.stringify([{ id: 1 }]));
  let message = "";
  const deleted = confirmAndClearHistory(local, (prompt) => { message = prompt; return false; });
  assert.equal(deleted, false);
  assert.equal(message, CLEAR_HISTORY_CONFIRMATION);
  assert.deepEqual(loadHistory<{ id: number }>(local), [{ id: 1 }]);
});

test("confirmed History-page clear removes only local analysis entries and immediately yields an empty visible list", () => {
  const local = storage();
  let history = appendHistory(local, [], { id: 1 });
  local.setItem("unrelated-key", "keep");
  assert.equal(confirmAndClearHistory(local, () => true), true);
  history = [];
  assert.deepEqual(loadHistory(local), []);
  assert.equal(local.getItem(HISTORY_KEY), null);
  assert.equal(local.getItem("unrelated-key"), "keep");
  history = appendHistory(local, history, { id: 2 });
  assert.deepEqual(history, [{ id: 2 }]);
  assert.deepEqual(loadHistory(local), [{ id: 2 }]);
});
