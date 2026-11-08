import * as pdfjsLib from "./vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).toString();

const SVG_NS = "http://www.w3.org/2000/svg";
const APP_VERSION = 3;

const SYMBOLS = [
  { key: "ap-room", category: "wifi", code: "AP", name: "AP habitación", color: "#0b84f3", layer: "wifi" },
  { key: "ap-common", category: "wifi", code: "AP", name: "AP zona común", color: "#15a6d8", layer: "wifi" },
  { key: "ap-outdoor", category: "wifi", code: "AP", name: "AP exterior", color: "#00a99d", layer: "wifi" },
  { key: "node", category: "network", code: "N", name: "Nodo de red", color: "#7b61ff", layer: "network" },
  { key: "double-node", category: "network", code: "2N", name: "Toma doble", color: "#6848e8", layer: "network" },
  { key: "corporate", category: "network", code: "COR", name: "Nodo corporativo", color: "#9a53d6", layer: "network" },
  { key: "iptv", category: "network", code: "TV", name: "IPTV", color: "#be5a97", layer: "network" },
  { key: "phone", category: "network", code: "IP", name: "Telefonía IP", color: "#5d73d8", layer: "network" },
  { key: "camera-dome", category: "security", code: "C", name: "Cámara domo", color: "#e55353", layer: "cctv" },
  { key: "camera-bullet", category: "security", code: "C", name: "Cámara bullet", color: "#d43f62", layer: "cctv" },
  { key: "camera-ptz", category: "security", code: "PTZ", name: "Cámara PTZ", color: "#f06a3e", layer: "cctv" },
  { key: "access", category: "security", code: "CA", name: "Control de acceso", color: "#d67b31", layer: "cctv" },
  { key: "mdf", category: "rack", code: "MDF", name: "Rack MDF", color: "#156f65", layer: "racks" },
  { key: "idf", category: "rack", code: "IDF", name: "Rack IDF", color: "#16846f", layer: "racks" },
  { key: "rack", category: "rack", code: "R", name: "Rack comunicaciones", color: "#287a58", layer: "racks" },
  { key: "fiber-box", category: "rack", code: "FO", name: "Caja de fibra", color: "#00a67d", layer: "fiber" }
];

const DEFAULT_LAYERS = [
  { id: "wifi", name: "WiFi", color: "#0b84f3", visible: true, locked: false },
  { id: "network", name: "Red y nodos", color: "#7b61ff", visible: true, locked: false },
  { id: "cctv", name: "CCTV y seguridad", color: "#e55353", visible: true, locked: false },
  { id: "racks", name: "Racks", color: "#16846f", visible: true, locked: false },
  { id: "fiber", name: "Fibra", color: "#00a67d", visible: true, locked: false },
  { id: "copper", name: "Cableado de cobre", color: "#f08b2d", visible: true, locked: false },
  { id: "conduit", name: "Canalizaciones", color: "#64748b", visible: true, locked: false },
  { id: "notes", name: "Observaciones", color: "#d19b00", visible: true, locked: false }
];

const ROUTE_STYLES = {
  fiber: { name: "Fibra óptica", color: "#00a67d", layer: "fiber", dash: "" },
  copper: { name: "Cableado de cobre", color: "#f08b2d", layer: "copper", dash: "" },
  conduit: { name: "Canalización", color: "#64748b", layer: "conduit", dash: "10 7" },
  wireless: { name: "Enlace inalámbrico", color: "#0b84f3", layer: "wifi", dash: "5 6" }
};

const el = (id) => document.getElementById(id);
const welcome = el("welcome");
const appShell = el("app-shell");
const canvasScroll = el("canvas-scroll");
const planStage = el("plan-stage");
const bgCanvas = el("background-canvas");
const overlaySvg = el("overlay-svg");
const routesLayer = el("routes-layer");
const itemsLayer = el("items-layer");
const draftLayer = el("draft-layer");
const symbolTooltip = el("symbol-tooltip");
const fileBuffers = new Map();
const pdfDocuments = new Map();
let history = [];
let historyIndex = -1;
let dirty = false;
let activeTool = "select";
let activeSymbol = null;
let selectedId = null;
let dragState = null;
let draftRoutePoints = [];
let pendingNotePoint = null;
let renderToken = 0;
let toastTimer;
let pendingFormChange = false;
let focusedLayerId = null;

let state = freshState();

function freshState(name = "Proyecto sin título") {
  return {
    appVersion: APP_VERSION,
    projectName: name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sources: [],
    layers: structuredClone(DEFAULT_LAYERS),
    pages: [],
    currentPageId: null,
    zoom: 1
  };
}

function uid(prefix = "id") {
  return `${prefix}-${crypto.randomUUID()}`;
}

function currentPage() {
  return state.pages.find((page) => page.id === state.currentPageId) || null;
}

function allObjects() {
  return state.pages.flatMap((page) => page.objects || []);
}

function objectById(id) {
  const page = currentPage();
  return page?.objects.find((object) => object.id === id) || null;
}

function layerById(id) {
  return state.layers.find((layer) => layer.id === id);
}

function sourceById(id) {
  return state.sources.find((source) => source.id === id);
}

