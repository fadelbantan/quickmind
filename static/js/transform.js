/**
 * Handle canvas pan and zoom transforms.
 */
import { store } from "/static/js/state.js";
import { repositionAllLines } from "/static/js/connections.js";
/**
 * Update the zoom level text in the UI.
 */
export function updateZoomDisplay() {
    store.controls.zoomDisplay.textContent = Math.round(store.scale * 100) + "%";
}

/**
 * Apply the current pan and zoom transform to the canvas.
 * Repositions existing connection lines and updates the zoom display.
 */
export function applyTransform() {
    store.canvas.style.transform = `translate(${store.panX}px, ${store.panY}px) scale(${store.scale})`;
    repositionAllLines();
    updateZoomDisplay();
}