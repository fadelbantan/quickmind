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
  setText, toggleCollapse, childNodes, visibleChildren,
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
  null,                                                    // default (theme)
  "#fde68a", "#bfdbfe", "#bbf7d0", "#fbcfe8", "#ddd6fe",  // soft
  "#f59e0b", "#3b82f6", "#10b981", "#ec4899", "#8b5cf6",  // bold
  "#ef4444", "#1e293b",                                    // strong / dark
];

// ── view transform ─────────────────────────────────────────────────────────
const GRID_BASE = 26;
function applyView() {
  world.style.transform =
    `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
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
function refresh() {
  render(model);
  updateLayoutButtons();
}

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

// Spatial navigation: arrows follow the VISUAL direction on screen, using the
// engine-computed positions. In horizontal layouts (balanced/right/left) the
// depth axis is x — left/right walks parent↔child whichever way they actually
// sit, up/down moves between siblings. In the down layout it's rotated.
function navigate(dir) {
  const node = selectedNode();
  if (!node) return;
  const cx = (n) => n.x + n.w / 2;
  const cy = (n) => n.y + n.h / 2;
  const parent = node.parent != null ? getNode(model, node.parent) : null;
  const kids = visibleChildren(model, node);
  const sibs = parent ? childNodes(model, parent).filter((s) => s.id !== node.id) : [];

  const horizontal = model.layoutMode !== LAYOUT.DOWN;
  const isDepthMove = horizontal
    ? (dir === "left" || dir === "right")
    : (dir === "up" || dir === "down");
  const sign = (dir === "left" || dir === "up") ? -1 : 1;
  const depthPos = horizontal ? cx : cy;   // along parent→child axis
  const crossPos = horizontal ? cy : cx;   // along sibling axis

  if (isDepthMove) {
    // parent first if it lies in that direction, else nearest child that does
    if (parent && Math.sign(depthPos(parent) - depthPos(node)) === sign) {
      return select(parent.id);
    }
    const cands = kids.filter((k) => Math.sign(depthPos(k) - depthPos(node)) === sign);
    if (cands.length) {
      cands.sort((a, b) =>
        Math.abs(crossPos(a) - crossPos(node)) - Math.abs(crossPos(b) - crossPos(node)));
      return select(cands[0].id);
    }
  } else {
    // nearest sibling in that visual direction
    let cands = sibs.filter((s) => Math.sign(crossPos(s) - crossPos(node)) === sign);
    // in balanced mode siblings can sit across the root — prefer the same side
    if (parent && cands.length > 1) {
      const side = Math.sign(depthPos(node) - depthPos(parent));
      const sameSide = cands.filter(
        (s) => Math.sign(depthPos(s) - depthPos(parent)) === side);
      if (sameSide.length) cands = sameSide;
    }
    if (cands.length) {
      cands.sort((a, b) =>
        Math.abs(crossPos(a) - crossPos(node)) - Math.abs(crossPos(b) - crossPos(node)));
      return select(cands[0].id);
    }
  }
}

// ── editing ─────────────────────────────────────────────────────────────────
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
    e.stopPropagation();
  };
  content.addEventListener("blur", onBlur);
  content.addEventListener("keydown", onKey);
}

function branch(kind, fromId) {
  const from = getNode(model, fromId);
  if (!from) return;
  if (!from.text.trim()) { select(fromId); return; }
  let created = null;
  if (kind === "child") created = addChild(model, fromId);
  else if (!isRoot(model, fromId)) created = addSibling(model, fromId);
  else created = addChild(model, fromId);
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

// ── layout ────────────────────────────────────────────────────────────────────
function setLayoutMode(mode) {
  model.layoutMode = mode;
  // Suppress the CSS transform transition so connectors and nodes snap to new
  // positions together — without this, nodes animate while connectors are
  // already drawn at the final positions, making edges look misaligned.
  world.classList.add("instant");
  commit();
  requestAnimationFrame(() => requestAnimationFrame(() => world.classList.remove("instant")));
}

function updateLayoutButtons() {
  document.querySelectorAll(".layout-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.layout === model.layoutMode);
  });
}

// ── color picker (palette popup) ──────────────────────────────────────────────
let _paletteNodeId = null;

function openColorPicker(id, anchor) {
  closePalette(); // close any open one first
  _paletteNodeId = id;
  const palette = $("#color-palette");
  const node = getNode(model, id);

  palette.innerHTML = "";
  NODE_COLORS.forEach((color) => {
    const sw = document.createElement("div");
    sw.className = "color-swatch" + (color === null ? " color-swatch-default" : "");
    if (color === null) {
      sw.title = "Remove color (use default)";
      sw.textContent = "✕";
    } else {
      sw.style.background = color;
      sw.title = color;
    }
    if (node && node.color === color) sw.classList.add("active");
    sw.addEventListener("mousedown", (e) => {
      // mousedown so it fires before the blur on the node
      e.preventDefault();
      e.stopPropagation();
      const n = getNode(model, _paletteNodeId);
      if (n) n.color = color;
      commit();
      closePalette();
    });
    palette.appendChild(sw);
  });

  // Position fixed, near the anchor dot
  const rect = anchor.getBoundingClientRect();
  palette.style.display = "grid";
  const paletteW = 4 * 28 + 3 * 6 + 16; // 4 cols × 28px + gaps + padding
  let left = rect.left + rect.width / 2 - paletteW / 2;
  let top = rect.bottom + 8;
  // clamp to viewport
  left = Math.max(8, Math.min(left, window.innerWidth - paletteW - 8));
  if (top + 120 > window.innerHeight) top = rect.top - 120 - 8;
  palette.style.left = left + "px";
  palette.style.top = top + "px";

  setTimeout(() => document.addEventListener("click", _closePaletteOutside), 0);
}

function _closePaletteOutside(e) {
  if (!e.target.closest("#color-palette") && !e.target.closest(".color-picker")) {
    closePalette();
  }
}

function closePalette() {
  const palette = $("#color-palette");
  if (palette) palette.style.display = "none";
  _paletteNodeId = null;
  document.removeEventListener("click", _closePaletteOutside);
}

// ── export helpers ────────────────────────────────────────────────────────────
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function nodeIsHidden(node) {
  let p = node.parent;
  while (p != null) {
    const parent = model.nodes.get(p);
    if (!parent) break;
    if (parent.collapsed) return true;
    p = parent.parent;
  }
  return false;
}

function readableTextColor(bg) {
  const hex = String(bg).trim().replace("#", "");
  if (hex.length < 6) return "#1f2937";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1f2937" : "#f8fafc";
}

function escXml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── export: JSON (native round-trip) ─────────────────────────────────────────
function exportJson() {
  const data = { version: 2, model: serialize(model), view };
  download("mindmap.qm.json", JSON.stringify(data, null, 2), "application/json");
}

// ── export: Markdown outline ──────────────────────────────────────────────────
function exportMd() {
  const lines = [];
  function walk(id, depth) {
    const node = getNode(model, id);
    if (!node) return;
    lines.push(depth === 0 ? `# ${node.text}` : `${"  ".repeat(depth - 1)}- ${node.text}`);
    node.children.forEach((c) => walk(c, depth + 1));
  }
  walk(model.rootId, 0);
  download("mindmap.md", lines.join("\n"), "text/markdown");
}

