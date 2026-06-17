let stlBase64 = "";
let uploadedFileName = "";

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

function config() {
  return {
    name: document.getElementById("printName").value.trim() || "Uploaded print",
    uploadedFileName,
    stlBase64,
    outerWidth: readNumber("outerWidth"),
    outerDepth: readNumber("outerDepth"),
    height: readNumber("height"),
    estimatedWeightGrams: readNumber("estimatedWeightGrams"),
    filamentMaterial: document.getElementById("filamentMaterial").value,
    filamentName: document.getElementById("filamentName").value,
    filamentKey: `uploaded-${document.getElementById("filamentMaterial").value}`,
    filamentHex: "#8b9499"
  };
}

function drawPreview() {
  const svg = document.getElementById("preview");
  const width = Math.max(1, readNumber("outerWidth"));
  const depth = Math.max(1, readNumber("outerDepth"));
  const height = Math.max(1, readNumber("height"));
  const scale = Math.min(560 / width, 260 / depth);
  const x = 380 - width * scale / 2;
  const y = 250 - depth * scale / 2;
  svg.innerHTML = `
    <ellipse cx="380" cy="335" rx="${Math.max(60, width * scale * .38)}" ry="28" fill="#1e2b33" opacity=".14"/>
    <rect x="${x}" y="${y}" width="${width * scale}" height="${depth * scale}" rx="10" fill="#eef0ed" stroke="#45555b" stroke-width="2"/>
    <rect x="${x + 18}" y="${y - Math.min(80, height * scale * .45)}" width="${Math.max(20, width * scale - 36)}" height="${Math.min(80, height * scale * .45)}" fill="#bdc9ce" stroke="#45555b" opacity=".72"/>
    <text x="380" y="380" text-anchor="middle" fill="#1e2b33" font-size="15" font-weight="800">${width} x ${depth} x ${height} mm</text>
  `;
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
  const bounds = parseBinaryBounds(new DataView(buffer));
  if (bounds) {
    document.getElementById("outerWidth").value = Math.max(1, bounds.width).toFixed(1);
    document.getElementById("outerDepth").value = Math.max(1, bounds.depth).toFixed(1);
    document.getElementById("height").value = Math.max(1, bounds.height).toFixed(1);
  }
  document.getElementById("estimatedWeightGrams").value = Math.max(5, Math.round(file.size / 32000));
  stlBase64 = bytesToBase64(new Uint8Array(buffer));
  document.getElementById("uploadStatus").textContent = `${file.name} loaded. Check the dimensions and estimated grams before quoting.`;
  drawPreview();
}

document.getElementById("stlFile").addEventListener("change", async (event) => {
  try {
    await loadStl(event.target.files[0]);
  } catch (error) {
    window.generatorAuth.toast(error.message);
  }
});

["outerWidth", "outerDepth", "height", "estimatedWeightGrams"].forEach((id) => document.getElementById(id).addEventListener("input", drawPreview));
document.getElementById("quoteButton").addEventListener("click", async () => {
  try {
    if (!stlBase64) throw new Error("Upload an STL first.");
    await window.generatorQuotes.request(config(), document.getElementById("printName").value);
    window.generatorAuth.toast("Quotes loaded");
  } catch (error) {
    window.generatorAuth.toast(error.message);
  }
});

window.generatorAuth.initAuth().catch((error) => { document.getElementById("loginError").textContent = error.message; });
drawPreview();
