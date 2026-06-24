const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const staticRoot = path.join(root, "static");

test("PWA app version matches service worker cache and shell assets", () => {
  const appVersion = JSON.parse(fs.readFileSync(path.join(staticRoot, "app-version.json"), "utf8"));
  const workerJs = fs.readFileSync(path.join(staticRoot, "service-worker.js"), "utf8");

  assert.equal(appVersion.version, "2026.06.24.1");
  assert.match(appVersion.version, /^20\d{2}\.\d{2}\.\d{2}\.\d+$/);
  assert.match(workerJs, new RegExp(`const APP_VERSION = "${escapeRegExp(appVersion.version)}"`));
  assert.match(workerJs, /const CACHE_NAME = `delivery-proof-pwa-\${APP_VERSION}`;/);

  for (const asset of [
    "/static/app-version.json",
    "/static/driver-api.js",
    "/static/smart-photo.js",
    "/static/driver-smart-delivery.js",
    "/static/scan-invoice.js",
    "/static/driver-scan-delivery.js",
    "/static/admin-operation-state.js",
  ]) {
    assert.match(workerJs, new RegExp(`"${escapeRegExp(asset)}"`));
  }
});

test("manifest has Android fullscreen PWA install fields", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(staticRoot, "manifest.json"), "utf8"));

  assert.equal(manifest.name, "配送存證平台");
  assert.equal(manifest.short_name, "配送存證");
  assert.equal(manifest.start_url, "/driver");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "fullscreen");
  assert.deepEqual(manifest.display_override, ["fullscreen", "standalone"]);
  assert.equal(manifest.orientation, "portrait");

  const icon192 = manifest.icons.find((icon) => icon.sizes === "192x192");
  const icon512 = manifest.icons.find((icon) => icon.sizes === "512x512");
  assert.deepEqual(icon192, {
    src: "/static/icons/icon-192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "any maskable",
  });
  assert.deepEqual(icon512, {
    src: "/static/icons/icon-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any maskable",
  });
});

test("PWA icon files exist with expected PNG dimensions", () => {
  assertPngSize(path.join(staticRoot, "icons", "icon-192.png"), 192, 192);
  assertPngSize(path.join(staticRoot, "icons", "icon-512.png"), 512, 512);
});

test("PWA icon contains recognizable truck color regions", () => {
  const icon = readPng(path.join(staticRoot, "icons", "icon-512.png"));

  assertPixelNear(icon, 24, 24, [20, 108, 99], 2);
  assertPixelNear(icon, 200, 245, [248, 252, 248], 24);
  assertPixelNear(icon, 390, 260, [114, 183, 173], 40);
  assertPixelNear(icon, 176, 356, [31, 43, 49], 30);
  assertPixelNear(icon, 366, 356, [31, 43, 49], 30);
  assertPixelNear(icon, 286, 266, [248, 252, 248], 8);
  assertPixelNear(icon, 241, 247, [15, 47, 99], 4);
});

test("driver and admin pages declare PWA metadata and register script", () => {
  for (const file of ["index.html", "admin.html"]) {
    const html = fs.readFileSync(path.join(staticRoot, file), "utf8");

    assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest" \/>/);
    assert.match(html, /<meta name="theme-color" content="#146c63" \/>/);
    assert.match(html, /<meta name="mobile-web-app-capable" content="yes" \/>/);
    assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes" \/>/);
    assert.match(html, /<link rel="icon" type="image\/png" sizes="192x192" href="\/static\/icons\/icon-192\.png" \/>/);
    assert.match(html, /<script src="\/static\/pwa\.js" defer><\/script>/);
  }
});