function showToast(message) {
  const toast = el("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2300);
}

function safeName(value) {
  return (value || "proyecto")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "proyecto";
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function snapshot() {
  return JSON.stringify(state);
}

function commitHistory(markDirty = true) {
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot());
  if (history.length > 60) history.shift();
  historyIndex = history.length - 1;
  if (markDirty) dirty = true;
  updateUndoButtons();
}

function resetHistory() {
  history = [snapshot()];
  historyIndex = 0;
  dirty = false;
  updateUndoButtons();
}

function restoreHistory(index) {
  if (index < 0 || index >= history.length) return;
  historyIndex = index;
  state = JSON.parse(history[historyIndex]);
  selectedId = null;
  draftRoutePoints = [];
  dirty = true;
  refreshUI(true);
  updateUndoButtons();
}

function updateUndoButtons() {
  el("undo-btn").disabled = historyIndex <= 0;
  el("redo-btn").disabled = historyIndex >= history.length - 1;
}

function markUpdated() {
  state.updatedAt = new Date().toISOString();
}

function openApp() {
  focusedLayerId = null;
  welcome.hidden = true;
  appShell.hidden = false;
  el("project-title").textContent = state.projectName;
}

function setTool(tool, symbol = null) {
  activeTool = tool;
  activeSymbol = symbol;
  draftRoutePoints = [];
  draftLayer.replaceChildren();
  el("route-actions").hidden = true;
  document.querySelectorAll(".drawing-tool").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
  if (tool === "select") el("tool-help").textContent = "Selecciona un elemento para editarlo.";
  if (tool === "symbol") el("tool-help").textContent = `Pulsa sobre el plano para colocar: ${symbol.name}.`;
  if (tool === "route") el("tool-help").textContent = "Pulsa símbolos para anclar inicio, pasos o final; pulsa el plano para crear esquinas. Doble clic o «Finalizar y guardar» termina la ruta.";
  if (tool === "note") el("tool-help").textContent = "Pulsa sobre el plano para añadir una observación.";
}

function renderSymbolLibrary(category = "all") {
  const grid = el("symbol-grid");
  grid.replaceChildren();
  SYMBOLS.filter((symbol) => category === "all" || symbol.category === category).forEach((symbol) => {
    const button = document.createElement("button");
    button.className = "symbol-card";
    button.type = "button";
    button.draggable = true;
    button.style.setProperty("--symbol-color", symbol.color);
    const preview = document.createElement("span");
    preview.className = "symbol-preview";
    const previewSvg = svgNode("svg", { viewBox: "-24 -24 48 48", "aria-hidden": "true" });
    previewSvg.append(svgNode("circle", { cx: 0, cy: 0, r: 19, fill: "rgba(255,255,255,.04)", stroke: "currentColor", "stroke-width": 2 }));
    previewSvg.append(createSymbolIcon(symbol, 1.15));
    preview.appendChild(previewSvg);
    const name = document.createElement("span");
    name.textContent = symbol.name;
    button.append(preview, name);
    button.addEventListener("click", () => setTool("symbol", symbol));
    button.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/telecom-symbol", symbol.key);
      event.dataTransfer.effectAllowed = "copy";
    });
    grid.appendChild(button);
  });
}

function renderPages() {
  const list = el("page-list");
  list.replaceChildren();
  state.pages.forEach((page, index) => {
    const button = document.createElement("button");
    button.className = `page-item${page.id === state.currentPageId ? " active" : ""}`;
    button.innerHTML = `<span class="page-number">${String(index + 1).padStart(2, "0")}</span><span class="page-name">${escapeHtml(page.name)}</span>`;
    button.title = "Doble clic para renombrar";
    button.addEventListener("click", () => selectPage(page.id));
    button.addEventListener("dblclick", () => renamePage(page));
    list.appendChild(button);
  });
}

function renderLayers() {
  const list = el("layer-list");
  list.replaceChildren();
  state.layers.forEach((layer) => {
    const row = document.createElement("div");
    row.className = `layer-row${layer.visible ? "" : " layer-hidden"}${focusedLayerId === layer.id ? " active" : ""}`;
    row.innerHTML = `<button class="layer-eye" title="Mostrar u ocultar">${layer.visible ? "◉" : "○"}</button><button class="layer-name" title="Aislar esta capa"><i class="layer-swatch" style="background:${layer.color}"></i>${escapeHtml(layer.name)}</button><button class="layer-lock" title="Bloquear capa">${layer.locked ? "▣" : "□"}</button>`;
    row.querySelector(".layer-eye").addEventListener("click", () => {
      layer.visible = !layer.visible;
      markUpdated(); commitHistory(); renderLayers(); renderOverlay();
    });
    row.querySelector(".layer-lock").addEventListener("click", () => {
      layer.locked = !layer.locked;
      markUpdated(); commitHistory(); renderLayers(); renderOverlay();
    });
    row.querySelector(".layer-name").addEventListener("click", () => {
      focusedLayerId = focusedLayerId === layer.id ? null : layer.id;
      renderLayers();
      renderOverlay();
      showToast(focusedLayerId ? `Mostrando solo: ${layer.name}` : "Mostrando todas las capas visibles");
    });
    list.appendChild(row);
  });
  el("show-all-layers").hidden = !focusedLayerId;
  const select = el("prop-layer");
  const currentValue = select.value;
  select.replaceChildren(...state.layers.map((layer) => new Option(layer.name, layer.id)));
  if (state.layers.some((layer) => layer.id === currentValue)) select.value = currentValue;
}

function renderInventory() {
  const objects = allObjects().filter((object) => object.kind === "symbol");
  const totals = new Map();
  objects.forEach((object) => {
    const key = object.type || "Sin tipo";
    const existing = totals.get(key) || { count: 0, color: object.color };
    existing.count += 1;
    totals.set(key, existing);
  });
  const list = el("inventory-list");
  list.replaceChildren();
  [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0], "es")).forEach(([name, data]) => {
    const row = document.createElement("div");
    row.className = "inventory-row";
    row.style.setProperty("--inventory-color", data.color);
    row.innerHTML = `<i></i><span>${escapeHtml(name)}</span><strong>${data.count}</strong>`;
    list.appendChild(row);
  });
  if (!totals.size) list.innerHTML = `<span class="tool-help">Todavía no hay símbolos en el proyecto.</span>`;
  el("inventory-total").textContent = objects.length;
}

function renderProperties() {
  const object = objectById(selectedId);
  el("no-selection").hidden = Boolean(object);
  el("properties-form").hidden = !object;
  if (!object) return;
  el("prop-label").value = object.label || "";
  el("prop-type").value = object.type || "";
  el("prop-rack").value = object.rack || "";
  el("prop-status").value = object.status || "proposed";
  el("prop-layer").value = object.layer || "notes";
  el("prop-color").value = object.color || "#0b84f3";
  const size = Number(object.size) || 1;
  el("prop-size-field").hidden = false;
  el("prop-size-label").textContent = object.kind === "route" ? "Grosor de la ruta" : object.kind === "note" ? "Tamaño de la observación" : "Tamaño del símbolo";
  el("prop-size").value = size;
  el("prop-size-output").value = `${Math.round(size * 100)} %`;
  el("prop-notes").value = object.notes || "";
}

function refreshUI(renderBackground = false) {
  el("project-title").textContent = state.projectName;
  renderPages();
  renderLayers();
  renderInventory();
  renderProperties();
  if (renderBackground) renderCurrentPage();
  else renderOverlay();
  updateStatus();
}

