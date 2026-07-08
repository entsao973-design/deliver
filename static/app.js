const DRIVER_DATE_OPTION_LIMIT = 10;

const state = {
  token: localStorage.getItem("delivery_token") || "",
  profile: JSON.parse(localStorage.getItem("delivery_profile") || "null"),
  deliveries: [],
  counts: { open: 0, done: 0, total: 0 },
  dates: [],
  selectedDate: localStorage.getItem("delivery_selected_date") || "",
  rememberedLogin: JSON.parse(localStorage.getItem("delivery_remembered_login") || "null"),
  pendingDelivery: null,
  pendingStatus: null,
  pendingUploads: [],
  syncInProgress: false,
  dialogDelivery: null,
};

const els = {
  loginScreen: document.querySelector("#loginScreen"),
  deliveryScreen: document.querySelector("#deliveryScreen"),
  loginForm: document.querySelector("#loginForm"),
  username: document.querySelector("#username"),
  password: document.querySelector("#password"),
  togglePassword: document.querySelector("#togglePassword"),
  passwordEyeOpen: document.querySelector("#passwordEyeOpen"),
  passwordEyeClosed: document.querySelector("#passwordEyeClosed"),
  vehicleNo: document.querySelector("#vehicleNo"),
  vehicleSelect: document.querySelector("#vehicleSelect"),
  vehicleOptions: document.querySelector("#vehicleOptions"),
  rememberLogin: document.querySelector("#rememberLogin"),
  loginError: document.querySelector("#loginError"),
  routeDate: document.querySelector("#routeDate"),
  routeTitle: document.querySelector("#routeTitle"),
  driverName: document.querySelector("#driverName"),
  datePanel: document.querySelector("#datePanel"),
  dateSelect: document.querySelector("#dateSelect"),
  logoutButton: document.querySelector("#logoutButton"),
  openCount: document.querySelector("#openCount"),
  doneCount: document.querySelector("#doneCount"),
  hideDoneToggle: document.querySelector("#hideDoneToggle"),
  showAllPhotosToggle: document.querySelector("#showAllPhotosToggle"),
  smartPhotoButton: document.querySelector("#smartPhotoButton"),
  scanInvoiceButton: document.querySelector("#scanInvoiceButton"),
  refreshButton: document.querySelector("#refreshButton"),
  reloadButton: document.querySelector("#reloadButton"),
  queueStatus: document.querySelector("#queueStatus"),
  message: document.querySelector("#message"),
  deliveryList: document.querySelector("#deliveryList"),
  photoInput: document.querySelector("#photoInput"),
  scanInvoiceInput: document.querySelector("#scanInvoiceInput"),
  scanInvoiceDialog: document.querySelector("#scanInvoiceDialog"),
  scanInvoiceViewport: document.querySelector("#scanInvoiceViewport"),
  scanInvoiceVideo: document.querySelector("#scanInvoiceVideo"),
  scanInvoiceFrame: document.querySelector("#scanInvoiceFrame"),
  scanInvoiceCanvas: document.querySelector("#scanInvoiceCanvas"),
  scanInvoiceZoomOutButton: document.querySelector("#scanInvoiceZoomOutButton"),
  scanInvoiceZoomInButton: document.querySelector("#scanInvoiceZoomInButton"),
  scanInvoiceZoomSlider: document.querySelector("#scanInvoiceZoomSlider"),
  scanInvoiceZoomValue: document.querySelector("#scanInvoiceZoomValue"),
  captureScanInvoiceButton: document.querySelector("#captureScanInvoiceButton"),
  closeScanInvoiceButton: document.querySelector("#closeScanInvoiceButton"),
  photoDialog: document.querySelector("#photoDialog"),
  photoTitle: document.querySelector("#photoTitle"),
  photoPreview: document.querySelector("#photoPreview"),
  photoViewport: document.querySelector("#photoViewport"),
  closePhotoButton: document.querySelector("#closePhotoButton"),
  retakeButton: document.querySelector("#retakeButton"),
  smartPhotoDialog: document.querySelector("#smartPhotoDialog"),
  smartPhotoTitle: document.querySelector("#smartPhotoTitle"),
  closeSmartPhotoButton: document.querySelector("#closeSmartPhotoButton"),
  smartPhotoStatusNormal: document.querySelector("#smartPhotoStatusNormal"),
  smartPhotoStatusAbnormal: document.querySelector("#smartPhotoStatusAbnormal"),
  smartPhotoCandidates: document.querySelector("#smartPhotoCandidates"),
};

