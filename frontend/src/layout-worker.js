"use strict";

self.onmessage = (event) => {
  const payload = event.data || {};
  if (payload.type !== "detect") return;

  try {
    const width = Number(payload.width) || 0;
    const height = Number(payload.height) || 0;
    const settings = payload.settings || {};
    const rgba = new Uint8ClampedArray(payload.buffer);
    if (!width || !height || rgba.length < width * height * 4) {
      throw new Error("Imagem de análise inválida.");
    }

    self.postMessage({ type: "progress", value: 0.2, label: "Mapeando fundo" });
    const background = dominantBorderColor(rgba, width, height);
    const mask = new Uint8Array(width * height);
    const rows = new Uint32Array(height);
    const threshold = Number(settings.threshold) || 20;

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const pixel = rowOffset + x;
        const offset = pixel * 4;
        if (rgba[offset + 3] < 18) continue;
        const distance = Math.max(
          Math.abs(rgba[offset] - background.r),
          Math.abs(rgba[offset + 1] - background.g),
          Math.abs(rgba[offset + 2] - background.b),
        );
        if (distance > threshold) {
          mask[pixel] = 1;
          rows[y]++;
        }
      }
    }

    self.postMessage({ type: "progress", value: 0.55, label: "Separando regiões" });
    const detail = Math.max(1, Math.min(6, Number(settings.detail) || 4));
    const rowThreshold = [0, 0.004, 0.007, 0.012, 0.018, 0.026, 0.036][detail];
    const minGap = Math.max(3, Math.round(height * 0.004));
    const rowActivity = Array.from(rows, (count) => count / Math.max(1, width));
    const rowGaps = findLowBands(rowActivity, rowThreshold, minGap)
      .filter((gap) => gap.start > 1 && gap.end < height - 2);

    const sections = [];
    let sectionStart = 0;
    for (const gap of rowGaps) {
      if (gap.start - sectionStart >= 12) {
        sections.push({ y: sectionStart, height: gap.start - sectionStart });
      }
      sectionStart = gap.end + 1;
    }
    if (height - sectionStart >= 12) {
      sections.push({ y: sectionStart, height: height - sectionStart });
    }
    if (!sections.length) sections.push({ y: 0, height });

    let boxes = [];
    for (const section of sections) {
      const split = splitSectionByColumns(mask, width, height, section, detail);
      for (const candidate of split) {
        const trimmed = trimToMask(mask, width, height, candidate, detail >= 5 ? 1 : 3);
        if (!trimmed) continue;
        if (detail >= 5 && trimmed.height > 90) {
          boxes.push(...splitBoxByRows(mask, width, height, trimmed, detail));
        } else {
          boxes.push(trimmed);
        }
      }
    }

    boxes = boxes
      .map((box) => trimToMask(mask, width, height, box, 2) || box)
      .filter((box) => box.width >= 14 && box.height >= 14)
      .filter((box) => box.width * box.height >= width * height * [0, 0.0012, 0.0009, 0.00065, 0.00035, 0.0002, 0.0001][detail]);

    boxes = dedupeBoxes(boxes);
    boxes.sort((a, b) => a.y - b.y || a.x - b.x);
    const maxBoxes = [0, 18, 28, 48, 80, 130, 220][detail];
    boxes = boxes.slice(0, maxBoxes);
    if (!boxes.length) boxes = [{ x: 0, y: 0, width, height }];

    self.postMessage({ type: "result", boxes, background });
  } catch (error) {
    self.postMessage({ type: "error", message: error?.message || "Falha ao analisar a imagem." });
  }
};

function dominantBorderColor(rgba, width, height) {
  const bins = new Map();
  const step = Math.max(1, Math.round(Math.max(width, height) / 700));
  const border = Math.max(2, Math.round(Math.min(width, height) * 0.018));
  const add = (x, y) => {
    const index = (y * width + x) * 4;
    if (rgba[index + 3] < 20) return;
    const r = rgba[index];
    const g = rgba[index + 1];
    const b = rgba[index + 2];
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const entry = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    entry.count++;
    entry.r += r;
    entry.g += g;
    entry.b += b;
    bins.set(key, entry);
  };

  for (let x = 0; x < width; x += step) {
    for (let y = 0; y < border; y += step) add(x, y);
    for (let y = Math.max(0, height - border); y < height; y += step) add(x, y);
  }
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < border; x += step) add(x, y);
    for (let x = Math.max(0, width - border); x < width; x += step) add(x, y);
  }

  let best = null;
  bins.forEach((entry) => {
    if (!best || entry.count > best.count) best = entry;
  });
  if (!best?.count) return { r: 255, g: 255, b: 255 };
  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
  };
}

