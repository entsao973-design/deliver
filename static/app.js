const state = {
  token: localStorage.getItem("delivery_token") || "",
  profile: JSON.parse(localStorage.getItem("delivery_profile") || "null"),
  deliveries: [],
  counts: { open: 0, done: 0, total: 0 },
  dates: [],
  selectedDate: localStorage.getItem("delivery_selected_date") || "",
  pendingDelivery: null,
  pendingStatus: null,
  dialogDelivery: null,
};

const els = {
  loginScreen: document.querySelector("#loginScreen"),
  deliveryScreen: document.querySelector("#deliveryScreen"),
  loginForm: document.querySelector("#loginForm"),
  username: document.querySelector("#username"),
  password: document.querySelector("#password"),
  vehicleNo: document.querySelector("#vehicleNo"),
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
  refreshButton: document.querySelector("#refreshButton"),
  reloadButton: document.querySelector("#reloadButton"),
  message: document.querySelector("#message"),
  deliveryList: document.querySelector("#deliveryList"),
  photoInput: document.querySelector("#photoInput"),
  photoDialog: document.querySelector("#photoDialog"),
  photoTitle: document.querySelector("#photoTitle"),
  photoPreview: document.querySelector("#photoPreview"),
  photoViewport: document.querySelector("#photoViewport"),
  photoZoomIn: document.querySelector("#photoZoomIn"),
  photoZoomOut: document.querySelector("#photoZoomOut"),
  photoZoomReset: document.querySelector("#photoZoomReset"),
  closePhotoButton: document.querySelector("#closePhotoButton"),
  retakeButton: document.querySelector("#retakeButton"),
};

createPhotoViewer({
  dialog: els.photoDialog,
  image: els.photoPreview,
  viewport: els.photoViewport,
  zoomIn: els.photoZoomIn,
  zoomOut: els.photoZoomOut,
  reset: els.photoZoomReset,
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
    saveRememberedLogin(payload.username, payload.vehicle_no);

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
    showDeliveryScreen();
    renderDeliveries();
  } catch (error) {
    els.loginError.textContent = error.message;
  }
});

els.logoutButton.addEventListener("click", () => {
  state.token = "";
  state.profile = null;
  state.deliveries = [];
  localStorage.removeItem("delivery_token");
  localStorage.removeItem("delivery_role");
  localStorage.removeItem("delivery_profile");
  localStorage.removeItem("delivery_selected_date");
  els.deliveryScreen.hidden = true;
  els.loginScreen.hidden = false;
});

els.dateSelect.addEventListener("change", () => {
  state.selectedDate = els.dateSelect.value;
  localStorage.setItem("delivery_selected_date", state.selectedDate);
  loadDeliveries();
});

els.hideDoneToggle.addEventListener("change", loadDeliveries);
els.refreshButton.addEventListener("click", loadDeliveries);
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

  setMessage("照片處理中...");
  try {
    const dataUrl = await compressToJpegDataUrl(file, 1800, 0.86);
    const result = await api(`/api/deliveries/${state.pendingDelivery.id}/photo`, {
      method: "POST",
      body: {
        token: state.token,
        status: state.pendingStatus,
        delivery_date: state.selectedDate,
        photo_data: dataUrl,
      },
    });

    upsertDelivery(result.delivery);
    state.counts = result.counts;
    renderDeliveries();
    setMessage("照片已送出");
  } catch (error) {
    setMessage(error.message, true);
  } finally {
    state.pendingDelivery = null;
    state.pendingStatus = null;
  }
});

els.closePhotoButton.addEventListener("click", () => els.photoDialog.close());
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
    showDeliveryScreen();
    renderDeliveries();
    setMessage("");
  } catch (error) {
    setMessage(error.message, true);
    if (error.status === 401) {
      showLoginScreen();
    }
  }
}

function renderDeliveries() {
  const shown = state.deliveries;
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

  const badgeClass = delivery.status === "normal" ? "normal" : delivery.status === "abnormal" ? "abnormal" : "";
  card.innerHTML = `
    <div class="card-main">
      <div class="card-title-row">
        <h2 class="customer"></h2>
        <span class="badge ${badgeClass}"></span>
      </div>
      <div class="meta-line">
        <span class="invoice"></span>
        <span class="company"></span>
      </div>
      <div class="meta-line updated-line"></div>
    </div>
    <div class="actions"></div>
  `;

  card.querySelector(".customer").textContent = delivery.customer;
  card.querySelector(".badge").textContent = delivery.status_label;
  card.querySelector(".invoice").textContent = delivery.invoice_no;
  card.querySelector(".company").textContent = delivery.company;
  card.querySelector(".updated-line").textContent = delivery.photo_updated_at
    ? `照片時間 ${delivery.photo_updated_at}`
    : "";

  const actions = card.querySelector(".actions");
  if (delivery.has_photo) {
    actions.append(makeButton("查看照片", "secondary-button wide", () => openPhoto(delivery)));
    actions.append(makeButton("重新拍照", "secondary-button", () => startCapture(delivery, delivery.status || "normal")));
    actions.append(
      makeButton(delivery.status === "normal" ? "改異常" : "改正常", delivery.status === "normal" ? "abnormal-button" : "normal-button", () =>
        startCapture(delivery, delivery.status === "normal" ? "abnormal" : "normal"),
      ),
    );
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
  els.photoPreview.src = `/api/deliveries/${delivery.id}/photo?token=${encodeURIComponent(state.token)}&t=${stamp}`;
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

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || "系統錯誤");
    error.status = response.status;
    throw error;
  }
  return payload;
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

function showLoginScreen() {
  els.deliveryScreen.hidden = true;
  els.loginScreen.hidden = false;
  state.token = "";
  localStorage.removeItem("delivery_token");
}

function renderDateSelect() {
  els.dateSelect.replaceChildren();
  for (const item of state.dates) {
    const option = document.createElement("option");
    option.value = item.delivery_date;
    option.textContent = formatDate(item.delivery_date);
    option.selected = item.delivery_date === state.selectedDate;
    els.dateSelect.append(option);
  }
  els.datePanel.hidden = state.dates.length <= 1;
}

function formatDate(value) {
  return value ? value.replaceAll("-", "/") : "";
}

function setMessage(message, isError = false) {
  els.message.textContent = message;
  els.message.style.color = isError ? "var(--danger)" : "var(--normal)";
}

function loadRememberedLogin() {
  const remembered = JSON.parse(localStorage.getItem("delivery_remembered_login") || "null");
  if (!remembered) {
    return;
  }
  els.username.value = remembered.username || "";
  els.vehicleNo.value = remembered.vehicle_no || "";
  els.rememberLogin.checked = true;
}

function saveRememberedLogin(username, vehicleNo) {
  if (!els.rememberLogin.checked) {
    localStorage.removeItem("delivery_remembered_login");
    return;
  }
  localStorage.setItem("delivery_remembered_login", JSON.stringify({
    username,
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