createPhotoViewer({
  dialog: els.photoDialog,
  image: els.photoPreview,
  viewport: els.photoViewport,
});

const offlineQueueApi = window.OfflineUploadQueue;
const photoQueue = offlineQueueApi ? new offlineQueueApi.IndexedDbPhotoQueue() : null;
const api = window.DriverApi.request;
const smartDeliveryController = window.DriverSmartDelivery.createController({
  els,
  state,
  offlineQueueApi,
  startCapture,
  setMessage,
});
const scanDeliveryController = window.DriverScanDelivery.createController({
  els,
  state,
  api,
  offlineQueueApi,
  startCapture,
  setMessage,
});

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.loginError.textContent = "";

  const payload = {
    username: els.username.value.trim(),
    password: els.password.value,
    vehicle_no: els.vehicleNo.value.trim(),
  };

  try {
    const result = await api("/api/login", { method: "POST", body: payload });
    state.token = result.token;
    localStorage.setItem("delivery_token", state.token);
    localStorage.setItem("delivery_role", result.role);
    localStorage.setItem("delivery_permissions", JSON.stringify(result.permissions || {}));
    saveRememberedLogin(payload.username, payload.password, payload.vehicle_no);

    if (result.role === "admin") {
      window.location.href = "/admin";
      return;
    }

    state.profile = result.profile;
    state.deliveries = result.deliveries;
    state.counts = result.counts;
    state.dates = result.dates || [];
    state.selectedDate = result.selected_date || "";
    localStorage.setItem("delivery_profile", JSON.stringify(state.profile));
    localStorage.setItem("delivery_selected_date", state.selectedDate);
    setMessage("");
    resetDeliveryControls();
    await refreshPendingUploads();
    showDeliveryScreen();
    renderDeliveries();
    syncPendingUploads();
  } catch (error) {
    els.loginError.textContent = error.message;
  }
});

els.togglePassword.addEventListener("click", () => {
  const isVisible = els.password.type === "password";
  els.password.type = isVisible ? "text" : "password";
  els.togglePassword.setAttribute("aria-label", isVisible ? "隱藏密碼" : "顯示密碼");
  els.togglePassword.setAttribute("aria-pressed", String(isVisible));
  setPasswordIconHidden(els.passwordEyeOpen, isVisible);
  setPasswordIconHidden(els.passwordEyeClosed, !isVisible);
});

els.logoutButton.addEventListener("click", () => {
  state.token = "";
  state.profile = null;
  state.deliveries = [];
  localStorage.removeItem("delivery_token");
  localStorage.removeItem("delivery_role");
  localStorage.removeItem("delivery_permissions");
  localStorage.removeItem("delivery_profile");
  localStorage.removeItem("delivery_selected_date");
  showLoginScreen();
});

els.dateSelect.addEventListener("change", () => {
  state.selectedDate = els.dateSelect.value;
  localStorage.setItem("delivery_selected_date", state.selectedDate);
  loadDeliveries();
});

els.vehicleSelect.addEventListener("change", () => {
  if (els.vehicleSelect.value) {
    els.vehicleNo.value = els.vehicleSelect.value;
  }
});

els.vehicleNo.addEventListener("input", () => {
  const typedVehicle = els.vehicleNo.value.trim();
  const hasOption = Array.from(els.vehicleSelect.options).some((option) => option.value === typedVehicle);
  els.vehicleSelect.value = hasOption ? typedVehicle : "";
});

els.hideDoneToggle.addEventListener("change", loadDeliveries);
els.showAllPhotosToggle.addEventListener("change", renderDeliveries);
els.smartPhotoButton.addEventListener("click", smartDeliveryController.handleSmartPhoto);
els.scanInvoiceButton.addEventListener("click", scanDeliveryController.handleScanInvoice);
els.scanInvoiceInput.addEventListener("change", scanDeliveryController.handleScanInvoiceFileChange);
els.captureScanInvoiceButton.addEventListener("click", scanDeliveryController.handleCaptureScanInvoice);
els.scanInvoiceZoomSlider.addEventListener("input", scanDeliveryController.handleScanInvoiceZoomInput);
els.scanInvoiceZoomOutButton.addEventListener("click", scanDeliveryController.handleScanInvoiceZoomOut);
els.scanInvoiceZoomInButton.addEventListener("click", scanDeliveryController.handleScanInvoiceZoomIn);
els.closeScanInvoiceButton.addEventListener("click", scanDeliveryController.closeScanInvoiceCamera);
els.scanInvoiceDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  scanDeliveryController.closeScanInvoiceCamera();
});
els.refreshButton.addEventListener("click", loadDeliveries);
window.addEventListener("online", () => {
  updateQueueStatus();
  syncPendingUploads();
});
window.addEventListener("offline", () => updateQueueStatus());
els.reloadButton.addEventListener("click", async () => {
  setMessage("重新匯入中...");
  try {
    await api("/api/reload", { method: "POST", body: { token: state.token } });
    await loadDeliveries();
    setMessage("已重新匯入");
  } catch (error) {
    setMessage(error.message, true);
  }
});

