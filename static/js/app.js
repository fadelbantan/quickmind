// ─────────────────────────────────────────────────────────────────────────
// app.js — bootstrap + interaction layer.
//
// Interactions only ever MUTATE THE MODEL, then call commit()/refresh().
// They never compute geometry — the engine owns that.
//
//   commit()  = model changed structurally → render + push history + autosave
//   refresh() = view-only change (selection) → render, no history
// ─────────────────────────────────────────────────────────────────────────

import {
  LAYOUT, createModel, deserialize, serialize,
  getNode, isRoot, addChild, addSibling, removeSubtree,
  setText, toggleCollapse, childNodes,
} from "/static/js/model.js";
import { initRender, render, elementFor, contentOf } from "/static/js/render.js";

const $ = (s) => document.querySelector(s);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// ── module state ─────────────────────────────────────────────────────────
let model;
let canvas, world;
const view = { x: 0, y: 0, scale: 1 };
const history = { stack: [], index: -1 };
const NODE_COLORS = [
  null,                                                   // default (theme)
  "#fde68a", "#bfdbfe", "#bbf7d0", "#fbcfe8", "#ddd6fe",  // soft → dark text
  "#f59e0b", "#3b82f6", "#10b981", "#ec4899", "#8b5cf6",  // bold → light text
  "#ef4444", "#1e293b",                                   // strong / dark
];

