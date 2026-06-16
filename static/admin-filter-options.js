(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.AdminFilterOptions = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function buildAdminOptionsPath(token, filters) {
    const params = new URLSearchParams({
      token,
      deleted: filters.deleted ? "1" : "0",
    });
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
    return `/api/admin/options?${params}`;
  }

  function preservedSelectValue(currentValue, values) {
    return values.includes(currentValue) ? currentValue : "";
  }

  return {
    buildAdminOptionsPath,
    preservedSelectValue,
  };
});
