import { store } from "/static/js/state.js";
import { repositionAllLines } from "/static/js/connections.js";

export function updateZoomDisplay() { store.controls.zoomDisplay.textContent = Math.round(store.scale * 100) + "%"; }


export function applyTransform() {
    store.canvas.style.transform = `translate(${store.panX}px, ${store.panY}px) scale(${store.scale})`;
    repositionAllLines(); updateZoomDisplay();
}