function updateStatus() {
  const page = currentPage();
  if (!page) return;
  const index = state.pages.findIndex((entry) => entry.id === page.id) + 1;
  el("status-page").textContent = `Página ${index} · ${page.name}`;
  el("status-size").textContent = `${Math.round(page.width)} × ${Math.round(page.height)} px`;
  el("status-items").textContent = `${page.objects.length} elementos`;
  el("zoom-label").textContent = `${Math.round(state.zoom * 100)} %`;
}

async function selectPage(pageId) {
  if (state.currentPageId === pageId) return;
  state.currentPageId = pageId;
  selectedId = null;
  draftRoutePoints = [];
  renderPages();
  await renderCurrentPage();
}

function renamePage(page) {
  const value = prompt("Nombre de la página o planta:", page.name);
  if (!value?.trim()) return;
  page.name = value.trim();
  markUpdated(); commitHistory(); refreshUI();
}

function layerAllows(object) {
  const layer = layerById(object.layer);
  return (!layer || layer.visible) && (!focusedLayerId || object.layer === focusedLayerId);
}

function layerLocked(object) {
  return Boolean(layerById(object.layer)?.locked);
}

function svgNode(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function createSymbolIcon(symbol, scale = 1) {
  const group = svgNode("g", {
    class: "symbol-icon",
    transform: `scale(${scale})`,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2.2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  });
  const add = (tag, attrs) => group.appendChild(svgNode(tag, attrs));
  const key = symbol?.key || "";

  if (key.startsWith("ap-")) {
    add("circle", { cx: 0, cy: 4, r: 2, fill: "currentColor", stroke: "none" });
    add("path", { d: "M-6 2a8 8 0 0 1 12 0M-11-3a15 15 0 0 1 22 0" });
    add("path", { d: "M-13 10h26", opacity: ".42" });
  } else if (key === "node" || key === "corporate") {
    add("rect", { x: -10, y: -8, width: 20, height: 17, rx: 2 });
    add("path", { d: "M-6-8v5M-2-8v5M2-8v5M6-8v5M-5 4h10" });
    if (key === "corporate") add("circle", { cx: 9, cy: -9, r: 3, fill: "currentColor", stroke: "white", "stroke-width": 1 });
  } else if (key === "double-node") {
    add("rect", { x: -13, y: -8, width: 12, height: 16, rx: 2 });
    add("rect", { x: 1, y: -8, width: 12, height: 16, rx: 2 });
    add("path", { d: "M-10-8v4M-6-8v4M4-8v4M8-8v4" });
  } else if (key === "iptv") {
    add("rect", { x: -13, y: -9, width: 26, height: 17, rx: 2 });
    add("path", { d: "M-5 13h10M0 8v5" });
  } else if (key === "phone") {
    add("path", { d: "M-10-11c3-2 6 3 7 6l-4 3c2 5 5 8 10 10l3-4c4 1 8 4 6 7-2 4-7 4-11 2C-6 10-12 4-14-4c-1-3 0-6 4-7Z" });
  } else if (key === "camera-dome") {
    add("path", { d: "M-13 3a13 13 0 0 1 26 0Z" });
    add("path", { d: "M-9 4a9 9 0 0 0 18 0M-4 2a4 4 0 0 1 8 0" });
  } else if (key === "camera-bullet") {
    add("path", { d: "M-13-7h18l7 6-7 6h-18Z" });
    add("circle", { cx: -8, cy: -1, r: 2 });
    add("path", { d: "M0 6v5M-5 12H5" });
  } else if (key === "camera-ptz") {
    add("rect", { x: -9, y: -12, width: 18, height: 5, rx: 2 });
    add("path", { d: "M-12-6h24M-10-5a10 10 0 0 0 20 0M-4 1a4 4 0 0 0 8 0" });
  } else if (key === "access") {
    add("path", { d: "M-11 13v-25H8v25M-11 13h22" });
    add("circle", { cx: 3, cy: 1, r: 1.5, fill: "currentColor", stroke: "none" });
    add("rect", { x: 10, y: -7, width: 5, height: 10, rx: 1 });
  } else if (["mdf", "idf", "rack"].includes(key)) {
    add("rect", { x: -10, y: -14, width: 20, height: 28, rx: 2 });
    add("path", { d: "M-7-8H7M-7-2H7M-7 4H7M-7 10H3" });
    add("circle", { cx: 6, cy: 10, r: 1, fill: "currentColor", stroke: "none" });
  } else if (key === "fiber-box") {
    add("rect", { x: -12, y: -12, width: 24, height: 24, rx: 4 });
    add("path", { d: "M-7 6c0-8 14-8 14 0M-7 6a3 3 0 1 0 6 0M7 6a3 3 0 1 1-6 0" });
  } else {
    add("circle", { cx: 0, cy: 0, r: 9 });
  }
  return group;
}

function symbolTransform(object) {
  return `translate(${object.x} ${object.y}) rotate(${object.rotation || 0}) scale(${Number(object.size) || 1})`;
}

function noteTransform(object) {
  return `translate(${object.x} ${object.y}) scale(${Number(object.size) || 1})`;
}

function createSymbolNode(object, interactive = true) {
  const symbol = SYMBOLS.find((entry) => entry.key === object.symbolKey);
  const group = svgNode("g", {
    class: `plan-item${object.id === selectedId && interactive ? " selected" : ""}`,
    transform: symbolTransform(object),
    "data-object-id": object.id,
    style: `--item-color:${object.color};color:${object.color}`,
    "aria-label": `${object.label}. ${object.notes?.trim() || "Sin observaciones"}`
  });
  const hit = svgNode("rect", { class: "item-hit", x: -26, y: -26, width: 52, height: 66, rx: 8 });
  const ring = svgNode("circle", { class: "item-ring", cx: 0, cy: 0, r: 17, stroke: object.color });
  const icon = createSymbolIcon(symbol, .78);
  const label = svgNode("text", { class: "item-label", x: 0, y: 31, "font-size": 9 });
  label.textContent = object.label;
  const title = svgNode("title");
  title.textContent = `${object.label}: ${object.notes?.trim() || "Sin observaciones"}`;
  group.append(title, hit, ring, icon, label);
  if (interactive) bindObjectEvents(group, object);
  return group;
}

function createNoteNode(object, interactive = true) {
  const group = svgNode("g", {
    class: `plan-item note-item${object.id === selectedId && interactive ? " selected" : ""}`,
    transform: noteTransform(object),
    "data-object-id": object.id
  });
  const hit = svgNode("rect", { class: "item-hit", x: -4, y: -4, width: 188, height: 68, rx: 6 });
  const rect = svgNode("rect", { x: 0, y: 0, width: 180, height: 60, rx: 5 });
  group.append(hit, rect);
  const lines = wrapText(object.label || "Observación", 28).slice(0, 3);
  lines.forEach((line, index) => {
    const text = svgNode("text", { x: 10, y: 18 + index * 15, "font-size": 10 });
    text.textContent = line;
    group.appendChild(text);
  });
  if (interactive) bindObjectEvents(group, object);
  return group;
}

function resolvedRoutePoints(object, page = currentPage()) {
  return (object.points || []).map((point) => {
    const anchor = point.anchorId ? page?.objects.find((entry) => entry.id === point.anchorId && entry.kind === "symbol") : null;
    return anchor ? { ...point, x: anchor.x, y: anchor.y } : point;
  });
}

function syncAnchoredRoutePoints(symbolObject) {
  const page = currentPage();
  if (!page || symbolObject.kind !== "symbol") return;
  page.objects.filter((entry) => entry.kind === "route").forEach((route) => {
    route.points.forEach((point) => {
      if (point.anchorId === symbolObject.id) {
        point.x = symbolObject.x;
        point.y = symbolObject.y;
      }
    });
  });
}

function routeLabelPosition(points) {
  let best = null;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (!best || length > best.length) best = { start, end, length };
  }
  if (!best) return null;
  let angle = Math.atan2(best.end.y - best.start.y, best.end.x - best.start.x) * 180 / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  return { x: (best.start.x + best.end.x) / 2, y: (best.start.y + best.end.y) / 2 - 6, angle };
}

