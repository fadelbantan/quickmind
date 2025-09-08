import { throttle } from "/static/util.js";
import { store } from "/static/js/state.js";
import { repositionAllLines } from "/static/js/connections.js";

export function updateZoomDisplay() { store.controls.zoomDisplay.textContent = Math.round(store.scale * 100) + "%"; }


export function applyTransform() {
    store.canvas.style.transform = `translate(${store.panX}px, ${store.panY}px) scale(${store.scale})`;
    repositionAllLines(); updateZoomDisplay();
}


export const updateConnectionsDuringDrag = throttle((node) => {
    if (!node) return;
    // update node and its parent connections without heavy reflow
    import('./connections.js').then(({ updateConnections }) => {
        updateConnections(node);
        const pid = node.dataset.parent; if (pid) { const p = document.querySelector(`[data-id="${pid}"]`); if (p) updateConnections(p); }
    });
}, 60);