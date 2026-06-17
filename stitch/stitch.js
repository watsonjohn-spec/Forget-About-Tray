function parseThreads() {
  return document.getElementById("threads").value.split(/\r?\n/)
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      const match = /^(\S+)\s*(.*)$/.exec(trimmed);
      return { id: `thread-${index}`, number: match?.[1] || String(index + 1), name: match?.[2] || "Thread" };
    })
    .filter(Boolean);
}

function stitchConfig() {
  return {
    threads: parseThreads(),
    columns: Number(document.getElementById("columns").value || 1),
    slotWidth: Number(document.getElementById("slotWidth").value || 16),
    slotDepth: Number(document.getElementById("slotDepth").value || 34),
    gap: 2,
    wallThickness: 1.6,
    wallHeight: 10,
    plateThickness: 2,
    filamentMaterial: "pla",
    filamentKey: "pla-project-lilac",
    filamentName: "Project Lilac",
    filamentHex: "#8d6aa9"
  };
}

function renderStitchPreview() {
  const config = stitchConfig();
  const columns = Math.max(1, config.columns);
  const rows = Math.ceil(config.threads.length / columns);
  const scale = Math.min(620 / (columns * (config.slotWidth + 4)), 320 / (rows * (config.slotDepth + 4)));
  const pitchX = (config.slotWidth + 4) * scale;
  const pitchY = (config.slotDepth + 4) * scale;
  const x0 = 380 - columns * pitchX / 2;
  const y0 = 56;
  const slots = config.threads.map((thread, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = x0 + col * pitchX;
    const y = y0 + row * pitchY;
    return `<g><rect x="${x}" y="${y}" width="${config.slotWidth * scale}" height="${config.slotDepth * scale}" rx="5" fill="#f7f2f8" stroke="#563868" stroke-width="1.5"/><text x="${x + config.slotWidth * scale / 2}" y="${y + config.slotDepth * scale + 13}" text-anchor="middle" fill="#30273a" font-size="10" font-weight="800">${thread.number}</text></g>`;
  }).join("");
  document.getElementById("preview").innerHTML = `<rect x="${x0 - 14}" y="${y0 - 14}" width="${columns * pitchX + 18}" height="${rows * pitchY + 24}" rx="12" fill="#fffaff" stroke="#8d6aa9" stroke-width="2"/>${slots}`;
  document.getElementById("threadStat").textContent = config.threads.length;
  document.getElementById("rowStat").textContent = rows;
  document.getElementById("materialStat").textContent = `${Math.max(15, Math.round(config.threads.length * 2.8))} g est.`;
}

["threads", "columns", "slotWidth", "slotDepth"].forEach((id) => document.getElementById(id).addEventListener("input", renderStitchPreview));
document.getElementById("quoteButton").addEventListener("click", async () => {
  try {
    await window.generatorQuotes.request(stitchConfig(), document.getElementById("projectName").value);
    window.generatorAuth.toast("Quotes loaded");
  } catch (error) {
    window.generatorAuth.toast(error.message);
  }
});

window.generatorAuth.initAuth().catch((error) => { document.getElementById("loginError").textContent = error.message; });
renderStitchPreview();