els.photoInput.addEventListener("change", async () => {
  const file = els.photoInput.files[0];
  els.photoInput.value = "";
  if (!file || !state.pendingDelivery || !state.pendingStatus) {
    return;
  }

  const delivery = state.pendingDelivery;
  const status = state.pendingStatus;
  let dataUrl = "";
  let capturedAt = "";
  setMessage("照片處理中...");
  try {
    dataUrl = await compressToJpegDataUrl(file, 1800, 0.86);
    capturedAt = currentLocalTimestamp();
    if (navigator.onLine === false) {
      await queuePhotoUpload(delivery, status, dataUrl, capturedAt);
      return;
    }

    const result = await uploadPhoto(delivery.id, status, dataUrl, capturedAt);
    upsertDelivery(result.delivery);
    state.counts = result.counts;
    await removePendingUpload(delivery.id);
    renderDeliveries();
    setMessage("照片已上傳");
  } catch (error) {
    if (dataUrl && offlineQueueApi && offlineQueueApi.shouldQueueUploadError(error, navigator.onLine)) {
      await queuePhotoUpload(delivery, status, dataUrl, capturedAt || currentLocalTimestamp());
      return;
    }
    setMessage(error.message, true);
  } finally {
    state.pendingDelivery = null;
    state.pendingStatus = null;
  }
});

els.closePhotoButton.addEventListener("click", () => els.photoDialog.close());
els.closeSmartPhotoButton.addEventListener("click", () => els.smartPhotoDialog.close());
els.retakeButton.addEventListener("click", () => {
  if (!state.dialogDelivery) {
    return;
  }
  const status = state.dialogDelivery.status || "normal";
  els.photoDialog.close();
  startCapture(state.dialogDelivery, status);
});

async function loadDeliveries() {
  if (!state.token) {
    showLoginScreen();
    return;
  }

  const include = els.hideDoneToggle.checked ? "active" : "all";
  const date = state.selectedDate ? `&date=${encodeURIComponent(state.selectedDate)}` : "";
  try {
    const result = await api(`/api/deliveries?include=${include}&token=${encodeURIComponent(state.token)}${date}`);
    state.profile = result.profile || state.profile;
    state.dates = result.dates || state.dates;
    state.selectedDate = result.selected_date || state.selectedDate;
    state.deliveries = result.deliveries;
    state.counts = result.counts;
    localStorage.setItem("delivery_profile", JSON.stringify(state.profile));
    localStorage.setItem("delivery_selected_date", state.selectedDate);
    await refreshPendingUploads();
    showDeliveryScreen();
    renderDeliveries();
    syncPendingUploads();
    setMessage("");
  } catch (error) {
    const message = offlineQueueApi
      ? offlineQueueApi.deliveryLoadErrorMessage(error, navigator.onLine)
      : error.message;
    setMessage(message, true);
    if (error.status === 401) {
      showLoginScreen();
    }
  }
}

function renderDeliveries() {
  const shown = offlineQueueApi
    ? offlineQueueApi.mergePendingUploads(state.deliveries, state.pendingUploads)
    : state.deliveries;
  els.openCount.textContent = state.counts.open;
  els.doneCount.textContent = state.counts.done;

  els.deliveryList.replaceChildren();
  if (shown.length === 0) {
    const empty = document.createElement("div");
    empty.className = "delivery-card";
    empty.textContent = els.hideDoneToggle.checked ? "目前沒有未達交單據" : "目前沒有配送資料";
    els.deliveryList.append(empty);
    return;
  }

  for (const delivery of shown) {
    els.deliveryList.append(renderCard(delivery));
  }
}

