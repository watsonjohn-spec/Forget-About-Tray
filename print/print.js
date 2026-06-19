let stlBase64 = "";
let uploadedFileName = "";
let stlMesh = null;
let previewTurntable = null;
let currentUploadRef = crypto.randomUUID();
let savedUploads = [];
const filamentColours = [
  { key: "all", name: "Any standard colour", hex: "#8b9499" },
  { key: "black", name: "Black", hex: "#202223" },
  { key: "white", name: "White", hex: "#f1f2ee" },
  { key: "grey", name: "Grey", hex: "#777c7d" },
  { key: "red", name: "Red", hex: "#b93636" },
  { key: "orange", name: "Orange", hex: "#e87524" },
  { key: "yellow", name: "Yellow", hex: "#f3c623" },
  { key: "green", name: "Green", hex: "#398052" },
  { key: "blue", name: "Blue", hex: "#32658c" },
  { key: "purple", name: "Purple", hex: "#6e4b8b" },
  { key: "pink", name: "Pink", hex: "#d98c9b" },
  { key: "rose-gold", name: "Rose Gold", hex: "#b76e79" },
  { key: "brown", name: "Brown", hex: "#6f4e37" },
  { key: "natural-abs", name: "Natural ABS", hex: "#e6dfcf" }
];

document.getElementById("filamentColour").innerHTML = filamentColours
  .map((colour) => `<option value="${colour.key}">${colour.name}</option>`)
  .join("");

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function readNumber(id) {
  return Number(document.getElementById(id).value || 0);
}

function selectedFilamentColour() {
  return filamentColours.find((colour) => colour.key === document.getElementById("filamentColour").value) || filamentColours[0];
}

function config() {
  const material = document.getElementById("filamentMaterial").value;
  const colour = selectedFilamentColour();
  return {
    name: document.getElementById("printName").value.trim() || "Uploaded print",
    uploadedFileName,
    stlBase64,
    outerWidth: readNumber("outerWidth"),
    outerDepth: readNumber("outerDepth"),
    height: readNumber("height"),
    estimatedWeightGrams: readNumber("estimatedWeightGrams"),
    filamentMaterial: material,
    filamentName: colour.name,
    filamentKey: `uploaded-${material}-${colour.key}`,
    filamentHex: colour.hex,
    desiredColourKey: colour.key,
    preferredPrinterProfileId: document.getElementById("printerPreference").value
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function updateBounds(bounds, point) {
  for (let axis = 0; axis < 3; axis += 1) {
    bounds.min[axis] = Math.min(bounds.min[axis], point[axis]);
    bounds.max[axis] = Math.max(bounds.max[axis], point[axis]);
  }
}

function normalForTriangle(points) {
  const [a, b, c] = points;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0]
  ];
  const length = Math.hypot(...cross) || 1;
  return cross.map((value) => value / length);
}

function unitVector(vector) {
  const length = Math.hypot(...vector);
  return length ? vector.map((value) => value / length) : vector;
}

function meshFromTriangles(triangles, bounds) {
  if (!triangles.length || !bounds.min.every(Number.isFinite)) return null;
  const normalized = triangles.map((triangle) => ({
    normal: triangle.normal,
    points: triangle.points.map((point) => [
      point[0] - bounds.min[0],
      point[1] - bounds.min[1],
      point[2] - bounds.min[2]
    ])
  }));
  return {
    triangles: normalized,
    width: bounds.max[0] - bounds.min[0],
    depth: bounds.max[1] - bounds.min[1],
    height: bounds.max[2] - bounds.min[2]
  };
}