function createRouteNode(object, interactive = true, page = currentPage()) {
  const group = svgNode("g", { class: `route-item${object.id === selectedId && interactive ? " selected" : ""}`, "data-object-id": object.id });
  const routePoints = resolvedRoutePoints(object, page);
  const points = routePoints.map((point) => `${point.x},${point.y}`).join(" ");
  const hit = svgNode("polyline", { class: "route-hit", points });
  const width = 4 * (Number(object.size) || 1);
  const line = svgNode("polyline", { class: "route-line", points, stroke: object.color, style: `stroke-width:${width}px` });
  hit.style.strokeWidth = `${Math.max(16, width + 10)}px`;
  const routeStyle = ROUTE_STYLES[object.routeType];
  if (routeStyle?.dash) line.setAttribute("stroke-dasharray", routeStyle.dash);
  group.append(hit, line);
  const labelPosition = routeLabelPosition(routePoints);
  if (labelPosition) {
    const label = svgNode("text", {
      class: "route-label",
      x: labelPosition.x,
      y: labelPosition.y,
      fill: object.color,
      transform: `rotate(${labelPosition.angle} ${labelPosition.x} ${labelPosition.y})`
    });
    label.textContent = routeStyle?.name || object.type || "Ruta";
    group.appendChild(label);
  }
  routePoints.forEach((point) => {
    if (point.anchorId) group.appendChild(svgNode("circle", { class: "route-anchor", cx: point.x, cy: point.y, r: 4, stroke: object.color }));
  });
  if (interactive) {
    group.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      if (activeTool !== "select") setTool("select");
      selectObject(object.id);
    });
  }
  return group;
}

function bindObjectEvents(node, object) {
  node.addEventListener("pointerenter", (event) => showSymbolTooltip(object, event));
  node.addEventListener("pointermove", positionSymbolTooltip);
  node.addEventListener("pointerleave", hideSymbolTooltip);
  node.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    if (activeTool === "route" && object.kind === "symbol") {
      event.preventDefault();
      if (event.detail < 2) addDraftRoutePoint({ x: object.x, y: object.y, anchorId: object.id });
      return;
    }
    if (layerLocked(object)) return;
    if (activeTool !== "select") setTool("select");
    hideSymbolTooltip();
    selectObject(object.id);
    const point = eventToPlanPoint(event);
    dragState = { id: object.id, pointerId: event.pointerId, startX: point.x, startY: point.y, objectX: object.x, objectY: object.y, moved: false };
    overlaySvg.setPointerCapture(event.pointerId);
  });
  node.addEventListener("dblclick", (event) => {
    if (activeTool !== "route" || object.kind !== "symbol") return;
    event.preventDefault();
    event.stopPropagation();
    finishRoute();
  });
}

function showSymbolTooltip(object, event) {
  if (object.kind !== "symbol") return;
  el("symbol-tooltip-title").textContent = object.label || object.type || "Símbolo";
  el("symbol-tooltip-text").textContent = object.notes?.trim() || "Sin observaciones añadidas.";
  symbolTooltip.hidden = false;
  positionSymbolTooltip(event);
}

function positionSymbolTooltip(event) {
  if (symbolTooltip.hidden) return;
  const left = Math.min(event.clientX + 14, window.innerWidth - 292);
  const top = Math.min(event.clientY + 14, window.innerHeight - 100);
  symbolTooltip.style.left = `${Math.max(8, left)}px`;
  symbolTooltip.style.top = `${Math.max(8, top)}px`;
}

function hideSymbolTooltip() {
  symbolTooltip.hidden = true;
}

function renderOverlay() {
  const page = currentPage();
  routesLayer.replaceChildren();
  itemsLayer.replaceChildren();
  if (!page) return;
  page.objects.forEach((object) => {
    if (!layerAllows(object)) return;
    if (object.kind === "route") routesLayer.appendChild(createRouteNode(object, true, page));
    else if (object.kind === "note") itemsLayer.appendChild(createNoteNode(object));
    else itemsLayer.appendChild(createSymbolNode(object));
  });
  renderDraftRoute();
  renderProperties();
  renderInventory();
  updateStatus();
}

