const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "static", "driver-smart-delivery.js"), "utf8");

function loadSmartDelivery(overrides = {}) {
  const context = {
    window: {},
    navigator: { geolocation: null, onLine: true },
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
  return { context, api: context.window.DriverSmartDelivery };
}

function createEls() {
  const appended = [];
  return {
    appended,
    els: {
      smartPhotoButton: { disabled: false },
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

test("DriverSmartDelivery finds nearby delivery and starts capture from the selected candidate", async () => {
  const geoOptions = [];
  const delivery = { company: "瑪里士", invoice_no: "M11501001", customer: "測試客戶" };
  const { appended, els } = createEls();
  const messages = [];
  let captured = null;
  const { api } = loadSmartDelivery({
    navigator: {
      onLine: true,
      geolocation: {
        getCurrentPosition(resolve, _reject, options) {
          geoOptions.push(options);
          resolve({ coords: { latitude: 25.033, longitude: 121.565, accuracy: 20 } });
        },
      },
    },
    SmartPhoto: {
      outcomeForPosition({ coords, deliveries }) {
        assert.equal(coords.latitude, 25.033);
        assert.deepEqual(deliveries, [delivery]);
        return { type: "single", candidates: [{ delivery, distance: 25 }] };
      },
      formatDistance(distance) {
        return `${distance}m`;
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

  await controller.handleSmartPhoto();

  assert.equal(geoOptions[0].enableHighAccuracy, true);
  assert.equal(geoOptions[0].maximumAge, 0);
  assert.equal(geoOptions[0].timeout, 10000);
  assert.equal(els.smartPhotoButton.disabled, false);
  assert.equal(els.smartPhotoDialog.open, true);
  assert.equal(els.smartPhotoStatusNormal.checked, true);
  assert.equal(els.smartPhotoStatusAbnormal.checked, false);
  assert.equal(els.smartPhotoTitle.textContent, "找到 1 張單據");
  assert.equal(appended.length, 1);
  assert.equal(appended[0].children[0].textContent, "瑪里士 M11501001");
  assert.equal(appended[0].children[1].textContent, "測試客戶 25m");
  assert.deepEqual(messages.map((entry) => entry.message), ["正在取得定位...", ""]);

  appended[0].listeners.click();

  assert.equal(els.smartPhotoDialog.open, false);
  assert.deepEqual(captured, { delivery, status: "normal" });
});

test("DriverSmartDelivery shows a Chinese message when GPS accuracy is not usable", async () => {
  const { els } = createEls();
  const messages = [];
  const { api } = loadSmartDelivery({
    navigator: {
      onLine: true,
      geolocation: {
        getCurrentPosition(resolve) {
          resolve({ coords: { latitude: 25.033, longitude: 121.565, accuracy: 1000 } });
        },
      },
    },
    SmartPhoto: {
      outcomeForPosition() {
        throw new Error("low_accuracy");
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

  await controller.handleSmartPhoto();

  assert.deepEqual(messages.at(-1), {
    message: "定位精度不足，請移至可收訊處或自行選擇單號拍照",
    isError: true,
  });
  assert.equal(els.smartPhotoButton.disabled, false);
});
