const fileInput = document.getElementById("fileInput");
const methodSelect = document.getElementById("methodSelect");
const applyBtn = document.getElementById("applyBtn");

const originalCanvas = document.getElementById("originalCanvas");
const ditherCanvas = document.getElementById("ditherCanvas");
const origCtx = originalCanvas.getContext("2d");
const ditherCtx = ditherCanvas.getContext("2d");

const origInfo = document.getElementById("origInfo");
const ditherInfo = document.getElementById("ditherInfo");

const saveBtn = document.getElementById("saveBtn");

let originalFileName = "";
let originalExt = "";

let currentImageData = null;
let isGrayscale = false;

// Detect grayscale: if R=G=B for all pixels
function detectGrayscale(imageData) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== data[i + 1] || data[i + 1] !== data[i + 2]) {
      return false;
    }
  }
  return true;
}

// Load and display image at original resolution
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  // Extract name and extension
  originalFileName = file.name.replace(/\.[^/.]+$/, "");
  originalExt = file.name.split(".").pop();

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const w = img.width;
      const h = img.height;

      originalCanvas.width = w;
      originalCanvas.height = h;
      ditherCanvas.width = w;
      ditherCanvas.height = h;

      origCtx.drawImage(img, 0, 0, w, h);
      currentImageData = origCtx.getImageData(0, 0, w, h);

      isGrayscale = detectGrayscale(currentImageData);
      origInfo.textContent = `${w} × ${h}px • ${isGrayscale ? "Grayscale" : "RGB"}`;

      ditherCtx.clearRect(0, 0, w, h);
      ditherInfo.textContent = "";

      applyBtn.disabled = false;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// Apply dithering
applyBtn.addEventListener("click", () => {
  if (!currentImageData) return;

  const method = methodSelect.value;
  let result;
  const t0 = performance.now();

  if (isGrayscale) {
    result = applyGrayDither(method, currentImageData);
  } else {
    result = applyColorDither(method, currentImageData);
  }

  const t1 = performance.now();
  ditherCtx.putImageData(result, 0, 0);

  const psnr = computePSNR(currentImageData, result).toFixed(2);
  const ssim = computeSSIM(currentImageData, result).toFixed(3);

  ditherInfo.textContent =
    `${methodName(method)} • ` +
    `${(t1 - t0).toFixed(1)} ms • ` +
    `PSNR=${psnr} • SSIM=${ssim}`;

  saveBtn.disabled = false;
});

