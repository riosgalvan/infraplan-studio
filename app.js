import * as pdfjsLib from "./vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).toString();

const SVG_NS = "http://www.w3.org/2000/svg";
const APP_VERSION = 8;

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
  { id: "architecture", name: "Arquitectura", color: "#315b7c", visible: true, locked: false },
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
const architectureLayer = el("architecture-layer");
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
let spacePressed = false;
let panState = null;
let activeSymbolCategory = "all";
let planToolStart = null;
let planToolPointer = null;

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

function normalizeProjectState(projectState) {
  projectState.layers ||= [];
  DEFAULT_LAYERS.forEach((defaultLayer) => {
    if (!projectState.layers.some((layer) => layer.id === defaultLayer.id)) {
      projectState.layers.unshift(structuredClone(defaultLayer));
    }
  });
  projectState.pages ||= [];
  projectState.pages.forEach((page) => { page.objects ||= []; });
  projectState.appVersion = APP_VERSION;
  return projectState;
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
  planToolStart = null;
  planToolPointer = null;
  draftLayer.replaceChildren();
  el("route-actions").hidden = true;
  document.querySelectorAll(".drawing-tool").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
  document.querySelectorAll(".symbol-card").forEach((button) => button.classList.toggle("active", tool === "symbol" && button.dataset.symbolKey === symbol?.key));
  if (tool === "select") el("tool-help").textContent = "Selecciona un elemento para editarlo.";
  if (tool === "symbol") el("tool-help").textContent = `Pulsa sobre el plano para colocar: ${symbol.name}.`;
  if (tool === "route") el("route-help").textContent = "Pulsa símbolos para anclar puntos o pulsa el plano para crear vértices. Doble clic o “Finalizar” guarda la ruta.";
  else el("route-help").textContent = "Selecciona el tipo y pulsa “Dibujar nueva ruta”.";
  if (tool === "note") el("tool-help").textContent = "Pulsa sobre el plano para añadir una observación.";
  if (tool === "room") el("tool-help").textContent = "Marca dos esquinas para dibujar una habitación o zona.";
  if (tool === "wall") el("tool-help").textContent = "Marca el inicio y el final del muro.";
  if (tool === "door") el("tool-help").textContent = "Pulsa sobre el plano para colocar una puerta.";
}

function renderSymbolLibrary(category = "all") {
  activeSymbolCategory = category;
  const grid = el("symbol-grid");
  grid.replaceChildren();
  SYMBOLS.filter((symbol) => category === "all" || symbol.category === category).forEach((symbol) => {
    const button = document.createElement("button");
    button.className = `symbol-card${activeTool === "symbol" && activeSymbol?.key === symbol.key ? " active" : ""}`;
    button.type = "button";
    button.dataset.symbolKey = symbol.key;
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
      event.dataTransfer.setData("text/infraplan-symbol", symbol.key);
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
    row.innerHTML = `<button class="layer-eye" title="Mostrar u ocultar">${layer.visible ? "◉" : "○"}</button><button class="layer-name" title="Aislar esta capa"><i class="layer-swatch" style="background:${layer.color}"></i>${escapeHtml(layer.name)}</button>`;
    row.querySelector(".layer-eye").addEventListener("click", () => {
      layer.visible = !layer.visible;
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
  el("prop-label-title").textContent = object.kind === "architecture" && object.archType !== "door"
    ? "Texto visible en el plano"
    : object.kind === "architecture" && object.archType === "door"
      ? "Identificador interno (no visible)"
      : "Identificador";
  el("prop-type").value = object.type || "";
  el("prop-rack").value = object.rack || "";
  el("prop-status").value = object.status || "proposed";
  el("prop-layer").value = object.layer || "notes";
  el("prop-color").value = object.color || "#0b84f3";
  const size = Number(object.size) || 1;
  el("prop-size-field").hidden = false;
  el("prop-size-label").textContent = object.kind === "route"
    ? "Grosor de la ruta"
    : object.kind === "note"
      ? "Tamaño de la observación"
      : object.kind === "architecture" && object.archType === "wall"
        ? "Grosor del muro"
        : object.kind === "architecture"
          ? "Escala del elemento"
          : "Tamaño del símbolo";
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
  el("status-size").textContent = page.sourceKind === "blank"
    ? `${page.metersWidth} × ${page.metersHeight} m`
    : `${Math.round(page.width)} × ${Math.round(page.height)} px`;
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
  return false;
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

function createArchitectureNode(object, interactive = true) {
  const selected = object.id === selectedId && interactive ? " selected" : "";
  const group = svgNode("g", {
    class: `architecture-item architecture-${object.archType}${selected}`,
    "data-object-id": object.id,
    style: `--architecture-color:${object.color || "#315b7c"}`
  });

  if (object.archType === "room") {
    group.setAttribute("transform", `translate(${object.x} ${object.y}) scale(${Number(object.size) || 1})`);
    const width = Math.max(12, object.width || 120);
    const height = Math.max(12, object.height || 80);
    group.appendChild(svgNode("rect", { class: "architecture-hit", x: 0, y: 0, width, height }));
    group.appendChild(svgNode("rect", { class: "architecture-shape room-shape", x: 0, y: 0, width, height, stroke: object.color }));
    const label = svgNode("text", { class: "architecture-label", x: width / 2, y: height / 2 - 3 });
    label.textContent = object.label || "Habitación";
    const dimensions = svgNode("text", { class: "architecture-dimensions", x: width / 2, y: height / 2 + 13 });
    const page = currentPage();
    const ppm = page?.pixelsPerMeter || 40;
    dimensions.textContent = `${(width / ppm).toFixed(1)} × ${(height / ppm).toFixed(1)} m`;
    group.append(label, dimensions);
  } else if (object.archType === "wall") {
    const [start, end] = object.points || [];
    if (!start || !end) return group;
    const width = 5 * (Number(object.size) || 1);
    group.appendChild(svgNode("line", { class: "architecture-hit wall-hit", x1: start.x, y1: start.y, x2: end.x, y2: end.y }));
    group.appendChild(svgNode("line", { class: "architecture-shape wall-shape", x1: start.x, y1: start.y, x2: end.x, y2: end.y, stroke: object.color, style: `stroke-width:${width}px` }));
    const label = svgNode("text", {
      class: "architecture-label wall-label",
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2 - 9
    });
    label.textContent = object.label || "Muro";
    group.appendChild(label);
  } else if (object.archType === "door") {
    group.setAttribute("transform", `translate(${object.x} ${object.y}) rotate(${object.rotation || 0}) scale(${Number(object.size) || 1})`);
    group.appendChild(svgNode("rect", { class: "architecture-hit", x: -7, y: -7, width: 58, height: 58 }));
    group.appendChild(svgNode("path", { class: "architecture-shape door-shape", d: "M0 0H42 M0 0A42 42 0 0 1 42 42", stroke: object.color }));
  }

  if (interactive) {
    if (object.archType === "wall") bindWallEvents(group, object);
    else bindObjectEvents(group, object);
  }
  return group;
}

function bindWallEvents(node, object) {
  node.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    if (handlePlacementOverObject(event, object)) return;
    if (activeTool !== "select") setTool("select");
    selectObject(object.id);
    const point = eventToPlanPoint(event);
    dragState = {
      type: "architecture-wall",
      id: object.id,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      points: structuredClone(object.points),
      moved: false
    };
    overlaySvg.setPointerCapture(event.pointerId);
  });
}

function handlePlacementOverObject(event, object) {
  const point = eventToPlanPoint(event);
  if (activeTool === "symbol" && activeSymbol) {
    event.preventDefault();
    addSymbol(activeSymbol, point);
    return true;
  }
  if (activeTool === "route") {
    event.preventDefault();
    addDraftRoutePoint(object.kind === "symbol" ? { x: object.x, y: object.y, anchorId: object.id } : point);
    return true;
  }
  if (activeTool === "note") {
    event.preventDefault();
    pendingNotePoint = point;
    el("note-text").value = "";
    el("note-dialog").showModal();
    return true;
  }
  if (["room", "wall", "door"].includes(activeTool)) {
    event.preventDefault();
    handlePlanToolPoint(activeTool, point);
    return true;
  }
  return false;
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
      if (event.target.closest(".route-control-point, .route-midpoint")) return;
      event.stopPropagation();
      if (layerLocked(object)) return;
      if (activeTool !== "select") setTool("select");
      selectObject(object.id);
      const start = eventToPlanPoint(event);
      dragState = {
        type: "route",
        id: object.id,
        pointerId: event.pointerId,
        startX: start.x,
        startY: start.y,
        points: resolvedRoutePoints(object, page).map((point) => ({ x: point.x, y: point.y })),
        moved: false
      };
      overlaySvg.setPointerCapture(event.pointerId);
    });
  }
  return group;
}

