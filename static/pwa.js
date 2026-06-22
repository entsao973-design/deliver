(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.DeliveryPwa = api;
  if (api.canInit()) {
    api.init();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function (root) {
  const VERSION_URL = "/static/app-version.json";
  const APP_VERSION_STORAGE_KEY = "delivery_app_version";
  const PENDING_UPLOAD_COUNT_KEY = "delivery_pending_upload_count";

  let isReloadingForUpdate = false;
  let pendingWorker = null;
  let updateBanner = null;

  function pendingUploadCount(storage = root.localStorage, documentRef = root.document) {
    if (isAdminPage(documentRef)) {
      return 0;
    }
    const value = Number.parseInt(storage?.getItem(PENDING_UPLOAD_COUNT_KEY) || "0", 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function isAdminPage(documentRef = root.document) {
    return Boolean(documentRef?.querySelector?.("#adminApp, #adminLoginScreen"));
  }

  function isLoginVisible(documentRef = root.document) {
    const login = documentRef?.querySelector?.("#loginScreen, #adminLoginScreen");
    return Boolean(login && !login.hidden);
  }

  function shouldActivateImmediately(options) {
    return Boolean(options.isLoginVisible) && options.pendingUploadCount === 0;
  }

  function updateMessageForPendingCount(count) {
    if (count > 0) {
      return `系統已有新版；待上傳照片 ${count} 筆完成後再更新。`;
    }
    return "系統已有新版，請更新。";
  }

  function activateWaitingWorker(worker) {
    if (worker) {
      worker.postMessage({ type: "SKIP_WAITING" });
    }
  }

  function maybeApplyUpdate(registration, worker, options = {}) {
    const count = pendingUploadCount();
    const canApplyNow = shouldActivateImmediately({
      isLoginVisible: isLoginVisible(),
      pendingUploadCount: count,
    });
    pendingWorker = worker || null;

    if (canApplyNow) {
      if (worker) {
        activateWaitingWorker(worker);
      } else if (options.reloadOnly) {
        reloadForUpdate();
      }
      return;
    }

    showUpdateBanner({
      worker,
      reloadOnly: options.reloadOnly || !worker,
    });
  }

  async function checkAppVersion(registration) {
    if (!root.fetch || !root.localStorage) {
      return;
    }

    try {
      const response = await root.fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      const version = String(payload.version || "");
      if (!version) {
        return;
      }

      const previousVersion = root.localStorage.getItem(APP_VERSION_STORAGE_KEY) || "";
      root.localStorage.setItem(APP_VERSION_STORAGE_KEY, version);
      if (previousVersion && previousVersion !== version && !registration?.waiting) {
        maybeApplyUpdate(registration, null, { reloadOnly: true });
      }
    } catch (error) {
      // Version checks must never block the app when offline.
    }
  }

  function showUpdateBanner(options = {}) {
    const banner = ensureUpdateBanner();
    if (!banner) {
      return;
    }

    const count = pendingUploadCount();
    const worker = options.worker || pendingWorker;
    pendingWorker = worker || null;
    banner.message.textContent = updateMessageForPendingCount(count);
    banner.button.textContent = count > 0 ? "等待上傳" : "更新";
    banner.button.disabled = count > 0;
    banner.button.onclick = () => {
      const currentCount = pendingUploadCount();
      if (currentCount > 0) {
        showUpdateBanner(options);
        return;
      }
      if (worker && !options.reloadOnly) {
        activateWaitingWorker(worker);
        return;
      }
      reloadForUpdate();
    };
    banner.root.hidden = false;
  }

  function ensureUpdateBanner() {
    if (!root.document) {
      return null;
    }
    if (updateBanner) {
      return updateBanner;
    }

    const existing = root.document.querySelector("#pwaUpdateBanner");
    const banner = existing || root.document.createElement("div");
    const message = existing?.querySelector?.(".pwa-update-message") || root.document.createElement("span");
    const button = existing?.querySelector?.(".pwa-update-button") || root.document.createElement("button");

    banner.id = "pwaUpdateBanner";
    banner.className = "pwa-update-banner";
    banner.hidden = true;
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    message.className = "pwa-update-message";
    button.className = "pwa-update-button";
    button.type = "button";

    if (!existing) {
      banner.append(message, button);
      root.document.body.append(banner);
    }

    updateBanner = { root: banner, message, button };
    return updateBanner;
  }

  function reloadForUpdate() {
    if (isReloadingForUpdate) {
      return;
    }
    isReloadingForUpdate = true;
    root.location.reload();
  }

  function handleControllerChange() {
    if (pendingUploadCount() > 0) {
      showUpdateBanner({ reloadOnly: true });
      return;
    }
    reloadForUpdate();
  }

  function init() {
    if (!canInit()) {
      return;
    }

    root.addEventListener("load", () => {
      root.navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
        .then((registration) => {
          if (registration.waiting) {
            maybeApplyUpdate(registration, registration.waiting);
          }
          registration.update().catch(() => {});
          checkAppVersion(registration);
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            if (!worker) {
              return;
            }
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && root.navigator.serviceWorker.controller) {
                maybeApplyUpdate(registration, worker);
              }
            });
          });
        })
        .catch(() => {});
    });

    root.navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    root.addEventListener("delivery-pending-uploads-changed", () => {
      if (updateBanner && !updateBanner.root.hidden) {
        showUpdateBanner({ worker: pendingWorker, reloadOnly: !pendingWorker });
      }
    });
  }

  function canInit() {
    return Boolean(root.navigator?.serviceWorker && root.addEventListener && root.document);
  }

  return {
    VERSION_URL,
    PENDING_UPLOAD_COUNT_KEY,
    pendingUploadCount,
    isAdminPage,
    shouldActivateImmediately,
    updateMessageForPendingCount,
    init,
    canInit,
  };
});
