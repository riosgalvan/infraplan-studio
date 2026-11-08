import * as pdfjsLib from "./vendor/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).toString();

const SVG_NS = "http://www.w3.org/2000/svg";
const APP_VERSION = 1;

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
  welcome.hidden = true;
  appShell.hidden = false;
  el("project-title").textContent = state.projectName;
}

function setTool(tool, symbol = null) {
  activeTool = tool;
  activeSymbol = symbol;
  draftRoutePoints = [];
  draftLayer.replaceChildren();
  document.querySelectorAll(".drawing-tool").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
  if (tool === "select") el("tool-help").textContent = "Selecciona un elemento para editarlo.";
  if (tool === "symbol") el("tool-help").textContent = `Pulsa sobre el plano para colocar: ${symbol.name}.`;
  if (tool === "route") el("tool-help").textContent = "Marca los puntos de la ruta. Haz doble clic para terminar. Esc cancela.";
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
    button.innerHTML = `<span class="symbol-preview">${symbol.code}</span><span>${symbol.name}</span>`;
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
    row.className = `layer-row${layer.visible ? "" : " layer-hidden"}`;
    row.innerHTML = `<button class="layer-eye" title="Mostrar u ocultar">${layer.visible ? "◉" : "○"}</button><span class="layer-name"><i class="layer-swatch" style="background:${layer.color}"></i>${escapeHtml(layer.name)}</span><button class="layer-lock" title="Bloquear capa">${layer.locked ? "▣" : "□"}</button>`;
    row.querySelector(".layer-eye").addEventListener("click", () => {
      layer.visible = !layer.visible;
      markUpdated(); commitHistory(); renderLayers(); renderOverlay();
    });
    row.querySelector(".layer-lock").addEventListener("click", () => {
      layer.locked = !layer.locked;
      markUpdated(); commitHistory(); renderLayers(); renderOverlay();
    });
    list.appendChild(row);
  });
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
  return !layer || layer.visible;
}

function layerLocked(object) {
  return Boolean(layerById(object.layer)?.locked);
}

function svgNode(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function createSymbolNode(object, interactive = true) {
  const symbol = SYMBOLS.find((entry) => entry.key === object.symbolKey);
  const group = svgNode("g", {
    class: `plan-item${object.id === selectedId && interactive ? " selected" : ""}`,
    transform: `translate(${object.x} ${object.y}) rotate(${object.rotation || 0}) scale(${object.size || 1})`,
    "data-object-id": object.id
  });
  const hit = svgNode("rect", { class: "item-hit", x: -26, y: -26, width: 52, height: 66, rx: 8 });
  const ring = svgNode("circle", { class: "item-ring", cx: 0, cy: 0, r: 17, stroke: object.color });
  const code = svgNode("text", { class: "item-code", x: 0, y: 1, "font-size": symbol?.code.length > 2 ? 7 : 10 });
  code.textContent = symbol?.code || "?";
  const label = svgNode("text", { class: "item-label", x: 0, y: 31, "font-size": 9 });
  label.textContent = object.label;
  group.append(hit, ring, code, label);
  if (interactive) bindObjectEvents(group, object);
  return group;
}

function createNoteNode(object, interactive = true) {
  const group = svgNode("g", {
    class: `plan-item note-item${object.id === selectedId && interactive ? " selected" : ""}`,
    transform: `translate(${object.x} ${object.y})`,
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

function createRouteNode(object, interactive = true) {
  const group = svgNode("g", { class: `route-item${object.id === selectedId && interactive ? " selected" : ""}`, "data-object-id": object.id });
  const points = object.points.map((point) => `${point.x},${point.y}`).join(" ");
  const hit = svgNode("polyline", { class: "route-hit", points });
  const line = svgNode("polyline", { class: "route-line", points, stroke: object.color });
  const routeStyle = ROUTE_STYLES[object.routeType];
  if (routeStyle?.dash) line.setAttribute("stroke-dasharray", routeStyle.dash);
  group.append(hit, line);
  if (interactive) {
    group.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
      selectObject(object.id);
    });
  }
  return group;
}

function bindObjectEvents(node, object) {
  node.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    if (activeTool !== "select" || layerLocked(object)) return;
    selectObject(object.id);
    const point = eventToPlanPoint(event);
    dragState = { id: object.id, pointerId: event.pointerId, startX: point.x, startY: point.y, objectX: object.x, objectY: object.y, moved: false };
    overlaySvg.setPointerCapture(event.pointerId);
  });
}