// ── export: FreeMind XML (.mm) ────────────────────────────────────────────────
function exportMM() {
  const lines = ['<map version="1.0.1">'];
  function walk(id, indent) {
    const node = getNode(model, id);
    if (!node) return;
    const colorAttr = node.color ? ` BACKGROUND_COLOR="${node.color}"` : "";
    const kids = node.children;
    if (!kids.length) {
      lines.push(`${" ".repeat(indent)}<node ID="${node.id}" TEXT="${escXml(node.text)}"${colorAttr}/>`);
    } else {
      lines.push(`${" ".repeat(indent)}<node ID="${node.id}" TEXT="${escXml(node.text)}"${colorAttr}>`);
      kids.forEach((c) => walk(c, indent + 2));
      lines.push(`${" ".repeat(indent)}</node>`);
    }
  }
  walk(model.rootId, 2);
  lines.push("</map>");
  download("mindmap.mm", lines.join("\n"), "application/xml");
}

// ── export: SVG (programmatic, not a DOM dump) ────────────────────────────────
const _CURVE_K = 0.3;

function _svgEdgePath(p, c, horizontal, ox, oy) {
  const pcx = p.x + p.w / 2 + ox, pcy = p.y + p.h / 2 + oy;
  const ccx = c.x + c.w / 2 + ox, ccy = c.y + c.h / 2 + oy;
  const px = p.x + ox, py = p.y + oy;
  const cx2 = c.x + ox, cy2 = c.y + oy;
  let sx, sy, ex, ey, c1x, c1y, c2x, c2y;
  if (horizontal) {
    const cr = ccx >= pcx;
    sx = cr ? px + p.w : px; ex = cr ? cx2 : cx2 + c.w;
    sy = pcy; ey = ccy;
    const dx = ex - sx;
    c1x = sx + dx * _CURVE_K; c1y = sy;
    c2x = ex - dx * _CURVE_K; c2y = ey;
  } else {
    const cb = ccy >= pcy;
    sy = cb ? py + p.h : py; ey = cb ? cy2 : cy2 + c.h;
    sx = pcx; ex = ccx;
    const dy = ey - sy;
    c1x = sx; c1y = sy + dy * _CURVE_K;
    c2x = ex; c2y = ey - dy * _CURVE_K;
  }
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

function _svgWrapText(text, maxW) {
  const maxChars = Math.max(6, Math.floor(maxW / 7.7));
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  words.forEach((w) => {
    if (cur.length + w.length + 1 > maxChars && cur) { lines.push(cur); cur = w; }
    else { cur = cur ? cur + " " + w : w; }
  });
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// Build the full SVG document string + its pixel size. Shared by the SVG
// download and the PNG export (rasterizing our own SVG keeps connector lines
// intact — html2canvas couldn't capture the overflow:visible link layer).
function buildSvg() {
  const isDark = document.documentElement.dataset.theme === "dark";
  const bg = isDark ? "#0f1117" : "#F4F5F7";
  const lineColor = isDark ? "#3a4150" : "#b3bccb";
  const nodeBg = isDark ? "#1b1f29" : "#ffffff";
  const nodeBorderCol = isDark ? "#2c323d" : "#E5E7EB";
  const defaultText = isDark ? "#e6e8ed" : "#1F2937";

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  model.nodes.forEach((n) => {
    if (nodeIsHidden(n)) return;
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
  });

  const PAD = 48;
  const W = maxX - minX + PAD * 2;
  const H = maxY - minY + PAD * 2;
  const ox = -minX + PAD, oy = -minY + PAD;
  const horizontal = model.layoutMode !== LAYOUT.DOWN;

  const paths = [];
  model.nodes.forEach((parent) => {
    if (nodeIsHidden(parent)) return;
    visibleChildren(model, parent).forEach((child) => {
      paths.push(_svgEdgePath(parent, child, horizontal, ox, oy));
    });
  });

  const nodeEls = [];
  model.nodes.forEach((n) => {
    if (nodeIsHidden(n)) return;
    const x = n.x + ox, y = n.y + oy;
    const fill = n.color || nodeBg;
    const stroke = n.id === model.rootId ? "#94a3b8" : nodeBorderCol;
    const strokeW = n.id === model.rootId ? 2 : 1;
    const textCol = n.color ? readableTextColor(n.color) : defaultText;
    const fw = n.id === model.rootId ? "600" : "400";
    const tspans = _svgWrapText(n.text, n.w - 36);
    const lineH = 18;
    const textStartY = y + (n.h + lineH) / 2 - (tspans.length * lineH) / 2;
    nodeEls.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${n.w.toFixed(1)}" height="${n.h.toFixed(1)}" rx="10" ry="10" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/>` +
      `<text x="${(x + n.w / 2).toFixed(1)}" y="${textStartY.toFixed(1)}" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="14" font-weight="${fw}" fill="${textCol}">` +
      tspans.map((t, i) => `<tspan x="${(x + n.w / 2).toFixed(1)}" dy="${i === 0 ? 0 : lineH}">${escXml(t)}</tspan>`).join("") +
      `</text>`
    );
  });

  const svgStr =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}">\n` +
    `  <rect width="${W.toFixed(0)}" height="${H.toFixed(0)}" fill="${bg}"/>\n` +
    `  <path d="${paths.join(" ")}" fill="none" stroke="${lineColor}" stroke-width="2" stroke-linecap="round"/>\n` +
    `  ${nodeEls.join("\n  ")}\n` +
    `</svg>`;
  return { svgStr, w: W, h: H };
}