function buildStandaloneOverlay(page) {
  const svg = svgNode("svg", { xmlns: SVG_NS, width: page.width, height: page.height, viewBox: `0 0 ${page.width} ${page.height}` });
  const style = svgNode("style");
  style.textContent = `.item-ring{fill:white;stroke-width:3}.item-code{font-family:Arial,sans-serif;font-weight:900;text-anchor:middle;dominant-baseline:middle;fill:#071b38}.item-label{font-family:Arial,sans-serif;font-weight:800;text-anchor:middle;paint-order:stroke;stroke:white;stroke-width:3;stroke-linejoin:round;fill:#071b38}.route-line{fill:none;stroke-linejoin:round;stroke-linecap:round}.route-anchor{fill:white;stroke-width:2}.route-label{font-family:Arial,sans-serif;font-size:8px;font-weight:800;text-anchor:middle;dominant-baseline:central;paint-order:stroke;stroke:white;stroke-width:3px;stroke-linejoin:round}.route-hit,.item-hit{display:none}.note-item rect:not(.item-hit){fill:#fff6ba;stroke:#d19b00;stroke-width:2}.note-item text{font-family:Arial,sans-serif;fill:#3d3100;font-weight:700}`;
  svg.appendChild(style);
  page.objects.forEach((object) => {
    const layer = layerById(object.layer);
    if (layer && !layer.visible) return;
    if (object.kind === "route") svg.appendChild(createRouteNode(object, false, page));
    else if (object.kind === "note") svg.appendChild(createNoteNode(object, false));
    else svg.appendChild(createSymbolNode(object, false));
  });
  return svg;
}

function selectObject(id) {
  selectedId = id;
  renderOverlay();
}

function eventToPlanPoint(event) {
  const page = currentPage();
  const rect = overlaySvg.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(page.width, (event.clientX - rect.left) * page.width / rect.width)),
    y: Math.max(0, Math.min(page.height, (event.clientY - rect.top) * page.height / rect.height))
  };
}

function addSymbol(symbol, point) {
  const page = currentPage();
  if (!page) return;
  const count = allObjects().filter((object) => object.symbolKey === symbol.key).length + 1;
  const prefix = symbol.code.replace(/[^A-Z0-9]/gi, "");
  const object = {
    id: uid("object"), kind: "symbol", symbolKey: symbol.key,
    label: `${prefix}-${String(count).padStart(3, "0")}`,
    type: symbol.name, rack: "", status: "proposed", layer: symbol.layer,
    color: symbol.color, notes: "", x: point.x, y: point.y, rotation: 0, size: 1
  };
  page.objects.push(object);
  selectedId = object.id;
  markUpdated(); commitHistory(); renderOverlay();
}

function addNote(point, text) {
  const page = currentPage();
  page.objects.push({
    id: uid("note"), kind: "note", label: text, type: "Observación", rack: "",
    status: "pending", layer: "notes", color: "#d19b00", notes: "", x: point.x, y: point.y, size: 1
  });
  markUpdated(); commitHistory(); renderOverlay();
}

function addRoute(points) {
  const page = currentPage();
  const style = ROUTE_STYLES[el("route-type").value];
  const count = allObjects().filter((object) => object.kind === "route" && object.routeType === el("route-type").value).length + 1;
  const route = {
    id: uid("route"), kind: "route", routeType: el("route-type").value,
    label: `${style.name} ${String(count).padStart(2, "0")}`, type: style.name,
    rack: "", status: "proposed", layer: style.layer, color: style.color, notes: "", size: 1, points
  };
  page.objects.push(route);
  selectedId = route.id;
  markUpdated(); commitHistory();
}

function addDraftRoutePoint(point) {
  draftRoutePoints.push(point);
  renderDraftRoute();
}

function renderDraftRoute() {
  draftLayer.replaceChildren();
  el("route-actions").hidden = !draftRoutePoints.length;
  el("finish-route-btn").disabled = draftRoutePoints.length < 2;
  if (!draftRoutePoints.length) return;
  const line = svgNode("polyline", { class: "draft-route", points: draftRoutePoints.map((point) => `${point.x},${point.y}`).join(" ") });
  draftLayer.appendChild(line);
  draftRoutePoints.forEach((point) => draftLayer.appendChild(svgNode("circle", { class: `draft-point${point.anchorId ? " anchored" : ""}`, cx: point.x, cy: point.y, r: point.anchorId ? 6 : 4 })));
}

function finishRoute() {
  if (draftRoutePoints.length < 2) {
    showToast("La ruta necesita al menos un inicio y un final");
    return;
  }
  addRoute(structuredClone(draftRoutePoints));
  draftRoutePoints = [];
  setTool("select");
  renderOverlay();
  showToast("Ruta guardada en el plano");
}

function cancelRoute() {
  draftRoutePoints = [];
  renderDraftRoute();
  showToast("Trazado cancelado");
}

function deleteSelected() {
  const page = currentPage();
  const index = page?.objects.findIndex((object) => object.id === selectedId) ?? -1;
  if (index < 0) return;
  syncAnchoredRoutePoints(page.objects[index]);
  page.objects.splice(index, 1);
  selectedId = null;
  markUpdated(); commitHistory(); renderOverlay();
  showToast("Elemento eliminado");
}

function duplicateSelected() {
  const page = currentPage();
  const object = objectById(selectedId);
  if (!page || !object) return;
  const copy = structuredClone(object);
  copy.id = uid(object.kind);
  copy.label = `${copy.label} copia`;
  if (copy.kind === "route") copy.points = copy.points.map((point) => ({ x: point.x + 18, y: point.y + 18 }));
  else { copy.x += 18; copy.y += 18; }
  page.objects.push(copy);
  selectedId = copy.id;
  markUpdated(); commitHistory(); renderOverlay();
}

function updateSelectedProperty(property, value) {
  const object = objectById(selectedId);
  if (!object) return;
  object[property] = value;
  markUpdated(); commitHistory(); renderOverlay();
}

function liveUpdateSelectedProperty(property, value) {
  const object = objectById(selectedId);
  if (!object) return;
  object[property] = value;
  markUpdated();
  dirty = true;
  pendingFormChange = true;
  const selectedNode = overlaySvg.querySelector(`[data-object-id="${selectedId}"]`);
  if (property === "label") {
    const labelNode = selectedNode?.querySelector(".item-label");
    if (labelNode) labelNode.textContent = value;
  }
  if (property === "color") {
    selectedNode?.querySelector(".item-ring")?.setAttribute("stroke", value);
    selectedNode?.querySelector(".route-line")?.setAttribute("stroke", value);
    selectedNode?.style.setProperty("--item-color", value);
    if (selectedNode) selectedNode.style.color = value;
  }
  if (property === "type") renderInventory();
}

function commitPendingFormChange() {
  if (!pendingFormChange) return;
  pendingFormChange = false;
  commitHistory();
  renderOverlay();
}

