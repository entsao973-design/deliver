const adminState = {
  token: localStorage.getItem("delivery_token") || "",
  view: "deliveries",
  options: { dates: [], companies: [], drivers: [] },
  deliveries: [],
  deletedDeliveries: [],
  uploadFiles: [],
  archives: [],
  archiveRequestId: 0,
  showAllPhotos: false,
  photoDelivery: null,
};

const adminEls = {
  loginScreen: document.querySelector("#adminLoginScreen"),
  app: document.querySelector("#adminApp"),
  loginForm: document.querySelector("#adminLoginForm"),
  loginUsername: document.querySelector("#adminLoginUsername"),
  loginPassword: document.querySelector("#adminLoginPassword"),
  togglePassword: document.querySelector("#adminTogglePassword"),
  passwordEyeOpen: document.querySelector("#adminPasswordEyeOpen"),
  passwordEyeClosed: document.querySelector("#adminPasswordEyeClosed"),
  loginError: document.querySelector("#adminLoginError"),
  logout: document.querySelector("#adminLogout"),
  message: document.querySelector("#adminMessage"),
  tabs: document.querySelectorAll(".tab-button"),
  views: {
    deliveries: document.querySelector("#deliveriesView"),
    deleted: document.querySelector("#deletedView"),
    upload: document.querySelector("#uploadView"),
    archive: document.querySelector("#archiveView"),
    maintenance: document.querySelector("#maintenanceView"),
    users: document.querySelector("#usersView"),
  },
  filterStartDate: document.querySelector("#filterStartDate"),
  filterEndDate: document.querySelector("#filterEndDate"),
  filterCompany: document.querySelector("#filterCompany"),
  filterDriver: document.querySelector("#filterDriver"),
  deliveryCounts: document.querySelector("#adminDeliveryCounts"),
  deletedFilterStartDate: document.querySelector("#deletedFilterStartDate"),
  deletedFilterEndDate: document.querySelector("#deletedFilterEndDate"),
  deletedFilterCompany: document.querySelector("#deletedFilterCompany"),
  deletedFilterDriver: document.querySelector("#deletedFilterDriver"),
  deletedDeliveryCounts: document.querySelector("#deletedDeliveryCounts"),
  applyFilters: document.querySelector("#applyFilters"),
  applyDeletedFilters: document.querySelector("#applyDeletedFilters"),
  bulkDeleteFiltered: document.querySelector("#bulkDeleteFiltered"),
  bulkPermanentDeleteFiltered: document.querySelector("#bulkPermanentDeleteFiltered"),
  toggleAllPhotos: document.querySelector("#toggleAllPhotos"),
  deliveryList: document.querySelector("#adminDeliveryList"),
  deletedList: document.querySelector("#deletedDeliveryList"),
  dropZone: document.querySelector("#dropZone"),
  excelFile: document.querySelector("#excelFile"),
  uploadExcel: document.querySelector("#uploadExcel"),
  importSummary: document.querySelector("#importSummary"),
  archiveDate: document.querySelector("#archiveDate"),
  archivePhotos: document.querySelector("#archivePhotos"),
  archiveList: document.querySelector("#archiveList"),
  downloadArchives: document.querySelector("#downloadArchives"),
  maintenanceStartDate: document.querySelector("#maintenanceStartDate"),
  maintenanceEndDate: document.querySelector("#maintenanceEndDate"),
  cleanupDeliveryHistory: document.querySelector("#cleanupDeliveryHistory"),
  userUsername: document.querySelector("#userUsername"),
  userRole: document.querySelector("#userRole"),
  userPassword: document.querySelector("#userPassword"),
  userActive: document.querySelector("#userActive"),
  saveUser: document.querySelector("#saveUser"),
  userList: document.querySelector("#userList"),
  photoDialog: document.querySelector("#adminPhotoDialog"),
  photoTitle: document.querySelector("#adminPhotoTitle"),
  photoPreview: document.querySelector("#adminPhotoPreview"),
  photoViewport: document.querySelector("#adminPhotoViewport"),
  photoRotateLeft: document.querySelector("#adminPhotoRotateLeft"),
  photoRotateRight: document.querySelector("#adminPhotoRotateRight"),
  photoRotateError: document.querySelector("#adminPhotoRotateError"),
  closePhoto: document.querySelector("#closeAdminPhoto"),
};