function renderCard(delivery) {
  const card = document.createElement("article");
  card.className = "delivery-card";

  const badgeClass = delivery.local_pending_upload
    ? "pending"
    : delivery.status === "normal"
      ? "normal"
      : delivery.status === "abnormal"
        ? "abnormal"
        : "";
  card.innerHTML = `
    <div class="card-main">
      <div class="card-title-row">
        <h2 class="customer"></h2>
        <span class="badge ${badgeClass}"></span>
      </div>
      <div class="meta-line">
        <span class="invoice"></span>
        <span class="company"></span>
        <span class="quantity"></span>
      </div>
      <div class="meta-line updated-line"></div>
    </div>
    <div class="actions"></div>
  `;

  card.querySelector(".customer").textContent = delivery.customer;
  card.querySelector(".badge").textContent = delivery.status_label;
  card.querySelector(".invoice").textContent = delivery.invoice_no;
  card.querySelector(".company").textContent = delivery.company;
  const quantityText = delivery.quantity ? `數量：${delivery.quantity}` : "";
  card.querySelector(".quantity").textContent = quantityText;
  card.querySelector(".quantity").hidden = !quantityText;
  card.querySelector(".updated-line").textContent = delivery.photo_updated_at
    ? `照片時間 ${delivery.photo_updated_at.replace("T", " ")}`
    : "";

  if (delivery.has_photo && els.showAllPhotosToggle.checked) {
    const viewport = document.createElement("div");
    const photo = document.createElement("img");
    const stamp = encodeURIComponent(delivery.photo_updated_at || Date.now());
    viewport.className = "inline-photo-viewport";
    photo.className = "inline-photo";
    photo.src = delivery.local_photo_data || `/api/deliveries/${delivery.id}/photo?token=${encodeURIComponent(state.token)}&t=${stamp}`;
    photo.alt = `${delivery.invoice_no} 達交照片`;
    viewport.append(photo);
    card.insertBefore(viewport, card.querySelector(".actions"));
    createPhotoViewer({
      viewport,
      image: photo,
      useWindowResize: false,
      touchScrollTarget: () => viewport.closest(".delivery-list"),
    });
  }

  const actions = card.querySelector(".actions");
  if (delivery.has_photo) {
    if (!els.showAllPhotosToggle.checked) {
      actions.append(makeButton("檢視照片", "secondary-button wide", () => openPhoto(delivery)));
    }
    actions.append(makeButton("重新拍照", "secondary-button", () => startCapture(delivery, delivery.status || "normal")));
    if (delivery.local_pending_upload) {
      actions.append(makeButton("立即上傳", "secondary-button", syncPendingUploads));
    } else {
      actions.append(
        makeButton(delivery.status === "normal" ? "改異常" : "改正常", delivery.status === "normal" ? "abnormal-button" : "normal-button", () =>
          startCapture(delivery, delivery.status === "normal" ? "abnormal" : "normal"),
        ),
      );
    }
  } else {
    actions.append(makeButton("正常達交", "normal-button", () => startCapture(delivery, "normal")));
    actions.append(makeButton("異常達交", "abnormal-button", () => startCapture(delivery, "abnormal")));
  }

  return card;
}

