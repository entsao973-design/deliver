const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "static", "styles.css"), "utf8");
const driverHtml = fs.readFileSync(path.join(__dirname, "..", "static", "index.html"), "utf8");
const adminHtml = fs.readFileSync(path.join(__dirname, "..", "static", "admin.html"), "utf8");
const driverJs = fs.readFileSync(path.join(__dirname, "..", "static", "app.js"), "utf8");
const adminJs = fs.readFileSync(path.join(__dirname, "..", "static", "admin.js"), "utf8");
const viewerJs = fs.readFileSync(path.join(__dirname, "..", "static", "photo-viewer.js"), "utf8");

test("driver photo dialog header contains title and close button only", () => {
  const header = dialogHeader(driverHtml, "photoDialog");

  assert.ok(header.includes('id="photoTitle"'));
  assert.ok(header.includes('id="closePhotoButton"'));
  assert.equal(header.indexOf("photo-tools"), -1);
  assert.equal(header.indexOf("photoZoomOut"), -1);
  assert.equal(header.indexOf("photoZoomIn"), -1);
  assert.ok(header.indexOf('id="photoTitle"') < header.indexOf('id="closePhotoButton"'));
});

test("admin photo dialog header keeps title, rotation tools, and close button in one row", () => {
  assertHeaderLayout(adminHtml, "adminPhotoDialog", "adminPhotoTitle", "closeAdminPhoto");
  assert.match(adminHtml, /id="adminPhotoRotateLeft"/);
  assert.match(adminHtml, /id="adminPhotoRotateRight"/);
});

test("photo dialog does not include reset or admin zoom button controls", () => {
  assert.doesNotMatch(driverHtml, /photoZoomReset|ZoomReset|>重設</);
  assert.doesNotMatch(adminHtml, /adminPhotoZoomReset|adminPhotoZoomOut|adminPhotoZoomIn|ZoomReset|>重設|>縮小<|>放大</);
  assert.doesNotMatch(driverJs, /photoZoomReset|reset:\s*els\.photoZoomReset/);
  assert.doesNotMatch(adminJs, /adminPhotoZoomReset|adminPhotoZoomOut|adminPhotoZoomIn|photoZoomOut|photoZoomIn|reset:\s*adminEls\.photoZoomReset/);
  assert.doesNotMatch(viewerJs, /config\.reset|reset\.addEventListener/);
});

test("driver photo dialog header uses one compact row", () => {
  assert.match(css, /\.dialog-header\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;[^}]*padding:\s*6px 14px;/s);
  assert.match(css, /\.dialog-header\s+strong\s*\{[^}]*justify-self:\s*start;/s);
  assert.match(css, /\.dialog-header\s+>\s+\.ghost-button,\s*\.dialog-close-form\s*\{[^}]*justify-self:\s*end;/s);
});

test("admin photo dialog header gives title the remaining width", () => {
  assert.match(css, /#adminPhotoDialog\s+\.dialog-header\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto auto;[^}]*align-items:\s*center;/s);
});

test("photo dialog title wraps instead of truncating", () => {
  const titleRule = cssRule(".dialog-header strong");

  assert.match(titleRule, /white-space:\s*normal;/);
  assert.match(titleRule, /overflow-wrap:\s*anywhere;/);
  assert.doesNotMatch(titleRule, /overflow:\s*hidden;/);
  assert.doesNotMatch(titleRule, /text-overflow:\s*ellipsis;/);
  assert.doesNotMatch(titleRule, /white-space:\s*nowrap;/);
});

test("admin photo dialog title stays on one line when space is available", () => {
  const adminTitleRule = cssRule("#adminPhotoDialog .dialog-header strong");

  assert.match(adminTitleRule, /white-space:\s*nowrap;/);
  assert.match(adminTitleRule, /overflow:\s*hidden;/);
  assert.match(adminTitleRule, /text-overflow:\s*ellipsis;/);
  assert.match(adminTitleRule, /overflow-wrap:\s*normal;/);
});

test("photo dialog rotation tools are centered and tightly grouped", () => {
  assert.match(css, /\.photo-tools\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*center;[^}]*gap:\s*4px;/s);
  assert.match(css, /\.photo-tools\s+button\s*\{[^}]*padding:\s*0 8px;/s);
  assert.match(viewerJs, /const wheelRequiresCtrl = config\.wheelRequiresCtrl === true;/);
  assert.match(viewerJs, /if \(wheelRequiresCtrl && !event\.ctrlKey\) \{[\s\S]*return;[\s\S]*\}/);
});

