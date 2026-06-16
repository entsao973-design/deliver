const adminState = {
  token: localStorage.getItem("delivery_token") || "",
  view: "deliveries",
  options: { dates: [], companies: [], drivers: [] },
  uploadFiles: [],
  archives: [],
  showAllPhotos: false,
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
    users: document.querySelector("#usersView"),
  },
  filterStartDate: document.querySelector("#filterStartDate"),
  filterEndDate: document.querySelector("#filterEndDate"),
  filterCompany: document.querySelector("#filterCompany"),
  filterDriver: document.querySelector("#filterDriver"),
  deletedFilterStartDate: document.querySelector("#deletedFilterStartDate"),
  deletedFilterEndDate: document.querySelector("#deletedFilterEndDate"),
  deletedFilterCompany: document.querySelector("#deletedFilterCompany"),
  deletedFilterDriver: document.querySelector("#deletedFilterDriver"),
  applyFilters: document.querySelector("#applyFilters"),
  applyDeletedFilters: document.querySelector("#applyDeletedFilters"),
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
  photoZoomIn: document.querySelector("#adminPhotoZoomIn"),
  photoZoomOut: document.querySelector("#adminPhotoZoomOut"),
  closePhoto: document.querySelector("#closeAdminPhoto"),
};

createPhotoViewer({
  dialog: adminEls.photoDialog,
  image: adminEls.photoPreview,
  viewport: adminEls.photoViewport,
  zoomIn: adminEls.photoZoomIn,
  zoomOut: adminEls.photoZoomOut,
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
adminEls.toggleAllPhotos.addEventListener("click", () => {
  adminState.showAllPhotos = !adminState.showAllPhotos;
  updateToggleAllPhotosButton();
  loadDeliveries(false);
});
adminEls.excelFile.addEventListener("change", () => setUploadFiles([...adminEls.excelFile.files]));
adminEls.uploadExcel.addEventListener("click", uploadExcel);
adminEls.archivePhotos.addEventListener("click", archivePhotos);
adminEls.downloadArchives.addEventListener("click", downloadSelectedArchives);
adminEls.saveUser.addEventListener("click", saveUser);
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
    renderArchives();
  }
}

async function applyAdminFilters(deleted) {
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
  renderDeliveries(listEl, result.deliveries, deleted);
}

function renderDeliveries(container, deliveries, deleted) {
  container.replaceChildren();
  if (deliveries.length === 0) {
    const empty = document.createElement("div");
    empty.className = deleted ? "admin-card deleted-card" : "admin-card";
    empty.textContent = deleted ? "刪除區沒有資料" : "沒有符合條件的配送單";
    container.append(empty);
    return;
  }

  for (const delivery of deliveries) {
    const card = document.createElement("article");
    card.className = deleted ? "admin-card deleted-card" : "admin-card";
    card.innerHTML = `
      <div>
        <h3></h3>
        <div class="admin-meta line-one"></div>
      </div>
      <div class="admin-meta line-two"></div>
      <div class="admin-actions"></div>
    `;
    card.querySelector("h3").textContent = delivery.customer;
    card.querySelector(".line-one").textContent = `${delivery.delivery_date} | ${delivery.company} | ${delivery.invoice_no}`;
    card.querySelector(".line-two").textContent = `${delivery.driver} | ${delivery.vehicle_no} | ${delivery.status_label}`;

    const actions = card.querySelector(".admin-actions");
    if (delivery.has_photo) {
      if (!AdminPhotoView.shouldRenderInlinePhoto(delivery, deleted, adminState.showAllPhotos)) {
        actions.append(makeAdminButton("檢視照片", "secondary-button", () => openAdminPhoto(delivery)));
      }
    }
    if (deleted) {
      actions.append(makeAdminButton("永久刪除", "danger-button", () => permanentlyDelete(delivery)));
    } else {
      actions.append(makeAdminButton("刪除", "danger-button", () => deleteDelivery(delivery)));
    }
    if (AdminPhotoView.shouldRenderInlinePhoto(delivery, deleted, adminState.showAllPhotos)) {
      const photo = document.createElement("img");
      const stamp = encodeURIComponent(delivery.photo_updated_at || Date.now());
      photo.className = "admin-inline-photo";
      photo.src = `/api/deliveries/${delivery.id}/photo?token=${encodeURIComponent(adminState.token)}&t=${stamp}`;
      photo.alt = `${delivery.invoice_no} 達交照片`;
      card.append(photo);
    }
    container.append(card);
  }
}

async function uploadExcel() {
  if (adminState.uploadFiles.length === 0) {
    setAdminMessage("請先選擇或拖放 Excel 檔案", true);
    return;
  }

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
}

async function archivePhotos() {
  if (!adminEls.archiveDate.value) {
    setAdminMessage("請選擇封存日期", true);
    return;
  }

  setAdminMessage("封存中...");
  try {
    const result = await adminApi("/api/admin/archive", {
      method: "POST",
      body: {
        token: adminState.token,
        delivery_date: adminEls.archiveDate.value,
      },
    });
    adminState.archives = result.archives;
    renderArchives();
    setAdminMessage(result.archives.length ? "封存完成" : "該日期沒有可封存照片");
  } catch (error) {
    setAdminMessage(error.message, true);
  }
}

function renderArchives() {
  adminEls.archiveList.replaceChildren();
  if (adminState.archives.length === 0) {
    const empty = document.createElement("div");
    empty.className = "admin-card archive-row";
    empty.textContent = "尚無封存檔";
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

async function deleteDelivery(delivery) {
  if (!confirm(`確定刪除 ${delivery.invoice_no}？`)) {
    return;
  }
  const result = await adminApi(`/api/admin/deliveries/${delivery.id}/delete`, {
    method: "POST",
    body: { token: adminState.token },
  });
  await loadOptions();
  await loadDeliveries(false);
  if (result.mode === "archived") {
    setAdminMessage("已達交單據已移到刪除區");
  } else {
    setAdminMessage("未達交單據已永久刪除");
  }
}

async function permanentlyDelete(delivery) {
  if (!confirm(`確定永久刪除 ${delivery.invoice_no}？此動作無法復原。`)) {
    return;
  }
  await adminApi(`/api/admin/deliveries/${delivery.id}/permanent-delete`, {
    method: "POST",
    body: { token: adminState.token },
  });
  await loadDeliveries(true);
  setAdminMessage("已永久刪除");
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
  adminEls.photoTitle.textContent = `${delivery.invoice_no} ${delivery.status_label}`;
  const stamp = encodeURIComponent(delivery.photo_updated_at || Date.now());
  adminEls.photoPreview.src = `/api/deliveries/${delivery.id}/photo?token=${encodeURIComponent(adminState.token)}&t=${stamp}`;
  adminEls.photoDialog.showModal();
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
  button.addEventListener("click", onClick);
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
