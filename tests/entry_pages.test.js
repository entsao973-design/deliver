const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const staticRoot = path.join(root, "static");

function cssBlockAfter(css, selectorStart) {
  const selectorIndex = css.indexOf(selectorStart);
  assert.notEqual(selectorIndex, -1, `Missing CSS selector: ${selectorStart}`);
  const blockStart = css.indexOf("{", selectorIndex);
  const blockEnd = css.indexOf("}", blockStart);
  assert.ok(blockStart > selectorIndex && blockEnd > blockStart, `Missing CSS block: ${selectorStart}`);
  return css.slice(blockStart + 1, blockEnd);
}

test("driver entry uses driver route and split vehicle fields", () => {
  const html = fs.readFileSync(path.join(staticRoot, "index.html"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(staticRoot, "manifest.json"), "utf8"));
  const workerJs = fs.readFileSync(path.join(staticRoot, "service-worker.js"), "utf8");
  const webPy = fs.readFileSync(path.join(root, "delivery_app", "web.py"), "utf8");

  assert.equal(manifest.start_url, "/");
  assert.match(workerJs, /"\/driver"/);
  assert.match(webPy, /parsed\.path in \{"\/", "\/driver"\}/);
  assert.match(html, /<script src="\/static\/home-redirect\.js"><\/script>/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" \/>/);
  assert.match(html, /<title>配送存證平台<\/title>/);
  assert.match(html, /<h1>配送存證平台<\/h1>/);
  assert.match(html, /<p>物流士登入<\/p>/);
  assert.doesNotMatch(html, /司機必填/);
  assert.doesNotMatch(html, /class="vehicle-row"/);
  assert.match(html, /<span>車號<\/span>\s*<input id="vehicleNo"/);
  assert.match(html, /<span>車號選擇<\/span>\s*<select id="vehicleSelect"/);
});

test("driver login password field has a show-hide toggle", () => {
  const html = fs.readFileSync(path.join(staticRoot, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(staticRoot, "app.js"), "utf8");

  assert.match(html, /<div class="password-field">[\s\S]*<input id="password"[^>]*type="password"[\s\S]*<button id="togglePassword"/);
  assert.match(html, /aria-label="顯示密碼"/);
  assert.match(html, /class="eye-icon eye-open"/);
  assert.match(html, /class="eye-icon eye-closed"/);
  assert.match(appJs, /togglePassword:\s*document\.querySelector\("#togglePassword"\)/);
  assert.match(appJs, /els\.password\.type = isVisible \? "text" : "password";/);
  assert.match(appJs, /els\.togglePassword\.setAttribute\("aria-label", isVisible \? "隱藏密碼" : "顯示密碼"\);/);
  assert.match(appJs, /setPasswordIconHidden\(els\.passwordEyeOpen, isVisible\);/);
  assert.match(appJs, /setPasswordIconHidden\(els\.passwordEyeClosed, !isVisible\);/);
  assert.match(appJs, /icon\.setAttribute\("hidden", ""\);/);
  assert.match(appJs, /icon\.removeAttribute\("hidden"\);/);
});

test("driver remembered login includes password and vehicle", () => {
  const html = fs.readFileSync(path.join(staticRoot, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(staticRoot, "app.js"), "utf8");

  assert.match(html, /<input id="rememberLogin" type="checkbox" \/>\s*<span>記住帳號密碼與車號<\/span>/);
  assert.doesNotMatch(html, /記住帳號與車號/);
  assert.match(appJs, /saveRememberedLogin\(payload\.username, payload\.password, payload\.vehicle_no\);/);
  assert.match(appJs, /els\.password\.value = state\.rememberedLogin\.password \|\| "";/);
  assert.match(appJs, /function saveRememberedLogin\(username, password, vehicleNo\) \{/);
  assert.match(appJs, /localStorage\.setItem\("delivery_remembered_login", JSON\.stringify\(\{[\s\S]*username,[\s\S]*password,[\s\S]*vehicle_no: vehicleNo,[\s\S]*\}\)\);/);
});

test("driver photo clarity check defaults on, is remembered, and warns before upload", () => {
  const html = fs.readFileSync(path.join(staticRoot, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(staticRoot, "app.js"), "utf8");

  assert.match(html, /<input id="hideDoneToggle" type="checkbox" checked \/>[\s\S]*<input id="photoClarityToggle" type="checkbox" checked \/>\s*<span>拍照後檢查清晰度<\/span>[\s\S]*<input id="showAllPhotosToggle" type="checkbox" \/>/);
  assert.match(html, /<dialog id="photoClarityDialog"[^>]*>[\s\S]*照片可能模糊，重拍或仍然接受。[\s\S]*<button id="photoClarityRetake"[^>]*>重拍<\/button>[\s\S]*<button id="photoClarityAccept"[^>]*>仍然接受<\/button>/);
  assert.match(html, /<script src="\/static\/photo-quality\.js"><\/script>[\s\S]*<script src="\/static\/app\.js" defer><\/script>/);
  assert.match(appJs, /photoClarityEnabled:\s*true/);
  assert.match(appJs, /PhotoQuality\.loadEnabled\(localStorage, state\.username\)/);
  assert.match(appJs, /PhotoQuality\.saveEnabled\(localStorage, state\.username, state\.photoClarityEnabled\)/);
  assert.match(appJs, /await PhotoQuality\.analyzeDataUrl\(dataUrl\)/);
  assert.match(appJs, /if \(clarity\.possibly_blurry\) \{[\s\S]*await requestPhotoClarityDecision\(\)/);
});

test("driver delivery controls stay fixed while the list scrolls", () => {
  const css = fs.readFileSync(path.join(staticRoot, "styles.css"), "utf8");
  const appJs = fs.readFileSync(path.join(staticRoot, "app.js"), "utf8");

  assert.match(css, /\.delivery-screen\s*\{[\s\S]*--driver-control-panel-height:\s*64px;[\s\S]*height:\s*calc\(100vh - 36px\);[\s\S]*height:\s*calc\(100dvh - 36px\);[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.delivery-screen \.top-bar,[\s\S]*\.delivery-screen \.summary-strip\s*\{[\s\S]*flex:\s*0 0 auto;[\s\S]*height:\s*var\(--driver-control-panel-height\);/);
  assert.match(css, /\.delivery-screen \.top-bar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*2fr\) minmax\(0,\s*2fr\) minmax\(0,\s*1fr\) minmax\(0,\s*1fr\);[\s\S]*gap:\s*6px;[\s\S]*padding:\s*4px 8px;/);
  assert.match(css, /\.delivery-screen button\s*\{[\s\S]*min-height:\s*32px;[\s\S]*white-space:\s*nowrap;[\s\S]*word-break:\s*keep-all;/);
  assert.match(css, /\.top-actions\s*\{[\s\S]*display:\s*contents;/);
  const driverMetaBlock = cssBlockAfter(css, ".delivery-screen .eyebrow,");
  assert.match(driverMetaBlock, /color:\s*#000000;/);
  assert.match(driverMetaBlock, /font-size:\s*11px;/);
  const datePanelLabelBlock = cssBlockAfter(css, ".delivery-screen .date-panel span");
  assert.match(datePanelLabelBlock, /color:\s*#000000;/);
  assert.match(datePanelLabelBlock, /font-size:\s*11px;/);
  assert.match(css, /\.delivery-screen #refreshButton\s*\{[\s\S]*grid-column:\s*3;/);
  assert.match(css, /\.delivery-screen #logoutButton\s*\{[\s\S]*grid-column:\s*4;/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.delivery-screen \.top-bar\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*2fr\) minmax\(0,\s*2fr\) minmax\(0,\s*1fr\) minmax\(0,\s*1fr\);/);
  assert.match(css, /#refreshButton,\s*#logoutButton\s*\{[\s\S]*align-self:\s*center;[\s\S]*height:\s*calc\(var\(--driver-control-panel-height\) \* 0\.8\);[\s\S]*min-height:\s*calc\(var\(--driver-control-panel-height\) \* 0\.8\);/);
  assert.match(css, /#smartPhotoButton,\s*#scanInvoiceButton\s*\{[\s\S]*align-self:\s*stretch;[\s\S]*height:\s*100%;[\s\S]*min-height:\s*0;/);
  assert.match(css, /\.delivery-screen select\s*\{[\s\S]*min-height:\s*32px;/);
  assert.match(css, /\.delivery-screen \.summary-strip\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*2fr\) minmax\(0,\s*2fr\) minmax\(0,\s*1fr\) minmax\(0,\s*1fr\);[\s\S]*gap:\s*4px;[\s\S]*margin-top:\s*4px;[\s\S]*padding:\s*5px 6px;/);
  assert.match(css, /\.summary-actions\s*\{[\s\S]*display:\s*contents;/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.delivery-screen \.summary-strip\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*2fr\) minmax\(0,\s*2fr\) minmax\(0,\s*1fr\) minmax\(0,\s*1fr\);/);
  assert.match(css, /\.summary-actions button\s*\{[\s\S]*font-size:\s*12px;[\s\S]*white-space:\s*nowrap;/);
  const summaryLabelBlock = cssBlockAfter(css, ".delivery-screen .summary-strip span");
  assert.match(summaryLabelBlock, /color:\s*#000000;/);
  assert.match(summaryLabelBlock, /font-size:\s*11px;/);
  const summaryTogglesBlock = cssBlockAfter(css, "\n.summary-toggles {");
  assert.match(summaryTogglesBlock, /grid-template-rows:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(summaryTogglesBlock, /align-content:\s*stretch;/);
  assert.match(summaryTogglesBlock, /gap:\s*0;/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.delivery-screen \.summary-toggles\s*\{[\s\S]*gap:\s*0;/);
  assert.match(css, /\.delivery-screen \.summary-strip \.toggle-row input\s*\{[\s\S]*width:\s*15px;[\s\S]*height:\s*15px;[\s\S]*min-height:\s*15px;[\s\S]*margin:\s*0;/);
  assert.doesNotMatch(css, /\.delivery-screen \.summary-strip \.summary-toggles span/);
  assert.doesNotMatch(css, /\.delivery-screen \.summary-strip \.photo-clarity-toggle input/);
  assert.match(css, /\.delivery-screen \.message,[\s\S]*\.delivery-screen \.queue-status\s*\{[\s\S]*flex:\s*0 0 auto;[\s\S]*line-height:\s*1\.35;[\s\S]*white-space:\s*normal;[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*word-break:\s*break-word;/);
  assert.match(css, /\.delivery-screen \.delivery-list\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;[\s\S]*overflow-y:\s*auto;/);
  assert.match(appJs, /localStorage\.setItem\("delivery_pending_upload_count", String\(state\.pendingUploads\.length\)\);/);
});

test("driver browser view stays inside the iOS safe viewport", () => {
  const css = fs.readFileSync(path.join(staticRoot, "styles.css"), "utf8");
  const appJs = fs.readFileSync(path.join(staticRoot, "app.js"), "utf8");

  assert.match(css, /html\.driver-viewport-locked,[\s\S]*body\.driver-viewport-locked\s*\{[\s\S]*height:\s*100vh;[\s\S]*height:\s*100svh;[\s\S]*overflow:\s*hidden;[\s\S]*overscroll-behavior:\s*none;/);
  assert.match(css, /body\.driver-viewport-locked \.app-shell\s*\{[\s\S]*height:\s*100vh;[\s\S]*height:\s*100svh;[\s\S]*min-height:\s*0;[\s\S]*padding-top:\s*max\(var\(--app-shell-padding\), env\(safe-area-inset-top\)\);[\s\S]*padding-bottom:\s*max\(var\(--app-shell-padding\), env\(safe-area-inset-bottom\)\);/);
  assert.match(css, /body\.driver-viewport-locked \.delivery-screen\s*\{[\s\S]*height:\s*100%;/);
  assert.match(appJs, /function setDriverViewportLocked\(isLocked\)\s*\{[\s\S]*document\.documentElement\.classList\.toggle\("driver-viewport-locked", isLocked\);[\s\S]*document\.body\.classList\.toggle\("driver-viewport-locked", isLocked\);[\s\S]*window\.scrollTo\(0, 0\);/);
  assert.match(appJs, /function showDeliveryScreen\(\)\s*\{[\s\S]*setDriverViewportLocked\(true\);[\s\S]*els\.loginScreen\.hidden = true;/);
  assert.match(appJs, /function showLoginScreen\(\)\s*\{[\s\S]*setDriverViewportLocked\(false\);[\s\S]*els\.deliveryScreen\.hidden = true;/);
});

test("driver and admin lists keep cards at content height when few records remain", () => {
  const css = fs.readFileSync(path.join(staticRoot, "styles.css"), "utf8");
  const adminCss = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");

  assert.match(css, /\.delivery-list\s*\{[\s\S]*align-content:\s*start;[\s\S]*align-items:\s*start;/);
  assert.match(adminCss, /\.admin-list\s*\{[\s\S]*align-content:\s*start;[\s\S]*align-items:\s*start;/);
  assert.match(css, /\.delivery-screen \.delivery-card\s*\{[\s\S]*padding:\s*11px 12px;/);
  assert.match(adminCss, /\.admin-card\s*\{[\s\S]*padding:\s*4px 14px;/);
});

test("driver delivery card emphasizes invoice and company text", () => {
  const css = fs.readFileSync(path.join(staticRoot, "styles.css"), "utf8");

  assert.match(css, /\.delivery-screen \.invoice\s*\{[\s\S]*color:\s*#000000;[\s\S]*font-size:\s*16px;[\s\S]*font-weight:\s*800;/);
  assert.match(css, /\.delivery-screen \.company\s*\{[\s\S]*color:\s*#000000;[\s\S]*font-size:\s*16px;[\s\S]*font-weight:\s*600;/);
});

test("driver delivery card shows quantity beside invoice and company only when present", () => {
  const appJs = fs.readFileSync(path.join(staticRoot, "app.js"), "utf8");

  assert.match(appJs, /<div class="meta-line">\s*<span class="invoice"><\/span>\s*<span class="company"><\/span>\s*<span class="quantity"><\/span>\s*<\/div>/);
  assert.match(appJs, /const quantityText = delivery\.quantity \? `數量：\$\{delivery\.quantity\}` : "";/);
  assert.match(appJs, /card\.querySelector\("\.quantity"\)\.textContent = quantityText;/);
  assert.match(appJs, /card\.querySelector\("\.quantity"\)\.hidden = !quantityText;/);
});

test("driver scan invoice button replaces refresh in summary and refresh moves to header", () => {
  const html = fs.readFileSync(path.join(staticRoot, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(staticRoot, "app.js"), "utf8");

  assert.match(html, /<div class="top-actions">\s*<button id="refreshButton" class="secondary-button" type="button">重新整理<\/button>\s*<button id="logoutButton" class="ghost-button" type="button">/);
  assert.match(html, /<button id="smartPhotoButton" class="secondary-button" type="button">定位達交<\/button>\s*<button id="scanInvoiceButton" class="secondary-button" type="button">掃號達交<\/button>/);
  assert.match(html, /<input id="scanInvoiceInput" type="file" accept="image\/\*" capture="environment" hidden \/>/);
  assert.match(html, /<dialog id="scanInvoiceDialog" class="scan-invoice-dialog">/);
  assert.match(html, /<video id="scanInvoiceVideo" class="scan-invoice-video" autoplay playsinline muted><\/video>/);
  assert.match(html, /<div id="scanInvoiceFrame" class="scan-invoice-frame" aria-hidden="true"><\/div>/);
  assert.match(html, /<canvas id="scanInvoiceCanvas" hidden><\/canvas>/);
  assert.match(html, /<div class="scan-invoice-zoom" aria-label="掃號縮放">[\s\S]*<button id="scanInvoiceZoomOutButton"[\s\S]*aria-label="縮小"[\s\S]*<\/button>[\s\S]*<input id="scanInvoiceZoomSlider" type="range"[\s\S]*min="1"[\s\S]*max="3"[\s\S]*step="0.1"[\s\S]*value="1"[\s\S]*aria-label="掃號縮放比例"[\s\S]*\/>[\s\S]*<button id="scanInvoiceZoomInButton"[\s\S]*aria-label="放大"[\s\S]*<\/button>[\s\S]*<span id="scanInvoiceZoomValue"[\s\S]*>1.0x<\/span>/);
  assert.match(html, /<button id="captureScanInvoiceButton" class="primary-button" type="button">/);
  assert.match(html, /<button id="closeScanInvoiceButton" class="ghost-button" type="button">/);
  const driverApiScriptIndex = html.indexOf('<script src="/static/driver-api.js"></script>');
  const driverSmartDeliveryScriptIndex = html.indexOf('<script src="/static/driver-smart-delivery.js"></script>');
  const smartPhotoScriptIndex = html.indexOf('<script src="/static/smart-photo.js"></script>');
  const scanInvoiceScriptIndex = html.indexOf('<script src="/static/scan-invoice.js"></script>');
  const driverScanDeliveryScriptIndex = html.indexOf('<script src="/static/driver-scan-delivery.js"></script>');
  const appScriptIndex = html.indexOf('<script src="/static/app.js" defer></script>');
  assert.notEqual(driverApiScriptIndex, -1);
  assert.notEqual(driverSmartDeliveryScriptIndex, -1);
  assert.notEqual(smartPhotoScriptIndex, -1);
  assert.notEqual(scanInvoiceScriptIndex, -1);
  assert.notEqual(driverScanDeliveryScriptIndex, -1);
  assert.ok(driverApiScriptIndex < appScriptIndex);
  assert.ok(smartPhotoScriptIndex < driverSmartDeliveryScriptIndex);
  assert.ok(driverSmartDeliveryScriptIndex < appScriptIndex);
  assert.ok(smartPhotoScriptIndex < appScriptIndex);
  assert.ok(scanInvoiceScriptIndex < driverScanDeliveryScriptIndex);
  assert.ok(driverScanDeliveryScriptIndex < appScriptIndex);
  assert.match(appJs, /const api = window\.DriverApi\.request;/);
  assert.match(appJs, /window\.DriverSmartDelivery\.createController/);
  assert.match(appJs, /window\.DriverScanDelivery\.createController/);
  assert.match(appJs, /const scanDeliveryController = window\.DriverScanDelivery\.createController\(\{[\s\S]*api,[\s\S]*\}\);/);
  assert.match(appJs, /smartPhotoButton:\s*document\.querySelector\("#smartPhotoButton"\)/);
  assert.match(appJs, /scanInvoiceButton:\s*document\.querySelector\("#scanInvoiceButton"\)/);
  assert.match(appJs, /scanInvoiceInput:\s*document\.querySelector\("#scanInvoiceInput"\)/);
  assert.match(appJs, /scanInvoiceDialog:\s*document\.querySelector\("#scanInvoiceDialog"\)/);
  assert.match(appJs, /scanInvoiceVideo:\s*document\.querySelector\("#scanInvoiceVideo"\)/);
  assert.match(appJs, /scanInvoiceFrame:\s*document\.querySelector\("#scanInvoiceFrame"\)/);
  assert.match(appJs, /scanInvoiceCanvas:\s*document\.querySelector\("#scanInvoiceCanvas"\)/);
  assert.match(appJs, /scanInvoiceZoomOutButton:\s*document\.querySelector\("#scanInvoiceZoomOutButton"\)/);
  assert.match(appJs, /scanInvoiceZoomInButton:\s*document\.querySelector\("#scanInvoiceZoomInButton"\)/);
  assert.match(appJs, /scanInvoiceZoomSlider:\s*document\.querySelector\("#scanInvoiceZoomSlider"\)/);
  assert.match(appJs, /scanInvoiceZoomValue:\s*document\.querySelector\("#scanInvoiceZoomValue"\)/);
  assert.match(appJs, /captureScanInvoiceButton:\s*document\.querySelector\("#captureScanInvoiceButton"\)/);
  assert.match(appJs, /closeScanInvoiceButton:\s*document\.querySelector\("#closeScanInvoiceButton"\)/);
  assert.match(appJs, /els\.smartPhotoButton\.addEventListener\("click", smartDeliveryController\.handleSmartPhoto\);/);
  assert.match(appJs, /els\.scanInvoiceButton\.addEventListener\("click", scanDeliveryController\.handleScanInvoice\);/);
  assert.match(appJs, /els\.scanInvoiceInput\.addEventListener\("change", scanDeliveryController\.handleScanInvoiceFileChange\);/);
  assert.match(appJs, /els\.captureScanInvoiceButton\.addEventListener\("click", scanDeliveryController\.handleCaptureScanInvoice\);/);
  assert.match(appJs, /els\.scanInvoiceZoomSlider\.addEventListener\("input", scanDeliveryController\.handleScanInvoiceZoomInput\);/);
  assert.match(appJs, /els\.scanInvoiceZoomOutButton\.addEventListener\("click", scanDeliveryController\.handleScanInvoiceZoomOut\);/);
  assert.match(appJs, /els\.scanInvoiceZoomInButton\.addEventListener\("click", scanDeliveryController\.handleScanInvoiceZoomIn\);/);
  assert.match(appJs, /els\.closeScanInvoiceButton\.addEventListener\("click", scanDeliveryController\.closeScanInvoiceCamera\);/);
  assert.doesNotMatch(appJs, /function handleSmartPhoto\(\)/);
  assert.doesNotMatch(appJs, /function smartPhotoErrorMessage\(error\)/);
});

test("driver scan invoice camera viewfinder is centered and crops the OCR target", () => {
  const css = fs.readFileSync(path.join(staticRoot, "styles.css"), "utf8");

  assert.match(css, /\.scan-invoice-dialog\s*\{[\s\S]*width:\s*min\(96vw,\s*560px\);[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.scan-invoice-dialog\[open\]\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/);
  assert.match(css, /\.scan-invoice-viewport\s*\{[\s\S]*position:\s*relative;[\s\S]*aspect-ratio:\s*3 \/ 4;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.scan-invoice-video\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*object-fit:\s*cover;[\s\S]*transform:\s*scale\(var\(--scan-invoice-zoom,\s*1\)\);/);
  assert.match(css, /\.scan-invoice-frame\s*\{[\s\S]*position:\s*absolute;[\s\S]*left:\s*10%;[\s\S]*right:\s*10%;[\s\S]*top:\s*42%;[\s\S]*height:\s*18%;[\s\S]*box-shadow:\s*0 0 0 999px/);
  assert.match(css, /\.scan-invoice-zoom\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*40px minmax\(0,\s*1fr\) 40px auto;/);
});

test("driver smart photo dialog offers delivery status choices and candidate selection", () => {
  const html = fs.readFileSync(path.join(staticRoot, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(staticRoot, "app.js"), "utf8");
  const smartDeliveryJs = fs.readFileSync(path.join(staticRoot, "driver-smart-delivery.js"), "utf8");

  assert.match(html, /<dialog id="smartPhotoDialog" class="smart-photo-dialog">/);
  assert.match(html, /<input id="smartPhotoStatusNormal"[^>]*value="normal"[^>]*checked/);
  assert.match(html, /<input id="smartPhotoStatusAbnormal"[^>]*value="abnormal"/);
  assert.match(html, /<div id="smartPhotoCandidates" class="smart-photo-candidates"><\/div>/);
  assert.match(appJs, /smartDeliveryController\.handleSmartPhoto/);
  assert.match(smartDeliveryJs, /function handleSmartPhoto\(\)/);
  assert.match(smartDeliveryJs, /root\.navigator\.geolocation\.getCurrentPosition/);
  assert.match(smartDeliveryJs, /root\.SmartPhoto\.outcomeForPosition/);
  assert.match(smartDeliveryJs, /startCapture\(candidate\.delivery, selectedSmartPhotoStatus\(\)\)/);
});

test("driver inline photos use a fixed zoomable viewport", () => {
  const css = fs.readFileSync(path.join(staticRoot, "styles.css"), "utf8");
  const appJs = fs.readFileSync(path.join(staticRoot, "app.js"), "utf8");
  const photoViewerJs = fs.readFileSync(path.join(staticRoot, "photo-viewer.js"), "utf8");

  assert.match(css, /\.inline-photo-viewport\s*\{[\s\S]*height:\s*280px;[\s\S]*overflow:\s*hidden;[\s\S]*touch-action:\s*pan-y;/);
  assert.match(css, /\.inline-photo-viewport\.has-zoom,[\s\S]*\.inline-photo-viewport\.is-gesturing\s*\{[\s\S]*touch-action:\s*none;/);
  assert.match(css, /\.inline-photo\s*\{[\s\S]*max-width:\s*100%;[\s\S]*max-height:\s*100%;[\s\S]*transform-origin:\s*center center;/);
  assert.doesNotMatch(css, /\.inline-photo\s*\{[\s\S]*max-height:\s*220px;/);
  assert.match(appJs, /const viewport = document\.createElement\("div"\);[\s\S]*viewport\.className = "inline-photo-viewport";[\s\S]*viewport\.append\(photo\);[\s\S]*card\.insertBefore\(viewport, card\.querySelector\("\.actions"\)\);/);
  assert.match(appJs, /createPhotoViewer\(\{[\s\S]*viewport,[\s\S]*image: photo,[\s\S]*useWindowResize: false,[\s\S]*touchScrollTarget: \(\) => viewport\.closest\("\.delivery-list"\),[\s\S]*\}\);/);
  assert.doesNotMatch(appJs, /card\.insertBefore\(photo, card\.querySelector\("\.actions"\)\);/);
  assert.match(photoViewerJs, /const dialog = config\.dialog \|\| null;/);
  assert.match(photoViewerJs, /const MAX_SCALE = 5;/);
  assert.match(photoViewerJs, /const DOUBLE_TAP_DELAY_MS = 300;/);
  assert.match(photoViewerJs, /viewport\.classList\.toggle\("has-zoom", scale > 1\.01\);/);
  assert.match(photoViewerJs, /function toggleDoubleTapZoom\(point\) \{[\s\S]*if \(scale >= MAX_SCALE - 0\.01\) \{[\s\S]*resetView\(\);[\s\S]*return;[\s\S]*\}[\s\S]*setZoom\(MAX_SCALE, point\);[\s\S]*\}/);
  assert.match(photoViewerJs, /function handleTap\(event\) \{[\s\S]*if \(!isDoubleTap\) \{[\s\S]*lastTap = currentTap;[\s\S]*return;[\s\S]*\}[\s\S]*event\.preventDefault\(\);[\s\S]*lastTap = null;[\s\S]*toggleDoubleTapZoom\(\{ x: event\.clientX, y: event\.clientY \}\);[\s\S]*\}/);
  assert.match(photoViewerJs, /viewport\.addEventListener\("touchstart",[\s\S]*event\.preventDefault\(\);[\s\S]*startTouchPinch\(event\);[\s\S]*\{ passive: false \}/);
  assert.match(photoViewerJs, /viewport\.addEventListener\("touchmove",[\s\S]*event\.preventDefault\(\);[\s\S]*setZoom\([\s\S]*\{ passive: false \}/);
  assert.match(photoViewerJs, /if \(dialog\) \{[\s\S]*dialog\.addEventListener\("close", resetView\);[\s\S]*\}/);
  assert.match(photoViewerJs, /if \(useWindowResize\) \{[\s\S]*window\.addEventListener\("resize", resetView\);[\s\S]*\}/);
});

test("admin page has its own account password login without vehicle field", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(html, /<title>配送存證管理後台<\/title>/);
  assert.match(html, /<h1>配送存證管理後台<\/h1>/);
  assert.match(html, /<main id="adminLoginScreen"/);
  assert.match(html, /<form id="adminLoginForm"/);
  assert.match(html, /<input id="adminLoginUsername"[^>]*autocomplete="username"/);
  assert.match(html, /<input id="adminLoginPassword"[^>]*type="password"[^>]*autocomplete="current-password"/);
  assert.doesNotMatch(html, /adminLoginVehicle|vehicleNo|vehicleSelect|車號/);
  assert.match(html, /<main id="adminApp" class="admin-shell" hidden>/);
  assert.match(adminJs, /adminEls\.loginForm\.addEventListener\("submit", handleAdminLogin\)/);
  assert.match(adminJs, /body:\s*\{\s*username:\s*adminEls\.loginUsername\.value\.trim\(\),\s*password:\s*adminEls\.loginPassword\.value,\s*login_context:\s*"admin"/s);
  assert.match(adminJs, /使用帳號非管理員，無法登入/);
});

test("admin photo dialog supports ctrl wheel zoom and immediate rotate save", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");
  const adminCss = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const webPy = fs.readFileSync(path.join(root, "delivery_app", "web.py"), "utf8");

  assert.match(html, /<button id="adminPhotoRotateLeft" class="secondary-button photo-icon-button" type="button" aria-label="左轉90度" title="左轉90度">\s*<span aria-hidden="true">&#8634;<\/span>\s*<\/button>/);
  assert.match(html, /<button id="adminPhotoRotateRight" class="secondary-button photo-icon-button" type="button" aria-label="右轉90度" title="右轉90度">\s*<span aria-hidden="true">&#8635;<\/span>\s*<\/button>/);
  assert.match(html, /<span id="adminPhotoRotateError" class="photo-rotate-error" aria-live="polite"><\/span>/);
  assert.doesNotMatch(html, /adminPhotoZoomOut|adminPhotoZoomIn|>縮小<|>放大</);
  assert.match(adminJs, /photoRotateLeft:\s*document\.querySelector\("#adminPhotoRotateLeft"\)/);
  assert.match(adminJs, /photoRotateRight:\s*document\.querySelector\("#adminPhotoRotateRight"\)/);
  assert.match(adminJs, /photoRotateError:\s*document\.querySelector\("#adminPhotoRotateError"\)/);
  assert.doesNotMatch(adminJs, /photoZoomIn|photoZoomOut|adminPhotoZoomIn|adminPhotoZoomOut/);
  assert.match(adminJs, /wheelRequiresCtrl:\s*true/);
  assert.match(adminJs, /adminEls\.photoRotateLeft\.addEventListener\("click", \(\) => rotateAdminPhoto\(-90, adminEls\.photoRotateLeft\)\);/);
  assert.match(adminJs, /adminEls\.photoRotateRight\.addEventListener\("click", \(\) => rotateAdminPhoto\(90, adminEls\.photoRotateRight\)\);/);
  assert.match(adminJs, /canvas\.toDataURL\("image\/jpeg", 0\.9\)/);
  assert.match(adminJs, /saveRotatedAdminPhoto\(adminState\.photoDelivery, adminEls\.photoPreview, degrees\)/);
  assert.match(adminJs, /adminApi\(`\/api\/admin\/deliveries\/\$\{delivery\.id\}\/photo`/);
  assert.match(adminJs, /await runPhotoRotateWithFailureMessage\(button, adminEls\.photoRotateError, async \(\) => \{/);
  assert.match(adminJs, /adminEls\.photoTitle\.textContent = [^\n]*delivery\.photo_updated_at[^\n]*;/);
  assert.doesNotMatch(adminJs, /照片旋轉已儲存|儲存中/);
  assert.match(adminCss, /\.photo-rotate-error\s*\{[\s\S]*font-size:\s*8px;[\s\S]*white-space:\s*nowrap;/);
  assert.match(webPy, /parsed\.path\.startswith\("\/api\/admin\/deliveries\/"\) and parsed\.path\.endswith\("\/photo"\)/);
  assert.match(webPy, /def _handle_admin_photo_save\(self, delivery_id: str\)/);
});

test("admin rotated photo save preserves original photo time", () => {
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(adminJs, /const result = await saveRotatedAdminPhoto\(adminState\.photoDelivery, adminEls\.photoPreview, degrees\);/);
  assert.match(adminJs, /const result = await saveRotatedAdminPhoto\(delivery, image, degrees\);/);
  assert.match(adminJs, /async function saveRotatedAdminPhoto\(delivery, image, degrees\) \{[\s\S]*captured_at:\s*delivery\.photo_updated_at \|\| ""/);
});

test("admin rotated photo refreshes image cache without changing displayed photo time", () => {
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(adminJs, /photoRefreshToken:\s*0/);
  assert.match(adminJs, /adminEls\.photoTitle\.textContent = [^\n]*delivery\.photo_updated_at[^\n]*;/);
  assert.match(adminJs, /card\.querySelector\("\.admin-photo-time"\)\.textContent = showInlinePhoto \? `照片時間：\$\{formatPhotoTime\(delivery\.photo_updated_at\)\}` : "";/);
  assert.match(adminJs, /const stamp = encodeURIComponent\(\[\s*delivery\.photo_updated_at \|\| "",\s*delivery\.updated_at \|\| "",\s*adminState\.photoRefreshToken,\s*\]\.join\("\|"\)\);/);
  assert.match(adminJs, /function bumpAdminPhotoRefreshToken\(\) \{[\s\S]*adminState\.photoRefreshToken \+= 1;[\s\S]*\}/);
  assert.match(adminJs, /const result = await saveRotatedAdminPhoto\(adminState\.photoDelivery, adminEls\.photoPreview, degrees\);[\s\S]*bumpAdminPhotoRefreshToken\(\);[\s\S]*adminState\.photoDelivery = result\.delivery;[\s\S]*setAdminPhotoPreview\(result\.delivery\);/);
  assert.match(adminJs, /const result = await saveRotatedAdminPhoto\(delivery, image, degrees\);[\s\S]*Object\.assign\(delivery, result\.delivery\);[\s\S]*bumpAdminPhotoRefreshToken\(\);[\s\S]*setAdminPhotoSource\(image, result\.delivery\);/);
});

test("admin clears status messages on login and query", () => {
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(adminJs, /function showAdminApp\(\) \{[\s\S]*clearAdminMessage\(\);[\s\S]*\}/);
  assert.match(adminJs, /async function applyAdminFilters\(deleted\) \{[\s\S]*clearAdminMessage\(\);[\s\S]*await loadOptions\(deleted\);/);
  assert.match(adminJs, /function clearAdminMessage\(\) \{[\s\S]*setAdminMessage\("", false\);[\s\S]*\}/);
});

test("admin deleted deliveries can be restored before permanent delete", () => {
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");
  const webPy = fs.readFileSync(path.join(root, "delivery_app", "web.py"), "utf8");

  assert.match(adminJs, /if \(deleted\) \{\s*rowActions\.append\(makeAdminButton\("還原", "secondary-button", \(button\) => restoreDelivery\(delivery, button\)\)\);\s*rowActions\.append\(makeAdminButton\("永久刪除"/);
  assert.match(adminJs, /async function restoreDelivery\(delivery, button\) \{/);
  assert.match(adminJs, /AdminOperationState\.runWithButtonLock\(button, "還原中\.\.\.",/);
  assert.match(adminJs, /adminApi\(`\/api\/admin\/deliveries\/\$\{delivery\.id\}\/restore`/);
  assert.match(webPy, /parsed\.path\.startswith\("\/api\/admin\/deliveries\/"\) and parsed\.path\.endswith\("\/restore"\)/);
  assert.match(webPy, /def _handle_admin_restore\(self, delivery_id: str\)/);
});

test("admin filtered delivery rows support bulk delete and filtered permanent delete", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");
  const webPy = fs.readFileSync(path.join(root, "delivery_app", "web.py"), "utf8");

  assert.match(html, /data-view="deleted"[^>]*>刪除區<\/button>/);
  assert.doesNotMatch(html, /已達交刪除區/);
  assert.match(html, /<div id="adminDeliveryCounts" class="filter-counts" role="status" aria-live="polite">[\s\S]*<\/div>\s*<label class="delivery-visibility-toggle">\s*<input id="hideDelivered" type="checkbox" \/>\s*<span>隱藏已達交<\/span>\s*<\/label>\s*<button id="toggleAllPhotos" class="secondary-button" type="button">[\s\S]*<\/button>\s*<button id="bulkDeleteFiltered" class="danger-button" type="button">全部刪除<\/button>/);
  assert.match(html, /<div id="deletedDeliveryCounts" class="filter-counts" role="status" aria-live="polite">[\s\S]*共: 0[\s\S]*<\/div>\s*<button id="bulkPermanentDeleteFiltered" class="danger-button" type="button">全部永久刪除<\/button>/);
  assert.match(css, /\.delivery-filter-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\) minmax\(90px,\s*0\.7fr\) minmax\(220px,\s*1\.2fr\) minmax\(120px,\s*0\.9fr\) minmax\(120px,\s*0\.8fr\) minmax\(100px,\s*0\.7fr\);/);
  assert.match(css, /\.delivery-visibility-toggle\s*\{[\s\S]*align-self:\s*end;[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*height:\s*30px;[\s\S]*white-space:\s*nowrap;/);
  assert.match(css, /\.filter-grid \.delivery-visibility-toggle input\s*\{[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;[\s\S]*min-height:\s*16px;/);
  assert.match(css, /\.deleted-filter-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\) minmax\(90px,\s*0\.7fr\) minmax\(220px,\s*1\.2fr\) minmax\(100px,\s*0\.7fr\);/);
  assert.match(adminJs, /deliveries:\s*\[\]/);
  assert.match(adminJs, /deletedDeliveries:\s*\[\]/);
  assert.match(adminJs, /bulkDeleteFiltered:\s*document\.querySelector\("#bulkDeleteFiltered"\)/);
  assert.match(adminJs, /hideDelivered:\s*document\.querySelector\("#hideDelivered"\)/);
  assert.match(adminJs, /bulkPermanentDeleteFiltered:\s*document\.querySelector\("#bulkPermanentDeleteFiltered"\)/);
  assert.match(adminJs, /adminEls\.bulkDeleteFiltered\.addEventListener\("click", bulkDeleteFilteredDeliveries\);/);
  assert.match(adminJs, /adminEls\.hideDelivered\.addEventListener\("change",[\s\S]*adminState\.hideDelivered = adminEls\.hideDelivered\.checked;[\s\S]*renderCurrentDeliveries\(\);[\s\S]*\}\);/);
  assert.match(adminJs, /adminEls\.bulkPermanentDeleteFiltered\.addEventListener\("click", bulkPermanentDeleteFilteredDeliveries\);/);
  assert.match(adminJs, /adminState\[deleted \? "deletedDeliveries" : "deliveries"\] = result\.deliveries;/);
  assert.match(adminJs, /function renderCurrentDeliveries\(\) \{[\s\S]*AdminFilterOptions\.visibleDeliveries\(adminState\.deliveries, adminState\.hideDelivered\)[\s\S]*renderDeliveries\(adminEls\.deliveryList,/);
  assert.match(adminJs, /function currentDeliveryIds\(deleted\) \{[\s\S]*AdminFilterOptions\.visibleDeliveryIds\(deliveries, !deleted && adminState\.hideDelivered\);/);
  assert.match(adminJs, /async function bulkDeleteFilteredDeliveries\(\) \{/);
  assert.match(adminJs, /adminApi\("\/api\/admin\/deliveries\/bulk-delete",[\s\S]*delivery_ids: deliveryIds,/);
  assert.match(adminJs, /async function bulkPermanentDeleteFilteredDeliveries\(\) \{/);
  assert.match(adminJs, /adminApi\("\/api\/admin\/deliveries\/bulk-permanent-delete",[\s\S]*delivery_ids: deliveryIds,/);
  assert.match(adminJs, /確定永久清除目前篩選出的 \$\{deliveryIds\.length\} 筆刪除區配送紀錄嗎？/);
  assert.match(adminJs, /- 對應已封存 ZIP/);
  assert.match(adminJs, /確定永久刪除 \$\{delivery\.invoice_no\}？[\s\S]*- 對應已封存 ZIP/);
  assert.match(webPy, /parsed\.path == "\/api\/admin\/deliveries\/bulk-delete"/);
  assert.match(webPy, /parsed\.path == "\/api\/admin\/deliveries\/bulk-permanent-delete"/);
  assert.match(webPy, /def _handle_admin_bulk_delete\(self\)/);
  assert.match(webPy, /def _handle_admin_bulk_permanent_delete\(self\)/);
});

test("admin inline photos are zoomable and support immediate icon rotate save", () => {
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");
  const adminCss = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");

  assert.match(adminJs, /const inlinePhotoToolbar = card\.querySelector\("\.admin-inline-photo-toolbar"\);/);
  assert.match(adminJs, /card\.append\(createAdminInlinePhoto\(delivery, inlinePhotoToolbar\)\);/);
  assert.match(adminJs, /<div class="admin-inline-photo-left">\s*<strong class="admin-customer"><\/strong>\s*<span class="admin-row-cell admin-document"><\/span>\s*<\/div>\s*<div class="admin-inline-photo-toolbar"><\/div>\s*<div class="admin-inline-photo-right">\s*<span class="admin-row-cell admin-photo-time"><\/span>\s*<span class="admin-row-cell admin-route"><\/span>/);
  assert.match(adminJs, /card\.querySelector\("\.admin-photo-time"\)\.textContent = showInlinePhoto \? `照片時間：\$\{formatPhotoTime\(delivery\.photo_updated_at\)\}` : "";/);
  assert.match(adminJs, /function createAdminInlinePhoto\(delivery, toolbar\) \{/);
  assert.match(adminJs, /wrapper\.className = "admin-inline-photo-frame";/);
  assert.match(adminJs, /viewport\.className = "admin-inline-photo-viewport";/);
  assert.match(adminJs, /const rotateError = document\.createElement\("span"\);[\s\S]*rotateError\.className = "photo-rotate-error";/);
  assert.match(adminJs, /toolbar\.append\(rotateLeft, rotateRight, rotateError\);/);
  assert.match(adminJs, /createPhotoViewer\(\{[\s\S]*viewport,[\s\S]*image: photo,[\s\S]*useWindowResize: false,[\s\S]*wheelRequiresCtrl: true,[\s\S]*wheelScrollTarget: \(\) => viewport\.closest\("\.admin-list"\),[\s\S]*touchScrollTarget: \(\) => viewport\.closest\("\.admin-list"\),[\s\S]*\}\);/);
  assert.match(adminJs, /makePhotoIconButton\("左轉90度", "↺", \(button\) => rotateAdminInlinePhoto\(delivery, photo, -90, button, rotateError\)\)/);
  assert.match(adminJs, /makePhotoIconButton\("右轉90度", "↻", \(button\) => rotateAdminInlinePhoto\(delivery, photo, 90, button, rotateError\)\)/);
  assert.match(adminJs, /async function rotateAdminInlinePhoto\(delivery, image, degrees, button, errorEl\) \{/);
  assert.match(adminJs, /await runPhotoRotateWithFailureMessage\(button, errorEl, async \(\) => \{/);
  assert.match(adminJs, /await saveRotatedAdminPhoto\(delivery, image, degrees\);/);
  assert.match(adminJs, /function runPhotoRotateWithFailureMessage\(button, errorEl, operation\) \{/);
  assert.match(adminJs, /function setPhotoRotateError\(errorEl, message\) \{/);
  assert.doesNotMatch(adminJs, /admin-inline-photo-saving|runInlinePhotoRotateWithStatus/);
  assert.match(adminCss, /\.admin-inline-photo-frame\s*\{[\s\S]*grid-column:\s*1 \/ -1;[\s\S]*display:\s*grid;[\s\S]*gap:\s*4px;/);
  assert.match(adminCss, /\.admin-inline-photo-toolbar\s*\{[\s\S]*display:\s*none;/);
  assert.match(adminCss, /\.admin-card\.delivery-row\.has-inline-photo\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto minmax\(0,\s*1fr\);/);
  assert.match(adminCss, /\.admin-card\.delivery-row\.has-inline-photo \.admin-inline-photo-left\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(180px,\s*3fr\) minmax\(160px,\s*2fr\);/);
  assert.match(adminCss, /\.admin-card\.delivery-row\.has-inline-photo \.admin-inline-photo-right\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*max-content minmax\(120px,\s*2fr\) minmax\(76px,\s*1fr\) minmax\(100px,\s*2fr\);/);
  assert.match(adminCss, /\.admin-card\.delivery-row\.has-inline-photo \.admin-inline-photo-toolbar\s*\{[\s\S]*display:\s*flex;[\s\S]*justify-content:\s*center;[\s\S]*align-items:\s*center;[\s\S]*justify-self:\s*center;/);
  assert.match(adminCss, /\.photo-rotate-error\s*\{[\s\S]*font-size:\s*8px;[\s\S]*white-space:\s*nowrap;/);
  assert.match(adminCss, /\.admin-inline-photo-viewport\s*\{[\s\S]*height:\s*320px;[\s\S]*overflow:\s*hidden;[\s\S]*touch-action:\s*none;/);
  assert.match(adminCss, /\.photo-icon-button\s*\{[\s\S]*width:\s*38px;[\s\S]*font-size:\s*20px;/);
});

test("admin login password field has a show-hide toggle", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(html, /<div class="password-field">[\s\S]*<input id="adminLoginPassword"[^>]*type="password"[\s\S]*<button id="adminTogglePassword"/);
  assert.match(html, /aria-label="顯示密碼"/);
  assert.match(html, /id="adminPasswordEyeOpen"[\s\S]*class="eye-icon eye-open"/);
  assert.match(html, /id="adminPasswordEyeClosed"[\s\S]*class="eye-icon eye-closed"/);
  assert.match(adminJs, /togglePassword:\s*document\.querySelector\("#adminTogglePassword"\)/);
  assert.match(adminJs, /adminEls\.loginPassword\.type = isVisible \? "text" : "password";/);
  assert.match(adminJs, /adminEls\.togglePassword\.setAttribute\("aria-label", isVisible \? "隱藏密碼" : "顯示密碼"\);/);
  assert.match(adminJs, /setAdminPasswordIconHidden\(adminEls\.passwordEyeOpen, isVisible\);/);
  assert.match(adminJs, /setAdminPasswordIconHidden\(adminEls\.passwordEyeClosed, !isVisible\);/);
});

test("admin login starts at the top while staying horizontally centered", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");

  assert.match(html, /<main id="adminLoginScreen" class="app-shell">/);
  assert.match(css, /#adminLoginScreen\s*\{[\s\S]*padding-top:\s*0;/);
  assert.match(css, /#adminLoginScreen \.login-screen\s*\{[\s\S]*align-content:\s*start;[\s\S]*padding-top:\s*0;/);
  assert.doesNotMatch(css, /#adminLoginScreen\s*\{[^}]*margin/);
});

test("admin app header and filter controls use compact spacing", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.doesNotMatch(html, /管理環境/);
  assert.doesNotMatch(html, /<header class="admin-header">/);
  assert.doesNotMatch(html, /<main id="adminApp" class="admin-shell" hidden>[\s\S]*<h1>[\s\S]*<\/h1>[\s\S]*<\/main>/);
  assert.doesNotMatch(html, /配送紀錄維護/);
  assert.match(html, /<div class="admin-top-row">\s*<nav class="admin-tabs"[^>]*>[\s\S]*<\/nav>\s*<div class="admin-top-actions">[\s\S]*<button id="adminLogout" class="ghost-button admin-logout-button" type="button">/);
  assert.match(css, /\.admin-sticky\s*\{[\s\S]*padding-bottom:\s*4px;/);
  assert.match(css, /\.admin-tabs\s*\{[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);[\s\S]*margin-bottom:\s*0;/);
  assert.match(css, /\.admin-tabs button\s*\{[\s\S]*height:\s*30px;[\s\S]*min-height:\s*30px;[\s\S]*font-size:\s*14px;[\s\S]*font-weight:\s*700;[\s\S]*white-space:\s*nowrap;/);
  assert.match(css, /\.admin-logout-button\s*\{[\s\S]*height:\s*30px;[\s\S]*min-height:\s*30px;/);
  assert.match(css, /\.admin-view\s*\{[\s\S]*gap:\s*4px;/);
  assert.match(css, /\.filter-grid\s*\{[\s\S]*gap:\s*8px;[\s\S]*padding:\s*5px 10px;/);
  assert.match(css, /\.filter-grid label\s*\{[\s\S]*gap:\s*4px;[\s\S]*font-size:\s*13px;/);
  assert.match(css, /\.filter-grid input,[\s\S]*\.filter-grid select\s*\{[\s\S]*height:\s*30px;[\s\S]*min-height:\s*30px;/);
  assert.match(css, /\.filter-grid button\s*\{[\s\S]*height:\s*30px;[\s\S]*min-height:\s*30px;/);
  assert.match(css, /\.filter-counts\s*\{[\s\S]*height:\s*30px;[\s\S]*min-height:\s*30px;/);
  assert.match(css, /\.admin-shell\s*\{[\s\S]*padding:\s*8px;/);
  assert.match(css, /\.admin-list\s*\{[\s\S]*gap:\s*4px;/);
  assert.match(css, /\.admin-card\s*\{[\s\S]*padding:\s*4px 14px;/);
  assert.match(html, /<script src="\/static\/admin-operation-state\.js"><\/script>\s*<script src="\/static\/admin-api\.js"><\/script>/);
  assert.match(adminJs, /AdminOperationState\.runWithButtonLock\(adminEls\.uploadExcel, "匯入中\.\.\.",/);
  assert.match(adminJs, /AdminOperationState\.runWithButtonLock\(adminEls\.archivePhotos, "封存中\.\.\.",/);
  assert.match(adminJs, /AdminOperationState\.runWithButtonLock\(button, "刪除中\.\.\.",/);
  assert.match(adminJs, /AdminOperationState\.runWithButtonLock\(button, "永久刪除中\.\.\.",/);
});

test("archive date change loads existing archives and keeps only the latest response", () => {
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(adminJs, /archiveRequestId:\s*0/);
  assert.match(adminJs, /adminEls\.archiveDate\.addEventListener\("change", loadArchives\);/);
  assert.match(adminJs, /async function loadArchives\(\)/);
  assert.match(adminJs, /const requestId = \+\+adminState\.archiveRequestId;/);
  assert.match(adminJs, /adminApi\(`\/api\/admin\/archives\?token=\$\{encodeURIComponent\(adminState\.token\)\}&delivery_date=\$\{encodeURIComponent\(deliveryDate\)\}`\)/);
  assert.match(adminJs, /if \(requestId !== adminState\.archiveRequestId\) \{\s*return;\s*\}/);
  assert.match(adminJs, /adminState\.archives = result\.archives;/);
  assert.match(adminJs, /<input type="checkbox" checked \/>/);
  assert.match(adminJs, /此日期尚無封存檔案/);
});

test("admin import success refreshes only delivery data allowed by permissions", () => {
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(adminJs, /await refreshAfterImport\(\);/);
  assert.match(adminJs, /async function refreshAfterImport\(\) \{/);
  assert.match(adminJs, /if \(hasAdminPermission\("deliveries"\)\) \{[\s\S]*await loadOptions\(false\);[\s\S]*await loadDeliveries\(false\);[\s\S]*\}/);
  assert.match(adminJs, /if \(hasAdminPermission\("deleted"\)\) \{[\s\S]*await loadOptions\(true\);[\s\S]*\}/);
  assert.doesNotMatch(adminJs, /await loadOptions\(\);\s*await loadDeliveries\(false\);\s*setAdminMessage\("匯入完成"\);/);
});

test("admin delivery record maintenance UI is removed from the admin platform", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.doesNotMatch(html, /data-view="maintenance"|maintenanceView|maintenanceStartDate|maintenanceEndDate|cleanupDeliveryHistory|配送紀錄維護/);
  assert.doesNotMatch(css, /#maintenanceView/);
  assert.doesNotMatch(adminJs, /maintenance:\s*document\.querySelector|maintenanceStartDate|maintenanceEndDate|cleanupDeliveryHistory|\/api\/admin\/maintenance\/cleanup/);
});

test("admin filter row shows query before filtered delivery counts", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(html, /<select id="filterDriver"><\/select>\s*<\/label>\s*<button id="applyFilters" class="secondary-button" type="button">查詢<\/button>\s*<div id="adminDeliveryCounts" class="filter-counts" role="status" aria-live="polite">[\s\S]*已達交: 0[\s\S]*未達交: 0[\s\S]*共: 0[\s\S]*<\/div>\s*<label class="delivery-visibility-toggle">\s*<input id="hideDelivered" type="checkbox" \/>\s*<span>隱藏已達交<\/span>\s*<\/label>\s*<button id="toggleAllPhotos" class="secondary-button" type="button">[\s\S]*<\/button>\s*<button id="bulkDeleteFiltered" class="danger-button" type="button">全部刪除<\/button>/);
  assert.match(html, /<select id="deletedFilterDriver"><\/select>\s*<\/label>\s*<button id="applyDeletedFilters" class="secondary-button" type="button">查詢<\/button>\s*<div id="deletedDeliveryCounts" class="filter-counts" role="status" aria-live="polite">[\s\S]*已達交: 0[\s\S]*未達交: 0[\s\S]*共: 0[\s\S]*<\/div>\s*<button id="bulkPermanentDeleteFiltered" class="danger-button" type="button">全部永久刪除<\/button>/);
  assert.match(css, /\.delivery-filter-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\) minmax\(90px,\s*0\.7fr\) minmax\(220px,\s*1\.2fr\) minmax\(120px,\s*0\.9fr\) minmax\(120px,\s*0\.8fr\) minmax\(100px,\s*0\.7fr\);/);
  assert.match(css, /\.deleted-filter-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\) minmax\(90px,\s*0\.7fr\) minmax\(220px,\s*1\.2fr\) minmax\(100px,\s*0\.7fr\);/);
  assert.match(css, /\.filter-counts\s*\{[\s\S]*align-self:\s*end;[\s\S]*justify-content:\s*center;[\s\S]*height:\s*30px;[\s\S]*min-height:\s*30px;[\s\S]*font-size:\s*14px;[\s\S]*white-space:\s*nowrap;/);
  assert.match(adminJs, /deliveryCounts:\s*document\.querySelector\("#adminDeliveryCounts"\)/);
  assert.match(adminJs, /deletedDeliveryCounts:\s*document\.querySelector\("#deletedDeliveryCounts"\)/);
  assert.match(adminJs, /updateDeliveryCounts\(deleted \? adminEls\.deletedDeliveryCounts : adminEls\.deliveryCounts, result\.deliveries\);/);
  assert.match(adminJs, /function updateDeliveryCounts\(element, deliveries\) \{[\s\S]*const deliveredCount = deliveries\.filter\(\(delivery\) => Boolean\(delivery\.status\)\)\.length;[\s\S]*const pendingCount = totalCount - deliveredCount;[\s\S]*makeCountSpan\(`已達交: \$\{deliveredCount\}`\)[\s\S]*makeCountSpan\(`未達交: \$\{pendingCount\}`\)[\s\S]*makeCountSpan\(`共: \$\{totalCount\}`\)/);
});

test("admin delivery sort buttons toggle direction and query restores original order", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(html, /<\/div>\s*<div class="delivery-list-toolbar" role="group" aria-label="配送清單排序">\s*<button class="secondary-button delivery-sort-button" data-delivery-sort="customer" type="button" aria-pressed="false">客戶<\/button>\s*<button class="secondary-button delivery-sort-button" data-delivery-sort="company" type="button" aria-pressed="false">公司<\/button>\s*<button class="secondary-button delivery-sort-button" data-delivery-sort="driver" type="button" aria-pressed="false">物流士<\/button>\s*<button class="secondary-button delivery-sort-button" data-delivery-sort="status" type="button" aria-pressed="false">達交狀態<\/button>\s*<span class="delivery-sort-spacer" aria-hidden="true"><\/span>\s*<\/div>\s*<section id="adminDeliveryList" class="admin-list"><\/section>/);
  assert.doesNotMatch(html, /id="deliverySort"|原始順序/);
  assert.match(css, /\.delivery-list-toolbar\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(180px,\s*4fr\) minmax\(160px,\s*3fr\) minmax\(120px,\s*2fr\) minmax\(76px,\s*1fr\) minmax\(100px,\s*2fr\);[\s\S]*min-height:\s*34px;/);
  assert.match(css, /#deliveriesView\s*\{[\s\S]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\);/);
  assert.match(css, /\.delivery-sort-button\s*\{[\s\S]*height:\s*30px;[\s\S]*min-height:\s*30px;/);
  assert.match(css, /\.delivery-sort-button\.active\s*\{[\s\S]*background:\s*var\(--primary\);[\s\S]*color:\s*#ffffff;/);
  assert.match(css, /\.delivery-sort-button\[data-direction="asc"\]::after\s*\{[\s\S]*content:\s*" ↑";/);
  assert.match(css, /\.delivery-sort-button\[data-direction="desc"\]::after\s*\{[\s\S]*content:\s*" ↓";/);
  assert.match(adminJs, /deliverySortKey:\s*""[\s\S]*deliverySortDirection:\s*"asc"/);
  assert.match(adminJs, /deliverySortButtons:\s*document\.querySelectorAll\("\[data-delivery-sort\]"\)/);
  assert.match(adminJs, /for \(const button of adminEls\.deliverySortButtons\) \{[\s\S]*AdminFilterOptions\.nextDeliverySort\([\s\S]*button\.dataset\.deliverySort[\s\S]*updateDeliverySortButtons\(\);[\s\S]*renderCurrentDeliveries\(\);[\s\S]*\}/);
  assert.match(adminJs, /async function applyAdminFilters\(deleted\) \{[\s\S]*if \(!deleted\) \{\s*resetDeliverySort\(\);\s*\}[\s\S]*await loadDeliveries\(deleted\);/);
  assert.match(adminJs, /AdminFilterOptions\.sortDeliveries\(deliveries, adminState\.deliverySortKey, adminState\.deliverySortDirection\)/);
});

test("admin delivery list uses full width compact rows", () => {
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(css, /\.admin-shell\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;/);
  assert.match(css, /\.admin-card\.delivery-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(180px,\s*4fr\) minmax\(160px,\s*3fr\) minmax\(120px,\s*2fr\) minmax\(76px,\s*1fr\) minmax\(100px,\s*2fr\);/);
  assert.match(css, /\.admin-card\.delivery-row\.has-inline-photo\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto minmax\(0,\s*1fr\);/);
  assert.match(css, /\.admin-card\.delivery-row \.admin-customer\s*\{[\s\S]*font-size:\s*14px;[\s\S]*font-weight:\s*800;[\s\S]*color:\s*#000000;/);
  assert.match(css, /\.admin-card\.delivery-row \.admin-row-cell,[\s\S]*\.admin-card\.delivery-row \.admin-actions button\s*\{[\s\S]*font-size:\s*12px;[\s\S]*color:\s*#000000;/);
  assert.match(css, /\.admin-card\.delivery-row \.admin-document,[\s\S]*\.admin-card\.delivery-row \.admin-photo-time,[\s\S]*\.admin-card\.delivery-row \.admin-route,[\s\S]*\.admin-card\.delivery-row \.admin-status\s*\{[\s\S]*text-align:\s*left;/);
  assert.match(css, /\.admin-card\.delivery-row \.admin-photo-time\s*\{[\s\S]*min-width:\s*max-content;[\s\S]*overflow:\s*visible;[\s\S]*text-overflow:\s*clip;/);
  assert.match(css, /\.admin-card\.delivery-row:not\(\.has-inline-photo\) \.admin-photo-time\s*\{[\s\S]*display:\s*none;/);
  assert.match(css, /\.admin-card\.delivery-row \.admin-row-actions\s*\{[\s\S]*justify-content:\s*flex-end;/);
  assert.match(adminJs, /const hideDeliveryDate = Boolean\(startDateEl\.value && startDateEl\.value === endDateEl\.value\);/);
  assert.match(adminJs, /if \(deleted\) \{\s*renderDeliveries\(listEl, result\.deliveries, true, hideDeliveryDate\);\s*\} else \{\s*renderCurrentDeliveries\(\);\s*\}/);
  assert.match(adminJs, /function renderDeliveries\(container, deliveries, deleted, hideDeliveryDate = false\)/);
  assert.match(adminJs, /<div class="admin-inline-photo-left">\s*<strong class="admin-customer"><\/strong>\s*<span class="admin-row-cell admin-document"><\/span>\s*<\/div>\s*<div class="admin-inline-photo-toolbar"><\/div>\s*<div class="admin-inline-photo-right">\s*<span class="admin-row-cell admin-photo-time"><\/span>\s*<span class="admin-row-cell admin-route"><\/span>\s*<span class="admin-row-cell admin-status"><\/span>\s*<div class="admin-actions admin-row-actions"><\/div>\s*<\/div>/);
  assert.match(adminJs, /card\.querySelector\("\.admin-document"\)\.textContent = \[\s*hideDeliveryDate \? "" : delivery\.delivery_date,\s*delivery\.company,\s*delivery\.invoice_no,\s*delivery\.quantity \? `數量：\$\{delivery\.quantity\}` : "",\s*\]\.filter\(Boolean\)\.join\(" \| "\);/);
  assert.match(adminJs, /card\.querySelector\("\.admin-route"\)\.textContent = \[delivery\.driver, delivery\.vehicle_no\]\.filter\(Boolean\)\.join\(" \\| "\);/);
});

test("admin delivery status highlights normal green and abnormal red", () => {
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(adminJs, /const statusEl = card\.querySelector\("\.admin-status"\);/);
  assert.match(adminJs, /statusEl\.textContent = delivery\.status_label \|\| "";/);
  assert.match(adminJs, /statusEl\.classList\.toggle\("status-normal", delivery\.status === "normal"\);/);
  assert.match(adminJs, /statusEl\.classList\.toggle\("status-abnormal", delivery\.status === "abnormal"\);/);
  assert.match(css, /\.admin-card\.delivery-row \.admin-status\.status-normal\s*\{[\s\S]*color:\s*var\(--normal\);[\s\S]*font-weight:\s*800;/);
  assert.match(css, /\.admin-card\.delivery-row \.admin-status\.status-abnormal\s*\{[\s\S]*color:\s*var\(--danger\);[\s\S]*font-weight:\s*800;/);
});

test("admin user management has account and permission assignment panels", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(html, /<div class="user-management-grid">[\s\S]*<section class="admin-panel user-account-panel">[\s\S]*<h2>帳號密碼管理<\/h2>[\s\S]*<section id="userList" class="admin-list"><\/section>[\s\S]*<section class="admin-panel user-permission-panel">[\s\S]*<h2>權限指派<\/h2>/);
  assert.match(html, /<span>帳號<\/span>\s*<input id="userUsername" autocomplete="off" \/>/);
  assert.match(html, /<span>名稱<\/span>\s*<input id="userDisplayName" autocomplete="off" \/>/);
  assert.match(html, /data-permission-row="deliveries"[\s\S]*配送狀態[\s\S]*name="permission-deliveries"[\s\S]*value="disabled"[\s\S]*禁用[\s\S]*name="permission-deliveries"[\s\S]*value="readonly"[\s\S]*唯讀[\s\S]*name="permission-deliveries"[\s\S]*value="full"[\s\S]*完整功能/);
  for (const [key, label] of [
    ["deleted", "刪除區"],
    ["upload", "匯入 Excel"],
    ["archive", "封存照片"],
    ["users", "帳號管理"],
    ["driver", "物流士配送作業"],
  ]) {
    assert.match(html, new RegExp(`data-permission-row="${key}"[\\s\\S]*${label}[\\s\\S]*name="permission-${key}"[\\s\\S]*value="enabled"[\\s\\S]*啟用[\\s\\S]*name="permission-${key}"[\\s\\S]*value="disabled"[\\s\\S]*禁用`));
  }
  assert.match(css, /\.user-management-grid\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(0,\s*1fr\);/);
  assert.match(css, /\.permission-row\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto auto auto;/);
  assert.match(css, /:root\s*\{[\s\S]*--admin-user-row-height:\s*34px;[\s\S]*--admin-user-font-size:\s*13px;/);
  assert.match(css, /\.user-form\s*\{[\s\S]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\);[\s\S]*gap:\s*2px;[\s\S]*align-items:\s*stretch;/);
  assert.match(css, /\.permission-row,[\s\S]*\.user-account-panel \.admin-card\s*\{[\s\S]*height:\s*var\(--admin-user-row-height\);[\s\S]*min-height:\s*var\(--admin-user-row-height\);[\s\S]*font-size:\s*var\(--admin-user-font-size\);/);
  assert.match(css, /\.user-form label\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*auto minmax\(0,\s*1fr\);[\s\S]*align-items:\s*center;/);
  const userFormLabelBlock = cssBlockAfter(css, ".user-form label {");
  assert.match(userFormLabelBlock, /gap:\s*4px;/);
  assert.match(userFormLabelBlock, /padding:\s*0 2px;/);
  assert.doesNotMatch(userFormLabelBlock, /border:\s*1px/);
  assert.doesNotMatch(userFormLabelBlock, /border-radius:/);
  assert.doesNotMatch(userFormLabelBlock, /background:\s*#ffffff/);
  const userFormControlBlock = cssBlockAfter(css, ".user-form input,");
  assert.match(userFormControlBlock, /width:\s*auto;/);
  assert.match(userFormControlBlock, /height:\s*24px;/);
  assert.match(userFormControlBlock, /min-height:\s*24px;/);
  assert.doesNotMatch(userFormControlBlock, /(^|\n)\s*width:\s*100%;/);
  const userFormButtonBlock = cssBlockAfter(css, ".user-form button {");
  assert.match(userFormButtonBlock, /width:\s*auto;/);
  assert.match(userFormButtonBlock, /height:\s*34px;/);
  assert.match(userFormButtonBlock, /min-height:\s*34px;/);
  const userActiveInputBlock = cssBlockAfter(css, ".user-form .user-active input");
  assert.match(userActiveInputBlock, /width:\s*auto;/);
  assert.match(userActiveInputBlock, /height:\s*24px;/);
  assert.match(userActiveInputBlock, /min-height:\s*24px;/);
  assert.doesNotMatch(userActiveInputBlock, /width:\s*16px|height:\s*16px|min-height:\s*16px/);
  assert.match(css, /\.permission-row > span,[\s\S]*\.permission-row label,[\s\S]*\.user-account-panel \.admin-card h3,[\s\S]*\.user-account-panel \.admin-meta,[\s\S]*\.user-account-panel \.admin-actions button\s*\{[\s\S]*font-size:\s*var\(--admin-user-font-size\);/);
  assert.match(css, /\.user-account-panel \.user-account-line\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*auto minmax\(0,\s*1fr\);[\s\S]*align-items:\s*center;/);
  assert.match(css, /\.user-account-panel \.user-profile\s*\{[\s\S]*overflow:\s*hidden;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/);
  assert.match(adminJs, /userPermissionInputs:\s*document\.querySelectorAll\("\[data-user-permission\]"\)/);
  assert.match(adminJs, /userDisplayName:\s*document\.querySelector\("#userDisplayName"\)/);
  assert.match(adminJs, /display_name:\s*adminEls\.userDisplayName\.value\.trim\(\),/);
  assert.match(adminJs, /<div class="user-account-line">\s*<h3><\/h3>\s*<div class="admin-meta user-profile"><\/div>\s*<\/div>/);
  assert.match(adminJs, /card\.querySelector\("\.user-profile"\)\.textContent = \[/);
  assert.match(adminJs, /adminEls\.userDisplayName\.value = user\.display_name \|\| "";/);
  assert.match(adminJs, /user\.display_name \? `姓名 \$\{user\.display_name\}` : ""/);
  assert.match(adminJs, /const ADMIN_PERMISSION_KEYS = \["deliveries", "delivery_actions", "deleted", "upload", "archive", "users", "driver"\];/);
  assert.match(adminJs, /function readUserPermissionControls\(\) \{/);
  assert.match(adminJs, /permissions\.deliveries = deliveryMode !== "disabled";[\s\S]*permissions\.delivery_actions = deliveryMode === "full";/);
  assert.match(adminJs, /function setUserPermissionControls\(permissions, role = adminEls\.userRole\.value\) \{/);
  assert.match(adminJs, /const deliveryMode = deliveryPermissionMode\(normalized\);[\s\S]*input\[name="permission-deliveries"\]\[value="\$\{deliveryMode\}"\]/);
  assert.match(adminJs, /permissions:\s*readUserPermissionControls\(\),/);
  assert.match(adminJs, /setUserPermissionControls\(user\.permissions, user\.role\);/);
});

test("admin delivery readonly permission hides mutating delivery controls", () => {
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(adminJs, /function hasDeliveryActionsPermission\(\) \{[\s\S]*return hasAdminPermission\("delivery_actions"\);[\s\S]*\}/);
  assert.match(adminJs, /function syncDeliveryActionControls\(\) \{[\s\S]*adminEls\.bulkDeleteFiltered\.hidden = !hasDeliveryActionsPermission\(\);[\s\S]*\}/);
  assert.match(adminJs, /applyAdminPermissions\(adminState\.permissions\);[\s\S]*syncDeliveryActionControls\(\);/);
  assert.match(adminJs, /if \(!deleted && hasDeliveryActionsPermission\(\)\) \{[\s\S]*rowActions\.append\(makeAdminButton\("刪除", "danger-button", \(button\) => deleteDelivery\(delivery, button\)\)\);[\s\S]*\}/);
  assert.match(adminJs, /if \(hasDeliveryActionsPermission\(\)\) \{[\s\S]*toolbar\.append\(rotateLeft, rotateRight, rotateError\);[\s\S]*\}/);
  assert.match(adminJs, /const canRotate = hasDeliveryActionsPermission\(\);[\s\S]*adminEls\.photoRotateLeft\.hidden = !canRotate;[\s\S]*adminEls\.photoRotateRight\.hidden = !canRotate;/);
  assert.match(adminJs, /if \(!hasDeliveryActionsPermission\(\)\) \{[\s\S]*setPhotoRotateError\([^,]+,\s*"此帳號未啟用配送狀態完整功能"\);[\s\S]*return;/);
});

test("admin menu only shows permissions enabled for the signed-in user", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(html, /data-view="deliveries" data-permission="deliveries"[^>]*>配送狀態<\/button>/);
  assert.match(html, /data-view="deleted" data-permission="deleted"[^>]*>刪除區<\/button>/);
  assert.match(html, /data-view="upload" data-permission="upload"[^>]*>匯入 Excel<\/button>/);
  assert.match(html, /data-view="archive" data-permission="archive"[^>]*>封存照片<\/button>/);
  assert.match(html, /data-view="users" data-permission="users"[^>]*>帳號管理<\/button>/);
  assert.match(adminJs, /permissions:\s*readStoredPermissions\(\)/);
  assert.match(adminJs, /localStorage\.setItem\("delivery_permissions", JSON\.stringify\(adminState\.permissions\)\);/);
  assert.match(adminJs, /localStorage\.removeItem\("delivery_permissions"\);/);
  assert.match(adminJs, /function applyAdminPermissions\(permissions\) \{/);
  assert.match(adminJs, /button\.hidden = !hasAdminPermission\(button\.dataset\.permission\);/);
  assert.match(adminJs, /function firstAllowedAdminView\(\) \{/);
  assert.match(adminJs, /if \(!isAdminViewAllowed\(view\)\) \{/);
  assert.match(adminJs, /setAdminMessage\("此帳號尚未啟用任何管理功能", true\);/);
});

test("admin header has a fixed right my account button", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(html, /<div class="admin-top-row">\s*<nav class="admin-tabs" aria-label="管理選單">[\s\S]*<\/nav>\s*<div class="admin-top-actions">[\s\S]*<button id="adminAccount" class="secondary-button admin-account-button" type="button">我的帳號<\/button>[\s\S]*<button id="adminLogout"/);
  assert.match(css, /\.admin-top-row\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[\s\S]*align-items:\s*center;/);
  assert.match(css, /\.admin-top-actions\s*\{[\s\S]*display:\s*flex;[\s\S]*justify-content:\s*flex-end;/);
  assert.match(css, /\.admin-account-button\s*\{[\s\S]*width:\s*auto;[\s\S]*min-width:\s*88px;/);
  assert.match(adminJs, /accountButton:\s*document\.querySelector\("#adminAccount"\)/);
  assert.match(adminJs, /adminEls\.accountButton\.addEventListener\("click", \(\) => setView\("account"\)/);
});

test("admin my account view has profile and password panels", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(html, /<section id="accountView" class="admin-view" hidden>[\s\S]*<div class="account-grid">[\s\S]*<section class="admin-panel account-profile-panel">[\s\S]*<h2>我的帳號<\/h2>/);
  assert.match(html, /<span>帳號<\/span>\s*<input id="accountUsername" readonly \/>/);
  assert.match(html, /<span>使用者名稱<\/span>\s*<input id="accountDisplayName" autocomplete="name" \/>/);
  assert.match(html, /<span>角色<\/span>\s*<input id="accountRole" readonly \/>/);
  assert.match(html, /<div id="accountPermissions" class="account-permission-list" aria-label="目前的使用權限"><\/div>/);
  assert.match(html, /<section class="admin-panel account-password-panel">[\s\S]*<h2>變更密碼<\/h2>[\s\S]*設定密碼必須有英文、數字組合，至少8碼/);
  for (const id of ["accountOldPassword", "accountNewPassword", "accountConfirmPassword"]) {
    assert.match(html, new RegExp(`<input id="${id}"[^>]*type="password"`));
    assert.match(html, new RegExp(`<button[^>]*data-password-toggle="${id}"[^>]*aria-label="顯示密碼"`));
  }
  assert.match(html, /<button id="saveAccount" class="primary-button account-save-button" type="button">確定儲存<\/button>/);
  assert.match(css, /\.account-grid\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(0,\s*1fr\);/);
  assert.match(css, /\.account-save-row\s*\{[\s\S]*grid-column:\s*1 \/ -1;[\s\S]*justify-content:\s*center;/);
  assert.match(adminJs, /async function loadMyAccount\(\) \{/);
  assert.match(adminJs, /async function saveMyAccount\(\) \{/);
  assert.match(adminJs, /adminApi\(`\/api\/admin\/account\?token=\$\{encodeURIComponent\(adminState\.token\)\}`\)/);
  assert.match(adminJs, /adminApi\("\/api\/admin\/account",[\s\S]*display_name:\s*adminEls\.accountDisplayName\.value\.trim\(\),[\s\S]*old_password:/);
});

test("admin list controls stay sticky above scrolling lists", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");

  assert.match(html, /<div class="admin-sticky">\s*<div class="admin-top-row">\s*<nav class="admin-tabs"/);
  assert.match(html, /<p id="adminMessage" class="message" role="status" aria-live="polite"><\/p>\s*<\/div>\s*<section id="deliveriesView"/);
  assert.match(css, /\.admin-shell\s*\{[\s\S]*height:\s*100vh;[\s\S]*height:\s*100dvh;[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.admin-sticky\s*\{[\s\S]*position:\s*sticky;[\s\S]*top:\s*0;[\s\S]*z-index:\s*20;[\s\S]*background:\s*var\(--bg\);/);
  assert.match(css, /\.admin-view\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.admin-list\s*\{[\s\S]*min-height:\s*0;[\s\S]*overflow-y:\s*auto;/);
  assert.doesNotMatch(css, /--admin-filter-sticky-top/);
}
);

test("driver date dropdown renders at most the latest 10 dates", () => {
  const appJs = fs.readFileSync(path.join(staticRoot, "app.js"), "utf8");

  assert.match(appJs, /const DRIVER_DATE_OPTION_LIMIT = 10;/);
  assert.match(appJs, /state\.dates\.slice\(0,\s*DRIVER_DATE_OPTION_LIMIT\)/);
});
