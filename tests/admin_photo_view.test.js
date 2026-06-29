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

test("toggleAllPhotos button is in delivery filters before bulk delete only", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "static", "admin.html"), "utf8");
  const navStart = html.indexOf('<nav class="admin-tabs"');
  const navEnd = html.indexOf("</nav>", navStart);
  const navToggleIndex = html.indexOf('id="toggleAllPhotos"', navStart);
  const deliveriesStart = html.indexOf('<section id="deliveriesView"');
  const deletedStart = html.indexOf('<section id="deletedView"');
  const deliveryFilterStart = html.indexOf('<div class="filter-grid delivery-filter-grid">', deliveriesStart);
  const countsIndex = html.indexOf('id="adminDeliveryCounts"', deliveryFilterStart);
  const toggleIndex = html.indexOf('id="toggleAllPhotos"', deliveryFilterStart);
  const bulkDeleteIndex = html.indexOf('id="bulkDeleteFiltered"', deliveryFilterStart);
  const deletedToggleIndex = html.indexOf('id="toggleAllPhotos"', deletedStart);

  assert.ok(navStart >= 0);
  assert.ok(navEnd > navStart);
  assert.ok(navToggleIndex === -1 || navToggleIndex > navEnd);
  assert.ok(deliveriesStart >= 0);
  assert.ok(deletedStart > deliveriesStart);
  assert.ok(deliveryFilterStart > deliveriesStart && deliveryFilterStart < deletedStart);
  assert.ok(countsIndex < toggleIndex);
  assert.ok(toggleIndex < bulkDeleteIndex);
  assert.ok(deletedToggleIndex === -1);
});
