(function (root) {
  function createController({ els, state, api, offlineQueueApi, startCapture, setMessage }) {
    let scanInvoiceStream = null;

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
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        closeScanInvoiceCamera();
        scanInvoiceStream = stream;
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
      if (els.scanInvoiceVideo) {
        els.scanInvoiceVideo.srcObject = null;
      }
      if (els.scanInvoiceDialog?.open && typeof els.scanInvoiceDialog.close === "function") {
        els.scanInvoiceDialog.close();
      }
    }

    async function captureScanInvoiceCrop() {
      const video = els.scanInvoiceVideo;
      const canvas = els.scanInvoiceCanvas;
      const source = scanInvoiceCropSourceRect(video, els.scanInvoiceFrame);
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

    function scanInvoiceCropSourceRect(video, frame) {
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
      return {
        x,
        y,
        width: right - x,
        height: bottom - y,
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
      closeScanInvoiceCamera,
    };
  }

  const api = { createController };
  root.DriverScanDelivery = api;
  if (root.window) {
    root.window.DriverScanDelivery = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
