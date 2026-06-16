(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.OfflineUploadQueue = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  const DB_NAME = "delivery-photo-offline";
  const DB_VERSION = 1;
  const STORE_NAME = "pendingUploads";

  function makeClientUploadId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function buildQueuedUpload(input, makeId = makeClientUploadId) {
    return {
      delivery_id: input.delivery.id,
      client_upload_id: makeId(),
      invoice_no: input.delivery.invoice_no || "",
      customer: input.delivery.customer || "",
      company: input.delivery.company || "",
      status: input.status,
      delivery_date: input.delivery_date || "",
      vehicle_no: input.vehicle_no || "",
      photo_data: input.photo_data,
      captured_at: input.captured_at,
      attempt_count: 0,
      last_error: "",
    };
  }

  function shouldQueueUploadError(error, isOnline) {
    if (isOnline === false) {
      return true;
    }
    return !error || typeof error.status !== "number";
  }

  function deliveryLoadErrorMessage(error, isOnline) {
    if (isOnline === false || !error || typeof error.status !== "number") {
      return "網路中斷，載入失敗";
    }
    return error.message || "載入失敗";
  }

  function queueStatusMessage(options) {
    const customMessage = options.customMessage;
    if (typeof customMessage === "string" && customMessage) {
      return customMessage;
    }
    if (!options.isSupported) {
      return "此瀏覽器不支援離線照片暫存";
    }
    if (options.syncInProgress) {
      return "待上傳照片同步中...";
    }
    if (options.pendingCount > 0) {
      const suffix = options.isOnline === false ? "目前離線" : "網路恢復後會自動上傳";
      return `待上傳照片 ${options.pendingCount} 筆，${suffix}`;
    }
    if (options.isOnline === false) {
      return "網路中斷";
    }
    return "";
  }

  function syncCompleteMessage(uploadedCount, pendingCount) {
    if (uploadedCount > 0 && pendingCount === 0) {
      return "恢復連線，已上傳完畢。";
    }
    return "";
  }

  function mergePendingUploads(deliveries, pendingUploads) {
    const pendingByDelivery = new Map();
    for (const upload of pendingUploads) {
      pendingByDelivery.set(upload.delivery_id, upload);
    }

    return deliveries.map((delivery) => {
      const upload = pendingByDelivery.get(delivery.id);
      if (!upload) {
        return delivery;
      }

      return {
        ...delivery,
        status: upload.status,
        status_label: "待上傳",
        has_photo: true,
        photo_updated_at: upload.captured_at,
        local_pending_upload: true,
        local_photo_data: upload.photo_data,
        local_upload_error: upload.last_error || "",
      };
    });
  }

  class IndexedDbPhotoQueue {
    constructor(options = {}) {
      this.dbName = options.dbName || DB_NAME;
      this.dbVersion = options.dbVersion || DB_VERSION;
      this.storeName = options.storeName || STORE_NAME;
      this.dbPromise = null;
    }

    isSupported() {
      return Boolean(root.indexedDB);
    }

    async put(upload) {
      return this.withStore("readwrite", (store) => store.put(upload));
    }

    async remove(deliveryId) {
      return this.withStore("readwrite", (store) => store.delete(deliveryId));
    }

    async list() {
      const uploads = await this.withStore("readonly", (store) => store.getAll());
      return uploads.sort((left, right) => left.captured_at.localeCompare(right.captured_at));
    }

    async withStore(mode, operation) {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, mode);
        const store = transaction.objectStore(this.storeName);
        const request = operation(store);

        transaction.oncomplete = () => resolve(request ? request.result : undefined);
        transaction.onerror = () => reject(transaction.error || new Error("離線佇列存取失敗"));
        transaction.onabort = () => reject(transaction.error || new Error("離線佇列存取中止"));

        if (request) {
          request.onerror = () => reject(request.error || new Error("離線佇列存取失敗"));
        }
      });
    }

    async open() {
      if (!this.isSupported()) {
        throw new Error("此瀏覽器不支援離線照片暫存");
      }
      if (this.dbPromise) {
        return this.dbPromise;
      }

      this.dbPromise = new Promise((resolve, reject) => {
        const request = root.indexedDB.open(this.dbName, this.dbVersion);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: "delivery_id" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("離線佇列開啟失敗"));
      });

      return this.dbPromise;
    }
  }

  return {
    buildQueuedUpload,
    deliveryLoadErrorMessage,
    shouldQueueUploadError,
    queueStatusMessage,
    syncCompleteMessage,
    mergePendingUploads,
    IndexedDbPhotoQueue,
  };
});
