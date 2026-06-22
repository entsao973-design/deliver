(function (root) {
  const SCAN_INVOICE_DEFAULT_ZOOM = 1;
  const SCAN_INVOICE_MAX_ZOOM = 3;
  const SCAN_INVOICE_ZOOM_STEP = 0.1;

  function createController({ els, state, api, offlineQueueApi, startCapture, setMessage }) {
    let scanInvoiceStream = null;
    let scanInvoiceZoom = SCAN_INVOICE_DEFAULT_ZOOM;
    let scanInvoiceZoomTrack = null;
    let scanInvoiceNativeZoom = null;
    let scanInvoiceUsingNativeZoom = false;
    let scanInvoiceZoomTask = Promise.resolve();
    let scanInvoicePinch = null;

    bindScanInvoiceZoomGestures();

    function handleScanInvoice() {
      if (!root.ScanInvoice) {
        setMessage("掃號達交尚未載入，請重新整理或自行選擇單號拍照", true);
        return;
      }
      if (!canUseScanInvoiceCamera()) {
        els.scanInvoiceInput.click();
        return;
      }
      return openScanInvoiceCamera().catch(() => {
        closeScanInvoiceCamera();
        els.scanInvoiceInput.click();
      });
    }

    async function handleScanInvoiceFileChange() {
      const file = els.scanInvoiceInput.files[0];
      els.scanInvoiceInput.value = "";
      if (!file) {
        return;
      }

      await processScanInvoiceFile(file);
    }

    async function processScanInvoiceFile(file) {
      els.scanInvoiceButton.disabled = true;
      setMessage("辨識單號中...");
      try {
        const text = await recognizeScanInvoiceText(file);
        const outcome = root.ScanInvoice.outcomeForText({
          text,
          deliveries: currentDeliveriesForScan(),
        });

        if (outcome.type === "none") {
          setMessage(`查無對應單據。OCR辨識內容：${scanInvoiceOcrSummary(text)}。請重新掃號或自行選擇單號拍照`, true);
          return;
        }

        setMessage("");
        showScanInvoiceDialog(outcome.candidates);
      } catch (error) {
        setMessage(scanInvoiceErrorMessage(error), true);
      } finally {
        els.scanInvoiceButton.disabled = false;
      }
    }

    async function recognizeScanInvoiceText(file) {
      if (canUseCloudOcr()) {
        try {
          return await root.ScanInvoice.recognizeTextWithCloud(file, {
            request: api,
            token: state.token,
          });
        } catch (error) {
          // Keep local OCR as a fallback when cloud OCR is unavailable or temporarily fails.
        }
      }
      return root.ScanInvoice.recognizeText(file);
    }

    function canUseCloudOcr() {
      return Boolean(
        api
          && state.token
          && root.ScanInvoice?.recognizeTextWithCloud
          && root.navigator?.onLine !== false,
      );
    }

    async function handleCaptureScanInvoice() {
      if (els.captureScanInvoiceButton.disabled) {
        return;
      }

      els.captureScanInvoiceButton.disabled = true;
      try {
        const file = await captureScanInvoiceCrop();
        closeScanInvoiceCamera();
        await processScanInvoiceFile(file);
      } catch (error) {
        setMessage(scanInvoiceErrorMessage(error), true);
      } finally {
        els.captureScanInvoiceButton.disabled = false;
      }
    }

    function canUseScanInvoiceCamera() {
      return Boolean(
        els.scanInvoiceDialog
          && els.scanInvoiceVideo
          && els.scanInvoiceFrame
          && els.scanInvoiceCanvas
          && typeof els.scanInvoiceDialog.showModal === "function"
          && root.navigator?.mediaDevices?.getUserMedia,
      );
    }

    async function openScanInvoiceCamera() {
      els.scanInvoiceButton.disabled = true;
      try {
        const stream = await root.navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        closeScanInvoiceCamera();
        scanInvoiceStream = stream;
        setupScanInvoiceZoomTrack(stream);
        await setScanInvoiceZoom(SCAN_INVOICE_DEFAULT_ZOOM);
        els.scanInvoiceVideo.srcObject = stream;
        if (typeof els.scanInvoiceVideo.play === "function") {
          await els.scanInvoiceVideo.play();
        }
        if (!els.scanInvoiceDialog.open) {
          els.scanInvoiceDialog.showModal();
        }
        setMessage("");
      } catch (error) {
        closeScanInvoiceCamera();
        throw error;
      } finally {
        els.scanInvoiceButton.disabled = false;
      }
    }

    function closeScanInvoiceCamera() {
      if (scanInvoiceStream?.getTracks) {
        for (const track of scanInvoiceStream.getTracks()) {
          track.stop();
        }
      }
      scanInvoiceStream = null;
      scanInvoiceZoomTrack = null;
      scanInvoiceNativeZoom = null;
      scanInvoiceUsingNativeZoom = false;
      scanInvoicePinch = null;
      if (els.scanInvoiceVideo) {
        els.scanInvoiceVideo.srcObject = null;
        applyScanInvoiceSoftwareZoom(SCAN_INVOICE_DEFAULT_ZOOM);
      }
      if (els.scanInvoiceDialog?.open && typeof els.scanInvoiceDialog.close === "function") {
        els.scanInvoiceDialog.close();
      }
    }

    async function captureScanInvoiceCrop() {
      const video = els.scanInvoiceVideo;
      const canvas = els.scanInvoiceCanvas;
      await scanInvoiceZoomTask.catch(() => undefined);
      const source = scanInvoiceCropSourceRect(video, els.scanInvoiceFrame, scanInvoiceCaptureZoom());
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("scan_capture_failed");
      }

      canvas.width = source.width;
      canvas.height = source.height;
      context.drawImage(video, source.x, source.y, source.width, source.height, 0, 0, source.width, source.height);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (nextBlob) => {
            if (!nextBlob) {
              reject(new Error("scan_capture_failed"));
              return;
            }
            resolve(nextBlob);
          },
          "image/jpeg",
          0.92,
        );
      });
      return blobToScanInvoiceFile(blob);
    }

    function handleScanInvoiceZoomInput() {
      return updateScanInvoiceZoomFromControl(els.scanInvoiceZoomSlider?.value);
    }

    function handleScanInvoiceZoomOut() {
      return updateScanInvoiceZoomFromControl(scanInvoiceZoom - scanInvoiceZoomStep());
    }

    function handleScanInvoiceZoomIn() {
      return updateScanInvoiceZoomFromControl(scanInvoiceZoom + scanInvoiceZoomStep());
    }

    function updateScanInvoiceZoomFromControl(value) {
      scanInvoiceZoomTask = setScanInvoiceZoom(value);
      return scanInvoiceZoomTask;
    }

    async function setScanInvoiceZoom(value) {
      scanInvoiceZoom = normalizeScanInvoiceZoom(value);
      if (await tryApplyScanInvoiceNativeZoom(scanInvoiceZoom)) {
        scanInvoiceUsingNativeZoom = true;
        applyScanInvoiceSoftwareZoom(SCAN_INVOICE_DEFAULT_ZOOM);
      } else {
        scanInvoiceUsingNativeZoom = false;
        applyScanInvoiceSoftwareZoom(scanInvoiceZoom);
      }
      updateScanInvoiceZoomControls();
    }

    function setupScanInvoiceZoomTrack(stream) {
      const tracks = typeof stream.getVideoTracks === "function" ? stream.getVideoTracks() : [];
      scanInvoiceZoomTrack = tracks[0] || null;
      const capabilities = scanInvoiceZoomTrack?.getCapabilities?.() || {};
      const nativeZoom = capabilities.zoom;
      const nativeZoomMax = Math.min(SCAN_INVOICE_MAX_ZOOM, Number(nativeZoom?.max) || SCAN_INVOICE_MAX_ZOOM);
      scanInvoiceNativeZoom = nativeZoom && typeof scanInvoiceZoomTrack.applyConstraints === "function"
        ? {
            min: Math.max(SCAN_INVOICE_DEFAULT_ZOOM, Number(nativeZoom.min) || SCAN_INVOICE_DEFAULT_ZOOM),
            max: Math.max(SCAN_INVOICE_DEFAULT_ZOOM, nativeZoomMax),
            step: Number(nativeZoom.step) || SCAN_INVOICE_ZOOM_STEP,
          }
        : null;
      updateScanInvoiceZoomControls();
    }

    async function tryApplyScanInvoiceNativeZoom(value) {
      if (!scanInvoiceNativeZoom || !scanInvoiceZoomTrack?.applyConstraints) {
        return false;
      }

      try {
        await scanInvoiceZoomTrack.applyConstraints({ advanced: [{ zoom: value }] });
        return true;
      } catch (error) {
        scanInvoiceNativeZoom = null;
        return false;
      }
    }

    function scanInvoiceCaptureZoom() {
      return scanInvoiceUsingNativeZoom ? SCAN_INVOICE_DEFAULT_ZOOM : scanInvoiceZoom;
    }

    function scanInvoiceZoomStep() {
      return scanInvoiceNativeZoom?.step || SCAN_INVOICE_ZOOM_STEP;
    }

    function normalizeScanInvoiceZoom(value) {
      const number = Number(value);
      const limits = scanInvoiceZoomLimits();
      const next = Number.isFinite(number) ? number : scanInvoiceZoom;
      const stepped = Math.round(next / limits.step) * limits.step;
      return Number(clamp(stepped, limits.min, limits.max).toFixed(2));
    }

    function scanInvoiceZoomLimits() {
      return {
        min: SCAN_INVOICE_DEFAULT_ZOOM,
        max: scanInvoiceNativeZoom?.max || SCAN_INVOICE_MAX_ZOOM,
        step: scanInvoiceZoomStep(),
      };
    }

    function updateScanInvoiceZoomControls() {
      const limits = scanInvoiceZoomLimits();
      if (els.scanInvoiceZoomSlider) {
        els.scanInvoiceZoomSlider.min = String(limits.min);
        els.scanInvoiceZoomSlider.max = String(limits.max);
        els.scanInvoiceZoomSlider.step = String(limits.step);
        els.scanInvoiceZoomSlider.value = String(scanInvoiceZoom);
      }
      if (els.scanInvoiceZoomValue) {
        els.scanInvoiceZoomValue.textContent = `${scanInvoiceZoom.toFixed(1)}x`;
      }
      if (els.scanInvoiceZoomOutButton) {
        els.scanInvoiceZoomOutButton.disabled = scanInvoiceZoom <= limits.min + 0.001;
      }
      if (els.scanInvoiceZoomInButton) {
        els.scanInvoiceZoomInButton.disabled = scanInvoiceZoom >= limits.max - 0.001;
      }
    }

    function applyScanInvoiceSoftwareZoom(value) {
      const zoom = Number(value) || SCAN_INVOICE_DEFAULT_ZOOM;
      if (els.scanInvoiceVideo?.style?.setProperty) {
        els.scanInvoiceVideo.style.setProperty("--scan-invoice-zoom", String(zoom));
      } else if (els.scanInvoiceVideo?.style) {
        els.scanInvoiceVideo.style["--scan-invoice-zoom"] = String(zoom);
      }
    }

    function bindScanInvoiceZoomGestures() {
      const viewport = els.scanInvoiceViewport;
      if (!viewport?.addEventListener) {
        return;
      }

      viewport.addEventListener("touchstart", (event) => {
        if (event.touches?.length !== 2) {
          return;
        }
        scanInvoicePinch = {
          distance: scanInvoiceTouchDistance(event.touches),
          zoom: scanInvoiceZoom,
        };
      }, { passive: true });

      viewport.addEventListener("touchmove", (event) => {
        if (!scanInvoicePinch || event.touches?.length !== 2) {
          return;
        }
        event.preventDefault();
        const distance = scanInvoiceTouchDistance(event.touches);
        if (scanInvoicePinch.distance > 0) {
          updateScanInvoiceZoomFromControl(scanInvoicePinch.zoom * (distance / scanInvoicePinch.distance));
        }
      }, { passive: false });

      viewport.addEventListener("touchend", (event) => {
        if ((event.touches?.length || 0) < 2) {
          scanInvoicePinch = null;
        }
      }, { passive: true });
    }

    function scanInvoiceTouchDistance(touches) {
      const first = touches[0];
      const second = touches[1];
      return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    }

    function scanInvoiceCropSourceRect(video, frame, zoom = SCAN_INVOICE_DEFAULT_ZOOM) {
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const videoRect = video.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      if (!videoWidth || !videoHeight || !videoRect.width || !videoRect.height || !frameRect.width || !frameRect.height) {
        throw new Error("scan_capture_failed");
      }

      const scale = Math.max(videoRect.width / videoWidth, videoRect.height / videoHeight);
      const renderedWidth = videoWidth * scale;
      const renderedHeight = videoHeight * scale;
      const offsetX = (videoRect.width - renderedWidth) / 2;
      const offsetY = (videoRect.height - renderedHeight) / 2;
      const rawX = (frameRect.left - videoRect.left - offsetX) / scale;
      const rawY = (frameRect.top - videoRect.top - offsetY) / scale;
      const rawWidth = frameRect.width / scale;
      const rawHeight = frameRect.height / scale;
      const x = Math.round(clamp(rawX, 0, videoWidth - 1));
      const y = Math.round(clamp(rawY, 0, videoHeight - 1));
      const right = Math.round(clamp(rawX + rawWidth, x + 1, videoWidth));
      const bottom = Math.round(clamp(rawY + rawHeight, y + 1, videoHeight));
      return zoomScanInvoiceSourceRect({
        x,
        y,
        width: right - x,
        height: bottom - y,
      }, videoWidth, videoHeight, zoom);
    }

    function zoomScanInvoiceSourceRect(source, videoWidth, videoHeight, zoom) {
      const nextZoom = Math.max(SCAN_INVOICE_DEFAULT_ZOOM, Number(zoom) || SCAN_INVOICE_DEFAULT_ZOOM);
      if (nextZoom <= SCAN_INVOICE_DEFAULT_ZOOM + 0.001) {
        return source;
      }

      const width = Math.max(1, Math.round(source.width / nextZoom));
      const height = Math.max(1, Math.round(source.height / nextZoom));
      const centerX = source.x + source.width / 2;
      const centerY = source.y + source.height / 2;
      return {
        x: Math.round(clamp(centerX - width / 2, 0, videoWidth - width)),
        y: Math.round(clamp(centerY - height / 2, 0, videoHeight - height)),
        width,
        height,
      };
    }

    function blobToScanInvoiceFile(blob) {
      if (typeof root.File === "function") {
        try {
          return new root.File([blob], "scan-invoice-crop.jpg", { type: "image/jpeg" });
        } catch (error) {
          // Older WebViews may expose File but reject construction; OCR can still read the Blob.
        }
      }
      blob.name = "scan-invoice-crop.jpg";
      return blob;
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function currentDeliveriesForScan() {
      return offlineQueueApi
        ? offlineQueueApi.mergePendingUploads(state.deliveries, state.pendingUploads)
        : state.deliveries;
    }

    function showScanInvoiceDialog(candidates) {
      els.smartPhotoStatusNormal.checked = true;
      els.smartPhotoStatusAbnormal.checked = false;
      els.smartPhotoTitle.textContent = candidates.length === 1 ? "掃號找到 1 張單據" : `掃號找到 ${candidates.length} 張單據`;
      renderScanInvoiceCandidates(candidates);
      if (!els.smartPhotoDialog.open) {
        els.smartPhotoDialog.showModal();
      }
    }

    function renderScanInvoiceCandidates(candidates) {
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
        main.textContent = scanInvoiceCandidateTitle(delivery);
        meta.textContent = [delivery.customer || "", candidate.matchedText ? `比對 ${candidate.matchedText}` : ""].filter(Boolean).join(" ");
        button.append(main, meta);
        button.addEventListener("click", () => {
          els.smartPhotoDialog.close();
          startCapture(candidate.delivery, selectedSmartPhotoStatus());
        });
        els.smartPhotoCandidates.append(button);
      }
    }

    function scanInvoiceCandidateTitle(delivery) {
      return [delivery.company, delivery.invoice_no].filter(Boolean).join(" ") || delivery.customer || "未命名單據";
    }

    function selectedSmartPhotoStatus() {
      return els.smartPhotoStatusAbnormal.checked ? "abnormal" : "normal";
    }

    function scanInvoiceOcrSummary(text) {
      const tokens = scanInvoiceOcrTokens(text);
      if (tokens.length > 0) {
        return tokens.slice(0, 8).join("、");
      }

      const preview = String(text || "").replace(/\s+/g, " ").trim();
      if (preview) {
        return preview.length > 40 ? `${preview.slice(0, 40)}...` : preview;
      }
      return "未辨識到文字";
    }

    function scanInvoiceOcrTokens(text) {
      if (!root.ScanInvoice?.extractScanTokens) {
        return [];
      }
      const scanTokens = root.ScanInvoice.extractScanTokens(text);
      const values = [
        ...Array.from(scanTokens.fullTokens || []),
        ...Array.from(scanTokens.partialTokens || []),
      ];
      return Array.from(new Set(values));
    }

    function scanInvoiceErrorMessage(error) {
      if (error?.message === "ocr_load_failed") {
        return "掃號辨識載入失敗，請確認網路後重新整理";
      }
      if (error?.message === "ocr_unavailable") {
        return "此裝置無法載入掃號辨識，請自行選擇單號拍照";
      }
      if (error?.message === "scan_capture_failed") {
        return "掃號拍照失敗，請重新掃號或自行選擇單號拍照";
      }
      return "掃號辨識失敗，請重新掃號或自行選擇單號拍照";
    }

    return {
      handleScanInvoice,
      handleScanInvoiceFileChange,
      handleCaptureScanInvoice,
      handleScanInvoiceZoomInput,
      handleScanInvoiceZoomOut,
      handleScanInvoiceZoomIn,
      closeScanInvoiceCamera,
    };
  }

  const api = { createController };
  root.DriverScanDelivery = api;
  if (root.window) {
    root.window.DriverScanDelivery = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
