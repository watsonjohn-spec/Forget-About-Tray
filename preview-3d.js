(() => {
  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function hexToRgb(hex) {
    const value = String(hex || "#777777").replace("#", "");
    const number = Number.parseInt(value.length === 3
      ? value.split("").map((part) => part + part).join("")
      : value, 16);
    if (!Number.isFinite(number)) return { r: 119, g: 119, b: 119 };
    return { r: number >> 16 & 255, g: number >> 8 & 255, b: number & 255 };
  }

  function rgbToHex({ r, g, b }) {
    const channel = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
    return `#${channel(r)}${channel(g)}${channel(b)}`;
  }

  function mixColour(hex, target, amount) {
    const source = hexToRgb(hex);
    const destination = hexToRgb(target);
    return rgbToHex({
      r: source.r + (destination.r - source.r) * amount,
      g: source.g + (destination.g - source.g) * amount,
      b: source.b + (destination.b - source.b) * amount
    });
  }

  function shadeColour(hex, amount) {
    const source = hexToRgb(hex);
    return rgbToHex({
      r: source.r + amount,
      g: source.g + amount,
      b: source.b + amount
    });
  }

  function projectRaw(point, centerX, centerY, yaw, pitch) {
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    const rotatedX = Math.cos(yaw) * dx - Math.sin(yaw) * dy;
    const rotatedY = Math.sin(yaw) * dx + Math.cos(yaw) * dy;
    return {
      x: rotatedX,
      y: rotatedY * Math.sin(pitch) - point.z * Math.cos(pitch)
    };
  }

  function boundsPoints(width, depth, height, boxes = [], cylinders = []) {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: width, y: depth, z: height }
    ];
    boxes.forEach((box) => {
      points.push(
        { x: box.x, y: box.y, z: box.z || 0 },
        { x: box.x + box.w, y: box.y + box.d, z: (box.z || 0) + box.h }
      );
    });
    cylinders.forEach((cylinder) => {
      points.push(
        { x: cylinder.cx - cylinder.rx, y: cylinder.cy - cylinder.ry, z: cylinder.z || 0 },
        { x: cylinder.cx + cylinder.rx, y: cylinder.cy + cylinder.ry, z: (cylinder.z || 0) + cylinder.h }
      );
    });
    return points;
  }

  function createTransform(options) {
    const width = Math.max(1, Number(options.width) || 1);
    const depth = Math.max(1, Number(options.depth) || 1);
    const height = Math.max(1, Number(options.height) || 1);
    const yaw = Number.isFinite(options.yaw) ? options.yaw : -Math.PI / 4;
    const pitch = Number.isFinite(options.pitch) ? options.pitch : Math.PI / 5;
    const viewWidth = options.viewWidth || 760;
    const viewHeight = options.viewHeight || 420;
    const padding = options.padding || 36;
    const allPoints = boundsPoints(width, depth, height, options.boxes || [], options.cylinders || []);
    const raw = allPoints.map((point) => projectRaw(point, width / 2, depth / 2, yaw, pitch));
    const minX = Math.min(...raw.map((point) => point.x));
    const maxX = Math.max(...raw.map((point) => point.x));
    const minY = Math.min(...raw.map((point) => point.y));
    const maxY = Math.max(...raw.map((point) => point.y));
    const scale = Math.min(
      (viewWidth - padding * 2) / Math.max(1, maxX - minX),
      (viewHeight - padding * 2) / Math.max(1, maxY - minY)
    );
    const offsetX = viewWidth / 2 - ((minX + maxX) / 2) * scale;
    const offsetY = viewHeight / 2 - ((minY + maxY) / 2) * scale;
    const project = (x, y, z = 0) => {
      const point = projectRaw({ x, y, z }, width / 2, depth / 2, yaw, pitch);
      return { x: offsetX + point.x * scale, y: offsetY + point.y * scale };
    };
    return { project, scale, yaw, pitch, width, depth, height };
  }

  function polygon(points) {
    return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  }

  function faceDepth(transform, points) {
    return points.reduce((sum, point) => sum + projectRaw(point, transform.width / 2, transform.depth / 2, transform.yaw, transform.pitch).y, 0) / points.length;
  }

  function boxFaces(box, transform, fallbackColour, opacity, index) {
    const x1 = box.x;
    const y1 = box.y;
    const z1 = box.z || 0;
    const x2 = box.x + box.w;
    const y2 = box.y + box.d;
    const z2 = z1 + box.h;
    const colour = box.previewColour || fallbackColour;
    const faces = [
      { points: [{ x: x1, y: y1, z: z2 }, { x: x2, y: y1, z: z2 }, { x: x2, y: y2, z: z2 }, { x: x1, y: y2, z: z2 }], fill: mixColour(colour, "#ffffff", 0.32), stroke: shadeColour(colour, -62) },
      { points: [{ x: x1, y: y2, z: z1 }, { x: x2, y: y2, z: z1 }, { x: x2, y: y2, z: z2 }, { x: x1, y: y2, z: z2 }], fill: shadeColour(colour, -35), stroke: shadeColour(colour, -70) },
      { points: [{ x: x2, y: y1, z: z1 }, { x: x2, y: y2, z: z1 }, { x: x2, y: y2, z: z2 }, { x: x2, y: y1, z: z2 }], fill: shadeColour(colour, -55), stroke: shadeColour(colour, -80) },
      { points: [{ x: x1, y: y1, z: z1 }, { x: x2, y: y1, z: z1 }, { x: x2, y: y1, z: z2 }, { x: x1, y: y1, z: z2 }], fill: shadeColour(colour, -18), stroke: shadeColour(colour, -70) },
      { points: [{ x: x1, y: y1, z: z1 }, { x: x1, y: y2, z: z1 }, { x: x1, y: y2, z: z2 }, { x: x1, y: y1, z: z2 }], fill: shadeColour(colour, -48), stroke: shadeColour(colour, -80) }
    ];
    return faces.map((face, faceIndex) => ({
      markup: `<polygon class="${box.previewClass || ""}" points="${polygon(face.points.map((point) => transform.project(point.x, point.y, point.z)))}" fill="${face.fill}" stroke="${face.stroke}" stroke-width="1.1" opacity="${box.previewOpacity || opacity}"/>`,
      depth: faceDepth(transform, face.points) + index * 0.0001 + faceIndex * 0.00001
    }));
  }

  function ellipsePoints(cx, cy, z, rx, ry, segments = 28) {
    return Array.from({ length: segments }, (_, index) => {
      const angle = Math.PI * 2 * index / segments;
      return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry, z };
    });
  }

  function cylinderFaces(cylinder, transform, fallbackColour, opacity, index) {
    const z1 = cylinder.z || 0;
    const z2 = z1 + cylinder.h;
    const segments = cylinder.segments || 28;
    const colour = cylinder.previewColour || fallbackColour;
    const top = ellipsePoints(cylinder.cx, cylinder.cy, z2, cylinder.rx, cylinder.ry, segments);
    const bottom = ellipsePoints(cylinder.cx, cylinder.cy, z1, cylinder.rx, cylinder.ry, segments);
    const faces = [{
      points: top,
      fill: mixColour(colour, "#ffffff", 0.38),
      stroke: shadeColour(colour, -68),
      opacity: cylinder.previewOpacity || opacity
    }];
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const shade = Math.sin(Math.PI * 2 * segment / segments + transform.yaw) > 0 ? -34 : -58;
      faces.push({
        points: [bottom[segment], bottom[next], top[next], top[segment]],
        fill: shadeColour(colour, shade),
        stroke: shadeColour(colour, -80),
        opacity: cylinder.previewOpacity || opacity
      });
    }
    return faces.map((face, faceIndex) => ({
      markup: `<polygon class="${cylinder.previewClass || ""}" points="${polygon(face.points.map((point) => transform.project(point.x, point.y, point.z)))}" fill="${face.fill}" stroke="${face.stroke}" stroke-width="${cylinder.strokeWidth || 0.9}" opacity="${face.opacity}"/>`,
      depth: faceDepth(transform, face.points) + index * 0.0001 + faceIndex * 0.00001
    }));
  }

  function ellipsePolygon(transform, cx, cy, z, rx, ry, attributes = "", segments = 32) {
    const points = ellipsePoints(cx, cy, z, rx, ry, segments).map((point) => transform.project(point.x, point.y, point.z));
    return `<polygon points="${polygon(points)}" ${attributes}/>`;
  }

  function textLabel(transform, x, y, z, label, attributes = "") {
    const point = transform.project(x, y, z);
    return `<text x="${point.x.toFixed(2)}" y="${point.y.toFixed(2)}" ${attributes}>${label}</text>`;
  }

  function lineMarkup(transform, start, end, attributes = "") {
    const a = transform.project(start.x, start.y, start.z || 0);
    const b = transform.project(end.x, end.y, end.z || 0);
    return `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" ${attributes}/>`;
  }

  function millimetres(value) {
    const number = Number(value) || 0;
    return `${Number.isInteger(number) ? number : number.toFixed(1)} mm`;
  }

  function dimensionOverlay(transform, options = {}) {
    const width = Number(options.width || transform.width);
    const depth = Number(options.depth || transform.depth);
    const height = Number(options.height || transform.height);
    if (options.showDimensions === false || width <= 0 || depth <= 0) return "";
    const z = Math.max(0.1, height + Math.max(1.2, height * 0.04));
    const stroke = options.dimensionStroke || "#263c2b";
    const text = options.dimensionText || "#1e2921";
    const line = `stroke="${stroke}" stroke-width="1.05" stroke-dasharray="4 4" opacity=".54" vector-effect="non-scaling-stroke"`;
    const label = `fill="${text}" font-size="11" font-weight="900" paint-order="stroke" stroke="rgba(255,255,255,.78)" stroke-width="3" stroke-linejoin="round"`;
    return [
      lineMarkup(transform, { x: 0, y: 0, z }, { x: width, y: 0, z }, line),
      lineMarkup(transform, { x: width, y: 0, z }, { x: width, y: depth, z }, line),
      lineMarkup(transform, { x: width, y: depth, z: 0 }, { x: width, y: depth, z }, line),
      textLabel(transform, width / 2, -Math.max(8, depth * 0.04), z, millimetres(width), `text-anchor="middle" ${label}`),
      textLabel(transform, width + Math.max(8, width * 0.035), depth / 2, z, millimetres(depth), `text-anchor="middle" ${label}`),
      height > 1 ? textLabel(transform, width + Math.max(10, width * 0.05), depth + Math.max(10, depth * 0.05), height / 2, millimetres(height), `text-anchor="middle" ${label}`) : ""
    ].join("");
  }

  function plateSplitOverlay(transform, options = {}) {
    if (options.showPlateSplits === false) return "";
    const width = Number(options.width || transform.width);
    const depth = Number(options.depth || transform.depth);
    const height = Number(options.height || transform.height);
    const threshold = Math.max(80, Number(options.splitThreshold || 250));
    const columns = Math.max(1, Math.ceil(width / threshold));
    const rows = Math.max(1, Math.ceil(depth / threshold));
    if (columns === 1 && rows === 1) return "";
    const z = height + Math.max(1.8, height * 0.07);
    const stroke = options.splitStroke || "#9a6a2d";
    const line = `stroke="${stroke}" stroke-width="1.35" stroke-dasharray="7 5" opacity=".72" vector-effect="non-scaling-stroke"`;
    const lines = [];
    for (let column = 1; column < columns; column += 1) {
      const x = width * column / columns;
      lines.push(lineMarkup(transform, { x, y: 0, z }, { x, y: depth, z }, line));
    }
    for (let row = 1; row < rows; row += 1) {
      const y = depth * row / rows;
      lines.push(lineMarkup(transform, { x: 0, y, z }, { x: width, y, z }, line));
    }
    lines.push(textLabel(
      transform,
      width / 2,
      depth + Math.max(18, depth * 0.08),
      z,
      `${columns * rows} print plates`,
      `text-anchor="middle" fill="${stroke}" font-size="11" font-weight="900" paint-order="stroke" stroke="rgba(255,255,255,.82)" stroke-width="3"`
    ));
    return lines.join("");
  }

  function renderBoxes(svg, options) {
    const boxes = options.boxes || [];
    const cylinders = options.cylinders || [];
    const transform = createTransform({ ...options, boxes, cylinders });
    const colour = options.colour || "#777777";
    const opacity = options.opacity || 1;
    const stage = svg.closest?.(".preview-stage");
    if (stage) {
      stage.dataset.previewReady = "true";
      stage.style.setProperty("--preview-accent", colour);
    }
    const faces = [
      ...boxes.flatMap((box, index) => boxFaces(box, transform, colour, opacity, index)),
      ...cylinders.flatMap((cylinder, index) => cylinderFaces(cylinder, transform, colour, opacity, boxes.length + index))
    ].sort((a, b) => a.depth - b.depth);
    const shadowWidth = Math.max(90, Math.min(250, transform.scale * Math.max(transform.width, transform.depth) * 0.36));
    const shadow = `<ellipse cx="${(options.viewWidth || 760) / 2}" cy="${(options.viewHeight || 420) - 42}" rx="${shadowWidth.toFixed(1)}" ry="24" fill="#1e2b33" opacity=".14"/>`;
    const dimensions = dimensionOverlay(transform, options);
    const splitLines = plateSplitOverlay(transform, options);
    const overlay = typeof options.overlay === "function" ? options.overlay(transform) : (options.overlay || "");
    svg.innerHTML = `${shadow}${faces.map((face) => face.markup).join("")}${splitLines}${dimensions}${overlay}`;
    return { transform, faces };
  }

  function createTurntable(svg, render, options = {}) {
    const initialYaw = Number.isFinite(options.yaw) ? options.yaw : -Math.PI / 4;
    const initialPitch = Number.isFinite(options.pitch) ? options.pitch : Math.PI / 5;
    const state = { yaw: initialYaw, pitch: initialPitch, drag: null };
    const redraw = () => render({ yaw: state.yaw, pitch: state.pitch });
    const clampPitch = (pitch) => clamp(pitch, options.minPitch || 0.12, options.maxPitch || 1.35);
    svg.style.touchAction = "none";
    svg.addEventListener("pointerdown", (event) => {
      state.drag = { x: event.clientX, y: event.clientY, yaw: state.yaw, pitch: state.pitch };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    });
    svg.addEventListener("pointermove", (event) => {
      if (!state.drag) return;
      state.yaw = state.drag.yaw + (event.clientX - state.drag.x) * (options.yawSpeed || 0.012);
      state.pitch = clampPitch(state.drag.pitch - (event.clientY - state.drag.y) * (options.pitchSpeed || 0.008));
      redraw();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach((name) => {
      svg.addEventListener(name, () => { state.drag = null; });
    });
    return {
      state,
      render: redraw,
      reset() {
        state.yaw = initialYaw;
        state.pitch = initialPitch;
        redraw();
      },
      turn(delta) {
        state.yaw += delta;
        redraw();
      }
    };
  }

  window.forgetPreview3d = {
    createTurntable,
    createTransform,
    dimensionOverlay,
    ellipsePolygon,
    mixColour,
    plateSplitOverlay,
    renderBoxes,
    shadeColour,
    textLabel
  };
})();
