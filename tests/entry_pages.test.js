const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const staticRoot = path.join(root, "static");

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

  assert.match(css, /\.delivery-screen\s*\{[\s\S]*--driver-control-panel-height:\s*64px;[\s\S]*height:\s*calc\(100vh - 36px\);[\s\S]*height:\s*calc\(100dvh - 36px\);[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*overflow:\s*hidden;/);
  assert.match(css, /\.delivery-screen \.top-bar,[\s\S]*\.delivery-screen \.summary-strip\s*\{[\s\S]*flex:\s*0 0 auto;[\s\S]*height:\s*var\(--driver-control-panel-height\);/);
  assert.match(css, /\.delivery-screen \.top-bar\s*\{[\s\S]*gap:\s*6px;[\s\S]*padding:\s*4px 8px;/);
  assert.match(css, /\.delivery-screen button\s*\{[\s\S]*min-height:\s*32px;[\s\S]*white-space:\s*nowrap;[\s\S]*word-break:\s*keep-all;/);
  assert.match(css, /#logoutButton,\s*#smartPhotoButton,\s*#refreshButton\s*\{[\s\S]*align-self:\s*center;[\s\S]*height:\s*calc\(var\(--driver-control-panel-height\) \* 0\.8\);[\s\S]*min-height:\s*calc\(var\(--driver-control-panel-height\) \* 0\.8\);/);
  assert.match(css, /\.delivery-screen select\s*\{[\s\S]*min-height:\s*32px;/);
  assert.match(css, /\.summary-actions\s*\{[\s\S]*grid-template-columns:\s*1fr 1fr;/);
  assert.match(css, /\.summary-actions button\s*\{[\s\S]*font-size:\s*12px;[\s\S]*white-space:\s*nowrap;/);
  assert.match(css, /\.delivery-screen \.summary-strip\s*\{[\s\S]*gap:\s*4px;[\s\S]*margin-top:\s*4px;[\s\S]*padding:\s*5px 6px;/);
  assert.match(css, /\.delivery-screen \.summary-strip \.toggle-row input\s*\{[\s\S]*width:\s*18px;[\s\S]*min-height:\s*18px;/);
  assert.match(css, /\.delivery-screen \.delivery-list\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;[\s\S]*overflow-y:\s*auto;/);
});

test("driver and admin lists keep cards at content height when few records remain", () => {
  const css = fs.readFileSync(path.join(staticRoot, "styles.css"), "utf8");
  const adminCss = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");

  assert.match(css, /\.delivery-list\s*\{[\s\S]*align-content:\s*start;[\s\S]*align-items:\s*start;/);
  assert.match(adminCss, /\.admin-list\s*\{[\s\S]*align-content:\s*start;[\s\S]*align-items:\s*start;/);
  assert.match(css, /\.delivery-screen \.delivery-card\s*\{[\s\S]*padding:\s*11px 12px;/);
  assert.match(adminCss, /\.admin-card\s*\{[\s\S]*padding:\s*4px 14px;/);
});

test("driver smart photo button sits before refresh and loads before the app", () => {
  const html = fs.readFileSync(path.join(staticRoot, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(staticRoot, "app.js"), "utf8");

  assert.match(html, /<button id="smartPhotoButton" class="secondary-button" type="button">智慧達交<\/button>\s*<button id="refreshButton"/);
  const smartPhotoScriptIndex = html.indexOf('<script src="/static/smart-photo.js"></script>');
  const appScriptIndex = html.indexOf('<script src="/static/app.js" defer></script>');
  assert.notEqual(smartPhotoScriptIndex, -1);
  assert.ok(smartPhotoScriptIndex < appScriptIndex);
  assert.match(appJs, /smartPhotoButton:\s*document\.querySelector\("#smartPhotoButton"\)/);
  assert.match(appJs, /els\.smartPhotoButton\.addEventListener\("click", handleSmartPhoto\);/);
});

test("driver smart photo dialog offers delivery status choices and candidate selection", () => {
  const html = fs.readFileSync(path.join(staticRoot, "index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(staticRoot, "app.js"), "utf8");

  assert.match(html, /<dialog id="smartPhotoDialog" class="smart-photo-dialog">/);
  assert.match(html, /<input id="smartPhotoStatusNormal"[^>]*value="normal"[^>]*checked/);
  assert.match(html, /<input id="smartPhotoStatusAbnormal"[^>]*value="abnormal"/);
  assert.match(html, /<div id="smartPhotoCandidates" class="smart-photo-candidates"><\/div>/);
  assert.match(appJs, /function handleSmartPhoto\(\)/);
  assert.match(appJs, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(appJs, /window\.SmartPhoto\.outcomeForPosition/);
  assert.match(appJs, /startCapture\(candidate\.delivery, selectedSmartPhotoStatus\(\)\)/);
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
  assert.match(appJs, /createPhotoViewer\(\{[\s\S]*viewport,[\s\S]*image: photo,[\s\S]*useWindowResize: false,[\s\S]*\}\);/);
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

  assert.doesNotMatch(html, /管理環境/);
  assert.doesNotMatch(html, /<header class="admin-header">/);
  assert.doesNotMatch(html, /<main id="adminApp" class="admin-shell" hidden>[\s\S]*<h1>[\s\S]*<\/h1>[\s\S]*<\/main>/);
  assert.match(html, /<nav class="admin-tabs"[^>]*>[\s\S]*<button id="adminLogout" class="ghost-button admin-logout-button" type="button">[\s\S]*<\/button>\s*<\/nav>/);
  assert.match(css, /\.admin-sticky\s*\{[\s\S]*padding-bottom:\s*4px;/);
  assert.match(css, /\.admin-tabs\s*\{[\s\S]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\);[\s\S]*margin-bottom:\s*0;/);
  assert.match(css, /\.admin-logout-button\s*\{[\s\S]*min-height:\s*40px;[\s\S]*padding:\s*0 10px;/);
  assert.match(css, /\.admin-view\s*\{[\s\S]*gap:\s*4px;/);
  assert.match(css, /\.filter-grid\s*\{[\s\S]*gap:\s*8px;[\s\S]*padding:\s*10px;/);
  assert.match(css, /\.filter-grid label\s*\{[\s\S]*gap:\s*4px;[\s\S]*font-size:\s*13px;/);
  assert.match(css, /\.filter-grid input,[\s\S]*\.filter-grid select\s*\{[\s\S]*min-height:\s*38px;/);
  assert.match(css, /\.filter-grid button\s*\{[\s\S]*min-height:\s*38px;/);
  assert.match(css, /\.admin-shell\s*\{[\s\S]*padding:\s*8px;/);
  assert.match(css, /\.admin-list\s*\{[\s\S]*gap:\s*4px;/);
  assert.match(css, /\.admin-card\s*\{[\s\S]*padding:\s*4px 14px;/);
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
