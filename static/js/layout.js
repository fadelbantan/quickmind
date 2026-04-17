// Layout and positioning logic for the mind map tree.
import { $$, getChildren } from "/static/util.js";
import { store, recordHistory } from "/static/js/state.js";
import { updateConnections, repositionAllLines } from "/static/js/connections.js";
import { applyTransform } from "/static/js/transform.js";

// Compute a subtree "size" used for vertical spacing (leaf-weighted).
export function computeSubtreeSize(node) {
    const children = getChildren(node);
    if (children.length === 0) { store.subtreeSizes[node.dataset.id] = 1; return 1; }
    let total = 0; children.forEach((c) => { total += computeSubtreeSize(c); });
    store.subtreeSizes[node.dataset.id] = total; return total;
}

// Position direct children to the right of the parent with spacing based on subtree sizes.
export function layoutChildren(parent) {
    const children = Array.from($$(`[data-parent="${parent.dataset.id}"]`));
    if (!children.length) return;
    const parentRect = parent.getBoundingClientRect();
    const canvasRect = store.canvas.getBoundingClientRect();
    const spacing = 120;
    const left = (parentRect.right - canvasRect.left) / store.scale + 100;
    const heights = children.map((c) => store.subtreeSizes[c.dataset.id] || 1);
    const totalHeight = heights.reduce((a, b) => a + b, 0);
    let startY = (parentRect.top - canvasRect.top) / store.scale - (totalHeight * spacing) / 2;
    children.forEach((child, idx) => {
        const h = heights[idx];
        startY += (h * spacing) / 2;
        child.style.left = left + "px";
        child.style.top = startY + "px";
        updateConnections(child);
        startY += (h * spacing) / 2;
    });
    updateConnections(parent);
}

// Recursively layout the entire subtree rooted at a node.
export function layoutSubtree(node) {
    layoutChildren(node);
    getChildren(node).forEach((c) => layoutSubtree(c));
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
