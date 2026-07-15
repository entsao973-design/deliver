(function photoQualityModule(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PhotoQuality = api;
  }
}(typeof window !== "undefined" ? window : globalThis, () => {
  const STORAGE_KEY = "delivery_photo_clarity_preferences";
  const MAX_ANALYSIS_SIDE = 512;

  function preferenceId(username) {
    const normalized = String(username || "").trim().toLowerCase();
    return normalized || "__device__";
  }

  function readPreferences(storage) {
    try {
      const value = JSON.parse(storage.getItem(STORAGE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch (error) {
      return {};
    }
  }

  function loadEnabled(storage, username) {
    return readPreferences(storage)[preferenceId(username)] === true;
  }

  function saveEnabled(storage, username, enabled) {
    const preferences = readPreferences(storage);
    preferences[preferenceId(username)] = enabled === true;
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }

  function analyzeRgba(rgba, width, height) {
    if (!rgba || width < 3 || height < 3 || rgba.length < width * height * 4) {
      throw new Error("照片資料不足，無法檢查清晰度");
    }

    const grayscale = new Float32Array(width * height);
    let brightnessTotal = 0;
    for (let index = 0; index < grayscale.length; index += 1) {
      const offset = index * 4;
      const gray = (rgba[offset] * 0.299) + (rgba[offset + 1] * 0.587) + (rgba[offset + 2] * 0.114);
      grayscale[index] = gray;
      brightnessTotal += gray;
    }

    const brightness = brightnessTotal / grayscale.length;
    let contrastTotal = 0;
    for (const gray of grayscale) {
      contrastTotal += (gray - brightness) ** 2;
    }
    const contrast = Math.sqrt(contrastTotal / grayscale.length);

    let laplacianTotal = 0;
    let laplacianSquareTotal = 0;
    let laplacianCount = 0;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = (y * width) + x;
        const laplacian = (4 * grayscale[index])
          - grayscale[index - 1]
          - grayscale[index + 1]
          - grayscale[index - width]
          - grayscale[index + width];
        laplacianTotal += laplacian;
        laplacianSquareTotal += laplacian ** 2;
        laplacianCount += 1;
      }
    }

    const laplacianMean = laplacianTotal / laplacianCount;
    const sharpness = Math.max(0, (laplacianSquareTotal / laplacianCount) - (laplacianMean ** 2));
    const possiblyBlurry = sharpness < 100
      || contrast < 12
      || brightness < 30
      || brightness > 235;

    return {
      possibly_blurry: possiblyBlurry,
      sharpness,
      contrast,
      brightness,
    };
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("照片讀取失敗，無法檢查清晰度"));
      image.src = dataUrl;
    });
  }

  async function analyzeDataUrl(dataUrl) {
    const image = await loadImage(dataUrl);
    const scale = Math.min(1, MAX_ANALYSIS_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(3, Math.round(image.naturalWidth * scale));
    const height = Math.max(3, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("此裝置無法執行照片清晰度檢查");
    }
    context.drawImage(image, 0, 0, width, height);
    const imageData = context.getImageData(0, 0, width, height);
    return analyzeRgba(imageData.data, width, height);
  }

  return {
    analyzeDataUrl,
    analyzeRgba,
    loadEnabled,
    saveEnabled,
  };
}));
