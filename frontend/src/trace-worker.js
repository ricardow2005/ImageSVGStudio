"use strict";

import ImageTracerModule from "imagetracerjs";

const ImageTracer = ImageTracerModule?.default || ImageTracerModule;

self.onmessage = (event) => {
  const payload = event.data || {};
  if (payload.type !== "trace") return;

  try {
    const width = Number(payload.width) || 0;
    const height = Number(payload.height) || 0;
    const pixels = new Uint8ClampedArray(payload.buffer);
    const settings = payload.settings || {};

    if (!width || !height || pixels.length < width * height * 4) {
      throw new Error("Recorte inválido para vetorização.");
    }

    if (settings.removeBackground && settings.background) {
      const background = settings.background;
      const threshold = Number(settings.threshold) || 20;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] < 8) continue;
        const distance = Math.max(
          Math.abs(pixels[index] - background.r),
          Math.abs(pixels[index + 1] - background.g),
          Math.abs(pixels[index + 2] - background.b),
        );
        if (distance <= threshold) pixels[index + 3] = 0;
      }
    }

    const svg = ImageTracer.imagedataToSVG(
      { width, height, data: pixels },
      {
        ltres: 1,
        qtres: 1,
        pathomit: Math.max(1, Math.round(Math.min(width, height) * 0.0025)),
        rightangleenhance: true,
        colorsampling: 2,
        numberofcolors: Math.max(4, Math.min(64, Number(settings.colors) || 24)),
        mincolorratio: 0.001,
        colorquantcycles: 2,
        layering: 0,
        strokewidth: 0,
        linefilter: false,
        scale: 1,
        roundcoords: 1,
        viewbox: true,
        desc: false,
      },
    );

    self.postMessage({ type: "result", id: payload.id, svg });
  } catch (error) {
    self.postMessage({ type: "error", id: payload.id, message: error?.message || "Falha ao gerar o SVG." });
  }
};