function renderSelectedRouteControls() {
  const object = objectById(selectedId);
  if (!object || object.kind !== "route" || activeTool !== "select") return;
  const routePoints = resolvedRoutePoints(object);
  const controls = svgNode("g", { class: "route-controls", "data-object-id": object.id });
  routePoints.slice(0, -1).forEach((point, index) => {
    const next = routePoints[index + 1];
    const midpoint = svgNode("circle", {
      class: "route-midpoint",
      cx: (point.x + next.x) / 2,
      cy: (point.y + next.y) / 2,
      r: 4
    });
    midpoint.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const inserted = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
      object.points.splice(index + 1, 0, inserted);
      dragState = { type: "route-point", id: object.id, pointIndex: index + 1, pointerId: event.pointerId, moved: true };
      overlaySvg.setPointerCapture(event.pointerId);
      renderOverlay();
    });
    controls.appendChild(midpoint);
  });
  routePoints.forEach((point, index) => {
    const handle = svgNode("circle", {
      class: `route-control-point${point.anchorId ? " anchored" : ""}`,
      cx: point.x,
      cy: point.y,
      r: 6
    });
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dragState = { type: "route-point", id: object.id, pointIndex: index, pointerId: event.pointerId, moved: false };
      overlaySvg.setPointerCapture(event.pointerId);
    });
    controls.appendChild(handle);
  });
  draftLayer.appendChild(controls);
}

