// App bootstrap, global event wiring, and keyboard shortcuts.
import { $ } from "/static/util.js";
import {
  store, recordHistory, undo, redo,
  restoreStateHTML, maybeRestoreOnLoad
} from "/static/js/state.js";
import { clearConnections, updateConnections, repositionAllLines } from "/static/js/connections.js";
import { smartLayout, tidyLayout, centerMap } from "/static/js/layout.js";
import {
  attachEvents, autoExpandWidth, updateNodeButtons,
  selectNode, startEditing, createNode, deleteSelectedNode
} from "/static/js/nodes.js";
import { applyTransform } from "/static/js/transform.js";

console.log("[main] loaded");

// Initialize once the DOM is ready.
window.addEventListener("DOMContentLoaded", () => {
  console.log("[main] DOMContentLoaded");

  // Cache key DOM references used across the app.
  store.canvas = $("#canvas");
  store.controls = {
    zoomIn: $("#zoom-in"),
    zoomOut: $("#zoom-out"),
    zoomDisplay: $("#zoom-display"),
  };
  store.shortcutHelp = $("#shortcut-help");
  store.saveBtn = $("#save-btn");

  // Restore prior session if present.
  // Track whether a restore happened so we don't double-attach events on the root.
  let sessionRestored = false;
  maybeRestoreOnLoad((html) => {
    restoreStateHTML(html, {
      clearConnections, attachEvents, updateNodeButtons, autoExpandWidth, updateConnections
    });
    applyTransform();
    sessionRestored = true;
  });

  // Initialize the root node and baseline history state.
  // Skip attachEvents/updateNodeButtons/autoExpandWidth if restoreStateHTML already ran them.
  const root = $(".node.root");
  if (!sessionRestored) {
    attachEvents(root);
    updateNodeButtons(root);
    autoExpandWidth(root);
  }
  recordHistory();
  selectNode(root);
  applyTransform();

  // End drag/pan interactions and snap connections.
  function stopDragging() {
    if (store.draggedNode) {
      const parentId = store.draggedNode.dataset.parent;
      if (parentId) {
        const p = document.querySelector(`[data-id="${parentId}"]`);
        if (p) updateConnections(p);
      }
      updateConnections(store.draggedNode);
      store.draggedNode = null;
      recordHistory();
    }
    store.isPanning = false;
    store.canvas.classList.remove("dragging");
    applyTransform();
  }

  // Begin canvas panning when clicking empty space.
  store.canvas.addEventListener("mousedown", (e) => {
    if (e.target.closest(".node")) return;
    store.isPanning = true;
    store.startX = e.clientX - store.panX;
    store.startY = e.clientY - store.panY;
    store.canvas.classList.add("dragging");
  });
  // Touch panning mirrors mouse behavior.
  store.canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || e.target.closest(".node")) return;
    store.isPanning = true;
    store.startX = e.touches[0].clientX - store.panX;
    store.startY = e.touches[0].clientY - store.panY;
  });
  // Drag node or pan the canvas while moving the pointer.
  document.addEventListener("mousemove", (e) => {
    if (store.draggedNode) {
      const dx = (e.clientX - store.dragStartX) / store.scale;
      const dy = (e.clientY - store.dragStartY) / store.scale;
      store.draggedNode.style.left = store.startLeft + dx + "px";
      store.draggedNode.style.top = store.startTop + dy + "px";
      repositionAllLines();
    } else if (store.isPanning) {
      store.panX = e.clientX - store.startX;
      store.panY = e.clientY - store.startY;
      applyTransform();
    }
  });
  // Touch move for dragging/panning with one finger.
  document.addEventListener("touchmove", (e) => {
    if (store.draggedNode && e.touches.length === 1) {
      const dx = (e.touches[0].clientX - store.dragStartX) / store.scale;
      const dy = (e.touches[0].clientY - store.dragStartY) / store.scale;
      store.draggedNode.style.left = store.startLeft + dx + "px";
      store.draggedNode.style.top = store.startTop + dy + "px";
    } else if (store.isPanning && e.touches.length === 1) {
      store.panX = e.touches[0].clientX - store.startX;
      store.panY = e.touches[0].clientY - store.startY;
      applyTransform();
    }
  });
  // Stop drag/pan when pointer leaves or interaction ends.
  document.addEventListener("mouseup", stopDragging);
  document.addEventListener("mouseleave", stopDragging);
  document.addEventListener("touchend", stopDragging);
  document.addEventListener("touchcancel", stopDragging);

  // Wheel pans; Ctrl/Meta wheel zooms.
  store.canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey) {
      store.scale += e.deltaY < 0 ? 0.1 : -0.1;
      store.scale = Math.min(Math.max(0.1, store.scale), 3);
    } else {
      store.panX -= e.deltaX;
      store.panY -= e.deltaY;
    }
    applyTransform();
  }, { passive: false });

  // Zoom buttons for explicit UI control.
  store.controls.zoomIn?.addEventListener("click", () => {
    store.scale = Math.min(store.scale + 0.1, 3);
    applyTransform();
  });
  store.controls.zoomOut?.addEventListener("click", () => {
    store.scale = Math.max(store.scale - 0.1, 0.1);
    applyTransform();
  });

  // Export the canvas as a PNG via html2canvas.
  store.saveBtn?.addEventListener("click", () => {
    if (typeof html2canvas === 'undefined') { console.warn('html2canvas not loaded'); return; }
    html2canvas(store.canvas).then((c) => {
      const link = document.createElement("a");
      link.download = "mindmap.png";
      link.href = c.toDataURL("image/png");
      link.click();
    });
  });

  // Global keyboard shortcuts for editing and navigation.
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    if (active && active.classList.contains("content") && active.contentEditable === "true") {
      return; // don't steal keys while editing text
    }

    // Global combos (undo/redo, zoom, save).
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo((html) => restoreStateHTML(html, {
            clearConnections, attachEvents, updateNodeButtons, autoExpandWidth, updateConnections
          }));
        } else {
          undo((html) => restoreStateHTML(html, {
            clearConnections, attachEvents, updateNodeButtons, autoExpandWidth, updateConnections
          }));
        }
        applyTransform();
        return;
      }
      if (e.key === "+" || e.key === "=") { e.preventDefault(); store.scale = Math.min(store.scale + 0.1, 3); applyTransform(); return; }
      if (e.key === "-") { e.preventDefault(); store.scale = Math.max(store.scale - 0.1, 0.1); applyTransform(); return; }
      if (e.key === "s" || e.key === "S") { e.preventDefault(); store.saveBtn?.click(); return; }
    }

    // Toggle shortcut help.
    if (e.key === "?") {
      e.preventDefault();
      const sh = document.querySelector("#shortcut-help");
      if (sh) sh.open = !sh.open;
      return;
    }
    // Backspace deletes the selected node (if allowed).
    if (e.key === "Backspace") { deleteSelectedNode(); return; }

    if (!store.selectedNode) return;

    switch (e.key) {
      case "Enter": {
        e.preventDefault();
        const content = $(".content", store.selectedNode);
        if (!content || content.textContent.trim() === "") break;
        // Enter adds a child node.
        const child = createNode(store.selectedNode);
        smartLayout(store.selectedNode);
        updateConnections(store.selectedNode);
        updateNodeButtons(store.selectedNode);
        startEditing(child);
        break;
      }
      case "Tab": {
        e.preventDefault();
        const content = $(".content", store.selectedNode);
        if (!content || content.textContent.trim() === "") break;
        const parentId = store.selectedNode.dataset.parent;
        if (!parentId) break;
        const parentNode = document.querySelector(`[data-id="${parentId}"]`);
        if (!parentNode) break;
        // Tab adds a sibling node.
        const sibling = createNode(parentNode);
        smartLayout(parentNode);
        updateConnections(parentNode);
        updateNodeButtons(parentNode);
        startEditing(sibling);
        break;
      }
      case "e":
      case "E": {
        e.preventDefault();
        // "e" starts editing the selected node.
        startEditing(store.selectedNode);
        break;
      }
      case "ArrowUp":
      case "ArrowDown": {
        // Arrow up/down selects previous/next sibling.
        const pId = store.selectedNode.dataset.parent;
        if (!pId) break;
        const pNode = document.querySelector(`[data-id="${pId}"]`);
        if (!pNode) break;
        const siblings = Array.from(document.querySelectorAll(`[data-parent="${pId}"]`));
        const idx = siblings.indexOf(store.selectedNode);
        if (idx === -1) break;
        const nextIdx = e.key === "ArrowUp" ? idx - 1 : idx + 1;
        if (siblings[nextIdx]) selectNode(siblings[nextIdx]);
        break;
      }
      case "ArrowLeft": {
        // Arrow left selects the parent node.
        const parent = store.selectedNode.dataset.parent;
        if (parent) {
          const node = document.querySelector(`[data-id="${parent}"]`);
          if (node) selectNode(node);
        }
        break;
      }
      case "ArrowRight": {
        // Arrow right selects the first child node.
        const children = Array.from(document.querySelectorAll(`[data-parent="${store.selectedNode.dataset.id}"]`));
        if (children.length > 0) selectNode(children[0]);
        break;
      }
      case "l":
      case "L": e.preventDefault(); tidyLayout(); break;
      case "c":
      case "C": e.preventDefault(); centerMap(); break;
    }
  });

});