test("service worker registers at root scope and does not handle API requests", () => {
  const pwaJs = fs.readFileSync(path.join(staticRoot, "pwa.js"), "utf8");
  const workerJs = fs.readFileSync(path.join(staticRoot, "service-worker.js"), "utf8");
  const webPy = fs.readFileSync(path.join(root, "delivery_app", "web.py"), "utf8");

  assert.match(pwaJs, /serviceWorker\.register\("\/service-worker\.js",\s*\{\s*scope:\s*"\/"\s*\}\)/s);
  assert.match(pwaJs, /registration\.update\(\)/);
  assert.match(pwaJs, /controllerchange/);
  assert.match(pwaJs, /root\.location\.reload\(\)/);
  assert.match(workerJs, /self\.addEventListener\("install"/);
  assert.match(workerJs, /self\.addEventListener\("activate"/);
  assert.match(workerJs, /self\.addEventListener\("fetch"/);
  assert.match(workerJs, /self\.addEventListener\("message"/);
  assert.match(workerJs, /SKIP_WAITING/);
  assert.doesNotMatch(workerJs, /self\.addEventListener\("install"[\s\S]*self\.skipWaiting\(\);[\s\S]*self\.addEventListener\("activate"/);
  assert.match(workerJs, /delivery-proof-pwa-\$\{APP_VERSION\}/);
  assert.match(workerJs, /"\/driver"/);
  assert.match(workerJs, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(webPy, /parsed\.path == "\/manifest\.webmanifest"/);
  assert.match(webPy, /application\/manifest\+json/);
  assert.match(webPy, /parsed\.path == "\/service-worker\.js"/);
});

test("PWA update helpers defer reload while offline uploads are pending", () => {
  const DeliveryPwa = require("../static/pwa.js");
  const storage = {
    getItem(key) {
      return key === "delivery_pending_upload_count" ? "2" : "";
    },
  };

  assert.equal(DeliveryPwa.pendingUploadCount(storage), 2);
  assert.equal(DeliveryPwa.shouldActivateImmediately({ isLoginVisible: true, pendingUploadCount: 0 }), true);
  assert.equal(DeliveryPwa.shouldActivateImmediately({ isLoginVisible: false, pendingUploadCount: 0 }), false);
  assert.equal(DeliveryPwa.shouldActivateImmediately({ isLoginVisible: true, pendingUploadCount: 2 }), false);
  assert.equal(DeliveryPwa.updateMessageForPendingCount(0), "系統已有新版，請更新。");
  assert.equal(DeliveryPwa.updateMessageForPendingCount(2), "系統已有新版；待上傳照片 2 筆完成後再更新。");
});

test("PWA update helpers ignore driver pending uploads on admin pages", () => {
  const DeliveryPwa = require("../static/pwa.js");
  const storage = {
    getItem(key) {
      return key === "delivery_pending_upload_count" ? "3" : "";
    },
  };
  const adminDocument = {
    querySelector(selector) {
      return selector === "#adminApp, #adminLoginScreen" ? {} : null;
    },
  };

  assert.equal(DeliveryPwa.pendingUploadCount(storage, adminDocument), 0);
});

test("admin operation state locks buttons while an action is running", async () => {
  const AdminOperationState = require("../static/admin-operation-state.js");
  const attrs = {};
  const button = {
    disabled: false,
    textContent: "上傳並匯入",
    setAttribute(name, value) {
      attrs[name] = value;
    },
    removeAttribute(name) {
      delete attrs[name];
    },
  };
  let ran = false;

  await AdminOperationState.runWithButtonLock(button, "匯入中...", async () => {
    ran = true;
    assert.equal(button.disabled, true);
    assert.equal(button.textContent, "匯入中...");
    assert.equal(attrs["aria-busy"], "true");
  });

  assert.equal(ran, true);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "上傳並匯入");
  assert.equal(attrs["aria-busy"], undefined);
});

test("admin operation state skips duplicate clicks while a button is disabled", async () => {
  const AdminOperationState = require("../static/admin-operation-state.js");
  const button = {
    disabled: true,
    textContent: "刪除中...",
    setAttribute() {},
    removeAttribute() {},
  };
  let calls = 0;

  await AdminOperationState.runWithButtonLock(button, "刪除中...", async () => {
    calls += 1;
  });

  assert.equal(calls, 0);
  assert.equal(button.textContent, "刪除中...");
});

function assertPngSize(filePath, expectedWidth, expectedHeight) {
  const bytes = fs.readFileSync(filePath);
  assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a");
  assert.equal(bytes.readUInt32BE(16), expectedWidth);
  assert.equal(bytes.readUInt32BE(20), expectedHeight);
}

function readPng(filePath) {
  const zlib = require("node:zlib");
  const bytes = fs.readFileSync(filePath);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const chunks = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IDAT") {
      chunks.push(data);
    }
    offset += 12 + length;
  }
  const inflated = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    assert.equal(inflated[rowStart], 0);
    inflated.copy(pixels, y * stride, rowStart + 1, rowStart + 1 + stride);
  }
  return { width, height, pixels };
}

function assertPixelNear(icon, x, y, expectedRgb, tolerance) {
  const index = (y * icon.width + x) * 4;
  const actual = [
    icon.pixels[index],
    icon.pixels[index + 1],
    icon.pixels[index + 2],
  ];
  for (let channel = 0; channel < 3; channel += 1) {
    assert.ok(
      Math.abs(actual[channel] - expectedRgb[channel]) <= tolerance,
      `pixel ${x},${y} channel ${channel} expected near ${expectedRgb[channel]}, got ${actual[channel]}`,
    );
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
