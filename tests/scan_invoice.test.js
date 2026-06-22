const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ScanInvoice = require("../static/scan-invoice.js");
const source = fs.readFileSync(path.join(__dirname, "..", "static", "scan-invoice.js"), "utf8");

function loadScanInvoice(overrides = {}) {
  const context = {
    window: {},
    module: { exports: {} },
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.ScanInvoice || context.module.exports;
}

test("scan invoice matches hyphenated outsourced numbers by the original number", () => {
  const outcome = ScanInvoice.outcomeForText({
    text: "出貨單號 1234",
    deliveries: [
      { id: "a1", invoice_no: "A1-1234", company: "A1", status: "" },
      { id: "a2", invoice_no: "A2-1234", company: "A2", status: null },
      { id: "own", invoice_no: "1234", company: "Morris", status: "" },
      { id: "suffix", invoice_no: "991234", company: "Morris", status: "" },
      { id: "done", invoice_no: "B1-1234", company: "Done", status: "normal" },
    ],
  });

  assert.equal(outcome.type, "multiple");
  assert.deepEqual(outcome.candidates.map((candidate) => candidate.delivery.id), ["own", "a1", "a2"]);
  assert.deepEqual(outcome.candidates.map((candidate) => candidate.matchKind), ["exact", "original", "original"]);
});

test("scan invoice with company prefix matches only the exact prefixed invoice", () => {
  const outcome = ScanInvoice.outcomeForText({
    text: "A1-1234",
    deliveries: [
      { id: "a1", invoice_no: "A1-1234", company: "A1", status: "" },
      { id: "a2", invoice_no: "A2-1234", company: "A2", status: "" },
      { id: "own", invoice_no: "1234", company: "Morris", status: "" },
    ],
  });

  assert.equal(outcome.type, "single");
  assert.deepEqual(outcome.candidates.map((candidate) => candidate.delivery.id), ["a1"]);
  assert.equal(outcome.candidates[0].matchKind, "exact");
});

test("scan invoice without a match reports none", () => {
  const outcome = ScanInvoice.outcomeForText({
    text: "8888",
    deliveries: [
      { id: "a1", invoice_no: "A1-1234", company: "A1", status: "" },
      { id: "own", invoice_no: "1234", company: "Morris", status: "" },
    ],
  });

  assert.equal(outcome.type, "none");
  assert.deepEqual(outcome.candidates, []);
});

test("OCR recognition preprocesses images before sending them to Tesseract", async () => {
  const file = { name: "hitachi.jpg" };
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        drawImage() {},
        getImageData(width, height) {
          return {
            data: new Uint8ClampedArray(width * height * 4).fill(240),
          };
        },
        putImageData(imageData) {
          this.imageData = imageData;
        },
      };
    },
  };
  const parameters = [];
  const recognizedImages = [];

  class FakeImage {
    constructor() {
      this.naturalWidth = 320;
      this.naturalHeight = 90;
    }

    set src(value) {
      this._src = value;
      this.onload();
    }
  }

  const api = loadScanInvoice({
    Image: FakeImage,
    URL: {
      createObjectURL(nextFile) {
        assert.equal(nextFile, file);
        return "blob:hitachi";
      },
      revokeObjectURL() {},
    },
    document: {
      createElement(tagName) {
        assert.equal(tagName, "canvas");
        return canvas;
      },
    },
    Tesseract: {
      async createWorker(language) {
        assert.equal(language, "eng");
        return {
          async setParameters(nextParameters) {
            parameters.push(nextParameters);
          },
          async recognize(image) {
            recognizedImages.push(image);
            return image === file ? { data: { text: "SN FAN" } } : { data: { text: "HITACHI" } };
          },
          async terminate() {},
        };
      },
    },
  });

  const text = await api.recognizeText(file);

  assert.match(text, /SN FAN/);
  assert.match(text, /HITACHI/);
  assert.equal(recognizedImages[0], file);
  assert.ok(recognizedImages.includes(canvas));
  assert.ok(canvas.width > 320);
  assert.ok(parameters.some((entry) => entry.tessedit_pageseg_mode === "6"));
  assert.ok(parameters.some((entry) => entry.tessedit_pageseg_mode === "7"));
  assert.ok(parameters.some((entry) => entry.user_defined_dpi === "300"));
});

test("scan invoice cloud OCR sends a cropped image to the driver OCR API", async () => {
  const file = { name: "scan-invoice-crop.jpg" };
  const requests = [];
  class FakeFileReader {
    readAsDataURL(nextFile) {
      assert.equal(nextFile, file);
      this.result = "data:image/jpeg;base64,dGVzdA==";
      this.onload();
    }
  }
  const api = loadScanInvoice({ FileReader: FakeFileReader });

  const text = await api.recognizeTextWithCloud(file, {
    token: "driver-token",
    request(path, options) {
      requests.push({ path, options });
      return Promise.resolve({ text: "M1156646" });
    },
  });

  assert.equal(text, "M1156646");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "/api/driver/scan-invoice-ocr");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.body.token, "driver-token");
  assert.equal(requests[0].options.body.image_data, "data:image/jpeg;base64,dGVzdA==");
});
