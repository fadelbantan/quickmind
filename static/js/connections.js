/**
 * Manage drawing and positioning of lines between nodes.
 */
import { $$ } from "/static/util.js";
import { store } from "/static/js/state.js";

/**
 * Remove all connection lines from the canvas and reset the map.
 */
export function clearConnections() {
    Object.values(store.connectionMap).flat().forEach((l) => l.remove());
    for (const k in store.connectionMap) delete store.connectionMap[k];
}

/**
 * Reposition every connection line. Useful after global layout changes.
 */
export function repositionAllLines() {
    Object.values(store.connectionMap).flat().forEach((line) => line.position());
}

/**
 * Determine the optimal sockets to connect a parent and child node.
 * @param {HTMLElement} parentEl - Parent node element.
 * @param {HTMLElement} childEl - Child node element.
 * @returns {{startSocket: string, endSocket: string}} The sockets to use.
 */
export function chooseSockets(parentEl, childEl) {
    const pr = parentEl.getBoundingClientRect();
    const cr = childEl.getBoundingClientRect();
    const pcx = (pr.left + pr.right) / 2, pcy = (pr.top + pr.bottom) / 2;
    const ccx = (cr.left + cr.right) / 2, ccy = (cr.top + cr.bottom) / 2;
    const dx = ccx - pcx, dy = ccy - pcy;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return { startSocket: dx >= 0 ? "right" : "left", endSocket: dx >= 0 ? "left" : "right" };
    } else {
        return { startSocket: dy >= 0 ? "bottom" : "top", endSocket: dy >= 0 ? "top" : "bottom" };
    }
}

/**
 * Create or update lines connecting a parent node to all of its children.
 * @param {HTMLElement} parent - Parent node whose connections should be drawn.
 */
export function updateConnections(parent) {
    const parentId = parent.dataset.id;
    if (store.connectionMap[parentId]) store.connectionMap[parentId].forEach((l) => l.remove());
    const children = $$(`[data-parent="${parentId}"]`);
    const lines = [];
    children.forEach((child) => {
        const sockets = chooseSockets(parent, child);
        const line = new LeaderLine(parent, child, {
            ...{ color: "#94a3b8", size: 3, path: "magnet", startPlug: "behind", endPlug: "arrow2" },
            startSocket: sockets.startSocket,
            endSocket: sockets.endSocket,
        });
        lines.push(line);
    });
    store.connectionMap[parentId] = lines;
}