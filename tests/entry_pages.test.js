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

  assert.equal(manifest.start_url, "/driver");
  assert.match(workerJs, /"\/driver"/);
  assert.match(webPy, /parsed\.path in \{"\/", "\/driver"\}/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" \/>/);
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
  assert.match(css, /#refreshButton,\s*#logoutButton,\s*#smartPhotoButton,\s*#scanInvoiceButton\s*\{[\s\S]*align-self:\s*center;[\s\S]*height:\s*calc\(var\(--driver-control-panel-height\) \* 0\.8\);[\s\S]*min-height:\s*calc\(var\(--driver-control-panel-height\) \* 0\.8\);/);
  assert.match(css, /\.delivery-screen select\s*\{[\s\S]*min-height:\s*32px;/);
  assert.match(css, /\.delivery-screen \.summary-strip\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*2fr\) minmax\(0,\s*2fr\) minmax\(0,\s*1fr\) minmax\(0,\s*1fr\);[\s\S]*gap:\s*4px;[\s\S]*margin-top:\s*4px;[\s\S]*padding:\s*5px 6px;/);
  assert.match(css, /\.summary-actions\s*\{[\s\S]*display:\s*contents;/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.delivery-screen \.summary-strip\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*2fr\) minmax\(0,\s*2fr\) minmax\(0,\s*1fr\) minmax\(0,\s*1fr\);/);
  assert.match(css, /\.summary-actions button\s*\{[\s\S]*font-size:\s*12px;[\s\S]*white-space:\s*nowrap;/);
  const summaryLabelBlock = cssBlockAfter(css, ".delivery-screen .summary-strip span");
  assert.match(summaryLabelBlock, /color:\s*#000000;/);
  assert.match(summaryLabelBlock, /font-size:\s*11px;/);
  assert.match(css, /\.delivery-screen \.summary-strip \.toggle-row input\s*\{[\s\S]*width:\s*18px;[\s\S]*min-height:\s*18px;/);
  assert.match(css, /\.delivery-screen \.message,[\s\S]*\.delivery-screen \.queue-status\s*\{[\s\S]*flex:\s*0 0 auto;[\s\S]*line-height:\s*1\.35;[\s\S]*white-space:\s*normal;[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*word-break:\s*break-word;/);
  assert.match(css, /\.delivery-screen \.delivery-list\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;[\s\S]*overflow-y:\s*auto;/);
  assert.match(appJs, /localStorage\.setItem\("delivery_pending_upload_count", String\(state\.pendingUploads\.length\)\);/);
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
  assert.match(adminJs, /body:\s*\{\s*username:\s*adminEls\.loginUsername\.value\.trim\(\),\s*password:\s*adminEls\.loginPassword\.value/s);
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
  assert.doesNotMatch(adminJs, /照片旋轉已儲存|儲存中/);
  assert.match(adminCss, /\.photo-rotate-error\s*\{[\s\S]*font-size:\s*8px;[\s\S]*white-space:\s*nowrap;/);
  assert.match(webPy, /parsed\.path\.startswith\("\/api\/admin\/deliveries\/"\) and parsed\.path\.endswith\("\/photo"\)/);
  assert.match(webPy, /def _handle_admin_photo_save\(self, delivery_id: str\)/);
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
  assert.match(html, /<div id="adminDeliveryCounts" class="filter-counts" role="status" aria-live="polite">[\s\S]*共: 0[\s\S]*<\/div>\s*<button id="bulkDeleteFiltered" class="danger-button" type="button">全部刪除<\/button>/);
  assert.match(html, /<div id="deletedDeliveryCounts" class="filter-counts" role="status" aria-live="polite">[\s\S]*共: 0[\s\S]*<\/div>\s*<button id="bulkPermanentDeleteFiltered" class="danger-button" type="button">永久刪除<\/button>/);
  assert.match(css, /\.filter-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\) minmax\(90px,\s*0\.7fr\) minmax\(220px,\s*1\.2fr\) minmax\(100px,\s*0\.7fr\);/);
  assert.match(adminJs, /deliveries:\s*\[\]/);
  assert.match(adminJs, /deletedDeliveries:\s*\[\]/);
  assert.match(adminJs, /bulkDeleteFiltered:\s*document\.querySelector\("#bulkDeleteFiltered"\)/);
  assert.match(adminJs, /bulkPermanentDeleteFiltered:\s*document\.querySelector\("#bulkPermanentDeleteFiltered"\)/);
  assert.match(adminJs, /adminEls\.bulkDeleteFiltered\.addEventListener\("click", bulkDeleteFilteredDeliveries\);/);
  assert.match(adminJs, /adminEls\.bulkPermanentDeleteFiltered\.addEventListener\("click", bulkPermanentDeleteFilteredDeliveries\);/);
  assert.match(adminJs, /adminState\[deleted \? "deletedDeliveries" : "deliveries"\] = result\.deliveries;/);
  assert.match(adminJs, /async function bulkDeleteFilteredDeliveries\(\) \{/);
  assert.match(adminJs, /adminApi\("\/api\/admin\/deliveries\/bulk-delete",[\s\S]*delivery_ids: deliveryIds,/);
  assert.match(adminJs, /async function bulkPermanentDeleteFilteredDeliveries\(\) \{/);
  assert.match(adminJs, /adminApi\("\/api\/admin\/deliveries\/bulk-permanent-delete",[\s\S]*delivery_ids: deliveryIds,/);
  assert.match(adminJs, /確定永久清除目前篩選出的 \$\{deliveryIds\.length\} 筆刪除區配送紀錄嗎？/);
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
  assert.match(adminCss, /\.admin-card\.delivery-row\.has-inline-photo \.admin-inline-photo-toolbar\s*\{[\s\S]*display:\s*flex;[\s\S]*justify-content:\s*center;[\s\S]*align-items:\s*center;/);
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
  assert.match(html, /<nav class="admin-tabs"[^>]*>[\s\S]*<button id="adminLogout" class="ghost-button admin-logout-button" type="button">[\s\S]*<\/button>\s*<\/nav>/);
  assert.match(css, /\.admin-sticky\s*\{[\s\S]*padding-bottom:\s*4px;/);
  assert.match(css, /\.admin-tabs\s*\{[\s\S]*grid-template-columns:\s*repeat\(8,\s*minmax\(0,\s*1fr\)\);[\s\S]*margin-bottom:\s*0;/);
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

test("admin delivery record maintenance requires confirmation before permanent cleanup", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(html, /data-view="archive"[^>]*>封存照片<\/button>\s*<button class="tab-button" data-view="maintenance"[^>]*>配送紀錄維護<\/button>/);
  assert.match(html, /id="maintenanceView"[\s\S]*id="maintenanceStartDate"[^>]*type="date"[\s\S]*id="maintenanceEndDate"[^>]*type="date"[\s\S]*id="cleanupDeliveryHistory" class="danger-button"[^>]*>永久清除<\/button>/);
  assert.match(css, /#maintenanceView/);
  assert.match(adminJs, /maintenance:\s*document\.querySelector\("#maintenanceView"\)/);
  assert.match(adminJs, /maintenanceStartDate:\s*document\.querySelector\("#maintenanceStartDate"\)/);
  assert.match(adminJs, /maintenanceEndDate:\s*document\.querySelector\("#maintenanceEndDate"\)/);
  assert.match(adminJs, /cleanupDeliveryHistory:\s*document\.querySelector\("#cleanupDeliveryHistory"\)/);
  assert.match(adminJs, /adminEls\.cleanupDeliveryHistory\.addEventListener\("click", cleanupDeliveryHistory\);/);
  assert.match(adminJs, /if \(!startDate \|\| !endDate\) \{[\s\S]*請選擇開始日期與結束日期[\s\S]*return;/);
  assert.match(adminJs, /if \(startDate > endDate\) \{[\s\S]*開始日期不得晚於結束日期[\s\S]*return;/);
  assert.match(adminJs, /if \(!confirm\(`[\s\S]*全部配送紀錄[\s\S]*已達交照片[\s\S]*封存 ZIP[\s\S]*此清除無法恢復，請務必確定後執行[\s\S]*`\)\) \{\s*return;\s*\}/);
  assert.match(adminJs, /AdminOperationState\.runWithButtonLock\(adminEls\.cleanupDeliveryHistory, "清除中\.\.\.",/);
  assert.match(adminJs, /adminApi\("\/api\/admin\/maintenance\/cleanup",[\s\S]*start_date: startDate,[\s\S]*end_date: endDate,/);
  assert.match(adminJs, /已清除配送紀錄 \$\{summary\.deleted_records\} 筆、照片日期資料夾 \$\{summary\.deleted_photo_date_folders\} 個、封存 ZIP \$\{summary\.deleted_archives\} 個/);
});

test("admin filter row shows query before filtered delivery counts", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(html, /<select id="filterDriver"><\/select>\s*<\/label>\s*<button id="applyFilters" class="secondary-button" type="button">查詢<\/button>\s*<div id="adminDeliveryCounts" class="filter-counts" role="status" aria-live="polite">[\s\S]*已達交: 0[\s\S]*未達交: 0[\s\S]*共: 0[\s\S]*<\/div>\s*<button id="bulkDeleteFiltered" class="danger-button" type="button">全部刪除<\/button>/);
  assert.match(html, /<select id="deletedFilterDriver"><\/select>\s*<\/label>\s*<button id="applyDeletedFilters" class="secondary-button" type="button">查詢<\/button>\s*<div id="deletedDeliveryCounts" class="filter-counts" role="status" aria-live="polite">[\s\S]*已達交: 0[\s\S]*未達交: 0[\s\S]*共: 0[\s\S]*<\/div>\s*<button id="bulkPermanentDeleteFiltered" class="danger-button" type="button">永久刪除<\/button>/);
  assert.match(css, /\.filter-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\) minmax\(90px,\s*0\.7fr\) minmax\(220px,\s*1\.2fr\) minmax\(100px,\s*0\.7fr\);/);
  assert.match(css, /\.filter-counts\s*\{[\s\S]*align-self:\s*end;[\s\S]*justify-content:\s*center;[\s\S]*height:\s*30px;[\s\S]*min-height:\s*30px;[\s\S]*font-size:\s*14px;[\s\S]*white-space:\s*nowrap;/);
  assert.match(adminJs, /deliveryCounts:\s*document\.querySelector\("#adminDeliveryCounts"\)/);
  assert.match(adminJs, /deletedDeliveryCounts:\s*document\.querySelector\("#deletedDeliveryCounts"\)/);
  assert.match(adminJs, /updateDeliveryCounts\(deleted \? adminEls\.deletedDeliveryCounts : adminEls\.deliveryCounts, result\.deliveries\);/);
  assert.match(adminJs, /function updateDeliveryCounts\(element, deliveries\) \{[\s\S]*const deliveredCount = deliveries\.filter\(\(delivery\) => Boolean\(delivery\.status\)\)\.length;[\s\S]*const pendingCount = totalCount - deliveredCount;[\s\S]*makeCountSpan\(`已達交: \$\{deliveredCount\}`\)[\s\S]*makeCountSpan\(`未達交: \$\{pendingCount\}`\)[\s\S]*makeCountSpan\(`共: \$\{totalCount\}`\)/);
});

test("admin delivery list uses full width compact six-block rows", () => {
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(css, /\.admin-shell\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*none;/);
  assert.match(css, /\.admin-card\.delivery-row\.has-inline-photo\s*\{[\s\S]*grid-template-columns:\s*minmax\(180px,\s*3fr\) minmax\(160px,\s*2fr\) minmax\(88px,\s*1fr\) minmax\(120px,\s*2fr\) minmax\(76px,\s*1fr\) minmax\(140px,\s*2fr\);/);
  assert.match(css, /\.admin-card\.delivery-row \.admin-customer\s*\{[\s\S]*font-size:\s*14px;[\s\S]*font-weight:\s*800;[\s\S]*color:\s*#000000;/);
  assert.match(css, /\.admin-card\.delivery-row \.admin-row-cell,[\s\S]*\.admin-card\.delivery-row \.admin-actions button\s*\{[\s\S]*font-size:\s*12px;[\s\S]*color:\s*#000000;/);
  assert.match(css, /\.admin-card\.delivery-row \.admin-document,[\s\S]*\.admin-card\.delivery-row \.admin-route,[\s\S]*\.admin-card\.delivery-row \.admin-status\s*\{[\s\S]*text-align:\s*left;/);
  assert.match(css, /\.admin-card\.delivery-row \.admin-row-actions\s*\{[\s\S]*justify-content:\s*flex-end;/);
  assert.match(adminJs, /const hideDeliveryDate = Boolean\(startDateEl\.value && startDateEl\.value === endDateEl\.value\);/);
  assert.match(adminJs, /renderDeliveries\(listEl, result\.deliveries, deleted, hideDeliveryDate\);/);
  assert.match(adminJs, /function renderDeliveries\(container, deliveries, deleted, hideDeliveryDate = false\)/);
  assert.match(adminJs, /<strong class="admin-customer"><\/strong>\s*<span class="admin-row-cell admin-document"><\/span>\s*<div class="admin-inline-photo-toolbar"><\/div>\s*<span class="admin-row-cell admin-route"><\/span>\s*<span class="admin-row-cell admin-status"><\/span>\s*<div class="admin-actions admin-row-actions"><\/div>/);
  assert.match(adminJs, /card\.querySelector\("\.admin-document"\)\.textContent = \[[\s\S]*hideDeliveryDate \? "" : delivery\.delivery_date,[\s\S]*delivery\.company,[\s\S]*delivery\.invoice_no,[\s\S]*\]\.filter\(Boolean\)\.join\(" \\| "\);/);
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

test("admin list controls stay sticky above scrolling lists", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");

  assert.match(html, /<div class="admin-sticky">\s*<nav class="admin-tabs"/);
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
