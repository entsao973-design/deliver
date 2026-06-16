const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  showAllPhotosButtonText,
  shouldRenderInlinePhoto,
} = require("../static/admin-photo-view.js");

test("showAllPhotosButtonText toggles admin button label", () => {
  assert.equal(showAllPhotosButtonText(false), "檢視所有照片");
  assert.equal(showAllPhotosButtonText(true), "關閉檢視照片");
});

test("shouldRenderInlinePhoto only shows delivered photos on the main delivery list", () => {
  assert.equal(shouldRenderInlinePhoto({ has_photo: true, status: "normal" }, false, true), true);
  assert.equal(shouldRenderInlinePhoto({ has_photo: true, status: "abnormal" }, false, true), true);
  assert.equal(shouldRenderInlinePhoto({ has_photo: false, status: "normal" }, false, true), false);
  assert.equal(shouldRenderInlinePhoto({ has_photo: true, status: "normal" }, true, true), false);
  assert.equal(shouldRenderInlinePhoto({ has_photo: true, status: "normal" }, false, false), false);
});

test("toggleAllPhotos button is in admin tabs between upload and archive", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "static", "admin.html"), "utf8");
  const navStart = html.indexOf('<nav class="admin-tabs"');
  const navEnd = html.indexOf("</nav>", navStart);
  const uploadIndex = html.indexOf('data-view="upload"', navStart);
  const toggleIndex = html.indexOf('id="toggleAllPhotos"', navStart);
  const archiveIndex = html.indexOf('data-view="archive"', navStart);

  assert.ok(navStart >= 0);
  assert.ok(navEnd > navStart);
  assert.ok(uploadIndex > navStart && uploadIndex < toggleIndex);
  assert.ok(toggleIndex < archiveIndex && archiveIndex < navEnd);
});
