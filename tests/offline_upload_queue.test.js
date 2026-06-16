const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildQueuedUpload,
  deliveryLoadErrorMessage,
  mergePendingUploads,
  queueStatusMessage,
  shouldQueueUploadError,
  syncCompleteMessage,
} = require("../static/offline-upload-queue.js");

test("buildQueuedUpload creates a replaceable upload item for one delivery", () => {
  const upload = buildQueuedUpload(
    {
      delivery: {
        id: "D-001",
        invoice_no: "INV-001",
        customer: "Customer A",
        company: "Company A",
      },
      status: "normal",
      delivery_date: "2026-06-14",
      vehicle_no: "RFW-3960",
      photo_data: "data:image/jpeg;base64,abc",
      captured_at: "2026-06-14T09:30:00",
    },
    () => "upload-001",
  );

  assert.deepEqual(upload, {
    delivery_id: "D-001",
    client_upload_id: "upload-001",
    invoice_no: "INV-001",
    customer: "Customer A",
    company: "Company A",
    status: "normal",
    delivery_date: "2026-06-14",
    vehicle_no: "RFW-3960",
    photo_data: "data:image/jpeg;base64,abc",
    captured_at: "2026-06-14T09:30:00",
    attempt_count: 0,
    last_error: "",
  });
});

test("shouldQueueUploadError queues offline and network failures only", () => {
  assert.equal(shouldQueueUploadError(new TypeError("Failed to fetch"), true), true);
  assert.equal(shouldQueueUploadError(new Error("Network down"), false), true);
  assert.equal(shouldQueueUploadError(Object.assign(new Error("Unauthorized"), { status: 401 }), true), false);
  assert.equal(shouldQueueUploadError(Object.assign(new Error("Bad request"), { status: 400 }), true), false);
});

test("queueStatusMessage shows a Chinese offline message instead of event objects", () => {
  assert.equal(
    queueStatusMessage({
      customMessage: { type: "offline" },
      isOnline: false,
      isSupported: true,
      pendingCount: 0,
      syncInProgress: false,
    }),
    "網路中斷",
  );
});

test("deliveryLoadErrorMessage translates network load failures", () => {
  assert.equal(deliveryLoadErrorMessage(new TypeError("Load failed"), false), "網路中斷，載入失敗");
  assert.equal(deliveryLoadErrorMessage(new TypeError("Failed to fetch"), true), "網路中斷，載入失敗");
  assert.equal(
    deliveryLoadErrorMessage(Object.assign(new Error("登入逾時"), { status: 401 }), true),
    "登入逾時",
  );
});

test("syncCompleteMessage confirms upload completion only when queue is empty", () => {
  assert.equal(syncCompleteMessage(1, 0), "恢復連線，已上傳完畢。");
  assert.equal(syncCompleteMessage(0, 0), "");
  assert.equal(syncCompleteMessage(1, 1), "");
});

test("mergePendingUploads marks matching deliveries as waiting for upload", () => {
  const deliveries = [
    {
      id: "D-001",
      invoice_no: "INV-001",
      customer: "Customer A",
      company: "Company A",
      status: null,
      status_label: "未達交",
      has_photo: false,
      photo_updated_at: "",
    },
    {
      id: "D-002",
      invoice_no: "INV-002",
      customer: "Customer B",
      company: "Company B",
      status: null,
      status_label: "未達交",
      has_photo: false,
      photo_updated_at: "",
    },
  ];
  const pending = [
    {
      delivery_id: "D-001",
      status: "normal",
      photo_data: "data:image/jpeg;base64,abc",
      captured_at: "2026-06-14T09:30:00",
      last_error: "",
    },
  ];

  const merged = mergePendingUploads(deliveries, pending);

  assert.equal(merged[0].local_pending_upload, true);
  assert.equal(merged[0].status, "normal");
  assert.equal(merged[0].status_label, "待上傳");
  assert.equal(merged[0].has_photo, true);
  assert.equal(merged[0].photo_updated_at, "2026-06-14T09:30:00");
  assert.equal(merged[0].local_photo_data, "data:image/jpeg;base64,abc");
  assert.equal(merged[1].local_pending_upload, undefined);
});