async function addSourceFile(file, replaceProject = false) {
  const buffer = await file.arrayBuffer();
  const source = { id: uid("source"), name: file.name, type: file.type || mimeFromName(file.name) };
  if (replaceProject) {
    state.sources = [];
    state.pages = [];
    fileBuffers.clear();
    pdfDocuments.clear();
  }
  state.sources.push(source);
  fileBuffers.set(source.id, buffer);
  if (source.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const document = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
    pdfDocuments.set(source.id, document);
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const pdfPage = await document.getPage(pageNumber);
      const viewport = pdfPage.getViewport({ scale: 1.45 });
      state.pages.push({ id: uid("page"), name: document.numPages > 1 ? `Página ${pageNumber}` : file.name.replace(/\.pdf$/i, ""), sourceId: source.id, sourcePage: pageNumber, width: Math.round(viewport.width), height: Math.round(viewport.height), objects: [] });
    }
  } else {
    const dimensions = await imageDimensions(buffer, source.type);
    state.pages.push({ id: uid("page"), name: file.name.replace(/\.[^.]+$/, ""), sourceId: source.id, sourcePage: 1, width: dimensions.width, height: dimensions.height, objects: [] });
  }
  if (!state.currentPageId || replaceProject) state.currentPageId = state.pages[0]?.id || null;
  markUpdated();
}

function mimeFromName(name) {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.png$/i.test(name)) return "image/png";
  return "image/jpeg";
}

async function imageDimensions(buffer, type) {
  const image = await loadImageFromBlob(new Blob([buffer], { type }));
  return { width: image.naturalWidth, height: image.naturalHeight };
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = (error) => { URL.revokeObjectURL(url); reject(error); };
    image.src = url;
  });
}

async function getPdfDocument(sourceId) {
  if (pdfDocuments.has(sourceId)) return pdfDocuments.get(sourceId);
  const buffer = fileBuffers.get(sourceId);
  if (!buffer) throw new Error("No se encuentra el PDF original");
  const document = await pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) }).promise;
  pdfDocuments.set(sourceId, document);
  return document;
}

async function drawPageBackground(page, targetCanvas = bgCanvas) {
  targetCanvas.width = page.width;
  targetCanvas.height = page.height;
  const context = targetCanvas.getContext("2d", { alpha: false });
  context.fillStyle = "white";
  context.fillRect(0, 0, page.width, page.height);
  if (page.sourceKind === "demo") {
    drawDemoBackground(context, page.width, page.height);
    return;
  }
  const source = sourceById(page.sourceId);
  const buffer = fileBuffers.get(page.sourceId);
  if (!source || !buffer) throw new Error("No se encuentra el archivo original del plano");
  if (source.type === "application/pdf" || source.name.toLowerCase().endsWith(".pdf")) {
    const document = await getPdfDocument(source.id);
    const pdfPage = await document.getPage(page.sourcePage);
    const base = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: page.width / base.width });
    await pdfPage.render({ canvasContext: context, viewport }).promise;
  } else {
    const image = await loadImageFromBlob(new Blob([buffer], { type: source.type }));
    context.drawImage(image, 0, 0, page.width, page.height);
  }
}

function drawDemoBackground(context, width, height) {
  context.fillStyle = "#fbfdff";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#9eb0bf";
  context.lineWidth = 3;
  context.strokeRect(60, 80, width - 120, height - 160);
  context.lineWidth = 2;
  context.fillStyle = "#eff4f7";
  context.fillRect(60, 80, width - 120, 115);
  context.strokeRect(60, 80, width - 120, 115);
  const rooms = 8;
  const roomWidth = (width - 120) / rooms;
  context.font = "18px Arial";
  context.fillStyle = "#5d6e7c";
  context.textAlign = "center";
  for (let index = 0; index < rooms; index += 1) {
    const x = 60 + index * roomWidth;
    context.strokeRect(x, 80, roomWidth, 115);
    context.fillText(`H-${101 + index}`, x + roomWidth / 2, 143);
  }
  context.fillStyle = "#f5f7f9";
  context.fillRect(60, height - 255, width - 120, 175);
  context.strokeRect(60, height - 255, width - 120, 175);
  context.fillStyle = "#657988";
  context.font = "22px Arial";
  context.fillText("LOBBY · RECEPCIÓN · ZONA COMÚN", width / 2, height - 160);
  context.strokeStyle = "#c5d0d9";
  context.setLineDash([10, 8]);
  context.beginPath();
  context.moveTo(90, height / 2);
  context.lineTo(width - 90, height / 2);
  context.stroke();
  context.setLineDash([]);
}

async function renderCurrentPage() {
  const token = ++renderToken;
  const page = currentPage();
  const hasPage = Boolean(page);
  el("canvas-empty").hidden = hasPage;
  canvasScroll.hidden = !hasPage;
  el("canvas-status").hidden = !hasPage;
  if (!page) return;
  planStage.style.width = `${page.width * state.zoom}px`;
  planStage.style.height = `${page.height * state.zoom}px`;
  bgCanvas.style.width = "100%";
  bgCanvas.style.height = "100%";
  overlaySvg.setAttribute("viewBox", `0 0 ${page.width} ${page.height}`);
  overlaySvg.setAttribute("width", page.width);
  overlaySvg.setAttribute("height", page.height);
  try {
    await drawPageBackground(page);
    if (token !== renderToken) return;
    renderOverlay();
    renderPages();
  } catch (error) {
    console.error(error);
    showToast("No se pudo representar el plano");
  }
}

function setZoom(value) {
  state.zoom = Math.max(.1, Math.min(4, value));
  const page = currentPage();
  if (page) {
    planStage.style.width = `${page.width * state.zoom}px`;
    planStage.style.height = `${page.height * state.zoom}px`;
  }
  updateStatus();
}

function fitToCanvas() {
  const page = currentPage();
  if (!page) return;
  const rect = el("canvas-area").getBoundingClientRect();
  setZoom(Math.min((rect.width - 100) / page.width, (rect.height - 105) / page.height, 1.2));
  canvasScroll.scrollTo({ top: 0, left: 0 });
}

async function createNewProject(name, file) {
  state = freshState(name);
  selectedId = null;
  draftRoutePoints = [];
  await addSourceFile(file, true);
  openApp();
  resetHistory();
  refreshUI(true);
  requestAnimationFrame(fitToCanvas);
  showToast("Proyecto creado localmente");
}