function makeButton(text, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function startCapture(delivery, status) {
  state.pendingDelivery = delivery;
  state.pendingStatus = status;
  els.photoInput.click();
}

function openPhoto(delivery) {
  state.dialogDelivery = delivery;
  const stamp = encodeURIComponent(delivery.photo_updated_at || Date.now());
  els.photoTitle.textContent = `${delivery.invoice_no} ${delivery.status_label}`;
  els.photoPreview.src = delivery.local_photo_data || `/api/deliveries/${delivery.id}/photo?token=${encodeURIComponent(state.token)}&t=${stamp}`;
  els.photoDialog.showModal();
}

function upsertDelivery(delivery) {
  const index = state.deliveries.findIndex((item) => item.id === delivery.id);
  if (els.hideDoneToggle.checked && delivery.status) {
    if (index >= 0) {
      state.deliveries.splice(index, 1);
    }
    return;
  }
  if (index >= 0) {
    state.deliveries[index] = delivery;
  } else {
    state.deliveries.push(delivery);
  }
}

async function uploadPhoto(deliveryId, status, dataUrl, capturedAt = "") {
  return api(`/api/deliveries/${deliveryId}/photo`, {
    method: "POST",
    body: {
      token: state.token,
      status,
      delivery_date: state.selectedDate,
      photo_data: dataUrl,
      captured_at: capturedAt,
    },
  });
}

async function refreshPendingUploads() {
  if (!photoQueue || !photoQueue.isSupported()) {
    state.pendingUploads = [];
    updateQueueStatus();
    return;
  }

  try {
    const uploads = await photoQueue.list();
    state.pendingUploads = uploads.filter((upload) => !state.profile?.vehicle_no || upload.vehicle_no === state.profile.vehicle_no);
  } catch (error) {
    state.pendingUploads = [];
    updateQueueStatus("離線暫存讀取失敗");
    return;
  }
  updateQueueStatus();
}

async function queuePhotoUpload(delivery, status, dataUrl, capturedAt) {
  if (!photoQueue || !photoQueue.isSupported()) {
    setMessage("此瀏覽器不支援離線照片暫存", true);
    return;
  }

  const upload = offlineQueueApi.buildQueuedUpload({
    delivery,
    status,
    delivery_date: state.selectedDate,
    vehicle_no: state.profile?.vehicle_no || "",
    photo_data: dataUrl,
    captured_at: capturedAt,
  });

  try {
    await photoQueue.put(upload);
    await refreshPendingUploads();
    renderDeliveries();
    setMessage("網路中斷，照片已暫存，待網路恢復後上傳");
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function removePendingUpload(deliveryId) {
  if (!photoQueue || !photoQueue.isSupported()) {
    return;
  }

  await photoQueue.remove(deliveryId);
  await refreshPendingUploads();
}

async function syncPendingUploads() {
  if (!photoQueue || !photoQueue.isSupported() || state.syncInProgress || !state.token) {
    updateQueueStatus();
    return;
  }
  if (navigator.onLine === false) {
    updateQueueStatus();
    return;
  }

  const uploads = state.pendingUploads.length ? state.pendingUploads : await photoQueue.list();
  const currentVehicle = state.profile?.vehicle_no || "";
  const uploadsForSession = uploads.filter((upload) => !currentVehicle || upload.vehicle_no === currentVehicle);
  if (uploadsForSession.length === 0) {
    await refreshPendingUploads();
    return;
  }

  state.syncInProgress = true;
  updateQueueStatus();
  let uploadedCount = 0;
  try {
    for (const upload of uploadsForSession) {
      try {
        const result = await uploadPhoto(upload.delivery_id, upload.status, upload.photo_data, upload.captured_at);
        await photoQueue.remove(upload.delivery_id);
        upsertDelivery(result.delivery);
        state.counts = result.counts;
        uploadedCount += 1;
      } catch (error) {
        if (offlineQueueApi.shouldQueueUploadError(error, navigator.onLine)) {
          upload.attempt_count = (upload.attempt_count || 0) + 1;
          upload.last_error = error.message || "網路連線失敗";
          await photoQueue.put(upload);
          break;
        }

        upload.attempt_count = (upload.attempt_count || 0) + 1;
        upload.last_error = error.message || "補傳失敗";
        await photoQueue.put(upload);
        setMessage(upload.last_error, true);
        break;
      }
    }
  } finally {
    state.syncInProgress = false;
    await refreshPendingUploads();
    renderDeliveries();
    const completeMessage = offlineQueueApi.syncCompleteMessage(uploadedCount, state.pendingUploads.length);
    if (completeMessage) {
      setMessage(completeMessage);
    }
  }
}

function updateQueueStatus(message = "") {
  if (!els.queueStatus) {
    return;
  }
  localStorage.setItem("delivery_pending_upload_count", String(state.pendingUploads.length));
  window.dispatchEvent(new CustomEvent("delivery-pending-uploads-changed"));
  els.queueStatus.textContent = offlineQueueApi
    ? offlineQueueApi.queueStatusMessage({
        customMessage: message,
        isSupported: Boolean(photoQueue && photoQueue.isSupported()),
        syncInProgress: state.syncInProgress,
        pendingCount: state.pendingUploads.length,
        isOnline: navigator.onLine,
      })
    : "";
}

function currentLocalTimestamp() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 19);
}

async function compressToJpegDataUrl(file, maxSide, quality) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("照片壓縮失敗"));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("照片讀取失敗"));
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

function showDeliveryScreen() {
  els.loginScreen.hidden = true;
  els.deliveryScreen.hidden = false;
  els.routeTitle.textContent = state.profile.vehicle_no;
  els.routeDate.textContent = state.profile.delivery_date;
  els.driverName.textContent = state.profile.driver;
  els.reloadButton.hidden = true;
  renderDateSelect();
}