function findLowBands(activity, threshold, minimum) {
  const bands = [];
  let start = -1;
  for (let index = 0; index < activity.length; index++) {
    if (activity[index] <= threshold) {
      if (start < 0) start = index;
    } else if (start >= 0) {
      if (index - start >= minimum) bands.push({ start, end: index - 1 });
      start = -1;
    }
  }
  if (start >= 0 && activity.length - start >= minimum) {
    bands.push({ start, end: activity.length - 1 });
  }
  return bands;
}

function splitSectionByColumns(mask, width, height, section, detail) {
  const cols = new Uint32Array(width);
  const y0 = Math.max(0, section.y);
  const y1 = Math.min(height, section.y + section.height);
  for (let x = 0; x < width; x++) {
    let count = 0;
    for (let y = y0; y < y1; y++) count += mask[y * width + x] ? 1 : 0;
    cols[x] = count;
  }
  const activity = Array.from(cols, (count) => count / Math.max(1, y1 - y0));
  const threshold = [0, 0.004, 0.008, 0.012, 0.018, 0.026, 0.034][detail];
  const gaps = findLowBands(activity, threshold, Math.max(4, Math.round(width * 0.008)))
    .filter((gap) => gap.start > 4 && gap.end < width - 5);

  if (!gaps.length || detail <= 2) {
    return [{ x: 0, y: y0, width, height: y1 - y0 }];
  }
  const pieces = [];
  let x0 = 0;
  for (const gap of gaps) {
    if (gap.start - x0 >= 18) {
      pieces.push({ x: x0, y: y0, width: gap.start - x0, height: y1 - y0 });
    }
    x0 = gap.end + 1;
  }
  if (width - x0 >= 18) {
    pieces.push({ x: x0, y: y0, width: width - x0, height: y1 - y0 });
  }
  return pieces.length > 1 ? pieces : [{ x: 0, y: y0, width, height: y1 - y0 }];
}

function splitBoxByRows(mask, width, height, box, detail) {
  const rows = new Uint32Array(box.height);
  for (let ly = 0; ly < box.height; ly++) {
    let count = 0;
    const y = box.y + ly;
    for (let x = box.x; x < box.x + box.width; x++) {
      count += mask[y * width + x] ? 1 : 0;
    }
    rows[ly] = count;
  }
  const activity = Array.from(rows, (count) => count / Math.max(1, box.width));
  const threshold = detail >= 6 ? 0.012 : 0.007;
  const gaps = findLowBands(activity, threshold, Math.max(3, Math.round(box.height * 0.02)))
    .filter((gap) => gap.start > 3 && gap.end < box.height - 4);
  if (!gaps.length) return [box];

  const pieces = [];
  let y0 = 0;
  for (const gap of gaps) {
    if (gap.start - y0 >= 14) {
      pieces.push({ x: box.x, y: box.y + y0, width: box.width, height: gap.start - y0 });
    }
    y0 = gap.end + 1;
  }
  if (box.height - y0 >= 14) {
    pieces.push({ x: box.x, y: box.y + y0, width: box.width, height: box.height - y0 });
  }
  return pieces.length > 1 ? pieces : [box];
}

function trimToMask(mask, width, height, box, padding = 2) {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(width, Math.ceil(box.x + box.width));
  const y1 = Math.min(height, Math.ceil(box.y + box.height));
  let minX = x1;
  let minY = y1;
  let maxX = -1;
  let maxY = -1;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!mask[y * width + x]) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function dedupeBoxes(boxes) {
  const result = [];
  for (const box of boxes) {
    const duplicate = result.some((candidate) =>
      Math.abs(candidate.x - box.x) <= 3 &&
      Math.abs(candidate.y - box.y) <= 3 &&
      Math.abs(candidate.width - box.width) <= 5 &&
      Math.abs(candidate.height - box.height) <= 5,
    );
    if (!duplicate) result.push(box);
  }
  return result;
}
