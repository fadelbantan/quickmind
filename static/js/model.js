// ─────────────────────────────────────────────────────────────────────────
// model.js — the single source of truth.
//
// The map is pure data: a tree of nodes held in a Map. Positions (x,y) and
// measured sizes (w,h) live ON the nodes but are written by other layers
// (engine writes x,y; render writes w,h). Nothing here ever touches the DOM.
//
// Pipeline:  mutate model  →  measure  →  engine.layout  →  render  →  connectors
// ─────────────────────────────────────────────────────────────────────────

export const LAYOUT = {
  RIGHT: "right",     // all children grow to the right (org-chart-ish, horizontal)
  LEFT: "left",       // mirror of right
  DOWN: "down",       // children grow downward (classic org chart)
  BALANCED: "balanced", // children split left/right of root (classic mind map)
};

let _seq = 0;
const nextId = () => "n" + ++_seq;

function makeNode(text, parentId) {
  return {
    id: nextId(),
    text,
    parent: parentId,      // null for root
    children: [],          // array of child ids (order matters)
    collapsed: false,
    color: null,           // null = default; otherwise a css color
    // measured by render layer:
    w: 0, h: 0,
    // computed by engine (world-space top-left):
    x: 0, y: 0,
  };
}

// Create a fresh map with a single root.
export function createModel(rootText = "Central Idea") {
  _seq = 0;
  const root = makeNode(rootText, null);
  const nodes = new Map([[root.id, root]]);
  return {
    rootId: root.id,
    nodes,
    layoutMode: LAYOUT.BALANCED,
    selectedId: root.id,
    editingId: null,
  };
}

// ── tree accessors ──────────────────────────────────────────────────────
export const getNode = (model, id) => model.nodes.get(id);
export const getRoot = (model) => model.nodes.get(model.rootId);
export const isRoot = (model, id) => id === model.rootId;

// Live child nodes (skips ids that were removed).
export function childNodes(model, node) {
  return node.children.map((id) => model.nodes.get(id)).filter(Boolean);
}

// Visible children — respects collapse.
export function visibleChildren(model, node) {
  return node.collapsed ? [] : childNodes(model, node);
}

// ── mutations ───────────────────────────────────────────────────────────
// Each returns the affected node so callers can select / edit it.

export function addChild(model, parentId, text = "") {
  const parent = model.nodes.get(parentId);
  if (!parent) return null;
  const node = makeNode(text, parentId);
  model.nodes.set(node.id, node);
  parent.children.push(node.id);
  parent.collapsed = false; // adding a child reveals the branch
  return node;
}

export function addSibling(model, nodeId, text = "") {
  const node = model.nodes.get(nodeId);
  if (!node || node.parent == null) return null; // root has no siblings
  const parent = model.nodes.get(node.parent);
  const sib = makeNode(text, parent.id);
  model.nodes.set(sib.id, sib);
  const idx = parent.children.indexOf(nodeId);
  parent.children.splice(idx + 1, 0, sib.id);
  return sib;
}

// Remove a node and its entire subtree. Returns the parent id (for reselection).
export function removeSubtree(model, nodeId) {
  const node = model.nodes.get(nodeId);
  if (!node || node.parent == null) return null; // never remove the root
  const parent = model.nodes.get(node.parent);

  const collect = (id, acc) => {
    const n = model.nodes.get(id);
    if (!n) return acc;
    n.children.forEach((c) => collect(c, acc));
    acc.push(id);
    return acc;
  };
  collect(nodeId, []).forEach((id) => model.nodes.delete(id));
  parent.children = parent.children.filter((id) => id !== nodeId);
  return parent.id;
}

export function setText(model, id, text) {
  const n = model.nodes.get(id);
  if (n) n.text = text;
}

export function toggleCollapse(model, id) {
  const n = model.nodes.get(id);
  if (n && n.children.length) n.collapsed = !n.collapsed;
}

// ── serialization (for save / undo / autosave) ──────────────────────────
export function serialize(model) {
  return JSON.stringify({
    rootId: model.rootId,
    layoutMode: model.layoutMode,
    seq: _seq,
    nodes: [...model.nodes.values()].map((n) => ({
      id: n.id, text: n.text, parent: n.parent,
      children: n.children, collapsed: n.collapsed, color: n.color,
    })),
  });
}

export function deserialize(json) {
  const data = typeof json === "string" ? JSON.parse(json) : json;
  const nodes = new Map();
  data.nodes.forEach((n) => {
    nodes.set(n.id, { ...makeNode(n.text, n.parent), ...n });
  });
  _seq = data.seq || data.nodes.length;
  return {
    rootId: data.rootId,
    nodes,
    layoutMode: data.layoutMode || LAYOUT.BALANCED,
    selectedId: data.rootId,
    editingId: null,
  };
}
