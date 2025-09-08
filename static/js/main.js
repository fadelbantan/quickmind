// /static/js/main.js
import { $, $$ } from "/static/util.js";
import {
  store, recordHistory, undo, redo,
  restoreStateHTML, maybeRestoreOnLoad
} from "/static/js/state.js";
import { clearConnections, updateConnections } from "/static/js/connections.js";
import { layoutChildren, tidyLayout, centerMap } from "/static/js/layout.js";
import {
  attachEvents, autoExpandWidth, updateNodeButtons,
  selectNode, startEditing, createNode, deleteSelectedNode
} from "/static/js/nodes.js";
import { applyTransform } from "/static/js/transform.js";

console.log("[main] loaded");

window.addEventListener("DOMContentLoaded", () => {
  console.log("[main] DOMContentLoaded");

  // wire DOM
  store.canvas = $("#canvas");
  store.controls = {
    zoomIn: $("#zoom-in"),
    zoomOut: $("#zoom-out"),
    zoomDisplay: $("#zoom-display"),
  };
  store.shortcutHelp = $("#shortcut-help");
  store.saveBtn = $("#save-btn");

  // restore (if any)
  maybeRestoreOnLoad((html) => {
    restoreStateHTML(html, {
      clearConnections, attachEvents, updateNodeButtons, autoExpandWidth, updateConnections
    });
    applyTransform();
  });

  // init root
  const root = $(".node.root");
  attachEvents(root);
  updateNodeButtons(root);
  autoExpandWidth(root);
  recordHistory();
  selectNode(root);
  applyTransform();

  // --- canvas panning + node drag end
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

  store.canvas.addEventListener("mousedown", (e) => {
    if (e.target.closest(".node")) return;
    store.isPanning = true;
    store.startX = e.clientX - store.panX;
    store.startY = e.clientY - store.panY;
    store.canvas.classList.add("dragging");
  });
  store.canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || e.target.closest(".node")) return;
    store.isPanning = true;
    store.startX = e.touches[0].clientX - store.panX;
    store.startY = e.touches[0].clientY - store.panY;
  });
  document.addEventListener("mousemove", (e) => {
    if (store.draggedNode) {
      const dx = (e.clientX - store.dragStartX) / store.scale;
      const dy = (e.clientY - store.dragStartY) / store.scale;
      store.draggedNode.style.left = store.startLeft + dx + "px";
      store.draggedNode.style.top = store.startTop + dy + "px";
    } else if (store.isPanning) {
      store.panX = e.clientX - store.startX;
      store.panY = e.clientY - store.startY;
      applyTransform();
    }
  });
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
  document.addEventListener("mouseup", stopDragging);
  document.addEventListener("mouseleave", stopDragging);
  document.addEventListener("touchend", stopDragging);
  document.addEventListener("touchcancel", stopDragging);

  // wheel pan/zoom
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

  // zoom buttons
  store.controls.zoomIn?.addEventListener("click", () => {
    store.scale = Math.min(store.scale + 0.1, 3);
    applyTransform();
  });
  store.controls.zoomOut?.addEventListener("click", () => {
    store.scale = Math.max(store.scale - 0.1, 0.1);
    applyTransform();
  });

  // save image
  store.saveBtn?.addEventListener("click", () => {
    html2canvas(store.canvas).then((c) => {
      const link = document.createElement("a");
      link.download = "mindmap.png";
      link.href = c.toDataURL("image/png");
      link.click();
    });
  });

  // --- keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    if (active && active.classList.contains("content") && active.contentEditable === "true") {
      return; // don't steal keys while editing text
    }

    // global combos
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

    if (e.key === "?") {
      e.preventDefault();
      const sh = document.querySelector("#shortcut-help");
      if (sh) sh.open = !sh.open;
      return;
    }
    if (e.key === "Backspace") { deleteSelectedNode(); return; }

    if (!store.selectedNode) return;

    switch (e.key) {
      case "Enter": {
        e.preventDefault();
        const content = $(".content", store.selectedNode);
        if (!content || content.textContent.trim() === "") break;
        const child = createNode(store.selectedNode);
        layoutChildren(store.selectedNode);
        updateConnections(store.selectedNode);
        updateNodeButtons(store.selectedNode);
        selectNode(child);
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
        const sibling = createNode(parentNode);
        layoutChildren(parentNode);
        updateConnections(parentNode);
        updateNodeButtons(parentNode);
        selectNode(sibling);
        break;
      }
      case "e":
      case "E": {
        e.preventDefault();
        startEditing(store.selectedNode);
        break;
      }
      case "ArrowUp":
      case "ArrowDown": {
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
        const parent = store.selectedNode.dataset.parent;
        if (parent) {
          const node = document.querySelector(`[data-id="${parent}"]`);
          if (node) selectNode(node);
        }
        break;
      }
      case "ArrowRight": {
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
