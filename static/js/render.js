// ─────────────────────────────────────────────────────────────────────────
// render.js — reconcile the model into the DOM, then draw connectors.
//
// Responsibilities (in pipeline order):
//   1. reconcile  — create/remove node elements to match the model
//   2. measure    — read each element's real w/h back INTO the model
//   3. layout     — call the engine (writes x,y)
//   4. position   — transform each node to its (x,y)  [animates via CSS]
//   5. connect    — draw one SVG path per parent→child edge
//
// The DOM is a projection of the model; it is never read for layout decisions
// except to measure intrinsic node sizes.
// ─────────────────────────────────────────────────────────────────────────

import { LAYOUT, childNodes, visibleChildren } from "/static/js/model.js";
import { layout } from "/static/js/engine.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Choose dark or light text for a given background so it stays readable.
// Uses perceived (sRGB-weighted) luminance: bright bg → dark text, and
// dark bg → light text.
function readableText(bg) {
  const hex = String(bg).trim().replace("#", "");
  if (hex.length < 6) return ""; // unknown format → let CSS decide
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f2937" : "#f8fafc";
}

let nodesLayer = null;  // div holding .node elements
let linksLayer = null;  // <svg> holding connector paths
const els = new Map();  // id → element

export function initRender({ nodes, links }) {
  nodesLayer = nodes;
  linksLayer = links;
}

function createNodeEl(node) {
  const el = document.createElement("div");
  el.className = "node";
  el.dataset.id = node.id;
  el.tabIndex = 0;
  el.innerHTML = `
    <div class="color-picker"></div>
    <div class="content" contenteditable="false"></div>
    <button class="add-child" title="Add child (Enter)">+</button>
    <button class="add-sibling" title="Add sibling (Tab)">+</button>
    <button class="collapse-toggle" title="Collapse / expand"></button>`;
  nodesLayer.appendChild(el);
  return el;
}

// 1. reconcile: ensure exactly the model's nodes exist as elements.
function reconcile(model) {
  // remove stale
  for (const [id, el] of els) {
    if (!model.nodes.has(id)) { el.remove(); els.delete(id); }
  }
  // create / update
  model.nodes.forEach((node) => {
    let el = els.get(node.id);
    if (!el) { el = createNodeEl(node); els.set(node.id, el); }

    el.classList.toggle("root", node.id === model.rootId);
    el.classList.toggle("selected", node.id === model.selectedId);
    el.classList.toggle("collapsed", node.collapsed && node.children.length > 0);
    el.style.background = node.color || "";

    const content = el.querySelector(".content");
    // Pick readable text for the chosen background; fall back to the theme
    // color when the node uses the default (no custom color).
    content.style.color = node.color ? readableText(node.color) : "";

    // don't clobber text while the user is editing this node (cursor!)
    if (model.editingId !== node.id && content.textContent !== node.text) {
      content.textContent = node.text;
    }

    // collapse toggle only meaningful for nodes with children
    const toggle = el.querySelector(".collapse-toggle");
    toggle.style.display = node.children.length ? "" : "none";
    toggle.textContent = node.collapsed ? "+" : "−";
  });
}

// 2. measure: write real element sizes back into the model.
function measure(model) {
  model.nodes.forEach((node) => {
    const el = els.get(node.id);
    node.w = el.offsetWidth;
    node.h = el.offsetHeight;
  });
}

// 4. position: move each element to its computed world coords.
function position(model) {
  model.nodes.forEach((node) => {
    const el = els.get(node.id);
    const hidden = isHidden(model, node);
    el.style.display = hidden ? "none" : "";
    if (!hidden) el.style.transform = `translate(${node.x}px, ${node.y}px)`;
  });
}

// A node is hidden if any ancestor is collapsed.
function isHidden(model, node) {
  let p = node.parent;
  while (p != null) {
    const parent = model.nodes.get(p);
    if (!parent) break;
    if (parent.collapsed) return true;
    p = parent.parent;
  }
  return false;
}

// 5. connectors: one cubic bezier per visible edge.
function connect(model) {
  const horizontal = model.layoutMode !== LAYOUT.DOWN;
  const paths = [];
  model.nodes.forEach((parent) => {
    visibleChildren(model, parent).forEach((child) => {
      if (isHidden(model, parent)) return;
      paths.push(edgePath(parent, child, horizontal));
    });
  });
  linksLayer.innerHTML =
    `<path d="${paths.join(" ")}" fill="none" stroke="#b3bccb" ` +
    `stroke-width="2" vector-effect="non-scaling-stroke" ` +
    `stroke-linecap="round"/>`;
}

// How early the curve breaks toward the child, as a fraction of the gap.
// Small value ⇒ lines split right at the parent and fan out cleanly instead of
// bundling into a "rope"; large value ⇒ lines stay parallel longer. 0.3 keeps
// many-children fans readable.
const CURVE_K = 0.3;

// Build one "M..C.." segment from parent edge to child edge.
function edgePath(p, c, horizontal) {
  const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
  const ccx = c.x + c.w / 2, ccy = c.y + c.h / 2;
  let sx, sy, ex, ey, c1x, c1y, c2x, c2y;

  if (horizontal) {
    const childRight = ccx >= pcx;
    sx = childRight ? p.x + p.w : p.x;
    ex = childRight ? c.x : c.x + c.w;
    sy = pcy; ey = ccy;
    const dx = ex - sx;
    c1x = sx + dx * CURVE_K; c1y = sy;
    c2x = ex - dx * CURVE_K; c2y = ey;
  } else {
    const childBelow = ccy >= pcy;
    sy = childBelow ? p.y + p.h : p.y;
    ey = childBelow ? c.y : c.y + c.h;
    sx = pcx; ex = ccx;
    const dy = ey - sy;
    c1x = sx; c1y = sy + dy * CURVE_K;
    c2x = ex; c2y = ey - dy * CURVE_K;
  }
  return `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`;
}

// Full pipeline. Call after any model change.
export function render(model) {
  reconcile(model);
  measure(model);
  layout(model);
  position(model);
  connect(model);
}

// Expose element lookup for the interaction layer (focus, caret, etc.).
export const elementFor = (id) => els.get(id);
export const contentOf = (id) => els.get(id)?.querySelector(".content");