createPhotoViewer({
  dialog: adminEls.photoDialog,
  image: adminEls.photoPreview,
  viewport: adminEls.photoViewport,
  wheelRequiresCtrl: true,
});

adminEls.logout.addEventListener("click", () => {
  localStorage.removeItem("delivery_token");
  localStorage.removeItem("delivery_role");
  adminState.token = "";
  showAdminLogin();
});
adminEls.loginForm.addEventListener("submit", handleAdminLogin);
adminEls.togglePassword.addEventListener("click", () => {
  const isVisible = adminEls.loginPassword.type === "password";
  adminEls.loginPassword.type = isVisible ? "text" : "password";
  adminEls.togglePassword.setAttribute("aria-label", isVisible ? "隱藏密碼" : "顯示密碼");
  adminEls.togglePassword.setAttribute("aria-pressed", String(isVisible));
  setAdminPasswordIconHidden(adminEls.passwordEyeOpen, isVisible);
  setAdminPasswordIconHidden(adminEls.passwordEyeClosed, !isVisible);
});

for (const button of adminEls.tabs) {
  button.addEventListener("click", () => setView(button.dataset.view));
}

adminEls.applyFilters.addEventListener("click", () => applyAdminFilters(false));
adminEls.applyDeletedFilters.addEventListener("click", () => applyAdminFilters(true));
adminEls.bulkDeleteFiltered.addEventListener("click", bulkDeleteFilteredDeliveries);
adminEls.bulkPermanentDeleteFiltered.addEventListener("click", bulkPermanentDeleteFilteredDeliveries);
adminEls.toggleAllPhotos.addEventListener("click", () => {
  adminState.showAllPhotos = !adminState.showAllPhotos;
  updateToggleAllPhotosButton();
  loadDeliveries(false);
});
adminEls.excelFile.addEventListener("change", () => setUploadFiles([...adminEls.excelFile.files]));
adminEls.uploadExcel.addEventListener("click", uploadExcel);
adminEls.archivePhotos.addEventListener("click", archivePhotos);
adminEls.archiveDate.addEventListener("change", loadArchives);
adminEls.downloadArchives.addEventListener("click", downloadSelectedArchives);
adminEls.cleanupDeliveryHistory.addEventListener("click", cleanupDeliveryHistory);
adminEls.saveUser.addEventListener("click", saveUser);
adminEls.photoRotateLeft.addEventListener("click", () => rotateAdminPhoto(-90, adminEls.photoRotateLeft));
adminEls.photoRotateRight.addEventListener("click", () => rotateAdminPhoto(90, adminEls.photoRotateRight));
adminEls.closePhoto.addEventListener("click", (event) => {
  event.preventDefault();
  if (adminEls.photoDialog.open) {
    adminEls.photoDialog.close();
  }
});
adminEls.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  adminEls.dropZone.classList.add("dragging");
});
adminEls.dropZone.addEventListener("dragleave", () => adminEls.dropZone.classList.remove("dragging"));
adminEls.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  adminEls.dropZone.classList.remove("dragging");
  setUploadFiles([...event.dataTransfer.files].filter((file) => /\.(xlsm|xlsx)$/i.test(file.name)));
});