function exportSvg() {
  download("mindmap.svg", buildSvg().svgStr, "image/svg+xml");
}

// ── export: PNG (rasterized from the SVG at 2×) ──────────────────────────────
function exportPng() {
  const { svgStr, w, h } = buildSvg();
  const url = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml" }));
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const c = document.createElement("canvas");
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    const ctx = c.getContext("2d");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const a = document.createElement("a");
    a.download = "mindmap.png";
    a.href = c.toDataURL("image/png");
    a.click();
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert("PNG export failed."); };
  img.src = url;
}

// ── save menu ─────────────────────────────────────────────────────────────────
function handleExport(fmt) {
  closeSaveMenu();
  switch (fmt) {
    case "json": return exportJson();
    case "md":   return exportMd();
    case "mm":   return exportMM();
    case "svg":  return exportSvg();
    case "png":  return exportPng();
  }
}

function openSaveMenu() {
  const menu = $("#save-menu");
  if (!menu) return;
  const isOpen = menu.classList.toggle("open");
  if (isOpen) {
    setTimeout(() => document.addEventListener("click", _closeSaveMenuOutside), 0);
  } else {
    document.removeEventListener("click", _closeSaveMenuOutside);
  }
}

function _closeSaveMenuOutside(e) {
  if (!e.target.closest("#save-bar")) closeSaveMenu();
}

