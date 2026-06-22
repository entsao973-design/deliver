(function (root) {
  const TESSERACT_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  let tesseractLoadPromise = null;

  function normalizeInvoiceValue(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[–—−－]/g, "-")
      .replace(/\s+/g, "")
      .replace(/[^A-Z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function invoiceParts(invoiceNo) {
    const full = normalizeInvoiceValue(invoiceNo);
    const dashIndex = full.indexOf("-");
    if (dashIndex > 0 && dashIndex < full.length - 1) {
      return {
        full,
        hasCompanyCode: true,
        companyCode: full.slice(0, dashIndex),
        originalNo: full.slice(dashIndex + 1),
      };
    }
    return {
      full,
      hasCompanyCode: false,
      companyCode: "",
      originalNo: full,
    };
  }

  function extractScanTokens(text) {
    const prepared = String(text || "").toUpperCase().replace(/[–—−－]/g, "-");
    const rawTokens = prepared.match(/[A-Z0-9]+(?:-[A-Z0-9]+)*/g) || [];
    const fullTokens = new Set();
    const partialTokens = new Set();

    for (const rawToken of rawTokens) {
      const token = normalizeInvoiceValue(rawToken);
      if (token.length < 2) {
        continue;
      }
      if (token.includes("-")) {
        fullTokens.add(token);
      } else {
        partialTokens.add(token);
      }
    }

    return {
      fullTokens,
      partialTokens,
      hasPrefixedToken: fullTokens.size > 0,
    };
  }

  function findInvoiceMatches({ text, deliveries }) {
    const tokens = extractScanTokens(text);
    return (deliveries || [])
      .map((delivery) => candidateForDelivery(delivery, tokens))
      .filter(Boolean)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return String(left.delivery.invoice_no || "").localeCompare(String(right.delivery.invoice_no || ""));
      });
  }

  function candidateForDelivery(delivery, tokens) {
    if (!delivery || delivery.status || delivery.local_pending_upload) {
      return null;
    }

    const parts = invoiceParts(delivery.invoice_no);
    if (!parts.full) {
      return null;
    }

    if (tokens.fullTokens.has(parts.full)) {
      return {
        delivery,
        score: 100,
        matchKind: "exact",
        matchedText: parts.full,
      };
    }

    if (!tokens.hasPrefixedToken && tokens.partialTokens.has(parts.full)) {
      return {
        delivery,
        score: 100,
        matchKind: "exact",
        matchedText: parts.full,
      };
    }

    if (parts.hasCompanyCode && !tokens.hasPrefixedToken && tokens.partialTokens.has(parts.originalNo)) {
      return {
        delivery,
        score: 80,
        matchKind: "original",
        matchedText: parts.originalNo,
      };
    }

    return null;
  }

  function outcomeForText({ text, deliveries }) {
    const candidates = findInvoiceMatches({ text, deliveries });
    if (candidates.length === 0) {
      return { type: "none", candidates };
    }
    return {
      type: candidates.length === 1 ? "single" : "multiple",
      candidates,
    };
  }

  async function recognizeText(file) {
    const tesseract = await ensureTesseract();
    const worker = await tesseract.createWorker("eng");
    try {
      const results = [];
      const variants = await prepareOcrImageVariants(file);
      for (const variant of variants) {
        const text = await recognizeOcrVariant(worker, variant);
        if (text) {
          results.push(text);
        }
      }
      return mergeOcrText(results);
    } finally {
      if (worker.terminate) {
        await worker.terminate();
      }
    }
  }

  async function recognizeTextWithCloud(file, options = {}) {
    const request = options.request;
    const token = options.token || "";
    if (!request || !token) {
      throw new Error("cloud_ocr_unavailable");
    }

    const imageData = await fileToDataUrl(file);
    const result = await request("/api/driver/scan-invoice-ocr", {
      method: "POST",
      body: {
        token,
        image_data: imageData,
      },
    });
    return String(result?.text || "");
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!root.FileReader) {
        reject(new Error("cloud_ocr_unavailable"));
        return;
      }
      const reader = new root.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("cloud_ocr_unavailable"));
      reader.readAsDataURL(file);
    });
  }

  async function recognizeOcrVariant(worker, variant) {
    if (worker.setParameters) {
      await worker.setParameters({
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
        tessedit_pageseg_mode: variant.pageSegMode,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
    }
    const result = await worker.recognize(variant.image);
    return result?.data?.text || "";
  }

  async function prepareOcrImageVariants(file) {
    const variants = [{ image: file, pageSegMode: "6" }];
    const prepared = await prepareOcrImage(file);
    if (prepared !== file) {
      variants.push(
        { image: prepared, pageSegMode: "6" },
        { image: prepared, pageSegMode: "7" },
      );
    }
    return variants;
  }

  function mergeOcrText(results) {
    const seen = new Set();
    const lines = [];
    for (const result of results) {
      for (const rawLine of String(result || "").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || seen.has(line)) {
          continue;
        }
        seen.add(line);
        lines.push(line);
      }
    }
    return lines.join("\n");
  }

  async function prepareOcrImage(file) {
    if (!root.document?.createElement || !root.Image || !root.URL?.createObjectURL) {
      return file;
    }

    let objectUrl = "";
    try {
      objectUrl = root.URL.createObjectURL(file);
      const image = await loadOcrImage(objectUrl);
      const width = image.naturalWidth || image.width || 0;
      const height = image.naturalHeight || image.height || 0;
      if (!width || !height) {
        return file;
      }

      const scale = Math.min(3, Math.max(1, 1600 / Math.max(width, height)));
      const canvas = root.document.createElement("canvas");
      const context = canvas?.getContext?.("2d", { willReadFrequently: true });
      if (!canvas || !context) {
        return file;
      }

      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      binarizeOcrCanvas(context, canvas.width, canvas.height);
      return canvas;
    } catch {
      return file;
    } finally {
      if (objectUrl && root.URL?.revokeObjectURL) {
        root.URL.revokeObjectURL(objectUrl);
      }
    }
  }

  function loadOcrImage(objectUrl) {
    return new Promise((resolve, reject) => {
      const image = new root.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("ocr_image_load_failed"));
      image.src = objectUrl;
    });
  }

  function binarizeOcrCanvas(context, width, height) {
    if (!context.getImageData || !context.putImageData) {
      return;
    }

    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let index = 0; index < data.length; index += 4) {
      const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
      const value = contrasted > 168 ? 255 : 0;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
    context.putImageData(imageData, 0, 0);
  }

  function ensureTesseract() {
    if (root.Tesseract) {
      return Promise.resolve(root.Tesseract);
    }
    if (tesseractLoadPromise) {
      return tesseractLoadPromise;
    }
    if (!root.document?.createElement) {
      return Promise.reject(new Error("ocr_unavailable"));
    }

    tesseractLoadPromise = new Promise((resolve, reject) => {
      const script = root.document.createElement("script");
      script.src = TESSERACT_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        if (root.Tesseract) {
          resolve(root.Tesseract);
        } else {
          reject(new Error("ocr_unavailable"));
        }
      };
      script.onerror = () => reject(new Error("ocr_load_failed"));
      (root.document.head || root.document.body || root.document.documentElement).append(script);
    });

    return tesseractLoadPromise;
  }

  const api = {
    normalizeInvoiceValue,
    invoiceParts,
    extractScanTokens,
    findInvoiceMatches,
    outcomeForText,
    recognizeText,
    recognizeTextWithCloud,
    prepareOcrImageVariants,
    prepareOcrImage,
    fileToDataUrl,
  };

  root.ScanInvoice = api;
  if (root.window) {
    root.window.ScanInvoice = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
