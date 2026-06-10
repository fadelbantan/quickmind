// ─────────────────────────────────────────────────────────────────────────
// engine.js — the tidy-tree layout engine.
//
// Pure function: layout(model) reads each node's measured size (w,h) and the
// tree shape, then writes world-space (x,y) = top-left of every node. It never
// touches the DOM.
//
// Algorithm: variable-size "tidy tree" via subtree-block packing —
//   1. post-order: each subtree's BREADTH extent = max(own breadth size,
//      sum of children extents + gaps). Disjoint bands ⇒ subtrees never
//      overlap, so no contour threading is needed (the mind-map case).
//   2. pre-order: stack children within the parent's band; center the parent
//      between its first and last child (Reingold–Tilford's centering rule).
//
// All four layout modes reuse ONE canonical pass (depth grows +, breadth is
// the cross axis); modes are just a projection of canonical (depth,breadth)
// onto screen (x,y):
//   RIGHT    → x=depth,  y=breadth          (horizontal)
//   LEFT     → x=-depth, y=breadth          (horizontal, mirrored)
//   DOWN     → x=breadth, y=depth           (vertical)
//   BALANCED → split root's children L/R, run two horizontal passes, join.
// ─────────────────────────────────────────────────────────────────────────

import { LAYOUT, getRoot, visibleChildren } from "/static/js/model.js";

const GAPS = {
  DEPTH: 80,    // distance between consecutive levels
  BREADTH: 30,  // distance between sibling subtrees (vertical breathing room
                // — the main lever that keeps connector lines from crowding)
};

// breadth/depth size of a node given orientation ("h" = horizontal tree).
const breadthSize = (n, o) => (o === "h" ? n.h : n.w);
const depthSize = (n, o) => (o === "h" ? n.w : n.h);

// 1. Post-order: compute each subtree's breadth extent.
function computeExtents(model, node, o, ext) {
  const kids = visibleChildren(model, node);
  const own = breadthSize(node, o);
  if (!kids.length) return (ext[node.id] = own);
  let sum = 0;
  kids.forEach((k, i) => {
    sum += computeExtents(model, k, o, ext) + (i ? GAPS.BREADTH : 0);
  });
  return (ext[node.id] = Math.max(own, sum));
}

// 2. Pre-order: assign canonical depth `d` (near edge) and breadth center.
//    Writes { d, bCenter } into `pos`. Returns the node's breadth center.
function assign(model, node, o, ext, d, bandStart, pos) {
  const kids = visibleChildren(model, node);
  const bSize = breadthSize(node, o);
  let bCenter;

  if (!kids.length) {
    bCenter = bandStart + ext[node.id] / 2;
  } else {
    const total = kids.reduce(
      (s, k, i) => s + ext[k.id] + (i ? GAPS.BREADTH : 0), 0
    );
    let cursor = bandStart + (ext[node.id] - total) / 2;
    const childDepth = d + depthSize(node, o) + GAPS.DEPTH;
    let first, last;
    kids.forEach((k) => {
      const c = assign(model, k, o, ext, childDepth, cursor, pos);
      if (first === undefined) first = c;
      last = c;
      cursor += ext[k.id] + GAPS.BREADTH;
    });
    bCenter = (first + last) / 2;
  }
  pos[node.id] = { d, bCenter };
  return bCenter;
}

// Project canonical (d, bCenter) → world top-left (x,y) for one node.
function project(model, node, pos, o, dir) {
  const p = pos[node.id];
  if (!p) return;
  const ds = depthSize(node, o), bs = breadthSize(node, o);
  const depthTL = dir > 0 ? p.d : -(p.d + ds); // top-left along depth axis
  const breadthTL = p.bCenter - bs / 2;
  if (o === "h") { node.x = depthTL; node.y = breadthTL; }
  else { node.x = breadthTL; node.y = depthTL; }
}

// Lay out a single directed tree (RIGHT / LEFT / DOWN).
function layoutDirected(model, o, dir) {
  const root = getRoot(model);
  const ext = {}, pos = {};
  computeExtents(model, root, o, ext);
  assign(model, root, o, ext, 0, -ext[root.id] / 2, pos);
  model.nodes.forEach((n) => project(model, n, pos, o, dir));
}

// Greedy partition of root's children into two balanced groups (by extent).
function partition(kids, ext) {
  const sorted = [...kids].sort((a, b) => ext[b.id] - ext[a.id]);
  const left = [], right = [];
  let lSum = 0, rSum = 0;
  sorted.forEach((k) => {
    if (rSum <= lSum) { right.push(k); rSum += ext[k.id]; }
    else { left.push(k); lSum += ext[k.id]; }
  });
  // restore original order within each side
  const order = (arr) => kids.filter((k) => arr.includes(k));
  return { left: order(left), right: order(right) };
}

// Lay out one vertical stack of root-child subtrees, centered at breadth 0.
function layoutSide(model, kids, o, ext, startD, dir, pos) {
  const total = kids.reduce(
    (s, k, i) => s + ext[k.id] + (i ? GAPS.BREADTH : 0), 0
  );
  let cursor = -total / 2;
  kids.forEach((k) => {
    assign(model, k, o, ext, startD, cursor, pos);
    cursor += ext[k.id] + GAPS.BREADTH;
  });
  kids.forEach((k) => walkProject(model, k, pos, o, dir));
}

// Project a subtree (used by balanced mode where each side has its own dir).
function walkProject(model, node, pos, o, dir) {
  project(model, node, pos, o, dir);
  visibleChildren(model, node).forEach((c) => walkProject(model, c, pos, o, dir));
}

function layoutBalanced(model) {
  const o = "h";
  const root = getRoot(model);
  const kids = visibleChildren(model, root);
  const ext = {};
  // extents for every subtree (root extent unused but harmless)
  computeExtents(model, root, o, ext);

  // root centered at origin
  root.x = -root.w / 2;
  root.y = -root.h / 2;

  const { left, right } = partition(kids, ext);
  const startD = root.w / 2 + GAPS.DEPTH; // near edge of first child level
  const pos = {};
  layoutSide(model, right, o, ext, startD, +1, pos);
  layoutSide(model, left, o, ext, startD, -1, pos);
}

// Center the whole map so the root sits at world origin (0,0).
function centerOnRoot(model) {
  const root = getRoot(model);
  const cx = root.x + root.w / 2;
  const cy = root.y + root.h / 2;
  if (!cx && !cy) return;
  model.nodes.forEach((n) => { n.x -= cx; n.y -= cy; });
}

// Public entry: lay out the entire map according to model.layoutMode.
export function layout(model) {
  switch (model.layoutMode) {
    case LAYOUT.LEFT: layoutDirected(model, "h", -1); break;
    case LAYOUT.DOWN: layoutDirected(model, "v", +1); break;
    case LAYOUT.BALANCED: layoutBalanced(model); return; // already root-centered
    case LAYOUT.RIGHT:
    default: layoutDirected(model, "h", +1); break;
  }
  centerOnRoot(model);
}
