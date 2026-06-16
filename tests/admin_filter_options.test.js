const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAdminOptionsPath,
  preservedSelectValue,
} = require("../static/admin-filter-options.js");

test("buildAdminOptionsPath includes date range and deleted state", () => {
  assert.equal(
    buildAdminOptionsPath("tok en", {
      deleted: true,
      startDate: "2026-06-11",
      endDate: "2026-06-13",
    }),
    "/api/admin/options?token=tok+en&deleted=1&start_date=2026-06-11&end_date=2026-06-13",
  );
});

test("preservedSelectValue keeps only values that still exist in options", () => {
  assert.equal(preservedSelectValue("RangeCo", ["RangeCo", "OtherCo"]), "RangeCo");
  assert.equal(preservedSelectValue("OldCo", ["RangeCo", "OtherCo"]), "");
  assert.equal(preservedSelectValue("", ["RangeCo"]), "");
});
