let stlBase64 = "";
let uploadedFileName = "";
let stlMesh = null;
const maxPreviewTriangles = 2400;
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
  { key: "brown", name: "Brown", hex: "#6f4e37" }
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

function renderStlMeshPreview(svg, mesh, colour) {
  const transform = window.forgetPreview3d.createTransform({
    width: Math.max(1, mesh.width),
    depth: Math.max(1, mesh.depth),
    height: Math.max(1, mesh.height),
    padding: 30
  });
  const stride = Math.max(1, Math.ceil(mesh.triangles.length / maxPreviewTriangles));
  const light = [0.34, -0.54, 0.77];
  const baseColour = colour === "#8b9499" ? "#9aa5a9" : colour;
  const triangles = mesh.triangles
    .filter((_, index) => index % stride === 0)
    .map((triangle, index) => {
      const points = triangle.points.map((point) => transform.project(point[0], point[1], point[2]));
      const normal = triangle.normal || normalForTriangle(triangle.points);
      const lightAmount = Math.max(0, normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2]);
      const fill = window.forgetPreview3d.mixColour(baseColour, "#ffffff", 0.12 + lightAmount * 0.35);
      const stroke = window.forgetPreview3d.shadeColour(baseColour, -72);
      const depth = triangle.points.reduce((sum, point) => sum + point[1] + point[2] * 0.18, 0) / 3;
      return {
        depth,
        markup: `<polygon points="${points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width=".35" opacity=".94"/>`
      };
    })
    .sort((a, b) => a.depth - b.depth);
  const shadowWidth = Math.max(70, Math.min(230, transform.scale * Math.max(mesh.width, mesh.depth) * 0.36));
  const skipped = stride > 1 ? window.forgetPreview3d.textLabel(
    transform,
    mesh.width / 2,
    mesh.depth + Math.max(10, mesh.depth * 0.06),
    0,
    `${Math.ceil(mesh.triangles.length / stride)} of ${mesh.triangles.length} facets shown`,
    `text-anchor="middle" fill="#1e2b33" font-size="12" font-weight="800" opacity=".72"`
  ) : "";
  svg.innerHTML = `<ellipse cx="380" cy="378" rx="${shadowWidth.toFixed(1)}" ry="24" fill="#1e2b33" opacity=".14"/>${triangles.map((triangle) => triangle.markup).join("")}${skipped}`;
}

function drawPreview() {
  const svg = document.getElementById("preview");
  const width = Math.max(1, readNumber("outerWidth"));
  const depth = Math.max(1, readNumber("outerDepth"));
  const height = Math.max(1, readNumber("height"));
  const colour = selectedFilamentColour().hex;
  if (stlMesh) {
    renderStlMeshPreview(svg, stlMesh, colour);
  } else {
  window.forgetPreview3d.renderBoxes(svg, {
    width,
    depth,
    height,
    colour,
    boxes: [{ x: 0, y: 0, z: 0, w: width, d: depth, h: height, previewClass: "uploaded-print-envelope" }],
    overlay: (transform) => window.forgetPreview3d.textLabel(
      transform,
      width / 2,
      depth + Math.max(12, depth * 0.08),
      0,
      `${width} x ${depth} x ${height} mm`,
      `text-anchor="middle" fill="#1e2b33" font-size="15" font-weight="800"`
    )
  });
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
  document.getElementById("uploadStatus").textContent = stlMesh
    ? `${file.name} loaded. ${stlMesh.triangles.length} facets rendered in the preview.`
    : `${file.name} loaded. Check the dimensions and estimated grams before quoting.`;
  drawPreview();
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

["outerWidth", "outerDepth", "height"].forEach((id) => document.getElementById(id).addEventListener("input", () => {
  stlMesh = null;
  drawPreview();
}));
["estimatedWeightGrams", "filamentMaterial", "filamentColour"].forEach((id) => document.getElementById(id).addEventListener("input", drawPreview));
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

window.generatorAuth.initAuth().catch((error) => { document.getElementById("loginError").textContent = error.message; });
drawPreview();
