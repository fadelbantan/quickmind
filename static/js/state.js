import { $$ } from "/static/util.js";

export const store = {
  // DOM refs (set in main.js)
  canvas: null,
  controls: { zoomIn: null, zoomOut: null, zoomDisplay: null },
  shortcutHelp: null,
  saveBtn: null,

  // app state
  counter: 0,
  selectedNode: null,
  draggedNode: null,
  dragStartX: 0, dragStartY: 0,
  startLeft: 0, startTop: 0,

  // history
  history: [],
  historyIndex: -1,

  // graph
  connectionMap: {},
  subtreeSizes: {},

  // transform
  scale: 1, panX: 0, panY: 0,
  isPanning: false, startX: 0, startY: 0,

  // UI
  nodeColors: ["#ffffff","#fef3c7","#dbeafe","#dcfce7","#fce7f3","#e9d5ff"],
};

export function recordHistory() {
  const { canvas } = store;
  store.history.splice(store.historyIndex + 1);
  store.history.push(canvas.innerHTML);
  store.historyIndex = store.history.length - 1;
  autoSave();
}

export function undo(restoreState) {
  if (store.historyIndex <= 0) return;
  store.historyIndex -= 1;
  restoreState(store.history[store.historyIndex]);
}

export function redo(restoreState) {
  if (store.historyIndex >= store.history.length - 1) return;
  store.historyIndex += 1;
  restoreState(store.history[store.historyIndex]);
}

export function autoSave() {
  const { canvas, scale, panX, panY } = store;
  const mapData = {
    html: canvas.innerHTML,
    transform: { scale, panX, panY },
    timestamp: Date.now(),
  };
  try {
    localStorage.setItem("quickmind_autosave", JSON.stringify(mapData));
  } catch (e) {
    console.warn("Autosave failed:", e);
  }
}

export function restoreStateHTML(html, helpers) {
  const { clearConnections, attachEvents, updateNodeButtons, autoExpandWidth, updateConnections } = helpers;
  clearConnections();
  store.canvas.innerHTML = html;
  store.selectedNode = null;
  store.counter = 0;

  const nodes = $$(".node", store.canvas);
  nodes.forEach((n) => {
    attachEvents(n);
    updateNodeButtons(n);
    autoExpandWidth(n);
    const id = parseInt(n.dataset.id, 10);
    if (id > store.counter) store.counter = id;
  });
  nodes.forEach((n) => updateConnections(n));
}

export function maybeRestoreOnLoad(restoreState) {
  const saved = localStorage.getItem("quickmind_autosave");
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    if (confirm("Restore previous session?")) {
      restoreState(data.html);
      store.scale = data.transform?.scale ?? 1;
      store.panX = data.transform?.panX ?? 0;
      store.panY = data.transform?.panY ?? 0;
    }
  } catch (e) {
    console.warn("Autosave restore failed:", e);
  }
}