function createDemoProject() {
  state = freshState("Hotel demostración");
  state.pages.push({
    id: uid("page"), name: "Planta demostración", sourceKind: "demo", width: 1200, height: 760,
    objects: [
      demoSymbol("ap-common", 360, 265, "AP-PB-001", "IDF-PB-A"),
      demoSymbol("ap-common", 720, 265, "AP-PB-002", "IDF-PB-A"),
      demoSymbol("camera-dome", 985, 525, "CAM-PB-001", "IDF-PB-A"),
      demoSymbol("idf", 150, 535, "IDF-PB-A", ""),
      { id: uid("route"), kind: "route", routeType: "fiber", label: "Fibra 01", type: "Fibra óptica", rack: "IDF-PB-A", status: "proposed", layer: "fiber", color: "#00a67d", notes: "Ruta manual demostrativa", points: [{ x: 150, y: 535 }, { x: 150, y: 380 }, { x: 720, y: 380 }, { x: 720, y: 265 }] },
      { id: uid("note"), kind: "note", label: "Validar recorrido en visita", type: "Observación", rack: "", status: "pending", layer: "notes", color: "#d19b00", notes: "", x: 800, y: 480 }
    ]
  });
  state.currentPageId = state.pages[0].id;
  fileBuffers.clear();
  pdfDocuments.clear();
  openApp();
  resetHistory();
  refreshUI(true);
  requestAnimationFrame(fitToCanvas);
}

function demoSymbol(key, x, y, label, rack) {
  const symbol = SYMBOLS.find((entry) => entry.key === key);
  return { id: uid("object"), kind: "symbol", symbolKey: key, label, type: symbol.name, rack, status: "proposed", layer: symbol.layer, color: symbol.color, notes: "", x, y, rotation: 0, size: 1 };
}

async function saveProject() {
  if (!state.pages.length) return;
  const zip = new JSZip();
  const projectData = structuredClone(state);
  projectData.updatedAt = new Date().toISOString();
  zip.file("project.json", JSON.stringify(projectData, null, 2));
  state.sources.forEach((source) => {
    const buffer = fileBuffers.get(source.id);
    if (buffer) zip.file(`sources/${source.id}-${safeName(source.name)}`, buffer);
  });
  zip.file("README.txt", "Proyecto de Telecom Plan Studio. Este archivo se procesa localmente y no se debe descomprimir para abrirlo en la aplicación.");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  downloadBlob(blob, `TelecomPlan-${safeName(state.projectName)}.tplan`);
  dirty = false;
  showToast("Proyecto descargado en tu dispositivo");
}

async function openProjectFile(file) {
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const jsonEntry = zip.file("project.json");
    if (!jsonEntry) throw new Error("Archivo de proyecto no válido");
    const nextState = JSON.parse(await jsonEntry.async("string"));
    if (!Array.isArray(nextState.pages) || !Array.isArray(nextState.layers)) throw new Error("Estructura de proyecto no válida");
    fileBuffers.clear();
    pdfDocuments.clear();
    for (const source of nextState.sources || []) {
      const prefix = `sources/${source.id}-`;
      const entryName = Object.keys(zip.files).find((name) => name.startsWith(prefix));
      if (entryName) fileBuffers.set(source.id, await zip.file(entryName).async("arraybuffer"));
    }
    state = nextState;
    state.zoom = 1;
    selectedId = null;
    draftRoutePoints = [];
    openApp();
    resetHistory();
    refreshUI(true);
    requestAnimationFrame(fitToCanvas);
    showToast("Proyecto abierto localmente");
  } catch (error) {
    console.error(error);
    showToast("No se pudo abrir el archivo .tplan");
  }
}

async function renderPageComposite(page) {
  const canvas = document.createElement("canvas");
  await drawPageBackground(page, canvas);
  const svg = buildStandaloneOverlay(page);
  const serialized = new XMLSerializer().serializeToString(svg);
  const image = await loadImageFromBlob(new Blob([serialized], { type: "image/svg+xml" }));
  canvas.getContext("2d").drawImage(image, 0, 0, page.width, page.height);
  return canvas;
}

async function exportPng() {
  const page = currentPage();
  if (!page) return;
  try {
    const canvas = await renderPageComposite(page);
    canvas.toBlob((blob) => downloadBlob(blob, `${safeName(state.projectName)}-${safeName(page.name)}.png`), "image/png");
    showToast("Plano PNG generado");
  } catch (error) {
    console.error(error);
    showToast("No se pudo generar el PNG");
  }
}

async function exportPdf() {
  if (!state.pages.length) return;
  const { PDFDocument } = PDFLib;
  try {
    showToast("Generando PDF…");
    const output = await PDFDocument.create();
    for (const page of state.pages) {
      const canvas = await renderPageComposite(page);
      const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      const embedded = await output.embedPng(await png.arrayBuffer());
      const ratio = Math.min(842 / page.width, 595 / page.height);
      const width = page.width * ratio;
      const height = page.height * ratio;
      const pdfPage = output.addPage([842, 595]);
      pdfPage.drawImage(embedded, { x: (842 - width) / 2, y: (595 - height) / 2, width, height });
    }
    const bytes = await output.save();
    downloadBlob(new Blob([bytes], { type: "application/pdf" }), `${safeName(state.projectName)}-planos.pdf`);
    showToast("PDF generado localmente");
  } catch (error) {
    console.error(error);
    showToast("No se pudo generar el PDF");
  }
}

function exportCsv() {
  const rows = [["Página", "Identificador", "Categoría", "Tipo", "Rack", "Estado", "Capa", "Observaciones", "X", "Y"]];
  state.pages.forEach((page) => page.objects.forEach((object) => {
    const coordinates = object.kind === "route" ? object.points[0] || { x: "", y: "" } : object;
    rows.push([page.name, object.label, object.kind, object.type, object.rack, object.status, layerById(object.layer)?.name || object.layer, object.notes, Math.round(coordinates.x), Math.round(coordinates.y)]);
  }));
  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n");
  downloadBlob(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }), `${safeName(state.projectName)}-inventario.csv`);
  showToast("Inventario CSV generado");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function wrapText(text, maxLength) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    if ((line + " " + word).trim().length > maxLength && line) { lines.push(line); line = word; }
    else line = `${line} ${word}`.trim();
  });
  if (line) lines.push(line);
  return lines;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function confirmDiscard() {
  return !dirty || confirm("Hay cambios sin descargar. ¿Quieres continuar y descartarlos?");
}

