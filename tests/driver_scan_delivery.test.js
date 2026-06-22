const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "static", "driver-scan-delivery.js"), "utf8");

function loadScanDelivery(overrides = {}) {
  const context = {
    window: {},
    document: {
      createElement(tagName) {
        return {
          tagName,
          children: [],
          listeners: {},
          append(...children) {
            this.children.push(...children);
          },
          addEventListener(name, handler) {
            this.listeners[name] = handler;
          },
        };
      },
    },
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, api: context.window.DriverScanDelivery };
}

function createEls() {
  const appended = [];
  const canvasCalls = [];
  return {
    appended,
    canvasCalls,
    els: {
      scanInvoiceButton: { disabled: false },
      scanInvoiceInput: {
        value: "",
        files: [],
        clicked: false,
        click() {
          this.clicked = true;
        },
      },
      scanInvoiceDialog: {
        open: false,
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
      },
      scanInvoiceVideo: {
        videoWidth: 1000,
        videoHeight: 500,
        srcObject: null,
        played: false,
        async play() {
          this.played = true;
        },
        getBoundingClientRect() {
          return { left: 10, top: 20, width: 400, height: 200 };
        },
      },
      scanInvoiceFrame: {
        getBoundingClientRect() {
          return { left: 110, top: 70, width: 200, height: 80 };
        },
      },
      scanInvoiceZoomOutButton: { disabled: false },
      scanInvoiceZoomInButton: { disabled: false },
      scanInvoiceZoomSlider: {
        min: "1",
        max: "3",
        step: "0.1",
        value: "1",
      },
      scanInvoiceZoomValue: { textContent: "" },
      scanInvoiceCanvas: {
        width: 0,
        height: 0,
        getContext(type) {
          assert.equal(type, "2d");
          return {
            drawImage(...args) {
              canvasCalls.push(args);
            },
          };
        },
        toBlob(callback, type, quality) {
          callback({ type, quality, cropped: true });
        },
      },
      captureScanInvoiceButton: { disabled: false },
      closeScanInvoiceButton: {},
      smartPhotoStatusNormal: { checked: false },
      smartPhotoStatusAbnormal: { checked: false },
      smartPhotoTitle: { textContent: "" },
      smartPhotoCandidates: {
        replaceChildren() {
          appended.length = 0;
        },
        append(child) {
          appended.push(child);
        },
      },
      smartPhotoDialog: {
        open: false,
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
      },
    },
  };
}

test("DriverScanDelivery recognizes an invoice image and starts capture from the selected candidate", async () => {
  const delivery = { id: "a1", company: "A1", invoice_no: "A1-1234", customer: "Customer", status: "" };
  const { appended, els } = createEls();
  const messages = [];
  let captured = null;
  const file = { name: "invoice.jpg" };
  const { api } = loadScanDelivery({
    ScanInvoice: {
      async recognizeText(nextFile) {
        assert.equal(nextFile, file);
        return "1234";
      },
      outcomeForText({ text, deliveries }) {
        assert.equal(text, "1234");
        assert.deepEqual(deliveries, [delivery]);
        return { type: "single", candidates: [{ delivery, matchKind: "original", matchedText: "1234" }] };
      },
    },
  });

  const controller = api.createController({
    els,
    state: { deliveries: [delivery], pendingUploads: [] },
    offlineQueueApi: null,
    startCapture(nextDelivery, status) {
      captured = { delivery: nextDelivery, status };
    },
    setMessage(message, isError) {
      messages.push({ message, isError });
    },
  });

  controller.handleScanInvoice();
  assert.equal(els.scanInvoiceInput.clicked, true);

  els.scanInvoiceInput.files = [file];
  await controller.handleScanInvoiceFileChange();

  assert.equal(els.scanInvoiceButton.disabled, false);
  assert.equal(els.scanInvoiceInput.value, "");
  assert.equal(els.smartPhotoDialog.open, true);
  assert.equal(els.smartPhotoStatusNormal.checked, true);
  assert.equal(els.smartPhotoStatusAbnormal.checked, false);
  assert.equal(els.smartPhotoTitle.textContent, "掃號找到 1 張單據");
  assert.equal(appended.length, 1);
  assert.equal(appended[0].children[0].textContent, "A1 A1-1234");
  assert.equal(appended[0].children[1].textContent, "Customer 比對 1234");
  assert.deepEqual(messages.map((entry) => entry.message), ["辨識單號中...", ""]);

  appended[0].listeners.click();

  assert.equal(els.smartPhotoDialog.open, false);
  assert.deepEqual(captured, { delivery, status: "normal" });
});

