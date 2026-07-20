const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAdminOptionsPath,
  nextDeliverySort,
  sortDeliveries,
  visibleDeliveries,
  visibleDeliveryIds,
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

test("visibleDeliveries hides delivered records only when requested", () => {
  const deliveries = [
    { id: "pending", status: "" },
    { id: "normal", status: "normal" },
    { id: "abnormal", status: "abnormal" },
  ];

  assert.deepEqual(visibleDeliveries(deliveries, false), deliveries);
  assert.deepEqual(visibleDeliveries(deliveries, true), [deliveries[0]]);
});

test("visibleDeliveryIds follows the hide-delivered filter for bulk actions", () => {
  const deliveries = [
    { id: "pending", status: null },
    { id: "normal", status: "normal" },
    { id: "", status: null },
  ];

  assert.deepEqual(visibleDeliveryIds(deliveries, false), ["pending", "normal"]);
  assert.deepEqual(visibleDeliveryIds(deliveries, true), ["pending"]);
});

test("sortDeliveries keeps the original order until a primary sort is selected", () => {
  const deliveries = [{ id: "second" }, { id: "first" }];

  assert.deepEqual(sortDeliveries(deliveries, "", "asc"), deliveries);
  assert.deepEqual(deliveries.map((delivery) => delivery.id), ["second", "first"]);
});

test("sortDeliveries applies the selected primary field before fixed secondary fields", () => {
  const deliveries = [
    { id: "beta-normal", customer: "Beta", company: "A", driver: "Z", status: "normal" },
    { id: "beta-pending", customer: "Beta", company: "B", driver: "A", status: "" },
    { id: "beta-abnormal", customer: "Beta", company: "A", driver: "M", status: "abnormal" },
    { id: "alpha-normal", customer: "Alpha", company: "Z", driver: "Y", status: "normal" },
  ];

  assert.deepEqual(
    sortDeliveries(deliveries, "customer", "asc").map((delivery) => delivery.id),
    ["alpha-normal", "beta-pending", "beta-abnormal", "beta-normal"],
  );
  assert.deepEqual(
    sortDeliveries(deliveries, "company", "asc").map((delivery) => delivery.id),
    ["beta-abnormal", "beta-normal", "beta-pending", "alpha-normal"],
  );
  assert.deepEqual(
    sortDeliveries(deliveries, "driver", "asc").map((delivery) => delivery.id),
    ["beta-pending", "beta-abnormal", "alpha-normal", "beta-normal"],
  );
  assert.deepEqual(
    sortDeliveries(deliveries, "status", "asc").map((delivery) => delivery.id),
    ["beta-pending", "beta-abnormal", "beta-normal", "alpha-normal"],
  );
  assert.deepEqual(deliveries.map((delivery) => delivery.id), [
    "beta-normal",
    "beta-pending",
    "beta-abnormal",
    "alpha-normal",
  ]);
});

test("sortDeliveries reverses only the primary field for descending order", () => {
  const deliveries = [
    { id: "beta-normal", customer: "Beta", company: "A", status: "normal" },
    { id: "beta-pending", customer: "Beta", company: "B", status: "" },
    { id: "beta-abnormal", customer: "Beta", company: "A", status: "abnormal" },
    { id: "alpha-normal", customer: "Alpha", company: "Z", status: "normal" },
  ];

  assert.deepEqual(
    sortDeliveries(deliveries, "customer", "desc").map((delivery) => delivery.id),
    ["beta-pending", "beta-abnormal", "beta-normal", "alpha-normal"],
  );
  assert.deepEqual(
    sortDeliveries(deliveries, "status", "desc").map((delivery) => delivery.id),
    ["beta-normal", "alpha-normal", "beta-abnormal", "beta-pending"],
  );
});

test("nextDeliverySort toggles the same button and resets a different button to ascending", () => {
  assert.deepEqual(nextDeliverySort("", "asc", "customer"), { key: "customer", direction: "asc" });
  assert.deepEqual(nextDeliverySort("customer", "asc", "customer"), { key: "customer", direction: "desc" });
  assert.deepEqual(nextDeliverySort("customer", "desc", "customer"), { key: "customer", direction: "asc" });
  assert.deepEqual(nextDeliverySort("customer", "desc", "company"), { key: "company", direction: "asc" });
});