test("photo viewer can scroll a target instead of zooming when ctrl is not pressed", () => {
  assert.match(viewerJs, /const wheelScrollTarget = config\.wheelScrollTarget \|\| null;/);
  assert.match(viewerJs, /function resolveWheelScrollTarget\(\) \{[\s\S]*typeof wheelScrollTarget === "function"[\s\S]*wheelScrollTarget\(\)[\s\S]*\}/);
  assert.match(viewerJs, /if \(wheelRequiresCtrl && !event\.ctrlKey\) \{[\s\S]*const scrollTarget = resolveWheelScrollTarget\(\);[\s\S]*scrollTarget\.scrollBy\(\{ left: event\.deltaX, top: event\.deltaY \}\);[\s\S]*return;[\s\S]*\}/);
});

test("driver inline photo viewport allows page scrolling until zoomed", () => {
  const inlineViewportRule = cssRule(".inline-photo-viewport");
  const zoomRule = cssRule(".inline-photo-viewport.has-zoom,\n.inline-photo-viewport.is-gesturing");

  assert.match(inlineViewportRule, /touch-action:\s*pan-y;/);
  assert.match(inlineViewportRule, /overscroll-behavior:\s*auto;/);
  assert.match(zoomRule, /touch-action:\s*none;/);
  assert.match(zoomRule, /overscroll-behavior:\s*contain;/);
});

test("photo dialogs are hidden after close and flex only while open", () => {
  const closedDialogRule = cssRule(".photo-dialog:not([open])");
  const openDialogRule = cssRule(".photo-dialog[open]");

  assert.match(closedDialogRule, /display:\s*none;/);
  assert.match(openDialogRule, /display:\s*flex;/);
  assert.match(openDialogRule, /flex-direction:\s*column;/);
  assert.doesNotMatch(cssRule(".photo-dialog"), /display:\s*flex;/);
});

test("admin photo dialog is capped at 90 percent viewport height", () => {
  const dialogRule = cssRule(".photo-dialog");
  const openDialogRule = cssRule(".photo-dialog[open]");
  const adminDialogRule = cssRule("#adminPhotoDialog");
  const viewportRule = cssRule(".photo-viewport");
  const adminViewportRule = cssRule("#adminPhotoDialog .photo-viewport");

  assert.match(openDialogRule, /display:\s*flex;/);
  assert.match(openDialogRule, /flex-direction:\s*column;/);
  assert.match(dialogRule, /max-height:\s*calc\(100dvh - 24px\);/);
  assert.match(adminDialogRule, /height:\s*90dvh;/);
  assert.match(adminDialogRule, /max-height:\s*90dvh;/);
  assert.match(viewportRule, /flex:\s*1 1 auto;/);
  assert.match(viewportRule, /min-height:\s*0;/);
  assert.match(adminViewportRule, /height:\s*auto;/);
});

test("admin photo close button uses native dialog close form", () => {
  const dialogStart = adminHtml.indexOf('<dialog id="adminPhotoDialog"');
  const dialogEnd = adminHtml.indexOf("</dialog>", dialogStart);
  const dialog = adminHtml.slice(dialogStart, dialogEnd);
  const formStart = dialog.indexOf('<form class="dialog-close-form" method="dialog">');
  const closeStart = dialog.indexOf('id="closeAdminPhoto"', formStart);
  const formEnd = dialog.indexOf("</form>", formStart);

  assert.ok(formStart >= 0);
  assert.ok(closeStart > formStart);
  assert.ok(closeStart < formEnd);
  assert.match(dialog.slice(closeStart, formEnd), /type="submit"/);
});

function assertHeaderLayout(html, dialogId, titleId, closeId) {
  const header = dialogHeader(html, dialogId);

  assert.ok(header.indexOf(`id="${titleId}"`) < header.indexOf('class="photo-tools"'));
  assert.ok(header.indexOf('class="photo-tools"') < header.indexOf(`id="${closeId}"`));
  assert.ok(header.indexOf("RotateLeft") < header.indexOf("RotateRight"));
  assert.equal(header.indexOf("ZoomOut"), -1);
  assert.equal(header.indexOf("ZoomIn"), -1);
  assert.equal(header.indexOf("ZoomReset"), -1);
}

function dialogHeader(html, dialogId) {
  const dialogStart = html.indexOf(`<dialog id="${dialogId}"`);
  const dialogEnd = html.indexOf("</dialog>", dialogStart);
  const dialog = html.slice(dialogStart, dialogEnd);
  const headerStart = dialog.indexOf('class="dialog-header"');
  const headerEnd = dialog.indexOf('<div id=', headerStart);
  const header = dialog.slice(headerStart, headerEnd);

  assert.ok(dialogStart >= 0);
  assert.ok(dialogEnd > dialogStart);
  assert.ok(headerStart >= 0);
  return header;
}

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+");
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, "s"));
  assert.ok(match, `Missing CSS rule for ${selector}`);
  return match.groups.body;
}