test("DriverScanDelivery prefers cloud OCR before local OCR", async () => {
  const delivery = { id: "a1", company: "Morris", invoice_no: "M1156646", customer: "Customer", status: "" };
  const { appended, els } = createEls();
  const file = { name: "scan-invoice-crop.jpg" };
  let cloudFile = null;
  let cloudToken = null;
  let localOcrCalled = false;
  const { api } = loadScanDelivery({
    ScanInvoice: {
      async recognizeTextWithCloud(nextFile, options) {
        cloudFile = nextFile;
        cloudToken = options.token;
        assert.equal(typeof options.request, "function");
        return "M1156646";
      },
      async recognizeText() {
        localOcrCalled = true;
        return "";
      },
      outcomeForText({ text, deliveries }) {
        assert.equal(text, "M1156646");
        assert.deepEqual(deliveries, [delivery]);
        return { type: "single", candidates: [{ delivery, matchKind: "exact", matchedText: "M1156646" }] };
      },
    },
  });

  const controller = api.createController({
    els,
    state: { token: "driver-token", deliveries: [delivery], pendingUploads: [] },
    api: async () => {
      throw new Error("request is handled by recognizeTextWithCloud mock");
    },
    offlineQueueApi: null,
    startCapture() {},
    setMessage() {},
  });

  els.scanInvoiceInput.files = [file];
  await controller.handleScanInvoiceFileChange();

  assert.equal(cloudFile, file);
  assert.equal(cloudToken, "driver-token");
  assert.equal(localOcrCalled, false);
  assert.equal(els.smartPhotoDialog.open, true);
  assert.equal(appended.length, 1);
});

test("DriverScanDelivery opens an in-app viewfinder and sends only the crop to OCR", async () => {
  const delivery = { id: "a1", company: "A1", invoice_no: "A1-1234", customer: "Customer", status: "" };
  const { appended, canvasCalls, els } = createEls();
  const messages = [];
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  const stream = { getTracks() { return tracks; } };
  let recognizedFile = null;
  const { api } = loadScanDelivery({
    File: function TestFile(parts, name, options) {
      return { parts, name, type: options.type };
    },
    navigator: {
      mediaDevices: {
        async getUserMedia(constraints) {
          assert.equal(constraints.audio, false);
          assert.equal(constraints.video.facingMode.ideal, "environment");
          return stream;
        },
      },
    },
    ScanInvoice: {
      async recognizeText(nextFile) {
        recognizedFile = nextFile;
        return "1234";
      },
      outcomeForText({ text, deliveries }) {
        assert.equal(text, "1234");
        assert.deepEqual(deliveries, [delivery]);
        return { type: "single", candidates: [{ delivery, matchKind: "original", matchedText: "1234" }] };
      },
    },
  });

  const controller = api.createController({
    els,
    state: { deliveries: [delivery], pendingUploads: [] },
    offlineQueueApi: null,
    startCapture() {},
    setMessage(message, isError) {
      messages.push({ message, isError });
    },
  });

  await controller.handleScanInvoice();

  assert.equal(els.scanInvoiceInput.clicked, false);
  assert.equal(els.scanInvoiceDialog.open, true);
  assert.equal(els.scanInvoiceVideo.srcObject, stream);
  assert.equal(els.scanInvoiceVideo.played, true);

  await controller.handleCaptureScanInvoice();

  assert.equal(els.scanInvoiceDialog.open, false);
  assert.equal(els.scanInvoiceVideo.srcObject, null);
  assert.equal(tracks[0].stopped, true);
  assert.equal(els.scanInvoiceCanvas.width, 500);
  assert.equal(els.scanInvoiceCanvas.height, 200);
  assert.deepEqual(canvasCalls[0].slice(1, 5), [250, 125, 500, 200]);
  assert.equal(recognizedFile.name, "scan-invoice-crop.jpg");
  assert.equal(recognizedFile.type, "image/jpeg");
  assert.equal(recognizedFile.parts.length, 1);
  assert.equal(recognizedFile.parts[0].type, "image/jpeg");
  assert.equal(recognizedFile.parts[0].quality, 0.92);
  assert.equal(recognizedFile.parts[0].cropped, true);
  assert.equal(els.smartPhotoDialog.open, true);
  assert.equal(appended.length, 1);
  assert.deepEqual(messages.map((entry) => entry.message), ["", "辨識單號中...", ""]);
});