function parseBinaryStlMesh(view) {
  if (view.byteLength < 84) return null;
  const triangleCount = view.getUint32(80, true);
  if (84 + triangleCount * 50 !== view.byteLength) return null;
  const triangles = [];
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let offset = 84; offset + 49 < view.byteLength; offset += 50) {
    const normal = [view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true)];
    const points = [];
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const point = [0, 1, 2].map((axis) => view.getFloat32(offset + 12 + vertex * 12 + axis * 4, true));
      points.push(point);
      updateBounds(bounds, point);
    }
    triangles.push({ normal: Math.hypot(...normal) ? unitVector(normal) : normalForTriangle(points), points });
  }
  return meshFromTriangles(triangles, bounds);
}

function parseAsciiStlMesh(text) {
  const values = [...text.matchAll(/vertex\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/gi)]
    .map((match) => [Number(match[1]), Number(match[2]), Number(match[3])])
    .filter((point) => point.every(Number.isFinite));
  const triangles = [];
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let index = 0; index + 2 < values.length; index += 3) {
    const points = [values[index], values[index + 1], values[index + 2]];
    points.forEach((point) => updateBounds(bounds, point));
    triangles.push({ normal: normalForTriangle(points), points });
  }
  return meshFromTriangles(triangles, bounds);
}

function parseStlMesh(buffer) {
  const view = new DataView(buffer);
  const binary = parseBinaryStlMesh(view);
  if (binary) return binary;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  return parseAsciiStlMesh(text);
}

function previewLine(transform, a, b, attributes) {
  const start = transform.project(a.x, a.y, a.z);
  const end = transform.project(b.x, b.y, b.z);
  return `<line x1="${start.x.toFixed(1)}" y1="${start.y.toFixed(1)}" x2="${end.x.toFixed(1)}" y2="${end.y.toFixed(1)}" ${attributes}/>`;
}

function renderUploadedEnvelopePreview(svg, bounds, colour, view = {}) {
  const width = Math.max(1, bounds.width);
  const depth = Math.max(1, bounds.depth);
  const height = Math.max(1, bounds.height);
  const baseColour = colour === "#8b9499" ? "#748086" : colour;
  const boxes = [
    { x: 0, y: 0, z: 0, w: width, d: depth, h: Math.max(1.2, height * 0.045), previewColour: "#46545b", previewOpacity: 0.7, previewClass: "uploaded-print-base" },
    { x: width * 0.08, y: depth * 0.08, z: Math.max(1.2, height * 0.045), w: width * 0.84, d: depth * 0.84, h: Math.max(2, height * 0.82), previewColour: baseColour, previewOpacity: 0.72, previewClass: "uploaded-print-body" },
    { x: 0, y: 0, z: 0, w: width, d: depth, h: height, previewColour: "#aeb8bb", previewOpacity: 0.11, previewClass: "uploaded-print-envelope" }
  ];
  window.forgetPreview3d.renderBoxes(svg, {
    width,
    depth,
    height,
    yaw: view.yaw,
    pitch: view.pitch,
    colour: baseColour,
    boxes,
    padding: 34,
    overlay: (transform) => {
      const guide = `stroke="#1e2b33" stroke-width="1.05" stroke-dasharray="5 5" opacity=".34" vector-effect="non-scaling-stroke"`;
      const solid = `stroke="#1e2b33" stroke-width="1.1" opacity=".55" vector-effect="non-scaling-stroke"`;
      const label = escapeHtml(bounds.label || uploadedFileName || "Uploaded STL");
      const facetText = bounds.facets ? `${bounds.facets.toLocaleString()} facets read for dimensions` : "Clean print envelope preview";
      return [
        previewLine(transform, { x: 0, y: 0, z: 0 }, { x: width, y: 0, z: 0 }, solid),
        previewLine(transform, { x: 0, y: 0, z: 0 }, { x: 0, y: depth, z: 0 }, solid),
        previewLine(transform, { x: width, y: depth, z: 0 }, { x: width, y: depth, z: height }, guide),
        previewLine(transform, { x: 0, y: 0, z: height }, { x: width, y: 0, z: height }, guide),
        previewLine(transform, { x: 0, y: 0, z: height }, { x: 0, y: depth, z: height }, guide),
        window.forgetPreview3d.textLabel(transform, width / 2, depth + Math.max(12, depth * 0.08), 0, `${width.toFixed(1)} x ${depth.toFixed(1)} x ${height.toFixed(1)} mm`, `text-anchor="middle" fill="#1e2b33" font-size="14" font-weight="900"`),
        window.forgetPreview3d.textLabel(transform, width / 2, depth / 2, height + Math.max(8, height * 0.12), label, `text-anchor="middle" fill="#1e2b33" font-size="12" font-weight="850" opacity=".86"`),
        window.forgetPreview3d.textLabel(transform, width / 2, -Math.max(10, depth * 0.06), 0, facetText, `text-anchor="middle" fill="#46545b" font-size="10" font-weight="800" opacity=".72"`)
      ].join("");
    }
  });
}

