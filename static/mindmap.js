document.addEventListener("DOMContentLoaded", () => {
  let counter = 0;
  const connectionMap = {};
  const canvas = $("#canvas");
  const controls = {
    zoomIn: $("#zoom-in"),
    zoomOut: $("#zoom-out"),
    zoomDisplay: $("#zoom-display"),
  };
  const shortcutHelp = $("#shortcut-help");
  const saveBtn = $("#save-btn");
  const nodeColors = [
    "#ffffff",
    "#fef3c7",
    "#dbeafe",
    "#dcfce7",
    "#fce7f3",
    "#e9d5ff",
  ];
  let currentColorIndex = 0;

  let selectedNode = null;
  let draggedNode = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let startLeft = 0;
  let startTop = 0;

  const history = [];
  let historyIndex = -1;

  function clearConnections() {
    Object.values(connectionMap)
      .flat()
      .forEach((l) => l.remove());
    for (const k in connectionMap) delete connectionMap[k];
  }

  function recordHistory() {
    history.splice(historyIndex + 1);
    history.push(canvas.innerHTML);
    historyIndex = history.length - 1;
  }

  function restoreState(html) {
    clearConnections();
    canvas.innerHTML = html;
    selectedNode = null;
    counter = 0;
    const nodes = $$(".node");
    nodes.forEach((n) => {
      attachEvents(n);
      updateNodeButtons(n);
      const id = parseInt(n.dataset.id, 10);
      if (id > counter) counter = id;
    });
    nodes.forEach((n) => updateConnections(n));
  }

  function undo() {
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    restoreState(history[historyIndex]);
  }

  function redo() {
    if (historyIndex >= history.length - 1) return;
    historyIndex += 1;
    restoreState(history[historyIndex]);
  }

  function stopDragging() {
    if (draggedNode) {
      const parentId = draggedNode.dataset.parent;
      if (parentId) {
        const parentNode = $(`[data-id="${parentId}"]`);
        if (parentNode) updateConnections(parentNode);
      }
      updateConnections(draggedNode);
      draggedNode = null;
      recordHistory();
    }
    isPanning = false;
    canvas.classList.remove("dragging");
  }

  function selectNode(node) {
    if (selectedNode) selectedNode.classList.remove("selected");
    selectedNode = node;
    if (node) {
      node.classList.add("selected");
      node.focus();
    }
  }

  function startEditing(node) {
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
      content.removeEventListener("input", repositionAllLines);
      repositionAllLines();
      recordHistory();
    }
    function keyHandler(e) {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        content.blur();
      }
    }
    content.addEventListener("blur", finish);
    content.addEventListener("keydown", keyHandler);
    content.addEventListener("input", repositionAllLines);
  }

  function repositionAllLines() {
    Object.values(connectionMap)
      .flat()
      .forEach((line) => line.position());
  }

  const getChildren = (node) => $$(`[data-parent="${node.dataset.id}"]`);

  function updateNodeButtons(node) {
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

  function attachEvents(node) {
    // handle add children nodes
    const childBtn = $(".add-child", node);
    if (childBtn) {
      childBtn.addEventListener("click", () => {
        createNode(node);
        layoutChildren(node);
        updateConnections(node);
        updateNodeButtons(node);
      });
    }

    // handle adding sibling nodes
    const siblingBtn = $(".add-sibling", node);
    if (siblingBtn) {
      siblingBtn.addEventListener("click", () => {
        const parentId = node.dataset.parent;
        const parentNode = $(`[data-id="${parentId}"]`);
        if (!parentNode) return;
        createNode(parentNode);
        layoutChildren(parentNode);
        updateConnections(parentNode);
        updateNodeButtons(parentNode);
      });
    }

    node.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      selectNode(node);
    });

    node.addEventListener("dblclick", (e) => {
      if (e.target.closest("button")) return;
      startEditing(node);
    });

    node.addEventListener("keydown", (e) => {
      if (
        (e.key === "e" || e.key === "E") &&
        document.activeElement !== $(".content", node)
      ) {
        e.preventDefault();
        startEditing(node);
      }
    });

    node.addEventListener("mousedown", (e) => {
      if (
        !node.classList.contains("selected") ||
        e.target.closest("button") ||
        e.target.classList.contains("content")
      )
        return;
      draggedNode = node;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const style = window.getComputedStyle(node);
      startLeft = parseFloat(style.left);
      startTop = parseFloat(style.top);
    });
  }

  function deleteSelectedNode() {
    if (!selectedNode) return;
    const content = selectedNode.querySelector(".content");
    if (document.activeElement === content) return;
    if (selectedNode.classList.contains("root")) return;
    const children = getChildren(selectedNode);
    if (children.length > 0) return;
    const parentId = selectedNode.dataset.parent;
    const parentNode = $(`[data-id="${parentId}"]`);
    const nodeId = selectedNode.dataset.id;
    if (connectionMap[nodeId]) {
      connectionMap[nodeId].forEach((line) => line.remove());
      delete connectionMap[nodeId];
    }
    selectedNode.remove();
    if (parentNode) {
      updateConnections(parentNode);
      updateNodeButtons(parentNode);
      selectNode(parentNode);
    } else {
      selectNode(null);
    }
    recordHistory();
  }

  function createNode(parentNode) {
    counter += 1;

    const node = document.createElement("div");
    node.className = "node";
    node.dataset.id = counter;
    node.dataset.parent = parentNode.dataset.id;

    node.innerHTML = `
          <div class="content" contenteditable="false">new node</div>
        `;
    node.tabIndex = 0;

    canvas.appendChild(node);

    const refRect = parentNode.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    node.style.left = refRect.right - canvasRect.left + 100 + "px";
    node.style.top = refRect.top - canvasRect.top + "px";

    attachEvents(node);
    updateNodeButtons(node);
    recordHistory();
    return node;
  }

  const subtreeSizes = {};

  function computeSubtreeSize(node) {
    const children = getChildren(node);
    if (children.length === 0) {
      subtreeSizes[node.dataset.id] = 1;
      return 1;
    }
    let total = 0;
    children.forEach((child) => {
      total += computeSubtreeSize(child);
    });
    subtreeSizes[node.dataset.id] = total;
    return total;
  }

  function layoutChildren(parent) {
    const children = Array.from($$(`[data-parent="${parent.dataset.id}"]`));
    if (children.length === 0) return;
    const parentRect = parent.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const spacing = 120;
    const left = parentRect.right - canvasRect.left + 100;
    const heights = children.map((c) => subtreeSizes[c.dataset.id] || 1);
    const totalHeight = heights.reduce((a, b) => a + b, 0);
    let startY = parentRect.top - canvasRect.top - (totalHeight * spacing) / 2;
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

  function layoutSubtree(node) {
    layoutChildren(node);
    getChildren(node).forEach((child) => layoutSubtree(child));
  }

  function tidyLayout() {
    const prev = canvas.style.transform;
    canvas.style.transform = "none";
    const rootNode = $(".root");
    Object.keys(subtreeSizes).forEach((k) => delete subtreeSizes[k]);
    computeSubtreeSize(rootNode);
    layoutSubtree(rootNode);
    canvas.style.transform = prev;
    repositionAllLines();
    recordHistory();
  }

  let scale = 1;

  function updateZoomDisplay() {
    controls.zoomDisplay.textContent = Math.round(scale * 100) + "%";
  }

  function applyTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    repositionAllLines();
    updateZoomDisplay();
  }

  // updates connection lines between a parent and its children
  function updateConnections(parent) {
    const parentId = parent.dataset.id;

    // remove existing lines for this parent if any
    if (connectionMap[parentId]) {
      connectionMap[parentId].forEach((line) => line.remove());
    }
    const children = $$(`[data-parent="${parentId}"]`);
    const lines = [];

    children.forEach((child) => {
      const line = new LeaderLine(parent, child, {
        startSocket: "right",
        endSocket: "left",
        path: "fluid",
        startPlug: "behind",
        endPlug: "behind",
      });
      lines.push(line);
    });
    connectionMap[parentId] = lines;
  }

  let isPanning = false;
  let panX = 0;
  let panY = 0;
  let startX = 0;
  let startY = 0;

  canvas.addEventListener("mousedown", (e) => {
    if (e.target.closest(".node")) return;
    isPanning = true;
    startX = e.clientX - panX;
    startY = e.clientY - panY;
    canvas.classList.add("dragging");
  });

  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || e.target.closest(".node")) return;
    isPanning = true;
    startX = e.touches[0].clientX - panX;
    startY = e.touches[0].clientY - panY;
  });

  document.addEventListener("mousemove", (e) => {
    if (draggedNode) {
      const dx = (e.clientX - dragStartX) / scale;
      const dy = (e.clientY - dragStartY) / scale;
      draggedNode.style.left = startLeft + dx + "px";
      draggedNode.style.top = startTop + dy + "px";
      repositionAllLines();
    } else if (isPanning) {
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      applyTransform();
    }
  });

  document.addEventListener("touchmove", (e) => {
    if (draggedNode && e.touches.length === 1) {
      const dx = (e.touches[0].clientX - dragStartX) / scale;
      const dy = (e.touches[0].clientY - dragStartY) / scale;
      draggedNode.style.left = startLeft + dx + "px";
      draggedNode.style.top = startTop + dy + "px";
      repositionAllLines();
    } else if (isPanning && e.touches.length === 1) {
      panX = e.touches[0].clientX - startX;
      panY = e.touches[0].clientY - startY;
      applyTransform();
    }
  });

  document.addEventListener("mouseup", stopDragging);
  document.addEventListener("touchend", stopDragging);
  document.addEventListener("mouseleave", stopDragging);
  document.addEventListener("touchcancel", stopDragging);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey) {
      // Pinch to zoom
      if (e.deltaY < 0) {
        scale += 0.1;
      } else {
        scale -= 0.1;
      }
      scale = Math.min(Math.max(0.1, scale), 3);
    } else {
      // two finger drag to pan
      panX -= e.deltaX;
      panY -= e.deltaY;
    }
    applyTransform();
  });

  controls.zoomIn.addEventListener("click", () => {
    scale = Math.min(scale + 0.1, 3);
    applyTransform();
  });

  controls.zoomOut.addEventListener("click", () => {
    scale = Math.max(scale - 0.1, 0.1);
    applyTransform();
  });

  function centerMap() {
    const prevTransform = canvas.style.transform;
    canvas.style.transform = "none";
    const nodes = $$(".node");
    const canvasRect = canvas.getBoundingClientRect();
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    nodes.forEach((n) => {
      const rect = n.getBoundingClientRect();
      minX = Math.min(minX, rect.left - canvasRect.left);
      minY = Math.min(minY, rect.top - canvasRect.top);
      maxX = Math.max(maxX, rect.right - canvasRect.left);
      maxY = Math.max(maxY, rect.bottom - canvasRect.top);
    });

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    panX = canvasRect.width / 2 - centerX * scale;
    panY = canvasRect.height / 2 - centerY * scale;

    canvas.style.transform = prevTransform;
    applyTransform();
  }

  function saveAsImage() {
    html2canvas(canvas).then((c) => {
      const link = document.createElement("a");
      link.download = "mindmap.png";
      link.href = c.toDataURL("image/png");
      link.click();
    });
  }
  if (saveBtn) {
    saveBtn.addEventListener("click", saveAsImage);
  }

  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    if (
      active &&
      active.classList.contains("content") &&
      active.contentEditable === "true"
    ) {
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        scale = Math.min(scale + 0.1, 3);
        applyTransform();
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        scale = Math.max(scale - 0.1, 0.1);
        applyTransform();
        return;
      }
    }
    if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      saveAsImage();
      return;
    }
    if (e.key === "?") {
      e.preventDefault();
      if (shortcutHelp) {
        shortcutHelp.open = !shortcutHelp.open;
      }
      return;
    }
    if (e.key === "Backspace") {
      deleteSelectedNode();
      return;
    }
    if (!selectedNode) return;

    switch (e.key) {
      case "Enter":
        e.preventDefault();
        const child = createNode(selectedNode);
        layoutChildren(selectedNode);
        updateConnections(selectedNode);
        updateNodeButtons(selectedNode);
        selectNode(child);
        break;
      case "Tab":
        e.preventDefault();
        const parentId = selectedNode.dataset.parent;
        if (!parentId) break;
        const parentNode = $(`[data-id="${parentId}"]`);
        if (!parentNode) break;
        const sibling = createNode(parentNode);
        layoutChildren(parentNode);
        updateConnections(parentNode);
        updateNodeButtons(parentNode);
        selectNode(sibling);
        break;
      case "e":
      case "E":
        e.preventDefault();
        startEditing(selectedNode);
        break;
      case "ArrowUp":
      case "ArrowDown": {
        const pId = selectedNode.dataset.parent;
        if (!pId) break;
        const pNode = document.querySelector(`[data-id="${pId}"]`);
        if (!pNode) break;
        const siblings = getChildren(pNode);
        const idx = siblings.indexOf(selectedNode);
        if (idx === -1) break;
        const nextIdx = e.key === "ArrowUp" ? idx - 1 : idx + 1;
        if (siblings[nextIdx]) selectNode(siblings[nextIdx]);
        break;
      }
      case "ArrowLeft": {
        const parent = selectedNode.dataset.parent;
        if (parent) {
          const node = $(`[data-id="${parent}"]`);
          if (node) selectNode(node);
        }
        break;
      }
      case "ArrowRight": {
        const children = getChildren(selectedNode);
        if (children.length > 0) selectNode(children[0]);
        break;
      }
      case "l":
      case "L":
        e.preventDefault();
        tidyLayout();
        break;
      case "c":
      case "C":
        e.preventDefault();
        centerMap();
        break;
    }
  });

  // Kick things off
  const root = $(".root");
  attachEvents(root);
  applyTransform();
  updateNodeButtons(root);
  recordHistory();
});
