(function () {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  let isReloadingForUpdate = false;

  function activateWaitingWorker(worker) {
    if (worker) {
      worker.postMessage({ type: "SKIP_WAITING" });
    }
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" })
      .then((registration) => {
        activateWaitingWorker(registration.waiting);
        registration.update().catch(() => {});
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) {
            return;
          }
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              activateWaitingWorker(worker);
            }
          });
        });
      })
      .catch(() => {});
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (isReloadingForUpdate) {
      return;
    }
    isReloadingForUpdate = true;
    window.location.reload();
  });
})();