function closeSaveMenu() {
  const menu = $("#save-menu");
  if (menu) menu.classList.remove("open");
  document.removeEventListener("click", _closeSaveMenuOutside);
}

// ── import ────────────────────────────────────────────────────────────────────
function importFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const m = data.model || data; // support both wrapped {model,view} and bare serialized model
        model = deserialize(m);
        if (data.view) Object.assign(view, data.view);
        refresh();
        pushHistory();
        applyView();
      } catch (err) {
        alert("Could not open file: " + err.message);
      }
    };
    reader.readAsText(file);
  };
  input.click();
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
      active.contentEditable === "true") return;

  if (e.ctrlKey || e.metaKey) {
    if (e.key.toLowerCase() === "z") {
      e.preventDefault(); e.shiftKey ? redo() : undo(); return;
    }
    if (e.key === "=" || e.key === "+") { e.preventDefault(); zoomBy(1.1); return; }
    if (e.key === "-") { e.preventDefault(); zoomBy(1 / 1.1); return; }
    if (e.key.toLowerCase() === "s") { e.preventDefault(); openSaveMenu(); return; }
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
  if (e.target.closest(".color-picker")) {
    return openColorPicker(id, e.target.closest(".color-picker"));
  }
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

  let restored = false;
  try {
    const saved = JSON.parse(localStorage.getItem("quickmind_v2") || "null");
    if (saved && confirm("Restore previous session?")) {
      model = deserialize(saved.model);
      Object.assign(view, saved.view || {});
      restored = true;
    }
  } catch (_) { /* fall through */ }
  if (!restored) model = createModel("Central Idea");

  refresh();
  pushHistory();
  if (!restored) centerView(); else applyView();

  // canvas interaction
  canvas.addEventListener("mousedown", onCanvasMouseDown);
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("keydown", onKeyDown);
  $("#nodes").addEventListener("click", onNodesClick);
  $("#nodes").addEventListener("dblclick", onNodesDblClick);

  // zoom
  $("#zoom-in")?.addEventListener("click", () => zoomBy(1.1));
  $("#zoom-out")?.addEventListener("click", () => zoomBy(1 / 1.1));

  // layout buttons
  document.querySelectorAll(".layout-btn").forEach((btn) => {
    btn.addEventListener("click", () => setLayoutMode(btn.dataset.layout));
  });

  // save menu
  $("#save-btn")?.addEventListener("click", (e) => { e.stopPropagation(); openSaveMenu(); });
  $("#save-menu")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-fmt]");
    if (btn) handleExport(btn.dataset.fmt);
  });

  // open / import
  $("#open-btn")?.addEventListener("click", importFile);

  // theme
  $("#theme-toggle")?.addEventListener("click", toggleTheme);

  if (!restored) startEdit(model.rootId);
}

window.addEventListener("DOMContentLoaded", boot);