async function initAdmin() {
  if (!adminState.token || localStorage.getItem("delivery_role") !== "admin") {
    showAdminLogin();
    return;
  }

  try {
    showAdminApp();
    const today = todayISO();
    adminEls.filterStartDate.value = today;
    adminEls.filterEndDate.value = today;
    adminEls.deletedFilterStartDate.value = today;
    adminEls.deletedFilterEndDate.value = today;
    adminEls.archiveDate.value = today;
    adminEls.maintenanceStartDate.value = today;
    adminEls.maintenanceEndDate.value = today;
    updateToggleAllPhotosButton();
    await loadOptions();
    await loadDeliveries(false);
    await loadUsers();
  } catch (error) {
    setAdminMessage(error.message, true);
    if (error.status === 401 || error.status === 403) {
      showAdminLogin();
    }
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();
  adminEls.loginError.textContent = "";

  try {
    const result = await adminApi("/api/login", {
      method: "POST",
      body: {
        username: adminEls.loginUsername.value.trim(),
        password: adminEls.loginPassword.value,
      },
    });
    if (result.role !== "admin") {
      throw new Error("此帳號不是管理者");
    }
    adminState.token = result.token;
    localStorage.setItem("delivery_token", result.token);
    localStorage.setItem("delivery_role", result.role);
    adminEls.loginPassword.value = "";
    await initAdmin();
  } catch (error) {
    adminEls.loginError.textContent = error.message;
  }
}

function showAdminLogin() {
  adminEls.app.hidden = true;
  adminEls.loginScreen.hidden = false;
}

function showAdminApp() {
  adminEls.loginScreen.hidden = true;
  adminEls.app.hidden = false;
  clearAdminMessage();
}

function setView(view) {
  adminState.view = view;
  for (const button of adminEls.tabs) {
    button.classList.toggle("active", button.dataset.view === view);
  }
  for (const [name, section] of Object.entries(adminEls.views)) {
    section.hidden = name !== view;
  }
  if (view === "deleted") {
    loadDeliveries(true);
  }
  if (view === "users") {
    loadUsers();
  }
  if (view === "archive") {
    loadArchives();
  }
}

async function applyAdminFilters(deleted) {
  clearAdminMessage();
  await loadOptions(deleted);
  await loadDeliveries(deleted);
}

async function loadOptions(deleted = null) {
  if (deleted === null) {
    await Promise.all([loadOptions(false), loadOptions(true)]);
    return;
  }

  const startDateEl = deleted ? adminEls.deletedFilterStartDate : adminEls.filterStartDate;
  const endDateEl = deleted ? adminEls.deletedFilterEndDate : adminEls.filterEndDate;
  const companyEl = deleted ? adminEls.deletedFilterCompany : adminEls.filterCompany;
  const driverEl = deleted ? adminEls.deletedFilterDriver : adminEls.filterDriver;

  const options = await adminApi(AdminFilterOptions.buildAdminOptionsPath(adminState.token, {
    deleted,
    startDate: startDateEl.value,
    endDate: endDateEl.value,
  }));
  if (!deleted) {
    adminState.options = options;
  }
  fillSelect(
    companyEl,
    options.companies,
    "全部公司",
    AdminFilterOptions.preservedSelectValue(companyEl.value, options.companies),
  );
  fillSelect(
    driverEl,
    options.drivers,
    "全部物流士",
    AdminFilterOptions.preservedSelectValue(driverEl.value, options.drivers),
  );
}

async function loadDeliveries(deleted) {
  const startDateEl = deleted ? adminEls.deletedFilterStartDate : adminEls.filterStartDate;
  const endDateEl = deleted ? adminEls.deletedFilterEndDate : adminEls.filterEndDate;
  const companyEl = deleted ? adminEls.deletedFilterCompany : adminEls.filterCompany;
  const driverEl = deleted ? adminEls.deletedFilterDriver : adminEls.filterDriver;
  const listEl = deleted ? adminEls.deletedList : adminEls.deliveryList;
  const params = new URLSearchParams({
    token: adminState.token,
    deleted: deleted ? "1" : "0",
  });
  if (startDateEl.value) params.set("start_date", startDateEl.value);
  if (endDateEl.value) params.set("end_date", endDateEl.value);
  if (companyEl.value) params.set("company", companyEl.value);
  if (driverEl.value) params.set("driver", driverEl.value);

  const result = await adminApi(`/api/admin/deliveries?${params}`);
  const hideDeliveryDate = Boolean(startDateEl.value && startDateEl.value === endDateEl.value);
  adminState[deleted ? "deletedDeliveries" : "deliveries"] = result.deliveries;
  updateDeliveryCounts(deleted ? adminEls.deletedDeliveryCounts : adminEls.deliveryCounts, result.deliveries);
  renderDeliveries(listEl, result.deliveries, deleted, hideDeliveryDate);
}

function updateDeliveryCounts(element, deliveries) {
  if (!element) {
    return;
  }

  const totalCount = deliveries.length;
  const deliveredCount = deliveries.filter((delivery) => Boolean(delivery.status)).length;
  const pendingCount = totalCount - deliveredCount;
  element.replaceChildren(
    makeCountSpan(`已達交: ${deliveredCount}`),
    makeCountSpan(`未達交: ${pendingCount}`),
    makeCountSpan(`共: ${totalCount}`),
  );
}

function makeCountSpan(text) {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function renderDeliveries(container, deliveries, deleted, hideDeliveryDate = false) {
  container.replaceChildren();
  if (deliveries.length === 0) {
    const empty = document.createElement("div");
    empty.className = deleted ? "admin-card deleted-card" : "admin-card";
    empty.textContent = deleted ? "刪除區沒有資料" : "沒有符合條件的配送單";
    container.append(empty);
    return;
  }

  for (const delivery of deliveries) {
    const showInlinePhoto = AdminPhotoView.shouldRenderInlinePhoto(delivery, deleted, adminState.showAllPhotos);
    const card = document.createElement("article");
    card.className = `${deleted ? "admin-card delivery-row deleted-card" : "admin-card delivery-row"}${hideDeliveryDate ? " hide-date" : ""}${showInlinePhoto ? " has-inline-photo" : ""}`;
    card.innerHTML = `
      <strong class="admin-customer"></strong>
      <span class="admin-row-cell admin-document"></span>
      <div class="admin-inline-photo-toolbar"></div>
      <span class="admin-row-cell admin-route"></span>
      <span class="admin-row-cell admin-status"></span>
      <div class="admin-actions admin-row-actions"></div>
    `;
    card.querySelector(".admin-customer").textContent = delivery.customer || "";
    card.querySelector(".admin-document").textContent = [
      hideDeliveryDate ? "" : delivery.delivery_date,
      delivery.company,
      delivery.invoice_no,
    ].filter(Boolean).join(" | ");
    card.querySelector(".admin-route").textContent = [delivery.driver, delivery.vehicle_no].filter(Boolean).join(" | ");
    const statusEl = card.querySelector(".admin-status");
    statusEl.textContent = delivery.status_label || "";
    statusEl.classList.toggle("status-normal", delivery.status === "normal");
    statusEl.classList.toggle("status-abnormal", delivery.status === "abnormal");

    const rowActions = card.querySelector(".admin-row-actions");
    if (delivery.has_photo) {
      if (!showInlinePhoto) {
        rowActions.append(makeAdminButton("檢視照片", "secondary-button", () => openAdminPhoto(delivery)));
      }
    }
    if (deleted) {
      rowActions.append(makeAdminButton("還原", "secondary-button", (button) => restoreDelivery(delivery, button)));
      rowActions.append(makeAdminButton("永久刪除", "danger-button", (button) => permanentlyDelete(delivery, button)));
    } else {
      rowActions.append(makeAdminButton("刪除", "danger-button", (button) => deleteDelivery(delivery, button)));
    }
    if (showInlinePhoto) {
      const inlinePhotoToolbar = card.querySelector(".admin-inline-photo-toolbar");
      card.append(createAdminInlinePhoto(delivery, inlinePhotoToolbar));
    }
    container.append(card);
  }
}

function createAdminInlinePhoto(delivery, toolbar) {
  const wrapper = document.createElement("div");
  wrapper.className = "admin-inline-photo-frame";

  const photo = document.createElement("img");
  photo.className = "admin-inline-photo";
  photo.alt = `${delivery.invoice_no} 達交照片`;
  setAdminPhotoSource(photo, delivery);

  const rotateError = document.createElement("span");
  rotateError.className = "photo-rotate-error";
  rotateError.setAttribute("aria-live", "polite");
  const rotateLeft = makePhotoIconButton("左轉90度", "↺", (button) => rotateAdminInlinePhoto(delivery, photo, -90, button, rotateError));
  const rotateRight = makePhotoIconButton("右轉90度", "↻", (button) => rotateAdminInlinePhoto(delivery, photo, 90, button, rotateError));
  toolbar.append(rotateLeft, rotateRight, rotateError);

  const viewport = document.createElement("div");
  viewport.className = "admin-inline-photo-viewport";
  viewport.append(photo);
  createPhotoViewer({
    viewport,
    image: photo,
    useWindowResize: false,
    wheelRequiresCtrl: true,
    wheelScrollTarget: () => viewport.closest(".admin-list"),
    touchScrollTarget: () => viewport.closest(".admin-list"),
  });

  wrapper.append(viewport);
  return wrapper;
}

async function uploadExcel() {
  if (adminState.uploadFiles.length === 0) {
    setAdminMessage("請先選擇或拖放 Excel 檔案", true);
    return;
  }

  await AdminOperationState.runWithButtonLock(adminEls.uploadExcel, "匯入中...", async () => {
    setAdminMessage("匯入中...");
    const lines = [];
    try {
      for (const file of adminState.uploadFiles) {
        const fileData = await readFileDataUrl(file);
        const result = await adminApi("/api/admin/import", {
          method: "POST",
          body: {
            token: adminState.token,
            filename: file.name,
            file_data: fileData,
          },
        });
        lines.push(
          [
            file.name,
            `新增：${result.summary.inserted}`,
            `更新：${result.summary.updated}`,
            `略過：${result.summary.skipped}`,
            `已達交不可匯入：${result.summary.locked_delivered}`,
          ].join("\n"),
        );
      }
      adminEls.excelFile.value = "";
      setUploadFiles([]);
      adminEls.importSummary.textContent = lines.join("\n\n");
      await loadOptions();
      await loadDeliveries(false);
      setAdminMessage("匯入完成");
    } catch (error) {
      setAdminMessage(error.message, true);
    }
  });
}

async function archivePhotos() {
  if (!adminEls.archiveDate.value) {
    setAdminMessage("請選擇封存日期", true);
    return;
  }

  const deliveryDate = adminEls.archiveDate.value;
  const requestId = ++adminState.archiveRequestId;
  await AdminOperationState.runWithButtonLock(adminEls.archivePhotos, "封存中...", async () => {
    setAdminMessage("封存中...");
    try {
      const result = await adminApi("/api/admin/archive", {
        method: "POST",
        body: {
          token: adminState.token,
          delivery_date: deliveryDate,
        },
      });
      if (requestId !== adminState.archiveRequestId) {
        return;
      }
      adminState.archives = result.archives;
      renderArchives();
      setAdminMessage(result.archives.length ? "封存完成" : "該日期沒有可封存照片");
    } catch (error) {
      setAdminMessage(error.message, true);
    }
  });
}

async function loadArchives() {
  const deliveryDate = adminEls.archiveDate.value;
  const requestId = ++adminState.archiveRequestId;
  if (!deliveryDate) {
    adminState.archives = [];
    renderArchives();
    return;
  }

  try {
    const result = await adminApi(`/api/admin/archives?token=${encodeURIComponent(adminState.token)}&delivery_date=${encodeURIComponent(deliveryDate)}`);
    if (requestId !== adminState.archiveRequestId) {
      return;
    }
    adminState.archives = result.archives;
    renderArchives();
  } catch (error) {
    if (requestId !== adminState.archiveRequestId) {
      return;
    }
    adminState.archives = [];
    renderArchives();
    setAdminMessage(error.message, true);
  }
}

async function cleanupDeliveryHistory() {
  const startDate = adminEls.maintenanceStartDate.value;
  const endDate = adminEls.maintenanceEndDate.value;
  if (!startDate || !endDate) {
    setAdminMessage("請選擇開始日期與結束日期", true);
    return;
  }
  if (startDate > endDate) {
    setAdminMessage("開始日期不得晚於結束日期", true);
    return;
  }
  if (!confirm(`確定永久清除 ${startDate} 至 ${endDate} 的以下內容嗎？
- 全部配送紀錄
- 已達交照片
- 封存 ZIP

此清除無法恢復，請務必確定後執行。`)) {
    return;
  }

  await AdminOperationState.runWithButtonLock(adminEls.cleanupDeliveryHistory, "清除中...", async () => {
    setAdminMessage("清除中...");
    try {
      const result = await adminApi("/api/admin/maintenance/cleanup", {
        method: "POST",
        body: {
          token: adminState.token,
          start_date: startDate,
          end_date: endDate,
        },
      });
      await loadOptions();
      await Promise.all([loadDeliveries(false), loadDeliveries(true)]);
      const summary = result.summary;
      setAdminMessage(
        `已清除配送紀錄 ${summary.deleted_records} 筆、照片日期資料夾 ${summary.deleted_photo_date_folders} 個、封存 ZIP ${summary.deleted_archives} 個`,
      );
    } catch (error) {
      setAdminMessage(error.message, true);
    }
  });
}

function renderArchives() {
  adminEls.archiveList.replaceChildren();
  if (adminState.archives.length === 0) {
    const empty = document.createElement("div");
    empty.className = "admin-card archive-row";
    empty.textContent = "此日期尚無封存檔案";
    adminEls.archiveList.append(empty);
    return;
  }

  for (const archive of adminState.archives) {
    const row = document.createElement("article");
    row.className = "admin-card archive-row";
    row.innerHTML = `
      <input type="checkbox" checked />
      <div>
        <h3></h3>
        <div class="admin-meta"></div>
      </div>
      <button class="secondary-button" type="button">下載</button>
    `;
    row.querySelector("input").dataset.name = archive.name;
    row.querySelector("h3").textContent = archive.name;
    row.querySelector(".admin-meta").textContent = `${archive.company} | ${formatBytes(archive.size)}`;
    row.querySelector("button").addEventListener("click", () => downloadArchive(archive.name));
    adminEls.archiveList.append(row);
  }
}

function downloadSelectedArchives() {
  const checked = [...adminEls.archiveList.querySelectorAll("input[type='checkbox']:checked")];
  if (checked.length === 0) {
    setAdminMessage("請先勾選要下載的 ZIP", true);
    return;
  }
  for (const checkbox of checked) {
    downloadArchive(checkbox.dataset.name);
  }
}

function downloadArchive(name) {
  const link = document.createElement("a");
  link.href = `/api/admin/archives/${encodeURIComponent(name)}?token=${encodeURIComponent(adminState.token)}`;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}

async function deleteDelivery(delivery, button) {
  if (!confirm(`確定刪除 ${delivery.invoice_no}？`)) {
    return;
  }
  await AdminOperationState.runWithButtonLock(button, "刪除中...", async () => {
    try {
      const result = await adminApi(`/api/admin/deliveries/${delivery.id}/delete`, {
        method: "POST",
        body: { token: adminState.token },
      });
      await loadOptions();
      await loadDeliveries(false);
      setAdminMessage(result.mode === "archived" ? "單據已移到刪除區" : "已刪除");
    } catch (error) {
      setAdminMessage(error.message, true);
    }
  });
}

function currentDeliveryIds(deleted) {
  return (deleted ? adminState.deletedDeliveries : adminState.deliveries)
    .map((delivery) => delivery.id)
    .filter(Boolean);
}

async function bulkDeleteFilteredDeliveries() {
  const deliveryIds = currentDeliveryIds(false);
  if (deliveryIds.length === 0) {
    setAdminMessage("目前沒有可刪除的配送紀錄", true);
    return;
  }
  if (!confirm(`確定將目前篩選出的 ${deliveryIds.length} 筆配送紀錄移到刪除區嗎？`)) {
    return;
  }

  await AdminOperationState.runWithButtonLock(adminEls.bulkDeleteFiltered, "刪除中...", async () => {
    try {
      const result = await adminApi("/api/admin/deliveries/bulk-delete", {
        method: "POST",
        body: {
          token: adminState.token,
          delivery_ids: deliveryIds,
        },
      });
      await loadOptions();
      await loadDeliveries(false);
      setAdminMessage(`已將 ${result.summary.deleted_records} 筆配送紀錄移到刪除區`);
    } catch (error) {
      setAdminMessage(error.message, true);
    }
  });
}

async function restoreDelivery(delivery, button) {
  if (!confirm(`確定還原 ${delivery.invoice_no}？`)) {
    return;
  }
  await AdminOperationState.runWithButtonLock(button, "還原中...", async () => {
    try {
      await adminApi(`/api/admin/deliveries/${delivery.id}/restore`, {
        method: "POST",
        body: { token: adminState.token },
      });
      await loadOptions();
      await loadDeliveries(true);
      setAdminMessage("已還原");
    } catch (error) {
      setAdminMessage(error.message, true);
    }
  });
}

async function bulkPermanentDeleteFilteredDeliveries() {
  const deliveryIds = currentDeliveryIds(true);
  if (deliveryIds.length === 0) {
    setAdminMessage("目前沒有可永久刪除的配送紀錄", true);
    return;
  }
  if (!confirm(`確定永久清除目前篩選出的 ${deliveryIds.length} 筆刪除區配送紀錄嗎？
- 篩選出的配送紀錄
- 對應已達交照片

此清除無法恢復，請務必確定後執行。`)) {
    return;
  }

  await AdminOperationState.runWithButtonLock(adminEls.bulkPermanentDeleteFiltered, "永久刪除中...", async () => {
    try {
      const result = await adminApi("/api/admin/deliveries/bulk-permanent-delete", {
        method: "POST",
        body: {
          token: adminState.token,
          delivery_ids: deliveryIds,
        },
      });
      await loadOptions();
      await loadDeliveries(true);
      setAdminMessage(`已永久刪除 ${result.summary.deleted_records} 筆配送紀錄`);
    } catch (error) {
      setAdminMessage(error.message, true);
    }
  });
}

async function permanentlyDelete(delivery, button) {
  if (!confirm(`確定永久刪除 ${delivery.invoice_no}？此動作無法復原。`)) {
    return;
  }
  await AdminOperationState.runWithButtonLock(button, "永久刪除中...", async () => {
    try {
      await adminApi(`/api/admin/deliveries/${delivery.id}/permanent-delete`, {
        method: "POST",
        body: { token: adminState.token },
      });
      await loadDeliveries(true);
      setAdminMessage("已永久刪除");
    } catch (error) {
      setAdminMessage(error.message, true);
    }
  });
}

async function loadUsers() {
  const result = await adminApi(`/api/admin/users?token=${encodeURIComponent(adminState.token)}`);
  adminEls.userList.replaceChildren();
  for (const user of result.users) {
    const card = document.createElement("article");
    card.className = "admin-card";
    card.innerHTML = `
      <div>
        <h3></h3>
        <div class="admin-meta"></div>
      </div>
      <div class="admin-meta user-state"></div>
      <div class="admin-actions"></div>
    `;
    card.querySelector("h3").textContent = user.username;
    card.querySelector(".admin-meta").textContent = user.role === "admin" ? "管理人員" : "司機";
    card.querySelector(".user-state").textContent = [
      user.active ? "啟用" : "停用",
      `失敗 ${user.failed_attempts} 次`,
      user.locked_until ? `鎖定至 ${user.locked_until}` : "",
    ].filter(Boolean).join(" | ");

    const actions = card.querySelector(".admin-actions");
    actions.append(makeAdminButton("載入", "secondary-button", () => fillUserForm(user)));
    actions.append(makeAdminButton("刪除", "danger-button", () => deleteUser(user.username)));
    adminEls.userList.append(card);
  }
}

async function saveUser() {
  try {
    await adminApi("/api/admin/users", {
      method: "POST",
      body: {
        token: adminState.token,
        username: adminEls.userUsername.value.trim(),
        role: adminEls.userRole.value,
        password: adminEls.userPassword.value,
        active: adminEls.userActive.checked,
      },
    });
    adminEls.userPassword.value = "";
    await loadUsers();
    setAdminMessage("帳號已儲存");
  } catch (error) {
    setAdminMessage(error.message, true);
  }
}

async function deleteUser(username) {
  if (!confirm(`確定刪除帳號 ${username}？`)) {
    return;
  }
  try {
    await adminApi("/api/admin/users/delete", {
      method: "POST",
      body: { token: adminState.token, username },
    });
    await loadUsers();
    setAdminMessage("帳號已刪除");
  } catch (error) {
    setAdminMessage(error.message, true);
  }
}

function fillUserForm(user) {
  adminEls.userUsername.value = user.username;
  adminEls.userRole.value = user.role;
  adminEls.userPassword.value = "";
  adminEls.userActive.checked = user.active;
}

function openAdminPhoto(delivery) {
  adminState.photoDelivery = delivery;
  setAdminPhotoPreview(delivery);
  clearPhotoRotateError(adminEls.photoRotateError);
  adminEls.photoDialog.showModal();
}

function setAdminPhotoPreview(delivery) {
  adminEls.photoTitle.textContent = `${delivery.invoice_no} ${delivery.status_label}`;
  setAdminPhotoSource(adminEls.photoPreview, delivery);
}

function setAdminPhotoSource(image, delivery) {
  const stamp = encodeURIComponent(delivery.photo_updated_at || Date.now());
  image.src = `/api/deliveries/${delivery.id}/photo?token=${encodeURIComponent(adminState.token)}&t=${stamp}`;
}

async function rotateAdminPhoto(degrees, button) {
  if (!adminState.photoDelivery) {
    return;
  }

  await runPhotoRotateWithFailureMessage(button, adminEls.photoRotateError, async () => {
    const result = await saveRotatedAdminPhoto(adminState.photoDelivery, adminEls.photoPreview, degrees);
    adminState.photoDelivery = result.delivery;
    setAdminPhotoPreview(result.delivery);
    await loadDeliveries(adminState.view === "deleted");
  });
}

async function rotateAdminInlinePhoto(delivery, image, degrees, button, errorEl) {
  await runPhotoRotateWithFailureMessage(button, errorEl, async () => {
    const result = await saveRotatedAdminPhoto(delivery, image, degrees);
    Object.assign(delivery, result.delivery);
    setAdminPhotoSource(image, result.delivery);
    if (adminState.photoDelivery && adminState.photoDelivery.id === result.delivery.id) {
      adminState.photoDelivery = result.delivery;
      setAdminPhotoPreview(result.delivery);
    }
  });
}

async function runPhotoRotateWithFailureMessage(button, errorEl, operation) {
  if (button.disabled) {
    return;
  }

  clearPhotoRotateError(errorEl);
  button.disabled = true;
  button.setAttribute("aria-busy", "true");

  try {
    await operation();
  } catch (error) {
    setPhotoRotateError(errorEl, error.message);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function clearPhotoRotateError(errorEl) {
  setPhotoRotateError(errorEl, "");
}

function setPhotoRotateError(errorEl, message) {
  if (errorEl) {
    errorEl.textContent = message;
  }
}

async function saveRotatedAdminPhoto(delivery, image, degrees) {
  const photoData = rotatedPhotoDataUrl(image, degrees);
  return adminApi(`/api/admin/deliveries/${delivery.id}/photo`, {
    method: "POST",
    body: {
      token: adminState.token,
      status: delivery.status || "normal",
      photo_data: photoData,
    },
  });
}

function rotatedPhotoDataUrl(image, degrees) {
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) {
    throw new Error("照片尚未載入完成");
  }

  const normalized = ((degrees % 360) + 360) % 360;
  const swapSize = normalized === 90 || normalized === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swapSize ? image.naturalHeight : image.naturalWidth;
  canvas.height = swapSize ? image.naturalWidth : image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("照片處理失敗");
  }

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function updateToggleAllPhotosButton() {
  adminEls.toggleAllPhotos.textContent = AdminPhotoView.showAllPhotosButtonText(adminState.showAllPhotos);
}

function fillSelect(select, values, placeholder, selectedValue = "") {
  select.replaceChildren();
  const all = document.createElement("option");
  all.value = "";
  all.textContent = placeholder;
  select.append(all);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
  select.value = selectedValue;
}

function setUploadFiles(files) {
  adminState.uploadFiles = files;
  adminEls.dropZone.querySelector("span").textContent = files.length
    ? files.map((file) => file.name).join("、")
    : "或點下方選取多個檔案";
}

function makeAdminButton(text, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.addEventListener("click", () => onClick(button));
  return button;
}

function makePhotoIconButton(label, icon, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button photo-icon-button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.textContent = icon;
  button.addEventListener("click", () => onClick(button));
  return button;
}

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("檔案讀取失敗"));
    reader.readAsDataURL(file);
  });
}

async function adminApi(path, options = {}) {
  return AdminApi.request(path, options);
}

function setAdminMessage(message, isError = false) {
  adminEls.message.textContent = message;
  adminEls.message.style.color = isError ? "var(--danger)" : "var(--normal)";
}

function clearAdminMessage() {
  setAdminMessage("", false);
}

function setAdminPasswordIconHidden(icon, isHidden) {
  if (isHidden) {
    icon.setAttribute("hidden", "");
    return;
  }
  icon.removeAttribute("hidden");
}

function todayISO() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

initAdmin();