test("DriverScanDelivery zooms the viewfinder crop before OCR", async () => {
  const delivery = { id: "a1", company: "A1", invoice_no: "A1-1234", customer: "Customer", status: "" };
  const { canvasCalls, els } = createEls();
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  const stream = { getTracks() { return tracks; } };
  const { api } = loadScanDelivery({
    File: function TestFile(parts, name, options) {
      return { parts, name, type: options.type };
    },
    navigator: {
      mediaDevices: {
        async getUserMedia() {
          return stream;
        },
      },
    },
    ScanInvoice: {
      async recognizeText() {
        return "1234";
      },
      outcomeForText() {
        return { type: "single", candidates: [{ delivery, matchKind: "original", matchedText: "1234" }] };
      },
    },
  });

  const controller = api.createController({
    els,
    state: { deliveries: [delivery], pendingUploads: [] },
    offlineQueueApi: null,
    startCapture() {},
    setMessage() {},
  });

  await controller.handleScanInvoice();
  els.scanInvoiceZoomSlider.value = "2";
  await controller.handleScanInvoiceZoomInput();
  await controller.handleCaptureScanInvoice();

  assert.equal(els.scanInvoiceCanvas.width, 250);
  assert.equal(els.scanInvoiceCanvas.height, 100);
  assert.deepEqual(canvasCalls[0].slice(1, 5), [375, 175, 250, 100]);
  assert.equal(els.scanInvoiceZoomValue.textContent, "2.0x");
});

test("DriverScanDelivery shows a Chinese message when OCR finds no delivery", async () => {
  const { els } = createEls();
  const messages = [];
  const { api } = loadScanDelivery({
    ScanInvoice: {
      async recognizeText() {
        return "8888";
      },
      extractScanTokens(text) {
        assert.equal(text, "8888");
        return {
          fullTokens: new Set(),
          partialTokens: new Set(["8888"]),
        };
      },
      outcomeForText() {
        return { type: "none", candidates: [] };
      },
    },
  });

  const controller = api.createController({
    els,
    state: { deliveries: [], pendingUploads: [] },
    offlineQueueApi: null,
    startCapture() {
      throw new Error("startCapture should not run");
    },
    setMessage(message, isError) {
      messages.push({ message, isError });
    },
  });

  els.scanInvoiceInput.files = [{ name: "invoice.jpg" }];
  await controller.handleScanInvoiceFileChange();

  assert.deepEqual(messages.at(-1), {
    message: "查無對應單據。OCR辨識內容：8888。請重新掃號或自行選擇單號拍照",
    isError: true,
  });
  assert.equal(els.scanInvoiceButton.disabled, false);
});

test("DriverScanDelivery reports when OCR finds no readable invoice text", async () => {
  const { els } = createEls();
  const messages = [];
  const { api } = loadScanDelivery({
    ScanInvoice: {
      async recognizeText() {
        return "   ";
      },
      extractScanTokens() {
        return {
          fullTokens: new Set(),
          partialTokens: new Set(),
        };
      },
      outcomeForText() {
        return { type: "none", candidates: [] };
      },
    },
  });

  const controller = api.createController({
    els,
    state: { deliveries: [], pendingUploads: [] },
    offlineQueueApi: null,
    startCapture() {
      throw new Error("startCapture should not run");
    },
    setMessage(message, isError) {
      messages.push({ message, isError });
    },
  });

  els.scanInvoiceInput.files = [{ name: "invoice.jpg" }];
  await controller.handleScanInvoiceFileChange();

  assert.deepEqual(messages.at(-1), {
    message: "查無對應單據。OCR辨識內容：未辨識到文字。請重新掃號或自行選擇單號拍照",
    isError: true,
  });
});