function renderStlMeshPreview(svg, mesh, colour, view = {}) {
  renderUploadedEnvelopePreview(svg, {
    width: mesh.width,
    depth: mesh.depth,
    height: mesh.height,
    facets: mesh.triangles.length,
    label: uploadedFileName || "Uploaded STL"
  }, colour, view);
}

function drawPreview(view = previewTurntable?.state || {}) {
  const svg = document.getElementById("preview");
  const width = Math.max(1, readNumber("outerWidth"));
  const depth = Math.max(1, readNumber("outerDepth"));
  const height = Math.max(1, readNumber("height"));
  const colour = selectedFilamentColour().hex;
  if (stlMesh) {
    renderStlMeshPreview(svg, stlMesh, colour, view);
  } else {
    renderUploadedEnvelopePreview(svg, { width, depth, height, label: uploadedFileName || "Awaiting STL" }, colour, view);
  }
  document.getElementById("sizeStat").textContent = `${width} x ${depth} mm`;
  document.getElementById("heightStat").textContent = `${height} mm`;
  document.getElementById("weightStat").textContent = `${readNumber("estimatedWeightGrams")} g`;
}

function parseBinaryBounds(view) {
  const triangles = view.getUint32(80, true);
  if (84 + triangles * 50 !== view.byteLength) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let offset = 84; offset + 49 < view.byteLength; offset += 50) {
    for (let vertex = 0; vertex < 3; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const value = view.getFloat32(offset + 12 + vertex * 12 + axis * 4, true);
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    }
  }
  return min.every(Number.isFinite) ? { width: max[0] - min[0], depth: max[1] - min[1], height: max[2] - min[2] } : null;
}

async function loadStl(file) {
  if (!file) return;
  if (file.size > 650_000) throw new Error("Prototype upload limit is 650KB until file storage is added.");
  currentUploadRef = crypto.randomUUID();
  uploadedFileName = file.name;
  const buffer = await file.arrayBuffer();
  stlMesh = parseStlMesh(buffer);
  const bounds = stlMesh || parseBinaryBounds(new DataView(buffer));
  if (bounds) {
    document.getElementById("outerWidth").value = Math.max(1, bounds.width).toFixed(1);
    document.getElementById("outerDepth").value = Math.max(1, bounds.depth).toFixed(1);
    document.getElementById("height").value = Math.max(1, bounds.height).toFixed(1);
  }
  document.getElementById("estimatedWeightGrams").value = Math.max(5, Math.round(file.size / 32000));
  stlBase64 = bytesToBase64(new Uint8Array(buffer));
  document.getElementById("uploadFileLabel").textContent = `${file.name} ready to quote or save.`;
  document.getElementById("uploadStatus").textContent = stlMesh
    ? `${file.name} loaded. ${stlMesh.triangles.length} facets read for dimensions.`
    : `${file.name} loaded. Check the dimensions and estimated grams before quoting.`;
  previewTurntable.render();
}

function savedParameters(upload) {
  return upload.parameters || upload.configuration || {};
}

