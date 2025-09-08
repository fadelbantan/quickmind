// /static/js/nodes.js
import { $, $$, getChildren } from "/static/util.js";
import { store, recordHistory } from "/static/js/state.js";
import { layoutChildren } from "/static/js/layout.js";
import { updateConnections, repositionAllLines } from "/static/js/connections.js";

console.log("[nodes] loaded");

export function autoExpandWidth(node) {
  const content = $(".content", node);
  if (!content) return;                  // <-- return is inside function (OK)
  node.style.width = "auto";
  const padding = 36;
  const width = Math.max(content.scrollWidth + padding, 120);
  node.style.width = width + "px";
}

export function updateNodeButtons(node) {
  const isRoot = node.classList.contains("root");
  const childBtn = $(".add-child", node);
  const siblingBtn = $(".add-sibling", node);
  const children = getChildren(node);

  if (isRoot) {
    if (siblingBtn) siblingBtn.style.display = "none";
    if (childBtn) childBtn.style.display = "";
  } else if (children.length === 0) {
    if (childBtn) childBtn.style.display = "";
    if (siblingBtn) siblingBtn.style.display = "";
  } else {
    if (childBtn) childBtn.style.display = "none";
    if (siblingBtn) siblingBtn.style.display = "";
  }
}

export function selectNode(node) {
  if (store.selectedNode) store.selectedNode.classList.remove("selected");
  store.selectedNode = node;
  if (node) {
    node.classList.add("selected");
    node.focus();
  }
}

export function startEditing(node) {
  const content = $(".content", node);
  if (!content) return;
  selectNode(node);
  content.contentEditable = "true";
  content.focus();

  const range = document.createRange();
  range.selectNodeContents(content);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  function finish() {
    content.contentEditable = "false";
    content.removeEventListener("blur", finish);
    content.removeEventListener("keydown", keyHandler);
    content.removeEventListener("input", onInput);
    autoExpandWidth(node);
    layoutChildren(node);
    const parentId = node.dataset.parent;
    if (parentId) {
      const parentNode = document.querySelector(`[data-id="${parentId}"]`);
      if (parentNode) {
        layoutChildren(parentNode);
        updateConnections(parentNode);
      }
    }
    updateConnections(node);
    repositionAllLines();
    recordHistory();
  }

  function keyHandler(e) {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      content.blur(); // triggers finish()
    }
  }

  function onInput() {
    autoExpandWidth(node);
    layoutChildren(node);
    const parentId = node.dataset.parent;
    if (parentId) {
      const parentNode = document.querySelector(`[data-id="${parentId}"]`);
      if (parentNode) {
        layoutChildren(parentNode);
        updateConnections(parentNode);
      }
    }
    updateConnections(node);
    repositionAllLines();
  }

  content.addEventListener("blur", finish);
  content.addEventListener("keydown", keyHandler);
  content.addEventListener("input", onInput);
}

export function attachEvents(node) {
  // add child
  const childBtn = $(".add-child", node);
  if (childBtn) {
    childBtn.addEventListener("click", () => {
      const c = $(".content", node);
      if (!c || c.textContent.trim() === "") return;
      const child = createNode(node);
      layoutChildren(node);
      updateConnections(node);
      updateNodeButtons(node);
      selectNode(child);
    });
  }

  // add sibling
  const siblingBtn = $(".add-sibling", node);
  if (siblingBtn) {
    siblingBtn.addEventListener("click", () => {
      const c = $(".content", node);
      if (!c || c.textContent.trim() === "") return;
      const parentId = node.dataset.parent;
      const parentNode = document.querySelector(`[data-id="${parentId}"]`);
      if (!parentNode) return;
      const sib = createNode(parentNode);
      layoutChildren(parentNode);
      updateConnections(parentNode);
      updateNodeButtons(parentNode);
      selectNode(sib);
    });
  }

  // select on click (but not when clicking buttons)
  node.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    selectNode(node);
  });

  // double-click to edit
  node.addEventListener("dblclick", (e) => {
    if (e.target.closest("button")) return;
    startEditing(node);
  });

  // 'e' to edit when not focused on content
  node.addEventListener("keydown", (e) => {
    if (
      (e.key === "e" || e.key === "E") &&
      document.activeElement !== $(".content", node)
    ) {
      e.preventDefault();
      startEditing(node);
    }
  });

  // start dragging the selected node
  node.addEventListener("mousedown", (e) => {
    if (
      !node.classList.contains("selected") ||
      e.target.closest("button") ||
      e.target.classList.contains("content")
    ) return;

    store.draggedNode = node;
    store.dragStartX = e.clientX;
    store.dragStartY = e.clientY;
    const style = window.getComputedStyle(node);
    store.startLeft = parseFloat(style.left);
    store.startTop = parseFloat(style.top);
  });
}

export function createNode(parentNode) {
  store.counter += 1;

  const node = document.createElement("div");
  node.className = "node";
  node.dataset.id = store.counter;
  node.dataset.parent = parentNode.dataset.id;

  node.innerHTML = `
    <div class="color-picker"></div>
    <div class="content" contenteditable="false">new node</div>
  `;
  node.tabIndex = 0;

  store.canvas.appendChild(node);
  autoExpandWidth(node);

  const refRect = parentNode.getBoundingClientRect();
  const canvasRect = store.canvas.getBoundingClientRect();
  node.style.left = refRect.right - canvasRect.left + 100 + "px";
  node.style.top = refRect.top - canvasRect.top + "px";

  attachEvents(node);
  updateNodeButtons(node);
  recordHistory();
  return node;
}

export function deleteSelectedNode() {
  const node = store.selectedNode;
  if (!node) return;
  const content = node.querySelector(".content");
  if (document.activeElement === content) return;
  if (node.classList.contains("root")) return;

  const children = getChildren(node);
  if (children.length > 0) return;

  const parentId = node.dataset.parent;
  const parentNode = document.querySelector(`[data-id="${parentId}"]`);
  const nodeId = node.dataset.id;

  if (store.connectionMap[nodeId]) {
    store.connectionMap[nodeId].forEach((l) => l.remove());
    delete store.connectionMap[nodeId];
  }

  node.remove();

  if (parentNode) {
    updateConnections(parentNode);
    updateNodeButtons(parentNode);
    selectNode(parentNode);
  } else {
    selectNode(null);
  }
  recordHistory();
}