function bindObjectEvents(node, object) {
  node.addEventListener("pointerenter", (event) => showSymbolTooltip(object, event));
  node.addEventListener("pointermove", positionSymbolTooltip);
  node.addEventListener("pointerleave", hideSymbolTooltip);
  node.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    if (handlePlacementOverObject(event, object)) return;
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
    const last = draftRoutePoints.at(-1);
    const previous = draftRoutePoints.at(-2);
    if (last?.anchorId && last.anchorId === previous?.anchorId) draftRoutePoints.pop();
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
  architectureLayer.replaceChildren();
  routesLayer.replaceChildren();
  itemsLayer.replaceChildren();
  if (!page) return;
  page.objects.filter((object) => object.kind === "architecture").forEach((object) => {
    if (layerAllows(object)) architectureLayer.appendChild(createArchitectureNode(object));
  });
  page.objects.filter((object) => object.kind !== "architecture").forEach((object) => {
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
  style.textContent = `.item-ring{fill:white;stroke-width:3}.item-code{font-family:Arial,sans-serif;font-weight:900;text-anchor:middle;dominant-baseline:middle;fill:#071b38}.item-label{font-family:Arial,sans-serif;font-weight:800;text-anchor:middle;paint-order:stroke;stroke:white;stroke-width:3;stroke-linejoin:round;fill:#071b38}.route-line{fill:none;stroke-linejoin:round;stroke-linecap:round}.route-anchor{fill:white;stroke-width:2}.route-label{font-family:Arial,sans-serif;font-size:8px;font-weight:800;text-anchor:middle;dominant-baseline:central;paint-order:stroke;stroke:white;stroke-width:3px;stroke-linejoin:round}.route-hit,.item-hit,.architecture-hit{display:none}.note-item rect:not(.item-hit){fill:#fff6ba;stroke:#d19b00;stroke-width:2}.note-item text{font-family:Arial,sans-serif;fill:#3d3100;font-weight:700}.room-shape{fill:rgba(49,91,124,.08);stroke-width:3}.wall-shape,.door-shape{fill:none;stroke-linecap:round}.architecture-label,.architecture-dimensions{font-family:Arial,sans-serif;text-anchor:middle;fill:#17324d;font-weight:700}.architecture-label{font-size:12px}.architecture-dimensions{font-size:8px}`;
  svg.appendChild(style);
  page.objects.filter((object) => object.kind === "architecture").forEach((object) => {
    const layer = layerById(object.layer);
    if (!layer || layer.visible) svg.appendChild(createArchitectureNode(object, false));
  });
  page.objects.filter((object) => object.kind !== "architecture").forEach((object) => {
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
  const object = objectById(id);
  if (object?.kind === "route") el("route-help").textContent = "Ruta seleccionada: arrastra la línea para moverla completa, los círculos grandes para ajustar vértices o los pequeños para añadir un nuevo tramo.";
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

function snapPlanPoint(point) {
  const page = currentPage();
  if (page?.sourceKind !== "blank") return point;
  const step = (page.pixelsPerMeter || 40) / 4;
  return {
    x: Math.max(0, Math.min(page.width, Math.round(point.x / step) * step)),
    y: Math.max(0, Math.min(page.height, Math.round(point.y / step) * step))
  };
}

function addArchitectureObject(archType, start, end = null) {
  const page = currentPage();
  if (!page) return;
  const count = page.objects.filter((object) => object.kind === "architecture" && object.archType === archType).length + 1;
  let object;
  if (archType === "room") {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (width < 12 || height < 12) return showToast("La habitación necesita un tamaño mayor");
    object = {
      id: uid("room"), kind: "architecture", archType, label: `Habitación ${String(count).padStart(3, "0")}`,
      type: "Habitación / zona", rack: "", status: "proposed", layer: "architecture", color: "#315b7c",
      notes: "", x, y, width, height, size: 1
    };
  } else if (archType === "wall") {
    if (Math.hypot(end.x - start.x, end.y - start.y) < 12) return showToast("El muro necesita una longitud mayor");
    object = {
      id: uid("wall"), kind: "architecture", archType, label: `Muro ${String(count).padStart(3, "0")}`,
      type: "Muro", rack: "", status: "proposed", layer: "architecture", color: "#315b7c",
      notes: "", points: [start, end], size: 1
    };
  } else {
    object = {
      id: uid("door"), kind: "architecture", archType: "door", label: `Puerta ${String(count).padStart(3, "0")}`,
      type: "Puerta", rack: "", status: "proposed", layer: "architecture", color: "#315b7c",
      notes: "", x: start.x, y: start.y, rotation: 0, size: 1
    };
  }
  page.objects.push(object);
  selectedId = object.id;
  markUpdated();
  commitHistory();
  renderOverlay();
}

function handlePlanToolPoint(tool, point) {
  const snapped = snapPlanPoint(point);
  if (tool === "door") {
    addArchitectureObject("door", snapped);
    return;
  }
  if (!planToolStart) {
    planToolStart = snapped;
    planToolPointer = snapped;
    renderDraftRoute();
    showToast(tool === "room" ? "Marca la esquina opuesta" : "Marca el final del muro");
    return;
  }
  addArchitectureObject(tool, planToolStart, snapped);
  planToolStart = null;
  planToolPointer = null;
  renderDraftRoute();
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
  el("route-actions").hidden = activeTool !== "route" || !draftRoutePoints.length;
  el("finish-route-btn").disabled = draftRoutePoints.length < 2;
  if (draftRoutePoints.length) {
    const line = svgNode("polyline", { class: "draft-route", points: draftRoutePoints.map((point) => `${point.x},${point.y}`).join(" ") });
    draftLayer.appendChild(line);
    draftRoutePoints.forEach((point) => draftLayer.appendChild(svgNode("circle", { class: `draft-point${point.anchorId ? " anchored" : ""}`, cx: point.x, cy: point.y, r: point.anchorId ? 6 : 4 })));
  }
  if (planToolStart && planToolPointer && activeTool === "room") {
    const x = Math.min(planToolStart.x, planToolPointer.x);
    const y = Math.min(planToolStart.y, planToolPointer.y);
    draftLayer.appendChild(svgNode("rect", {
      class: "draft-room", x, y,
      width: Math.abs(planToolPointer.x - planToolStart.x),
      height: Math.abs(planToolPointer.y - planToolStart.y)
    }));
  }
  if (planToolStart && planToolPointer && activeTool === "wall") {
    draftLayer.appendChild(svgNode("line", {
      class: "draft-wall", x1: planToolStart.x, y1: planToolStart.y,
      x2: planToolPointer.x, y2: planToolPointer.y
    }));
  }
  renderSelectedRouteControls();
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
  if (copy.kind === "route" || (copy.kind === "architecture" && copy.archType === "wall")) copy.points = copy.points.map((point) => ({ ...point, x: point.x + 18, y: point.y + 18 }));
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
    const labelNode = selectedNode?.querySelector(".item-label, .architecture-label");
    if (labelNode) labelNode.textContent = value;
  }
  if (property === "color") {
    selectedNode?.querySelector(".item-ring")?.setAttribute("stroke", value);
    selectedNode?.querySelector(".route-line")?.setAttribute("stroke", value);
    selectedNode?.querySelector(".architecture-shape")?.setAttribute("stroke", value);
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
  if (page.sourceKind === "blank") {
    drawBlankBackground(context, page);
    return;
  }
  if (page.sourceKind === "demo") {
    drawDemoBackground(context, page);
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

function drawBlankBackground(context, page) {
  const ppm = page.pixelsPerMeter || 40;
  context.fillStyle = "#fbfdff";
  context.fillRect(0, 0, page.width, page.height);
  for (let x = 0; x <= page.width; x += ppm) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, page.height);
    context.strokeStyle = x % (ppm * 5) === 0 ? "#b7c9d8" : "#dce7ef";
    context.lineWidth = x % (ppm * 5) === 0 ? 1.4 : .7;
    context.stroke();
  }
  for (let y = 0; y <= page.height; y += ppm) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(page.width, y);
    context.strokeStyle = y % (ppm * 5) === 0 ? "#b7c9d8" : "#dce7ef";
    context.lineWidth = y % (ppm * 5) === 0 ? 1.4 : .7;
    context.stroke();
  }
  context.strokeStyle = "#315b7c";
  context.lineWidth = 3;
  context.strokeRect(1.5, 1.5, page.width - 3, page.height - 3);
  context.fillStyle = "rgba(255,255,255,.9)";
  context.fillRect(12, 12, 190, 33);
  context.fillStyle = "#17324d";
  context.font = "700 12px Arial";
  context.textAlign = "left";
  context.fillText(`CUADRÍCULA 1 m · ${page.metersWidth} × ${page.metersHeight} m`, 22, 33);
}

function drawDemoBackground(context, page) {
  context.fillStyle = "#fbfdff";
  context.fillRect(0, 0, page.width, page.height);
  drawDemoTitle(context, page);
  if (page.demoPlan === "rooms") drawDemoRoomsPlan(context);
  else if (page.demoPlan === "exterior") drawDemoExteriorPlan(context);
  else drawDemoGroundPlan(context);
}

function drawDemoTitle(context, page) {
  context.textAlign = "left";
  context.fillStyle = "#17324d";
  context.font = "700 22px Arial";
  context.fillText(`HOTEL COSTA SERENA · ${page.name.toUpperCase()}`, 50, 35);
  context.fillStyle = "#c2410c";
  context.font = "700 12px Arial";
  context.fillText("EJEMPLO FICTICIO · PREDISEÑO CONCEPTUAL · VALIDAR MEDIANTE VISITA Y ESTUDIO DE COBERTURA", 50, 57);
}

function drawDemoZone(context, x, y, width, height, label, fill = "#f4f7f9") {
  context.fillStyle = fill;
  context.strokeStyle = "#91a4b4";
  context.lineWidth = 2;
  context.fillRect(x, y, width, height);
  context.strokeRect(x, y, width, height);
  context.fillStyle = "#526778";
  context.font = "700 15px Arial";
  context.textAlign = "center";
  const lines = String(label).split("\n");
  lines.forEach((line, index) => context.fillText(line, x + width / 2, y + height / 2 + (index - (lines.length - 1) / 2) * 18));
}

function drawDemoGroundPlan(context) {
  drawDemoZone(context, 50, 85, 360, 265, "RESTAURANTE PRINCIPAL\n120 plazas", "#fff7ed");
  drawDemoZone(context, 410, 85, 230, 265, "COCINA + OFFICE", "#f1f5f9");
  drawDemoZone(context, 640, 85, 360, 265, "LOBBY · RECEPCIÓN\nCONSERJERÍA", "#eff6ff");
  drawDemoZone(context, 1000, 85, 180, 265, "BACK OFFICE", "#f5f3ff");
  drawDemoZone(context, 1180, 85, 170, 265, "MDF / CPD\nCUARTO TÉCNICO", "#ecfdf5");
  drawDemoZone(context, 50, 350, 1300, 160, "CIRCULACIÓN PRINCIPAL · ACCESOS · ASCENSORES", "#f8fafc");
  drawDemoZone(context, 50, 510, 310, 300, "BAR · LOUNGE", "#fdf2f8");
  drawDemoZone(context, 360, 510, 260, 300, "TERRAZA CUBIERTA", "#f0fdfa");
  drawDemoZone(context, 620, 510, 260, 300, "SALAS DE REUNIONES", "#eef2ff");
  drawDemoZone(context, 880, 510, 290, 300, "SPA · GIMNASIO", "#ecfeff");
  drawDemoZone(context, 1170, 510, 180, 150, "ASEOS", "#f8fafc");
  drawDemoZone(context, 1170, 660, 180, 150, "IDF-PB\nSERVICIOS", "#ecfdf5");
}

function drawDemoRoomsPlan(context) {
  const startX = 50;
  const roomWidth = 210;
  for (let index = 0; index < 6; index += 1) {
    drawDemoZone(context, startX + index * roomWidth, 85, roomWidth, 290, `HAB. ${201 + index}\nDOBLE`, index % 2 ? "#f8fafc" : "#f0f7ff");
    drawDemoZone(context, startX + index * roomWidth, 525, roomWidth, 290, `HAB. ${207 + index}\nDOBLE`, index % 2 ? "#f0f7ff" : "#f8fafc");
  }
  drawDemoZone(context, 50, 375, 1260, 150, "PASILLO DE HABITACIONES · RUTA DE EVACUACIÓN", "#f8fafc");
  drawDemoZone(context, 1310, 85, 55, 290, "ESC.", "#f1f5f9");
  drawDemoZone(context, 1310, 525, 55, 290, "ESC.", "#f1f5f9");
  drawDemoZone(context, 565, 395, 110, 110, "IDF-O", "#ecfdf5");
  drawDemoZone(context, 735, 395, 110, 110, "IDF-E", "#ecfdf5");
  drawDemoZone(context, 675, 395, 60, 110, "ASC.", "#f1f5f9");
  drawDemoZone(context, 1130, 395, 150, 110, "OFFICE PISO", "#fff7ed");
}

function drawDemoExteriorPlan(context) {
  drawDemoZone(context, 50, 85, 1300, 120, "FACHADA HOTEL · TERRAZA · SALIDA DESDE LOBBY", "#f8fafc");
  drawDemoZone(context, 60, 225, 250, 210, "POOL BAR\n+ COCINA", "#fff7ed");
  drawDemoZone(context, 345, 260, 570, 270, "PISCINA PRINCIPAL", "#dff6ff");
  drawDemoZone(context, 1000, 285, 260, 190, "PISCINA INFANTIL", "#e0f2fe");
  drawDemoZone(context, 310, 225, 690, 35, "SOLÁRIUM NORTE", "#fefce8");
  drawDemoZone(context, 310, 530, 690, 100, "SOLÁRIUM SUR · HAMACAS", "#fefce8");
  drawDemoZone(context, 50, 650, 310, 170, "JARDÍN OESTE\nEVENTOS", "#ecfdf5");
  drawDemoZone(context, 360, 650, 650, 170, "JARDINES · SENDERO CENTRAL", "#ecfdf5");
  drawDemoZone(context, 1010, 650, 340, 170, "ACCESO PLAYA\nCONTROL DE ACCESO", "#f0fdfa");
  drawDemoZone(context, 60, 455, 170, 150, "RACK-EXT\nCUARTO PISCINA", "#ecfdf5");
  context.strokeStyle = "#86a789";
  context.lineWidth = 5;
  context.setLineDash([14, 10]);
  context.beginPath();
  context.moveTo(230, 580);
  context.lineTo(1180, 580);
  context.lineTo(1180, 735);
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

function createBlankProject(name, widthMeters, heightMeters, pageName) {
  const pixelsPerMeter = 40;
  state = freshState(name);
  state.pages.push({
    id: uid("page"),
    name: pageName || "Planta baja",
    sourceKind: "blank",
    width: widthMeters * pixelsPerMeter,
    height: heightMeters * pixelsPerMeter,
    metersWidth: widthMeters,
    metersHeight: heightMeters,
    pixelsPerMeter,
    objects: []
  });
  state.currentPageId = state.pages[0].id;
  fileBuffers.clear();
  pdfDocuments.clear();
  selectedId = null;
  draftRoutePoints = [];
  planToolStart = null;
  planToolPointer = null;
  openApp();
  resetHistory();
  refreshUI(true);
  requestAnimationFrame(fitToCanvas);
  showToast("Plano vacío creado localmente");
}

function createDemoProject() {
  state = freshState("Hotel Costa Serena · Ejemplo ficticio");
  state.pages.push(
    { id: uid("page"), name: "PB · ZZCC y restauración", sourceKind: "demo", demoPlan: "ground", width: 1400, height: 900, objects: buildDemoGroundObjects() },
    { id: uid("page"), name: "P2 · Habitaciones y pasillos", sourceKind: "demo", demoPlan: "rooms", width: 1400, height: 900, objects: buildDemoRoomsObjects() },
    { id: uid("page"), name: "Exterior · Piscinas y jardines", sourceKind: "demo", demoPlan: "exterior", width: 1400, height: 900, objects: buildDemoExteriorObjects() }
  );
  state.currentPageId = state.pages[0].id;
  fileBuffers.clear();
  pdfDocuments.clear();
  openApp();
  resetHistory();
  refreshUI(true);
  requestAnimationFrame(fitToCanvas);
}

function demoSymbol(key, x, y, label, rack = "", notes = "", size = .8, status = "proposed") {
  const symbol = SYMBOLS.find((entry) => entry.key === key);
  return { id: uid("object"), kind: "symbol", symbolKey: key, label, type: symbol.name, rack, status, layer: symbol.layer, color: symbol.color, notes, x, y, rotation: 0, size };
}

function demoPoint(value) {
  return value?.kind === "symbol" ? { x: value.x, y: value.y, anchorId: value.id } : value;
}

function demoRoute(routeType, label, rack, points, notes = "", size = .55) {
  const style = ROUTE_STYLES[routeType];
  return { id: uid("route"), kind: "route", routeType, label, type: style.name, rack, status: "proposed", layer: style.layer, color: style.color, notes, size, points: points.map(demoPoint) };
}

function demoNote(label, x, y, notes = "") {
  return { id: uid("note"), kind: "note", label, type: "Observación", rack: "", status: "pending", layer: "notes", color: "#d19b00", notes, x, y, size: .72 };
}

function buildDemoGroundObjects() {
  const objects = [];
  const add = (object) => (objects.push(object), object);
  const mdf = add(demoSymbol("mdf", 1265, 215, "MDF-01", "", "Core de red, seguridad y salida de fibra del hotel."));
  const idf = add(demoSymbol("idf", 1260, 735, "IDF-PB-01", "MDF-01", "Distribución de servicios de planta baja."));
  const fiberBox = add(demoSymbol("fiber-box", 1310, 430, "FO-PB-01", "MDF-01", "Caja de transición hacia exteriores y montante vertical."));
  const aps = [
    ["AP-PB-RST-01", 155, 170], ["AP-PB-RST-02", 310, 275], ["AP-PB-COC-01", 520, 215],
    ["AP-PB-LOB-01", 735, 175], ["AP-PB-LOB-02", 900, 270], ["AP-PB-BO-01", 1085, 220],
    ["AP-PB-PAS-01", 280, 430], ["AP-PB-PAS-02", 690, 430], ["AP-PB-PAS-03", 1060, 430],
    ["AP-PB-BAR-01", 150, 615], ["AP-PB-BAR-02", 285, 735], ["AP-PB-TER-01", 490, 650],
    ["AP-PB-SAL-01", 690, 635], ["AP-PB-SAL-02", 815, 735], ["AP-PB-SPA-01", 975, 630], ["AP-PB-GYM-01", 1100, 735]
  ].map(([label, x, y]) => add(demoSymbol("ap-common", x, y, label, "IDF-PB-01", "Ubicación conceptual; validar cobertura y canal disponible mediante survey.")));
  [
    ["CAM-PB-RST-01", 390, 390], ["CAM-PB-LOB-01", 815, 390], ["CAM-PB-PAS-01", 545, 430],
    ["CAM-PB-PAS-02", 1140, 430], ["CAM-PB-BAR-01", 345, 545], ["CAM-PB-TER-01", 610, 545],
    ["CAM-PB-SPA-01", 890, 545], ["CAM-PB-SRV-01", 1180, 430]
  ].forEach(([label, x, y]) => add(demoSymbol("camera-dome", x, y, label, "IDF-PB-01", "Orientación y campo de visión sujetos a validación en visita.", .72)));
  [["CA-MDF-01", 1185, 330], ["CA-IDF-PB-01", 1185, 700], ["CA-BO-01", 1005, 330]].forEach(([label, x, y]) => add(demoSymbol("access", x, y, label, "IDF-PB-01", "Control de acceso conceptual." , .72)));
  [
    ["N-REC-01", "corporate", 760, 265], ["N-BO-01", "corporate", 1080, 285],
    ["POS-RST-01", "double-node", 165, 320], ["POS-RST-02", "double-node", 315, 320],
    ["POS-BAR-01", "double-node", 150, 780], ["N-SAL-01", "double-node", 690, 770],
    ["TV-LOU-01", "iptv", 275, 680], ["TEL-REC-01", "phone", 910, 315]
  ].forEach(([label, key, x, y]) => add(demoSymbol(key, x, y, label, "IDF-PB-01", "Punto de servicio integrado en la red corporativa.", .68)));
  add(demoRoute("fiber", "FO-MDF-IDF-PB", "MDF-01", [mdf, { x: 1265, y: 430 }, { x: 1260, y: 650 }, idf], "Troncal redundante recomendada; número de fibras y reserva a definir en ingeniería.", .7));
  add(demoRoute("fiber", "FO-MDF-EXT", "MDF-01", [mdf, { x: 1340, y: 300 }, fiberBox], "Enlace hacia armario de exteriores.", .7));
  add(demoRoute("conduit", "CAN-PB-PRINCIPAL", "IDF-PB-01", [idf, { x: 1260, y: 470 }, { x: 690, y: 470 }, { x: 280, y: 470 }], "Bandeja principal por circulación; secciones y ocupación pendientes de cálculo.", .6));
  add(demoRoute("copper", "CU-PB-NORTE", "IDF-PB-01", [idf, { x: 1160, y: 430 }, aps[8], aps[7], aps[6], { x: 280, y: 350 }, aps[1], aps[0]], "Recorrido conceptual de distribución; cada equipo requiere enlace individual certificado.", .5));
  add(demoRoute("copper", "CU-PB-LOBBY", "IDF-PB-01", [idf, { x: 1160, y: 430 }, aps[5], aps[4], aps[3]], "Derivaciones Cat 6A desde IDF-PB-01.", .5));
  add(demoRoute("copper", "CU-PB-SUR", "IDF-PB-01", [idf, aps[15], aps[14], aps[13], aps[12], aps[11], aps[10], aps[9]], "Recorrido conceptual para ZZCC sur.", .5));
  add(demoNote("PREDISEÑO: validar RF, aforo, PoE, distancias y rutas en visita", 515, 82, "Las cantidades ilustran el flujo de trabajo y no sustituyen una ingeniería ejecutiva."));
  return objects;
}

function buildDemoRoomsObjects() {
  const objects = [];
  const add = (object) => (objects.push(object), object);
  const idfWest = add(demoSymbol("idf", 620, 450, "IDF-P2-O", "MDF-01", "Distribución ala oeste y montante de planta."));
  const idfEast = add(demoSymbol("idf", 790, 450, "IDF-P2-E", "MDF-01", "Distribución ala este y office de planta."));
  const roomAps = [];
  for (let index = 0; index < 6; index += 1) {
    const x = 155 + index * 210;
    const west = index < 3;
    roomAps.push(add(demoSymbol("ap-room", x, 220, `AP-H${201 + index}`, west ? "IDF-P2-O" : "IDF-P2-E", "AP de habitación; validar modelo, orientación y atenuación de particiones.", .7)));
    roomAps.push(add(demoSymbol("ap-room", x, 680, `AP-H${207 + index}`, west ? "IDF-P2-O" : "IDF-P2-E", "AP de habitación; validar modelo, orientación y atenuación de particiones.", .7)));
    add(demoSymbol("double-node", x - 45, 325, `2N-H${201 + index}`, west ? "IDF-P2-O" : "IDF-P2-E", "Datos, IPTV y telefonía según estándar de habitación.", .55));
    add(demoSymbol("double-node", x - 45, 575, `2N-H${207 + index}`, west ? "IDF-P2-O" : "IDF-P2-E", "Datos, IPTV y telefonía según estándar de habitación.", .55));
    add(demoSymbol("iptv", x + 50, 325, `TV-H${201 + index}`, west ? "IDF-P2-O" : "IDF-P2-E", "Punto IPTV de habitación.", .55));
    add(demoSymbol("iptv", x + 50, 575, `TV-H${207 + index}`, west ? "IDF-P2-O" : "IDF-P2-E", "Punto IPTV de habitación.", .55));
  }
  const corridorAps = [[280, 450, "AP-P2-PAS-01", "IDF-P2-O"], [700, 450, "AP-P2-PAS-02", "IDF-P2-O"], [1120, 450, "AP-P2-PAS-03", "IDF-P2-E"]]
    .map(([x, y, label, rack]) => add(demoSymbol("ap-common", x, y, label, rack, "Cobertura de pasillo y roaming; validar con survey.", .7)));
  [[80, 450, "CAM-P2-01", "IDF-P2-O"], [500, 450, "CAM-P2-02", "IDF-P2-O"], [900, 450, "CAM-P2-03", "IDF-P2-E"], [1280, 450, "CAM-P2-04", "IDF-P2-E"]]
    .forEach(([x, y, label, rack]) => add(demoSymbol("camera-dome", x, y, label, rack, "Cobertura exclusiva de circulación; no orientar al interior de habitaciones.", .65)));
  add(demoSymbol("access", 565, 450, "CA-IDF-P2-O", "IDF-P2-O", "Acceso al cuarto técnico.", .62));
  add(demoSymbol("access", 845, 450, "CA-IDF-P2-E", "IDF-P2-E", "Acceso al cuarto técnico.", .62));
  add(demoRoute("fiber", "FO-MONTANTE-P2", "MDF-01", [{ x: 705, y: 85 }, { x: 705, y: 410 }, idfWest, idfEast], "Montante óptico desde MDF; reserva y topología a definir.", .7));
  add(demoRoute("conduit", "CAN-P2-PASILLO", "IDF-P2-O", [{ x: 70, y: 485 }, { x: 1330, y: 485 }], "Bandeja de pasillo para distribución a habitaciones.", .55));
  add(demoRoute("copper", "CU-P2-OESTE", "IDF-P2-O", [idfWest, corridorAps[1], corridorAps[0], roomAps[4], roomAps[2], roomAps[0], roomAps[1], roomAps[3], roomAps[5]], "Representación resumida; cada AP y toma dispone de enlace individual.", .45));
  add(demoRoute("copper", "CU-P2-ESTE", "IDF-P2-E", [idfEast, corridorAps[2], roomAps[10], roomAps[8], roomAps[6], roomAps[7], roomAps[9], roomAps[11]], "Representación resumida; cada AP y toma dispone de enlace individual.", .45));
  add(demoNote("12 habitaciones · AP por habitación · CCTV solo en pasillos", 930, 395, "Ejemplo conceptual de una planta tipo."));
  return objects;
}

function buildDemoExteriorObjects() {
  const objects = [];
  const add = (object) => (objects.push(object), object);
  const fiberBox = add(demoSymbol("fiber-box", 100, 165, "FO-EXT-01", "MDF-01", "Llegada de fibra desde el edificio principal."));
  const rack = add(demoSymbol("rack", 145, 525, "RACK-EXT-01", "MDF-01", "Armario climatizado para electrónica de exteriores."));
  const aps = [
    ["AP-EXT-BAR-01", 175, 300], ["AP-EXT-PIS-01", 470, 345], ["AP-EXT-PIS-02", 785, 435],
    ["AP-EXT-INF-01", 1125, 350], ["AP-EXT-JAR-01", 250, 735], ["AP-EXT-JAR-02", 700, 735], ["AP-EXT-PLA-01", 1180, 735]
  ].map(([label, x, y]) => add(demoSymbol("ap-outdoor", x, y, label, "RACK-EXT-01", "AP exterior IP-rated; validar cobertura, interferencias y protección ambiental.", .78)));
  [
    ["CAM-EXT-BAR-01", "camera-bullet", 320, 235], ["CAM-EXT-PIS-01", "camera-ptz", 930, 245],
    ["CAM-EXT-INF-01", "camera-dome", 1280, 250], ["CAM-EXT-OES-01", "camera-bullet", 315, 610],
    ["CAM-EXT-EST-01", "camera-bullet", 1000, 610], ["CAM-EXT-PLA-01", "camera-bullet", 1290, 760],
    ["CAM-EXT-ACC-01", "camera-bullet", 70, 650]
  ].forEach(([label, key, x, y]) => add(demoSymbol(key, x, y, label, "RACK-EXT-01", "Validar privacidad, iluminación y campo de visión.", .72)));
  add(demoSymbol("access", 1040, 760, "CA-PLAYA-01", "RACK-EXT-01", "Control de acceso desde playa.", .7));
  add(demoSymbol("double-node", 125, 390, "POS-POOL-01", "RACK-EXT-01", "POS y terminal de servicio del pool bar.", .62));
  add(demoSymbol("corporate", 235, 390, "N-POOL-01", "RACK-EXT-01", "Nodo corporativo de operación.", .62));
  add(demoRoute("fiber", "FO-EXT-RACK", "MDF-01", [fiberBox, { x: 100, y: 525 }, rack], "Troncal óptica al armario exterior.", .7));
  add(demoRoute("conduit", "CAN-EXT-ANILLO", "RACK-EXT-01", [rack, { x: 230, y: 580 }, { x: 1180, y: 580 }, { x: 1180, y: 735 }], "Canalización perimetral estanca con registros accesibles.", .65));
  add(demoRoute("copper", "CU-EXT-PISCINAS", "RACK-EXT-01", [rack, aps[0], aps[1], aps[2], aps[3]], "Enlaces exteriores certificados; revisar límites de 90 m y protección contra sobretensiones.", .5));
  add(demoRoute("copper", "CU-EXT-JARDINES", "RACK-EXT-01", [rack, aps[4], aps[5], aps[6]], "Distribución a jardines y acceso de playa.", .5));
  add(demoNote("EXTERIOR: validar IP/IK, puesta a tierra, PoE y protección eléctrica", 760, 85, "La selección final de equipos depende del entorno y del estudio de cobertura."));
  return objects;
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
  zip.file("README.txt", "Proyecto de InfraPlan Studio. Este archivo se procesa localmente y no se debe descomprimir para abrirlo en la aplicación.");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  downloadBlob(blob, `InfraPlan-${safeName(state.projectName)}.tplan`);
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
    state = normalizeProjectState(nextState);
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
  drawExportBrand(canvas);
  return canvas;
}

function drawExportBrand(canvas) {
  const context = canvas.getContext("2d");
  const scale = Math.max(.72, Math.min(1.7, Math.min(canvas.width, canvas.height) / 820));
  const padding = 18 * scale;
  const badgeHeight = 42 * scale;
  const badgeWidth = 204 * scale;
  const badgeX = canvas.width - badgeWidth - padding;
  const badgeY = canvas.height - badgeHeight - padding;
  const radius = 10 * scale;
  const iconSize = 30 * scale;
  const iconX = badgeX + 6 * scale;
  const iconY = badgeY + 6 * scale;

  context.save();
  context.globalAlpha = .9;
  context.beginPath();
  context.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, radius);
  context.fillStyle = "rgba(4, 17, 38, .86)";
  context.fill();
  context.strokeStyle = "rgba(39, 198, 223, .72)";
  context.lineWidth = Math.max(1, scale);
  context.stroke();

  const gradient = context.createLinearGradient(iconX, iconY, iconX + iconSize, iconY + iconSize);
  gradient.addColorStop(0, "#0b6bdc");
  gradient.addColorStop(1, "#27c6df");
  context.fillStyle = gradient;
  context.beginPath();
  context.roundRect(iconX, iconY, iconSize, iconSize, 8 * scale);
  context.fill();

  const routePoints = [
    { x: iconX + 8 * scale, y: iconY + 24 * scale },
    { x: iconX + 8 * scale, y: iconY + 8 * scale },
    { x: iconX + 23 * scale, y: iconY + 23 * scale },
    { x: iconX + 23 * scale, y: iconY + 7 * scale }
  ];
  context.beginPath();
  context.moveTo(routePoints[0].x, routePoints[0].y);
  routePoints.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.strokeStyle = "#eff8ff";
  context.lineWidth = 3 * scale;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();

  [routePoints[0], routePoints[2], routePoints[3]].forEach((point) => {
    context.beginPath();
    context.arc(point.x, point.y, 2.4 * scale, 0, Math.PI * 2);
    context.fillStyle = "#27c6df";
    context.fill();
    context.strokeStyle = "#eff8ff";
    context.lineWidth = 1.2 * scale;
    context.stroke();
  });

  context.fillStyle = "#eff8ff";
  context.font = `700 ${13.5 * scale}px Inter, Segoe UI, Arial, sans-serif`;
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.fillText("InfraPlan Studio", iconX + iconSize + 16 * scale, badgeY + badgeHeight / 2);
  context.restore();
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
    const coordinates = object.kind === "route" || (object.kind === "architecture" && object.archType === "wall") ? object.points[0] || { x: "", y: "" } : object;
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
  else if (["room", "wall", "door"].includes(activeTool)) handlePlanToolPoint(activeTool, point);
  else { selectedId = null; renderOverlay(); }
});

overlaySvg.addEventListener("dblclick", (event) => {
  if (activeTool !== "route") return;
  event.preventDefault();
  if (draftRoutePoints.length > 1) draftRoutePoints.pop();
  finishRoute();
});

overlaySvg.addEventListener("pointermove", (event) => {
  if (!dragState && planToolStart && ["room", "wall"].includes(activeTool)) {
    planToolPointer = snapPlanPoint(eventToPlanPoint(event));
    renderDraftRoute();
    return;
  }
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const object = objectById(dragState.id);
  if (!object) return;
  const point = eventToPlanPoint(event);
  if (dragState.type === "route-point" && object.kind === "route") {
    const routePoint = object.points[dragState.pointIndex];
    if (!routePoint) return;
    routePoint.x = point.x;
    routePoint.y = point.y;
    delete routePoint.anchorId;
  } else if (dragState.type === "route" && object.kind === "route") {
    const offsetX = point.x - dragState.startX;
    const offsetY = point.y - dragState.startY;
    object.points.forEach((routePoint, index) => {
      routePoint.x = dragState.points[index].x + offsetX;
      routePoint.y = dragState.points[index].y + offsetY;
      delete routePoint.anchorId;
    });
  } else if (dragState.type === "architecture-wall" && object.kind === "architecture") {
    const offsetX = point.x - dragState.startX;
    const offsetY = point.y - dragState.startY;
    object.points = dragState.points.map((wallPoint) => ({ x: wallPoint.x + offsetX, y: wallPoint.y + offsetY }));
  } else {
    object.x = dragState.objectX + point.x - dragState.startX;
    object.y = dragState.objectY + point.y - dragState.startY;
    syncAnchoredRoutePoints(object);
  }
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
  const key = event.dataTransfer.getData("text/infraplan-symbol");
  const symbol = SYMBOLS.find((entry) => entry.key === key);
  if (symbol) addSymbol(symbol, eventToPlanPoint(event));
});

document.addEventListener("keydown", (event) => {
  const editingField = ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(document.activeElement?.tagName);
  if (event.code === "Space" && !editingField && !document.querySelector("dialog[open]")) {
    event.preventDefault();
    spacePressed = true;
    canvasScroll.classList.add("pan-ready");
    return;
  }
  if (event.key === "Escape") {
    if (document.querySelector("dialog[open]")) return;
    cancelRoute();
    setTool("select");
  }
  if (event.key === "Enter" && activeTool === "route" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) finishRoute();
  if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) deleteSelected();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); restoreHistory(historyIndex - 1); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); restoreHistory(historyIndex + 1); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveProject(); }
});