function savedMetadata(upload) {
  return upload.metadata && typeof upload.metadata === "object" ? upload.metadata : {};
}

function isSavedStlUpload(upload) {
  const parameters = savedParameters(upload);
  const metadata = savedMetadata(upload);
  return Boolean(parameters.stlBase64 || metadata.saved_upload || metadata.uploaded_file_name);
}

function renderSavedUploads() {
  document.getElementById("savedUploads").innerHTML = savedUploads.length ? savedUploads.map((upload) => {
    const parameters = savedParameters(upload);
    return `<article data-upload-id="${escapeHtml(upload.id || upload.client_ref || "")}">
      <div><strong>${escapeHtml(upload.name || parameters.name || parameters.uploadedFileName || "Uploaded STL")}</strong><small>${escapeHtml(parameters.uploadedFileName || "STL saved")} | ${Number(parameters.estimatedWeightGrams || 0).toFixed(0)} g | ${Number(parameters.outerWidth || 0).toFixed(1)} x ${Number(parameters.outerDepth || 0).toFixed(1)} x ${Number(parameters.height || 0).toFixed(1)} mm</small></div>
      <button type="button" data-load-upload="${escapeHtml(upload.id || upload.client_ref || "")}">Load</button>
    </article>`;
  }).join("") : `<div class="empty">Saved STL files will appear here.</div>`;
}

async function refreshSavedUploads() {
  savedUploads = (await accountService.loadDesigns()).filter(isSavedStlUpload);
  renderSavedUploads();
}