overlaySvg.addEventListener("pointerdown", (event) => {
  if (event.target.closest("[data-object-id]")) return;
  const point = eventToPlanPoint(event);
  if (activeTool === "symbol" && activeSymbol) addSymbol(activeSymbol, point);
  else if (activeTool === "route") addDraftRoutePoint(point);
  else if (activeTool === "note") { pendingNotePoint = point; el("note-text").value = ""; el("note-dialog").showModal(); }
  else { selectedId = null; renderOverlay(); }
});

overlaySvg.addEventListener("dblclick", (event) => {
  if (activeTool !== "route") return;
  event.preventDefault();
  if (draftRoutePoints.length > 1) draftRoutePoints.pop();
  finishRoute();
});

overlaySvg.addEventListener("pointermove", (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const object = objectById(dragState.id);
  if (!object) return;
  const point = eventToPlanPoint(event);
  object.x = dragState.objectX + point.x - dragState.startX;
  object.y = dragState.objectY + point.y - dragState.startY;
  syncAnchoredRoutePoints(object);
  dragState.moved = true;
  renderOverlay();
});

overlaySvg.addEventListener("pointerup", (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  if (dragState.moved) { markUpdated(); commitHistory(); }
  dragState = null;
});

overlaySvg.addEventListener("dragover", (event) => event.preventDefault());
overlaySvg.addEventListener("drop", (event) => {
  event.preventDefault();
  const key = event.dataTransfer.getData("text/telecom-symbol");
  const symbol = SYMBOLS.find((entry) => entry.key === key);
  if (symbol) addSymbol(symbol, eventToPlanPoint(event));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    cancelRoute();
    setTool("select");
  }
  if (event.key === "Enter" && activeTool === "route" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) finishRoute();
  if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) deleteSelected();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); restoreHistory(historyIndex - 1); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); restoreHistory(historyIndex + 1); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveProject(); }
});

window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

el("new-project-btn").addEventListener("click", () => el("new-project-dialog").showModal());
el("demo-project-btn").addEventListener("click", createDemoProject);
el("open-project-btn").addEventListener("click", () => el("project-file-input").click());
el("toolbar-open").addEventListener("click", () => el("project-file-input").click());
el("toolbar-save").addEventListener("click", saveProject);
el("toolbar-new").addEventListener("click", () => { if (confirmDiscard()) el("new-project-dialog").showModal(); });
el("add-plan-btn").addEventListener("click", () => el("source-file-input").click());
el("empty-add-plan").addEventListener("click", () => el("source-file-input").click());
el("source-file-input").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  await addSourceFile(file, false);
  commitHistory();
  refreshUI(true);
  event.target.value = "";
});
el("project-file-input").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (file && confirmDiscard()) await openProjectFile(file);
  event.target.value = "";
});

el("new-project-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = el("new-project-file").files[0];
  const name = el("new-project-name").value.trim();
  if (!file || !name) return;
  el("new-project-dialog").close();
  try { await createNewProject(name, file); }
  catch (error) { console.error(error); showToast("No se pudo abrir el plano"); }
  event.target.reset();
});

el("note-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = el("note-text").value.trim();
  if (text && pendingNotePoint) addNote(pendingNotePoint, text);
  pendingNotePoint = null;
  el("note-dialog").close();
  setTool("select");
});

el("symbol-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-category]");
  if (!button) return;
  document.querySelectorAll("#symbol-tabs button").forEach((item) => item.classList.toggle("active", item === button));
  renderSymbolLibrary(button.dataset.category);
});

document.querySelectorAll(".drawing-tool").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
el("undo-btn").addEventListener("click", () => restoreHistory(historyIndex - 1));
el("redo-btn").addEventListener("click", () => restoreHistory(historyIndex + 1));
el("zoom-in-btn").addEventListener("click", () => setZoom(state.zoom + .1));
el("zoom-out-btn").addEventListener("click", () => setZoom(state.zoom - .1));
el("zoom-label").addEventListener("click", fitToCanvas);
el("fit-btn").addEventListener("click", fitToCanvas);
el("export-png-btn").addEventListener("click", exportPng);
el("export-pdf-btn").addEventListener("click", exportPdf);
el("export-csv-btn").addEventListener("click", exportCsv);
el("delete-btn").addEventListener("click", deleteSelected);
el("duplicate-btn").addEventListener("click", duplicateSelected);
el("show-all-layers").addEventListener("click", () => {
  focusedLayerId = null;
  renderLayers();
  renderOverlay();
  showToast("Mostrando todas las capas visibles");
});
el("finish-route-btn").addEventListener("click", finishRoute);
el("cancel-route-btn").addEventListener("click", cancelRoute);

[
  ["prop-label", "label"], ["prop-type", "type"], ["prop-rack", "rack"],
  ["prop-color", "color"], ["prop-notes", "notes"]
].forEach(([inputId, property]) => {
  el(inputId).addEventListener("input", (event) => liveUpdateSelectedProperty(property, event.target.value));
  el(inputId).addEventListener("blur", commitPendingFormChange);
});
el("prop-size").addEventListener("input", (event) => {
  const object = objectById(selectedId);
  if (!object) return;
  object.size = Number(event.target.value);
  el("prop-size-output").value = `${Math.round(object.size * 100)} %`;
  const selectedNode = overlaySvg.querySelector(`[data-object-id="${selectedId}"]`);
  if (object.kind === "symbol") selectedNode?.setAttribute("transform", symbolTransform(object));
  else if (object.kind === "note") selectedNode?.setAttribute("transform", noteTransform(object));
  else if (object.kind === "route") {
    const width = 4 * object.size;
    selectedNode?.querySelector(".route-line")?.setAttribute("style", `stroke-width:${width}px`);
    selectedNode?.querySelector(".route-hit")?.setAttribute("style", `stroke-width:${Math.max(16, width + 10)}px`);
  }
  markUpdated();
  dirty = true;
  pendingFormChange = true;
});
el("prop-size").addEventListener("change", commitPendingFormChange);
el("prop-size").addEventListener("blur", commitPendingFormChange);
[["prop-status", "status"], ["prop-layer", "layer"]].forEach(([inputId, property]) => {
  el(inputId).addEventListener("change", (event) => updateSelectedProperty(property, event.target.value));
});

renderSymbolLibrary();
renderLayers();
updateUndoButtons();