function resetDeliveryControls() {
  els.hideDoneToggle.checked = true;
  els.showAllPhotosToggle.checked = false;
}

function showLoginScreen() {
  els.deliveryScreen.hidden = true;
  els.loginScreen.hidden = false;
  state.token = "";
  localStorage.removeItem("delivery_token");
  localStorage.removeItem("delivery_permissions");
  loadVehicleOptions();
}

function renderDateSelect() {
  els.dateSelect.replaceChildren();
  const visibleDates = state.dates.slice(0, DRIVER_DATE_OPTION_LIMIT);
  for (const item of visibleDates) {
    const option = document.createElement("option");
    option.value = item.delivery_date;
    option.textContent = formatDate(item.delivery_date);
    option.selected = item.delivery_date === state.selectedDate;
    els.dateSelect.append(option);
  }
  els.datePanel.hidden = visibleDates.length <= 1;
}

function formatDate(value) {
  return value ? value.replaceAll("-", "/") : "";
}

function setMessage(message, isError = false) {
  els.message.textContent = message;
  els.message.style.color = isError ? "var(--danger)" : "var(--normal)";
}

function setPasswordIconHidden(icon, isHidden) {
  if (isHidden) {
    icon.setAttribute("hidden", "");
    return;
  }
  icon.removeAttribute("hidden");
}

async function loadVehicleOptions() {
  els.vehicleNo.placeholder = "載入車號中...";
  els.vehicleNo.disabled = true;
  els.vehicleSelect.replaceChildren(makeVehicleSelectOption("", "載入車號中..."));
  els.vehicleSelect.disabled = true;

  try {
    const result = await api("/api/vehicles");
    const vehicles = result.vehicles || [];
    const vehicleOptions = result.vehicle_options || vehicles.map((vehicleNo) => ({ vehicle_no: vehicleNo, driver: "" }));
    els.vehicleOptions.replaceChildren();
    els.vehicleSelect.replaceChildren(makeVehicleSelectOption("", vehicles.length ? "選擇車號" : "目前沒有車號"));

    for (const option of vehicleOptions) {
      const vehicleNo = option.vehicle_no || "";
      if (!vehicleNo) {
        continue;
      }
      els.vehicleOptions.append(makeVehicleOption(vehicleNo, formatVehicleOption(option)));
      els.vehicleSelect.append(makeVehicleSelectOption(vehicleNo, formatVehicleOption(option)));
    }

    els.vehicleNo.placeholder = vehicles.length ? "選擇或輸入車號" : "請輸入車號";
    syncVehicleSelect();
  } catch (error) {
    els.vehicleNo.placeholder = "請輸入車號";
    els.vehicleSelect.replaceChildren(makeVehicleSelectOption("", "車號載入失敗"));
    els.loginError.textContent = error.message;
  } finally {
    els.vehicleNo.disabled = false;
    els.vehicleSelect.disabled = false;
  }
}

function makeVehicleOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.label = label;
  return option;
}

function makeVehicleSelectOption(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

function formatVehicleOption(option) {
  return option.driver ? `${option.vehicle_no}:${option.driver}` : option.vehicle_no;
}

function syncVehicleSelect() {
  const vehicleNo = els.vehicleNo.value.trim();
  const hasOption = Array.from(els.vehicleSelect.options).some((option) => option.value === vehicleNo);
  els.vehicleSelect.value = hasOption ? vehicleNo : "";
}

function loadRememberedLogin() {
  if (!state.rememberedLogin) {
    return;
  }
  els.username.value = state.rememberedLogin.username || "";
  els.password.value = state.rememberedLogin.password || "";
  els.vehicleNo.value = state.rememberedLogin.vehicle_no || "";
  syncVehicleSelect();
  els.rememberLogin.checked = true;
}

function saveRememberedLogin(username, password, vehicleNo) {
  if (!els.rememberLogin.checked) {
    localStorage.removeItem("delivery_remembered_login");
    return;
  }
  localStorage.setItem("delivery_remembered_login", JSON.stringify({
    username,
    password,
    vehicle_no: vehicleNo,
  }));
}

loadRememberedLogin();

if (state.token && state.profile) {
  showDeliveryScreen();
  loadDeliveries();
} else {
  showLoginScreen();
}