// Save dithered image
saveBtn.addEventListener("click", () => {
  if (!currentImageData) return;

  const method = methodSelect.value;
  const ctx = ditherCanvas.getContext("2d");

  // Convert canvas → blob
  ditherCanvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${originalFileName}_${method}.${originalExt}`;
    a.click();

    URL.revokeObjectURL(url);
  });
});

function methodName(v) {
  return { bayer:"Bayer", fs:"Floyd–Steinberg", stucki:"Stucki", jjn:"JJN", rong:"Rong" }[v];
}

/* ------------------------------------------------
   Utility helpers
------------------------------------------------ */

function imageDataToGray(img) {
  const { width, height, data } = img;
  const arr = new Float32Array(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    arr[j] = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
  }
  return arr;
}

function grayToImageData(gray, width, height) {
  const out = new ImageData(width, height);
  for (let i = 0, j = 0; j < gray.length; j++, i += 4) {
    const v = Math.max(0, Math.min(255, gray[j]));
    out.data[i] = out.data[i+1] = out.data[i+2] = v;
    out.data[i+3] = 255;
  }
  return out;
}

function imageDataToRGB(img) {
  const { width, height, data } = img;
  const n = width * height;
  const r = new Float32Array(n);
  const g = new Float32Array(n);
  const b = new Float32Array(n);
  for (let i = 0, j = 0; j < n; j++, i += 4) {
    r[j] = data[i];
    g[j] = data[i+1];
    b[j] = data[i+2];
  }
  return { r, g, b, width, height };
}

function rgbToImageData(r, g, b, width, height) {
  const out = new ImageData(width, height);
  for (let i = 0, j = 0; j < r.length; j++, i += 4) {
    out.data[i]   = Math.max(0, Math.min(255, r[j]));
    out.data[i+1] = Math.max(0, Math.min(255, g[j]));
    out.data[i+2] = Math.max(0, Math.min(255, b[j]));
    out.data[i+3] = 255;
  }
  return out;
}

/* ------------------------------------------------
   Bayer dithering
------------------------------------------------ */

const BAYER_4x4 = [
  [0,  8,  2, 10],
  [12, 4, 14,  6],
  [3, 11,  1,  9],
  [15, 7, 13,  5],
];

// grayscale
function ditherBayerGray(img) {
  const { width, height } = img;
  const gray = imageDataToGray(img);
  const out = new Float32Array(gray);
  const n2 = 16;

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const t = (BAYER_4x4[y&3][x&3] + 0.5) / n2 * 255;
      out[idx] = gray[idx] < t ? 0 : 255;
    }

  return grayToImageData(out, width, height);
}

// RGB per-channel
function ditherBayerColor(img) {
  const { width, height, r, g, b } = imageDataToRGB(img);
  const R = new Float32Array(r);
  const G = new Float32Array(g);
  const B = new Float32Array(b);
  const n2 = 16;

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const t = (BAYER_4x4[y&3][x&3] + 0.5) / n2 * 255;
      R[idx] = r[idx] < t ? 0 : 255;
      G[idx] = g[idx] < t ? 0 : 255;
      B[idx] = b[idx] < t ? 0 : 255;
    }

  return rgbToImageData(R, G, B, width, height);
}

/* ------------------------------------------------
   Error diffusion
------------------------------------------------ */

// Rong-style nonlinear error shaping
function warpError(err) {
  if (err === 0) return 0;
  const sign = err > 0 ? 1 : -1;

  // Normalize to [0, 1] magnitude (original theory assumes error in [-0.5, 0.5])
  let e = Math.abs(err) / 255.0;

  // Rong mapping: e' = e + sin(4πe) / (4π)
  e = e + Math.sin(4 * Math.PI * e) / (4 * Math.PI);

  // Back to 0..255 scale
  return sign * e * 255.0;
}

const KERNELS = {
  fs: {
    divisor: 16,
    weights: [
      {dx:1, dy:0, w:7},
      {dx:-1, dy:1, w:3},
      {dx:0, dy:1, w:5},
      {dx:1, dy:1, w:1},
    ]
  },
  stucki: {
    divisor: 42,
    weights: [
      {dx:1, dy:0, w:8}, {dx:2, dy:0, w:4},
      {dx:-2,dy:1,w:2},{dx:-1,dy:1,w:4},{dx:0,dy:1,w:8},{dx:1,dy:1,w:4},{dx:2,dy:1,w:2},
      {dx:-2,dy:2,w:1},{dx:-1,dy:2,w:2},{dx:0,dy:2,w:4},{dx:1,dy:2,w:2},{dx:2,dy:2,w:1},
    ]
  },
  jjn: {
    divisor: 48,
    weights: [
      {dx:1,dy:0,w:7},{dx:2,dy:0,w:5},
      {dx:-2,dy:1,w:3},{dx:-1,dy:1,w:5},{dx:0,dy:1,w:7},{dx:1,dy:1,w:5},{dx:2,dy:1,w:3},
      {dx:-2,dy:2,w:1},{dx:-1,dy:2,w:3},{dx:0,dy:2,w:5},{dx:1,dy:2,w:3},{dx:2,dy:2,w:1},
    ]
  }
};

function ditherErrorDiffGray(img, kernel, warpError) {
  const { width, height } = img;
  const gray = imageDataToGray(img);
  const buffer = new Float32Array(gray);

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const oldV = buffer[idx];
      const newV = oldV < 128 ? 0 : 255;
      let err = oldV - newV;

      // Rong or other shaping
      if (warpError) err = warpError(err);

      buffer[idx] = newV;

      for (const {dx, dy, w} of kernel.weights) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        buffer[ny * width + nx] += err * (w / kernel.divisor);
      }
    }

  return grayToImageData(buffer, width, height);
}

function ditherErrorDiffColor(img, kernel, warpError) {
  const { width, height, r, g, b } = imageDataToRGB(img);
  const R = new Float32Array(r);
  const G = new Float32Array(g);
  const B = new Float32Array(b);

  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // threshold R
      let oR = R[idx], nR = oR < 128 ? 0 : 255;
      let eR = oR - nR;
      if (warpError) eR = warpError(eR);
      R[idx] = nR;

      // threshold G
      let oG = G[idx], nG = oG < 128 ? 0 : 255;
      let eG = oG - nG;
      if (warpError) eG = warpError(eG);
      G[idx] = nG;

      // threshold B
      let oB = B[idx], nB = oB < 128 ? 0 : 255;
      let eB = oB - nB;
      if (warpError) eB = warpError(eB);
      B[idx] = nB;

      for (const {dx, dy, w} of kernel.weights) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const id = ny * width + nx;
        const f = w / kernel.divisor;

        R[id] += eR * f;
        G[id] += eG * f;
        B[id] += eB * f;
      }
    }

  return rgbToImageData(R, G, B, width, height);
}

/* ------------------------------------------------
   Wrappers
------------------------------------------------ */

function applyGrayDither(method, img) {
  switch (method) {
    case "bayer": return ditherBayerGray(img);
    case "fs": return ditherErrorDiffGray(img, KERNELS.fs);
    case "stucki": return ditherErrorDiffGray(img, KERNELS.stucki);
    case "jjn": return ditherErrorDiffGray(img, KERNELS.jjn);
    case "rong": return ditherErrorDiffGray(img, KERNELS.jjn, warpError);
  }
}

function applyColorDither(method, img) {
  switch (method) {
    case "bayer": return ditherBayerColor(img);
    case "fs": return ditherErrorDiffColor(img, KERNELS.fs);
    case "stucki": return ditherErrorDiffColor(img, KERNELS.stucki);
    case "jjn": return ditherErrorDiffColor(img, KERNELS.jjn);
    case "rong": return ditherErrorDiffColor(img, KERNELS.jjn, warpError);
  }
}

function computePSNR(origData, dithData) {
  let mse = 0;
  const n = origData.data.length;

  for (let i = 0; i < n; i += 4) {
    const dr = origData.data[i]   - dithData.data[i];
    const dg = origData.data[i+1] - dithData.data[i+1];
    const db = origData.data[i+2] - dithData.data[i+2];
    mse += dr*dr + dg*dg + db*db;
  }

  mse /= (n / 4 * 3); // per color channel

  if (mse === 0) return 99; // identical
  return 10 * Math.log10((255 * 255) / mse);
}

function computeSSIM(orig, dith) {
  const w = orig.width, h = orig.height;
  const o = orig.data, d = dith.data;

  // Gaussian 11x11 kernel (sigma ≈ 1.5)
  const K = [
    [0.000003,0.000022,0.000105,0.000323,0.000649,0.000859,0.000649,0.000323,0.000105,0.000022,0.000003],
    [0.000022,0.000147,0.000685,0.002113,0.004245,0.005620,0.004245,0.002113,0.000685,0.000147,0.000022],
    [0.000105,0.000685,0.003198,0.009866,0.019818,0.026225,0.019818,0.009866,0.003198,0.000685,0.000105],
    [0.000323,0.002113,0.009866,0.030454,0.061172,0.080891,0.061172,0.030454,0.009866,0.002113,0.000323],
    [0.000649,0.004245,0.019818,0.061172,0.12229,0.16163,0.12229,0.061172,0.019818,0.004245,0.000649],
    [0.000859,0.005620,0.026225,0.080891,0.16163,0.21380,0.16163,0.080891,0.026225,0.005620,0.000859],
    [0.000649,0.004245,0.019818,0.061172,0.12229,0.16163,0.12229,0.061172,0.019818,0.004245,0.000649],
    [0.000323,0.002113,0.009866,0.030454,0.061172,0.080891,0.061172,0.030454,0.009866,0.002113,0.000323],
    [0.000105,0.000685,0.003198,0.009866,0.019818,0.026225,0.019818,0.009866,0.003198,0.000685,0.000105],
    [0.000022,0.000147,0.000685,0.002113,0.004245,0.005620,0.004245,0.002113,0.000685,0.000147,0.000022],
    [0.000003,0.000022,0.000105,0.000323,0.000649,0.000859,0.000649,0.000323,0.000105,0.000022,0.000003],
  ];

  let ssimSum = 0;
  let count = 0;

  // Per-pixel luminance grayscale
  function lum(i) {
    return 0.299 * i[0] + 0.587 * i[1] + 0.114 * i[2];
  }

  for (let y = 5; y < h - 5; y++) {
    for (let x = 5; x < w - 5; x++) {

      let mu1 = 0, mu2 = 0;

      // compute means
      for (let ky = -5; ky <= 5; ky++) {
        for (let kx = -5; kx <= 5; kx++) {
          const i = 4 * ((y + ky) * w + (x + kx));
          const wK = K[ky+5][kx+5];

          mu1 += lum([o[i], o[i+1], o[i+2]]) * wK;
          mu2 += lum([d[i], d[i+1], d[i+2]]) * wK;
        }
      }

      let sigma1 = 0, sigma2 = 0, sigma12 = 0;

      // compute variances / covariance
      for (let ky = -5; ky <= 5; ky++) {
        for (let kx = -5; kx <= 5; kx++) {
          const i = 4 * ((y + ky) * w + (x + kx));
          const wK = K[ky+5][kx+5];

          const l1 = lum([o[i], o[i+1], o[i+2]]);
          const l2 = lum([d[i], d[i+1], d[i+2]]);

          sigma1  += wK * (l1 - mu1) * (l1 - mu1);
          sigma2  += wK * (l2 - mu2) * (l2 - mu2);
          sigma12 += wK * (l1 - mu1) * (l2 - mu2);
        }
      }

      const C1 = 6.5025;  // (0.01*255)^2
      const C2 = 58.5225; // (0.03*255)^2
      
      const ssim =
        ((2 * mu1 * mu2 + C1) * (2 * sigma12 + C2)) /
        ((mu1 * mu1 + mu2 * mu2 + C1) *
         (sigma1 + sigma2 + C2));

      ssimSum += ssim;
      count++;
    }
  }

  return ssimSum / count;
}