function renderOverlay() {
  const page = currentPage();
  routesLayer.replaceChildren();
  itemsLayer.replaceChildren();
  if (!page) return;
  page.objects.forEach((object) => {
    if (!layerAllows(object)) return;
    if (object.kind === "route") routesLayer.appendChild(createRouteNode(object));
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
  style.textContent = `.item-ring{fill:white;stroke-width:3}.item-code{font-family:Arial,sans-serif;font-weight:900;text-anchor:middle;dominant-baseline:middle;fill:#071b38}.item-label{font-family:Arial,sans-serif;font-weight:800;text-anchor:middle;paint-order:stroke;stroke:white;stroke-width:3;stroke-linejoin:round;fill:#071b38}.route-line{stroke-width:4;fill:none;stroke-linejoin:round;stroke-linecap:round}.route-hit,.item-hit{display:none}.note-item rect:not(.item-hit){fill:#fff6ba;stroke:#d19b00;stroke-width:2}.note-item text{font-family:Arial,sans-serif;fill:#3d3100;font-weight:700}`;
  svg.appendChild(style);
  page.objects.forEach((object) => {
    const layer = layerById(object.layer);
    if (layer && !layer.visible) return;
    if (object.kind === "route") svg.appendChild(createRouteNode(object, false));
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
  page.objects.push({
    id: uid("object"), kind: "symbol", symbolKey: symbol.key,
    label: `${prefix}-${String(count).padStart(3, "0")}`,
    type: symbol.name, rack: "", status: "proposed", layer: symbol.layer,
    color: symbol.color, notes: "", x: point.x, y: point.y, rotation: 0, size: 1
  });
  markUpdated(); commitHistory(); renderOverlay();
}

function addNote(point, text) {
  const page = currentPage();
  page.objects.push({
    id: uid("note"), kind: "note", label: text, type: "Observación", rack: "",
    status: "pending", layer: "notes", color: "#d19b00", notes: "", x: point.x, y: point.y
  });
  markUpdated(); commitHistory(); renderOverlay();
}

function addRoute(points) {
  const page = currentPage();
  const style = ROUTE_STYLES[el("route-type").value];
  const count = allObjects().filter((object) => object.kind === "route" && object.routeType === el("route-type").value).length + 1;
  page.objects.push({
    id: uid("route"), kind: "route", routeType: el("route-type").value,
    label: `${style.name} ${String(count).padStart(2, "0")}`, type: style.name,
    rack: "", status: "proposed", layer: style.layer, color: style.color, notes: "", points
  });
  markUpdated(); commitHistory();
}

function renderDraftRoute() {
  draftLayer.replaceChildren();
  if (!draftRoutePoints.length) return;
  const line = svgNode("polyline", { class: "draft-route", points: draftRoutePoints.map((point) => `${point.x},${point.y}`).join(" ") });
  draftLayer.appendChild(line);
  draftRoutePoints.forEach((point) => draftLayer.appendChild(svgNode("circle", { class: "draft-point", cx: point.x, cy: point.y, r: 4 })));
}

function finishRoute() {
  if (draftRoutePoints.length >= 2) addRoute(structuredClone(draftRoutePoints));
  draftRoutePoints = [];
  renderOverlay();
}

function deleteSelected() {
  const page = currentPage();
  const index = page?.objects.findIndex((object) => object.id === selectedId) ?? -1;
  if (index < 0) return;
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
  else if (activeTool === "route") { draftRoutePoints.push(point); renderDraftRoute(); }
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
    draftRoutePoints = [];
    renderDraftRoute();
    setTool("select");
  }
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

[
  ["prop-label", "label"], ["prop-type", "type"], ["prop-rack", "rack"],
  ["prop-color", "color"], ["prop-notes", "notes"]
].forEach(([inputId, property]) => {
  el(inputId).addEventListener("input", (event) => liveUpdateSelectedProperty(property, event.target.value));
  el(inputId).addEventListener("blur", commitPendingFormChange);
});
[["prop-status", "status"], ["prop-layer", "layer"]].forEach(([inputId, property]) => {
  el(inputId).addEventListener("change", (event) => updateSelectedProperty(property, event.target.value));
});

renderSymbolLibrary();
renderLayers();
updateUndoButtons();
