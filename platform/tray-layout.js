(function exposeTrayLayout(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.trayLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : null, () => {
  const trayOutputModes = ["tray", "tray-and-bases", "bases-only"];

  function normalizeTrayOutputMode(input = {}) {
    if (trayOutputModes.includes(input.outputMode)) return input.outputMode;
    if (input.basesOnly) return "bases-only";
    return input.includeBases ? "tray-and-bases" : "tray";
  }

  function trayHasTray(config = {}) {
    return normalizeTrayOutputMode(config) !== "bases-only";
  }

  function trayIncludesBases(config = {}) {
    return normalizeTrayOutputMode(config) !== "tray";
  }

  function baseLayoutMetrics(count, columns, baseWidth, baseDepth, gap) {
    const rows = Math.ceil(count / columns);
    return {
      columns,
      rows,
      width: columns * baseWidth + Math.max(0, columns - 1) * gap,
      depth: rows * baseDepth + Math.max(0, rows - 1) * gap
    };
  }

  function baseGridPlacements(count, grid, x, y, baseWidth, baseDepth, gap) {
    return Array.from({ length: count }, (_, index) => ({
      x: x + (index % grid.columns) * (baseWidth + gap),
      y: y + Math.floor(index / grid.columns) * (baseDepth + gap),
      w: baseWidth,
      d: baseDepth
    }));
  }

  function packedLooseBaseLayout(config, trayWidth = 0, trayDepth = 0) {
    const count = Math.max(0, Math.round(config.columns) * Math.round(config.rows));
    if (!count || !trayIncludesBases(config)) return { placements: [], width: trayWidth, depth: trayDepth };
    const baseWidth = Number(config.baseSize);
    const baseDepth = Number(config.baseDepth);
    const baseGap = Math.max(1, Number(config.gap) || 0);
    const spacing = Math.max(5, baseGap * 2);
    const basesOnly = !trayHasTray(config);
    let best = null;

    if (basesOnly) {
      for (let columns = 1; columns <= count; columns += 1) {
        const grid = baseLayoutMetrics(count, columns, baseWidth, baseDepth, baseGap);
        const score = Math.max(grid.width, grid.depth) * 8 + Math.abs(grid.width - grid.depth) * 2 + grid.width * grid.depth * 0.001;
        if (!best || score < best.score) best = { score, grids: [{ count, grid, x: 0, y: 0 }], width: grid.width, depth: grid.depth };
      }
    } else {
      for (let rightCount = 0; rightCount <= count; rightCount += 1) {
        const bottomCount = count - rightCount;
        const rightColumns = rightCount ? Array.from({ length: rightCount }, (_, index) => index + 1) : [0];
        const bottomColumns = bottomCount ? Array.from({ length: bottomCount }, (_, index) => index + 1) : [0];
        rightColumns.forEach((rightColumnCount) => {
          const rightGrid = rightCount ? baseLayoutMetrics(rightCount, rightColumnCount, baseWidth, baseDepth, baseGap) : null;
          if (rightGrid && rightGrid.depth > trayDepth + 0.01) return;
          bottomColumns.forEach((bottomColumnCount) => {
            const bottomGrid = bottomCount ? baseLayoutMetrics(bottomCount, bottomColumnCount, baseWidth, baseDepth, baseGap) : null;
            const rightWidth = rightGrid ? spacing + rightGrid.width : 0;
            const bottomDepth = bottomGrid ? spacing + bottomGrid.depth : 0;
            const width = Math.max(trayWidth + rightWidth, bottomGrid?.width || 0);
            const depth = Math.max(trayDepth + bottomDepth, rightGrid?.depth || 0);
            const score = Math.max(width, depth) * 8 + Math.abs(width - depth) * 2 + width * depth * 0.001;
            if (!best || score < best.score) {
              best = {
                score,
                grids: [
                  ...(rightGrid ? [{ count: rightCount, grid: rightGrid, x: trayWidth + spacing, y: 0 }] : []),
                  ...(bottomGrid ? [{ count: bottomCount, grid: bottomGrid, x: 0, y: trayDepth + spacing }] : [])
                ],
                width,
                depth
              };
            }
          });
        });
      }
    }

    const placements = best?.grids.flatMap((gridConfig) => baseGridPlacements(
      gridConfig.count,
      gridConfig.grid,
      gridConfig.x,
      gridConfig.y,
      baseWidth,
      baseDepth,
      baseGap
    )) || [];
    return { placements, width: best?.width || trayWidth, depth: best?.depth || trayDepth };
  }

  return {
    trayOutputModes,
    normalizeTrayOutputMode,
    trayHasTray,
    trayIncludesBases,
    baseLayoutMetrics,
    baseGridPlacements,
    packedLooseBaseLayout
  };
});
