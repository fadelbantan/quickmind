// LeaderLine connection management between parent and child nodes.
import { $$ } from "/static/util.js";
import { store } from "/static/js/state.js";

// Remove all line elements and reset the connection map.
export function clearConnections() {
    Object.values(store.connectionMap).flat().forEach((l) => l.remove());
    for (const k in store.connectionMap) delete store.connectionMap[k];
}

// Reposition all existing lines after a layout change.
export function repositionAllLines() {
    Object.values(store.connectionMap).flat().forEach((line) => line.position());
}

// Choose connection sockets for a horizontal (left-to-right) tree.
// Lines always exit the parent's horizontal edge toward the child's side, so
// tall stacks of children fan out from the parent's right edge instead of
// sweeping out of its top/bottom (which caused crossing/tangled lines).
export function chooseSockets(parentEl, childEl) {
    const pr = parentEl.getBoundingClientRect();
    const cr = childEl.getBoundingClientRect();
    const pcx = (pr.left + pr.right) / 2;
    const ccx = (cr.left + cr.right) / 2;
    const childIsRight = ccx >= pcx;
    return {
        startSocket: childIsRight ? "right" : "left",
        endSocket: childIsRight ? "left" : "right",
    };
}

// Rebuild all child connection lines for a given parent.
export function updateConnections(parent) {
    const parentId = parent.dataset.id;
    if (store.connectionMap[parentId]) store.connectionMap[parentId].forEach((l) => l.remove());
    const children = $$(`[data-parent="${parentId}"]`);
    const lines = [];
    children.forEach((child) => {
        const sockets = chooseSockets(parent, child);
        if (typeof LeaderLine === 'undefined') return;
        const line = new LeaderLine(parent, child, {
            ...{ color: "#94a3b8", size: 2, path: "fluid", startPlug: "behind", endPlug: "behind" },
            startSocket: sockets.startSocket,
            endSocket: sockets.endSocket,
        });
        lines.push(line);
    });
    store.connectionMap[parentId] = lines;
}
