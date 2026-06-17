function value(id) {
  return document.getElementById(id).value;
}

function number(id) {
  return Number(value(id) || 0);
}

function paintConfig() {
  return {
    paintType: value("paintType"),
    paintCount: number("paintCount"),
    paintDiameter: number("paintDiameter"),
    brushSlots: number("brushSlots"),
    columns: number("columns"),
    wallHeight: number("wallHeight"),
    clearance: 2,
    wallThickness: 2,
    plateThickness: 2.4,
    filamentMaterial: "pla",
    filamentKey: "pla-workshop-green",
    filamentName: "Workshop Green",
    filamentHex: "#4f7b6f"
  };
}

function bottleDiameter(config) {
  if (config.paintType === "citadel") return 34;
  if (config.paintType === "vallejo") return 25;
  return config.paintDiameter;
}

function renderPaintPreview() {
  const config = paintConfig();
  const diameter = bottleDiameter(config);
  const columns = Math.max(1, config.columns);
  const rows = Math.ceil(config.paintCount / columns);
  const slot = diameter + 4;
  const scale = Math.min(620 / (columns * slot), 300 / (rows * slot + (config.brushSlots ? 30 : 0)));
  const x0 = 380 - columns * slot * scale / 2;
  const y0 = 70;
  let circles = "";
  for (let index = 0; index < config.paintCount; index += 1) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    circles += `<circle cx="${x0 + col * slot * scale + slot * scale / 2}" cy="${y0 + row * slot * scale + slot * scale / 2}" r="${diameter * scale / 2}" fill="#4f7b6f" opacity=".22" stroke="#294f45" stroke-width="2"/>`;
  }
  const brushY = y0 + rows * slot * scale + 18;
  const brushes = config.brushSlots ? Array.from({ length: config.brushSlots }, (_, index) => `<line x1="${x0 + index * columns * slot * scale / Math.max(1, config.brushSlots - 1)}" y1="${brushY}" x2="${x0 + index * columns * slot * scale / Math.max(1, config.brushSlots - 1)}" y2="${brushY + 34}" stroke="#294f45" stroke-width="2"/>`).join("") : "";
  document.getElementById("preview").innerHTML = `<rect x="${x0 - 14}" y="${y0 - 14}" width="${columns * slot * scale + 28}" height="${rows * slot * scale + (config.brushSlots ? 68 : 28)}" rx="12" fill="#fbfdf9" stroke="#4f7b6f" stroke-width="2"/>${circles}${brushes}`;
  document.getElementById("paintStat").textContent = config.paintCount;
  document.getElementById("rowStat").textContent = rows;
  document.getElementById("brushStat").textContent = config.brushSlots;
  document.getElementById("materialStat").textContent = `${Math.max(20, Math.round(config.paintCount * diameter * .18 + config.brushSlots * 1.5))} g est.`;
}

document.querySelectorAll("input,select").forEach((input) => input.addEventListener("input", renderPaintPreview));
document.getElementById("quoteButton").addEventListener("click", async () => {
  try {
    await window.generatorQuotes.request(paintConfig(), value("projectName"));
    window.generatorAuth.toast("Quotes loaded");
  } catch (error) {
    window.generatorAuth.toast(error.message);
  }
});

window.generatorAuth.initAuth().catch((error) => { document.getElementById("loginError").textContent = error.message; });
renderPaintPreview();