document.addEventListener("keyup", (event) => {
  if (event.code !== "Space") return;
  spacePressed = false;
  if (!panState) canvasScroll.classList.remove("pan-ready");
});

window.addEventListener("blur", () => {
  spacePressed = false;
  panState = null;
  canvasScroll.classList.remove("pan-ready", "panning");
});

canvasScroll.addEventListener("pointerdown", (event) => {
  if (!spacePressed || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  panState = {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    scrollLeft: canvasScroll.scrollLeft,
    scrollTop: canvasScroll.scrollTop
  };
  canvasScroll.classList.add("panning");
  canvasScroll.setPointerCapture(event.pointerId);
}, true);

canvasScroll.addEventListener("pointermove", (event) => {
  if (!panState || event.pointerId !== panState.pointerId) return;
  canvasScroll.scrollLeft = panState.scrollLeft - (event.clientX - panState.clientX);
  canvasScroll.scrollTop = panState.scrollTop - (event.clientY - panState.clientY);
});

function finishPanning(event) {
  if (!panState || event.pointerId !== panState.pointerId) return;
  panState = null;
  canvasScroll.classList.remove("panning");
  if (!spacePressed) canvasScroll.classList.remove("pan-ready");
}

canvasScroll.addEventListener("pointerup", finishPanning);
canvasScroll.addEventListener("pointercancel", finishPanning);

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
el("empty-blank-plan").addEventListener("click", () => {
  el("new-project-dialog").showModal();
  const blankMode = document.querySelector('input[name="project-mode"][value="blank"]');
  blankMode.checked = true;
  blankMode.dispatchEvent(new Event("change", { bubbles: true }));
});
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
  const name = el("new-project-name").value.trim();
  const mode = document.querySelector('input[name="project-mode"]:checked')?.value || "import";
  if (!name) return;
  if (mode === "blank") {
    const width = Number(el("blank-plan-width").value);
    const height = Number(el("blank-plan-height").value);
    const pageName = el("blank-plan-page-name").value.trim() || "Planta baja";
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 6 || height < 6) return;
    el("new-project-dialog").close();
    createBlankProject(name, width, height, pageName);
    event.target.reset();
    updateProjectModeFields();
    return;
  }
  const file = el("new-project-file").files[0];
  if (!file) return showToast("Selecciona un PDF o una imagen");
  el("new-project-dialog").close();
  try { await createNewProject(name, file); }
  catch (error) { console.error(error); showToast("No se pudo abrir el plano"); }
  event.target.reset();
  updateProjectModeFields();
});

function updateProjectModeFields() {
  const blank = document.querySelector('input[name="project-mode"]:checked')?.value === "blank";
  el("import-project-fields").hidden = blank;
  el("blank-project-fields").hidden = !blank;
  el("new-project-file").required = !blank;
}

document.querySelectorAll('input[name="project-mode"]').forEach((radio) => radio.addEventListener("change", updateProjectModeFields));
updateProjectModeFields();

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog")?.close("cancel"));
});

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close("cancel");
  });
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
  else if (object.kind === "architecture" && object.archType !== "wall") renderOverlay();
  else if (object.kind === "architecture" && object.archType === "wall") {
    const width = 5 * object.size;
    selectedNode?.querySelector(".wall-shape")?.setAttribute("style", `stroke-width:${width}px`);
  }
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