function applySavedUpload(upload) {
  const parameters = savedParameters(upload);
  currentUploadRef = upload.client_ref || upload.clientRef || upload.id || crypto.randomUUID();
  uploadedFileName = parameters.uploadedFileName || upload.name || "uploaded-model.stl";
  stlBase64 = parameters.stlBase64 || "";
  document.getElementById("printName").value = upload.name || parameters.name || "Uploaded print";
  document.getElementById("outerWidth").value = Number(parameters.outerWidth || 100).toFixed(1);
  document.getElementById("outerDepth").value = Number(parameters.outerDepth || 100).toFixed(1);
  document.getElementById("height").value = Number(parameters.height || 30).toFixed(1);
  document.getElementById("estimatedWeightGrams").value = Number(parameters.estimatedWeightGrams || 25).toFixed(0);
  document.getElementById("filamentMaterial").value = parameters.filamentMaterial || "pla";
  const desiredColour = String(parameters.desiredColourKey || "").replace(/^uploaded-[^-]+-/, "");
  document.getElementById("filamentColour").value = filamentColours.some((colour) => colour.key === desiredColour) ? desiredColour : "all";
  stlMesh = null;
  if (stlBase64) {
    try {
      const bytes = base64ToBytes(stlBase64);
      stlMesh = parseStlMesh(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    } catch {
      stlMesh = null;
    }
  }
  document.getElementById("uploadFileLabel").textContent = `${uploadedFileName} loaded from saved uploads.`;
  document.getElementById("uploadStatus").textContent = `${uploadedFileName} loaded from your saved uploads.`;
  previewTurntable.render();
}

async function saveUploadedStl() {
  if (!stlBase64) throw new Error("Upload an STL before saving it.");
  const name = document.getElementById("printName").value.trim() || uploadedFileName || "Uploaded print";
  await accountService.upsertDesign({
    client_ref: currentUploadRef || crypto.randomUUID(),
    name,
    generator_version: 1,
    parameters: config(),
    metadata: { saved_upload: true, uploaded_file_name: uploadedFileName }
  });
  await refreshSavedUploads();
  window.generatorAuth.toast("Uploaded STL saved");
}

function populatePrinterPreference(quotes) {
  const select = document.getElementById("printerPreference");
  const current = select.value;
  const printers = Array.from(new Map((quotes || []).map((quote) => [quote.printerProfileId, quote])).values());
  select.innerHTML = `<option value="">Any matching printer</option>${printers.map((quote) => (
    `<option value="${escapeHtml(quote.printerProfileId)}">${escapeHtml(quote.providerName)} - ${escapeHtml(quote.basedIn || "Location pending")}</option>`
  )).join("")}`;
  select.disabled = printers.length === 0;
  select.value = printers.some((quote) => quote.printerProfileId === current) ? current : "";
  window.generatorQuotes.setPrinterFilter?.(select.value);
  document.getElementById("printerPreferenceStatus").textContent = printers.length
    ? "Printer choices loaded."
    : "No matching printers returned yet.";
}

document.getElementById("stlFile").addEventListener("change", async (event) => {
  try {
    await loadStl(event.target.files[0]);
  } catch (error) {
    window.generatorAuth.toast(error.message);
  }
});

const uploadDropzone = document.getElementById("uploadDropzone");
["dragenter", "dragover"].forEach((eventName) => uploadDropzone.addEventListener(eventName, (event) => {
  event.preventDefault();
  uploadDropzone.classList.add("dragging");
}));
["dragleave", "drop"].forEach((eventName) => uploadDropzone.addEventListener(eventName, () => uploadDropzone.classList.remove("dragging")));
uploadDropzone.addEventListener("drop", async (event) => {
  event.preventDefault();
  try {
    await loadStl(event.dataTransfer?.files?.[0]);
  } catch (error) {
    window.generatorAuth.toast(error.message);
  }
});

["outerWidth", "outerDepth", "height"].forEach((id) => document.getElementById(id).addEventListener("input", () => {
  stlMesh = null;
  previewTurntable.render();
}));
["estimatedWeightGrams", "filamentMaterial", "filamentColour"].forEach((id) => document.getElementById(id).addEventListener("input", () => previewTurntable.render()));
document.getElementById("printerPreference").addEventListener("change", (event) => {
  window.generatorQuotes.setPrinterFilter?.(event.target.value);
  document.getElementById("printerPreferenceStatus").textContent = event.target.value
    ? "Selected printer quotes only."
    : "Showing every matching printer.";
});
document.getElementById("quoteButton").addEventListener("click", async () => {
  try {
    if (!stlBase64) throw new Error("Upload an STL first.");
    const quotes = await window.generatorQuotes.request(config(), document.getElementById("printName").value);
    populatePrinterPreference(quotes);
    window.generatorAuth.toast("Quotes loaded");
  } catch (error) {
    window.generatorAuth.toast(error.message);
  }
});
document.getElementById("saveUploadButton").addEventListener("click", () => saveUploadedStl().catch((error) => window.generatorAuth.toast(error.message)));
document.getElementById("refreshSavedUploads").addEventListener("click", () => refreshSavedUploads().catch((error) => window.generatorAuth.toast(error.message)));
document.getElementById("savedUploads").addEventListener("click", (event) => {
  const button = event.target.closest("[data-load-upload]");
  if (!button) return;
  const upload = savedUploads.find((candidate) => [candidate.id, candidate.client_ref, candidate.clientRef].includes(button.dataset.loadUpload));
  if (upload) applySavedUpload(upload);
});

window.generatorAuth.initAuth()
  .then((session) => { if (session) refreshSavedUploads().catch(() => {}); })
  .catch((error) => { document.getElementById("loginError").textContent = error.message; });
window.generatorCurrentConfig = config;
window.generatorCurrentName = () => document.getElementById("printName").value.trim() || "Uploaded print";
previewTurntable = window.forgetPreview3d.createTurntable(document.getElementById("preview"), drawPreview);
document.querySelectorAll("[data-preview-turn]").forEach((button) => button.addEventListener("click", () => previewTurntable.turn(Number(button.dataset.previewTurn) * Math.PI / 8)));
document.querySelector("[data-preview-reset]").addEventListener("click", () => previewTurntable.reset());
previewTurntable.render();
