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

  function visibleDeliveries(deliveries, hideDelivered) {
    return hideDelivered ? deliveries.filter((delivery) => !delivery.status) : deliveries;
  }

  function visibleDeliveryIds(deliveries, hideDelivered) {
    return visibleDeliveries(deliveries, hideDelivered)
      .map((delivery) => delivery.id)
      .filter(Boolean);
  }

  function sortDeliveries(deliveries, primarySort) {
    const primarySorts = ["customer", "company", "driver", "status"];
    if (!primarySorts.includes(primarySort)) {
      return deliveries;
    }

    const sortKeys = [primarySort, ...["status", "company", "customer"].filter((key) => key !== primarySort)];
    return [...deliveries].sort((left, right) => {
      for (const key of sortKeys) {
        const comparison = compareDeliveryField(left, right, key);
        if (comparison !== 0) {
          return comparison;
        }
      }
      return 0;
    });
  }

  function compareDeliveryField(left, right, key) {
    if (key === "status") {
      const rankDifference = deliveryStatusRank(left.status) - deliveryStatusRank(right.status);
      if (rankDifference !== 0) {
        return rankDifference;
      }
    }
    return String(left[key] || "").localeCompare(String(right[key] || ""), "zh-Hant", {
      numeric: true,
      sensitivity: "base",
    });
  }

  function deliveryStatusRank(status) {
    if (!status) return 0;
    if (status === "abnormal") return 1;
    if (status === "normal") return 2;
    return 3;
  }

  return {
    buildAdminOptionsPath,
    preservedSelectValue,
    sortDeliveries,
    visibleDeliveries,
    visibleDeliveryIds,
  };
});
