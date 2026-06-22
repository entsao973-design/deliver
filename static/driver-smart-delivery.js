(function (root) {
  function createController({ els, state, offlineQueueApi, startCapture, setMessage }) {
    async function handleSmartPhoto() {
      if (!root.SmartPhoto) {
        setMessage("定位達交尚未載入，請重新整理或自行選擇單號拍照", true);
        return;
      }
      if (!root.navigator.geolocation) {
        setMessage("無法取得目前定位，請自行選擇單號拍照", true);
        return;
      }

      els.smartPhotoButton.disabled = true;
      setMessage("正在取得定位...");
      try {
        const position = await getCurrentPosition();
        const outcome = root.SmartPhoto.outcomeForPosition({
          coords: position.coords,
          deliveries: currentDeliveriesForSmartPhoto(),
        });

        if (outcome.type === "none") {
          setMessage("300公尺內查無單據，請自行選擇單號拍照", true);
          return;
        }

        setMessage("");
        showSmartPhotoDialog(outcome.candidates);
      } catch (error) {
        setMessage(smartPhotoErrorMessage(error), true);
      } finally {
        els.smartPhotoButton.disabled = false;
      }
    }

    function getCurrentPosition() {
      return new Promise((resolve, reject) => {
        root.navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000,
        });
      });
    }

    function currentDeliveriesForSmartPhoto() {
      return offlineQueueApi
        ? offlineQueueApi.mergePendingUploads(state.deliveries, state.pendingUploads)
        : state.deliveries;
    }

    function showSmartPhotoDialog(candidates) {
      els.smartPhotoStatusNormal.checked = true;
      els.smartPhotoStatusAbnormal.checked = false;
      els.smartPhotoTitle.textContent = candidates.length === 1 ? "找到 1 張單據" : `找到 ${candidates.length} 張單據`;
      renderSmartPhotoCandidates(candidates);
      if (!els.smartPhotoDialog.open) {
        els.smartPhotoDialog.showModal();
      }
    }

    function renderSmartPhotoCandidates(candidates) {
      els.smartPhotoCandidates.replaceChildren();
      for (const candidate of candidates) {
        const button = document.createElement("button");
        const main = document.createElement("span");
        const meta = document.createElement("span");
        const delivery = candidate.delivery;

        button.type = "button";
        button.className = "secondary-button smart-photo-candidate";
        main.className = "smart-photo-candidate-main";
        meta.className = "smart-photo-candidate-meta";
        main.textContent = smartPhotoCandidateTitle(delivery);
        meta.textContent = `${delivery.customer || ""} ${root.SmartPhoto.formatDistance(candidate.distance)}`.trim();
        button.append(main, meta);
        button.addEventListener("click", () => {
          els.smartPhotoDialog.close();
          startCapture(candidate.delivery, selectedSmartPhotoStatus());
        });
        els.smartPhotoCandidates.append(button);
      }
    }

    function smartPhotoCandidateTitle(delivery) {
      return [delivery.company, delivery.invoice_no].filter(Boolean).join(" ") || delivery.customer || "未命名單據";
    }

    function selectedSmartPhotoStatus() {
      return els.smartPhotoStatusAbnormal.checked ? "abnormal" : "normal";
    }

    function smartPhotoErrorMessage(error) {
      if (error?.message === "low_accuracy") {
        return "定位精度不足，請移至可收訊處或自行選擇單號拍照";
      }
      if (error?.code === 1) {
        return "手機未允許定位，請開啟定位權限或自行選擇單號拍照";
      }
      if (root.navigator.onLine === false) {
        return "網路中斷，無法取得目前定位，請自行選擇單號拍照";
      }
      return "無法取得目前定位，請自行選擇單號拍照";
    }

    return { handleSmartPhoto };
  }

  const api = { createController };
  root.DriverSmartDelivery = api;
  if (root.window) {
    root.window.DriverSmartDelivery = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