// ── view transform ─────────────────────────────────────────────────────────
const GRID_BASE = 26; // dot spacing in world units
function applyView() {
  world.style.transform =
    `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  // Make the dot grid pan & zoom in lockstep with the map.
  if (canvas) {
    canvas.style.setProperty("--grid-size", GRID_BASE * view.scale + "px");
    canvas.style.setProperty("--grid-pos", `${view.x}px ${view.y}px`);
  }
  const zd = $("#zoom-display");
  if (zd) zd.textContent = Math.round(view.scale * 100) + "%";
}
function centerView() {
  view.x = canvas.clientWidth / 2;
  view.y = canvas.clientHeight / 2;
  applyView();
}

// ── theme (dark / light) ────────────────────────────────────────────────────
const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $("#theme-toggle");
  // show the icon of the mode you'd switch TO
  if (btn) btn.innerHTML = theme === "dark" ? ICON_SUN : ICON_MOON;
  try { localStorage.setItem("quickmind_theme", theme); } catch (_) { /* ignore */ }
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
}
function initTheme() {
  let theme = null;
  try { theme = localStorage.getItem("quickmind_theme"); } catch (_) { /* ignore */ }
  if (!theme) {
    theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  applyTheme(theme);
}

// ── render / history ───────────────────────────────────────────────────────
function refresh() { render(model); }

function pushHistory() {
  history.stack.splice(history.index + 1);
  history.stack.push(serialize(model));
  history.index = history.stack.length - 1;
  autosave();
}
function commit() { refresh(); pushHistory(); }

function restore(json, keepSelection) {
  const sel = model?.selectedId;
  model = deserialize(json);
  if (keepSelection && sel && model.nodes.has(sel)) model.selectedId = sel;
  refresh();
}
function undo() {
  if (history.index <= 0) return;
  history.index--;
  restore(history.stack[history.index]);
}
function redo() {
  if (history.index >= history.stack.length - 1) return;
  history.index++;
  restore(history.stack[history.index]);
}

function autosave() {
  try {
    localStorage.setItem("quickmind_v2", JSON.stringify({
      model: serialize(model), view, ts: Date.now(),
    }));
  } catch (_) { /* ignore quota */ }
}

// ── selection & navigation ──────────────────────────────────────────────────
function select(id) {
  if (!model.nodes.has(id)) return;
  model.selectedId = id;
  refresh();
  elementFor(id)?.focus();
}
function selectedNode() { return getNode(model, model.selectedId); }

function navigate(dir) {
  const node = selectedNode();
  if (!node) return;
  if (dir === "left" && node.parent != null) return select(node.parent);
  if (dir === "right") {
    const kids = childNodes(model, node);
    if (kids.length) return select(kids[0].id);
  }
  if ((dir === "up" || dir === "down") && node.parent != null) {
    const sibs = getNode(model, node.parent).children;
    const i = sibs.indexOf(node.id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (sibs[j]) select(sibs[j]);
  }
}

// ── editing ─────────────────────────────────────────────────────────────────
// after committing an edit, optionally branch (add child / sibling) and keep typing.
function startEdit(id, { selectAll = true } = {}) {
  model.editingId = id;
  refresh();
  const content = contentOf(id);
  if (!content) return;
  content.contentEditable = "true";
  content.focus();
  if (selectAll) {
    const r = document.createRange();
    r.selectNodeContents(content);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  const finish = (then) => {
    content.removeEventListener("blur", onBlur);
    content.removeEventListener("keydown", onKey);
    content.contentEditable = "false";
    setText(model, id, content.textContent.trim());
    model.editingId = null;
    commit();
    if (then) then();
    else elementFor(id)?.focus();
  };
  const onBlur = () => finish();
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); finish(); }
    else if (e.key === "Enter") {
      e.preventDefault();
      finish(() => branch("child", id));
    } else if (e.key === "Tab") {
      e.preventDefault();
      finish(() => branch("sibling", id));
    }
    e.stopPropagation(); // keep global shortcuts out of the editor
  };
  content.addEventListener("blur", onBlur);
  content.addEventListener("keydown", onKey);
}

// Create a child/sibling of `fromId` and immediately edit it.
// Guard: can't branch off a node that has no label yet.
function branch(kind, fromId) {
  const from = getNode(model, fromId);
  if (!from) return;
  if (!from.text.trim()) { select(fromId); return; }
  let created = null;
  if (kind === "child") created = addChild(model, fromId);
  else if (!isRoot(model, fromId)) created = addSibling(model, fromId);
  else created = addChild(model, fromId); // root has no siblings → child instead
  if (created) {
    model.selectedId = created.id;
    commit();
    startEdit(created.id);
  }
}

// ── node ops ─────────────────────────────────────────────────────────────────
function deleteSelected() {
  const node = selectedNode();
  if (!node || isRoot(model, node.id)) return;
  const parentId = removeSubtree(model, node.id);
  if (parentId) model.selectedId = parentId;
  commit();
}
function cycleColor(id) {
  const node = getNode(model, id);
  const i = NODE_COLORS.indexOf(node.color);
  node.color = NODE_COLORS[(i + 1) % NODE_COLORS.length];
  commit();
}
function setLayoutMode(mode) {
  model.layoutMode = mode;
  commit();
}

// ── pointer: pan + zoom ───────────────────────────────────────────────────────
let panning = null;
function onCanvasMouseDown(e) {
  if (e.target.closest(".node")) return;
  panning = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
  canvas.classList.add("dragging");
}
function onMouseMove(e) {
  if (!panning) return;
  view.x = panning.ox + (e.clientX - panning.sx);
  view.y = panning.oy + (e.clientY - panning.sy);
  applyView();
}
function onMouseUp() { panning = null; canvas.classList.remove("dragging"); }

function onWheel(e) {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const s = clamp(view.scale * factor, 0.2, 3);
    view.x = mx - (mx - view.x) * (s / view.scale);
    view.y = my - (my - view.y) * (s / view.scale);
    view.scale = s;
  } else {
    view.x -= e.deltaX; view.y -= e.deltaY;
  }
  applyView();
}
function zoomBy(factor) {
  const mx = canvas.clientWidth / 2, my = canvas.clientHeight / 2;
  const s = clamp(view.scale * factor, 0.2, 3);
  view.x = mx - (mx - view.x) * (s / view.scale);
  view.y = my - (my - view.y) * (s / view.scale);
  view.scale = s;
  applyView();
}

// ── keyboard ──────────────────────────────────────────────────────────────────
function onKeyDown(e) {
  const active = document.activeElement;
  if (active && active.classList.contains("content") &&
      active.contentEditable === "true") return; // editor handles its own keys

  if (e.ctrlKey || e.metaKey) {
    if (e.key.toLowerCase() === "z") {
      e.preventDefault(); e.shiftKey ? redo() : undo(); return;
    }
    if (e.key === "=" || e.key === "+") { e.preventDefault(); zoomBy(1.1); return; }
    if (e.key === "-") { e.preventDefault(); zoomBy(1 / 1.1); return; }
    if (e.key.toLowerCase() === "s") { e.preventDefault(); $("#save-btn")?.click(); return; }
  }

  const node = selectedNode();
  switch (e.key) {
    case "Enter": e.preventDefault(); if (node) branch("child", node.id); break;
    case "Tab": e.preventDefault(); if (node) branch("sibling", node.id); break;
    case " ": case "F2": case "e": case "E":
      e.preventDefault(); if (node) startEdit(node.id); break;
    case "Backspace": case "Delete":
      e.preventDefault(); deleteSelected(); break;
    case "ArrowUp": e.preventDefault(); navigate("up"); break;
    case "ArrowDown": e.preventDefault(); navigate("down"); break;
    case "ArrowLeft": e.preventDefault(); navigate("left"); break;
    case "ArrowRight": e.preventDefault(); navigate("right"); break;
    case ".": if (node) { toggleCollapse(model, node.id); commit(); } break;
    case "1": setLayoutMode(LAYOUT.BALANCED); break;
    case "2": setLayoutMode(LAYOUT.RIGHT); break;
    case "3": setLayoutMode(LAYOUT.LEFT); break;
    case "4": setLayoutMode(LAYOUT.DOWN); break;
    case "c": case "C": centerView(); break;
    case "?": { const sh = $("#shortcut-help"); if (sh) sh.open = !sh.open; break; }
  }
}

// ── delegated node interactions ────────────────────────────────────────────────
function onNodesClick(e) {
  const el = e.target.closest(".node");
  if (!el) return;
  const id = el.dataset.id;
  if (e.target.closest(".add-child")) return branch("child", id);
  if (e.target.closest(".add-sibling")) return branch("sibling", id);
  if (e.target.closest(".collapse-toggle")) { toggleCollapse(model, id); return commit(); }
  if (e.target.closest(".color-picker")) return cycleColor(id);
  select(id);
}
function onNodesDblClick(e) {
  const el = e.target.closest(".node");
  if (el && !e.target.closest("button")) startEdit(el.dataset.id);
}

// ── boot ──────────────────────────────────────────────────────────────────────
function boot() {
  canvas = $("#canvas");
  world = $("#world");
  initTheme();
  initRender({ nodes: $("#nodes"), links: $("#links") });

  // restore prior session or start fresh
  let restored = false;
  try {
    const saved = JSON.parse(localStorage.getItem("quickmind_v2") || "null");
    if (saved && confirm("Restore previous session?")) {
      model = deserialize(saved.model);
      Object.assign(view, saved.view || {});
      restored = true;
    }
  } catch (_) { /* fall through to fresh */ }
  if (!restored) model = createModel("Central Idea");

  refresh();
  pushHistory();
  if (!restored) centerView(); else applyView();

  // wire events
  canvas.addEventListener("mousedown", onCanvasMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("keydown", onKeyDown);
  $("#nodes").addEventListener("click", onNodesClick);
  $("#nodes").addEventListener("dblclick", onNodesDblClick);

  $("#zoom-in")?.addEventListener("click", () => zoomBy(1.1));
  $("#zoom-out")?.addEventListener("click", () => zoomBy(1 / 1.1));
  $("#save-btn")?.addEventListener("click", exportPng);
  $("#theme-toggle")?.addEventListener("click", toggleTheme);

  // start by editing the root so the user can type immediately
  if (!restored) startEdit(model.rootId);
}

function exportPng() {
  if (typeof html2canvas === "undefined") return;
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue("--bg").trim() || "#F4F5F7";
  html2canvas(canvas, { backgroundColor: bg }).then((c) => {
    const link = document.createElement("a");
    link.download = "mindmap.png";
    link.href = c.toDataURL("image/png");
    link.click();
  });
}

window.addEventListener("DOMContentLoaded", boot);
