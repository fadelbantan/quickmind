// Layout and positioning logic for the mind map tree.
import { $$, getChildren } from "/static/util.js";
import { store, recordHistory } from "/static/js/state.js";
import { updateConnections, repositionAllLines } from "/static/js/connections.js";
import { applyTransform } from "/static/js/transform.js";

// Tight vertical gap between adjacent sibling subtrees.
const V_GAP = 12;
// Horizontal gap between a parent's right edge and its children's left edge.
const H_GAP = 50;

// Bottom-up measurement: each subtree's vertical footprint is the MAX of
// (its own node height) and (the sum of its children's subtree footprints).
// This packs bushy branches only as tall as they actually need to be —
// unlike leaf-counting, which multiplies spacing by descendants.
export function computeSubtreeSize(node) {
    const children = getChildren(node);
    const ownHeight = node.offsetHeight + V_GAP;
    if (children.length === 0) {
        store.subtreeSizes[node.dataset.id] = ownHeight;
        return ownHeight;
    }
    const childrenTotal = children.reduce(
        (sum, c) => sum + computeSubtreeSize(c),
        0
    );
    const height = Math.max(ownHeight, childrenTotal);
    store.subtreeSizes[node.dataset.id] = height;
    return height;
}

// Place direct children to the right of the parent, each centered within
// its measured vertical slot. Total children span = sum of slot heights.
export function layoutChildren(parent) {
    const children = getChildren(parent);
    if (!children.length) return;
    const parentRect = parent.getBoundingClientRect();
    const canvasRect = store.canvas.getBoundingClientRect();
    const left = (parentRect.right - canvasRect.left) / store.scale + H_GAP;
    const parentCenterY =
        (parentRect.top - canvasRect.top) / store.scale + parent.offsetHeight / 2;

    const slots = children.map(
        (c) => store.subtreeSizes[c.dataset.id] || c.offsetHeight + V_GAP
    );
    const totalH = slots.reduce((a, b) => a + b, 0);

    let y = parentCenterY - totalH / 2;
    children.forEach((child, idx) => {
        const slot = slots[idx];
        child.style.left = left + "px";
        child.style.top = y + slot / 2 - child.offsetHeight / 2 + "px";
        updateConnections(child);
        y += slot;
    });
    updateConnections(parent);
}

// Recursively layout the entire subtree rooted at a node.
export function layoutSubtree(node) {
    layoutChildren(node);
    getChildren(node).forEach((c) => layoutSubtree(c));
}

// Full, correct reflow from the root. Used after any structural change
// (creating a node, editing text that resizes a node) so every node's
// position is consistent with the latest subtree sizes.
export function smartLayout() {
    const rootNode = document.querySelector(".root");
    if (!rootNode) return;
    store.subtreeSizes = {};
    computeSubtreeSize(rootNode);
    layoutSubtree(rootNode);
    repositionAllLines();
}

// Recompute sizes and reflow the entire map, then persist history.
export function tidyLayout() {
    const prev = store.canvas.style.transform;
    store.canvas.style.transform = "none";
    const rootNode = document.querySelector(".root");
    store.subtreeSizes = {};
    computeSubtreeSize(rootNode);
    layoutSubtree(rootNode);
    store.canvas.style.transform = prev;
    repositionAllLines();
    recordHistory();
}

// Center the map within the canvas by bounding-boxing all nodes.
export function centerMap() {
    const prevTransform = store.canvas.style.transform;
    store.canvas.style.transform = "none";
    const nodes = $$(`.node`);
    const canvasRect = store.canvas.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach((n) => {
        const r = n.getBoundingClientRect();
        minX = Math.min(minX, r.left - canvasRect.left);
        minY = Math.min(minY, r.top - canvasRect.top);
        maxX = Math.max(maxX, r.right - canvasRect.left);
        maxY = Math.max(maxY, r.bottom - canvasRect.top);
    });
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    store.panX = canvasRect.width / 2 - centerX * store.scale;
    store.panY = canvasRect.height / 2 - centerY * store.scale;
    store.canvas.style.transform = prevTransform;
    applyTransform();
}
