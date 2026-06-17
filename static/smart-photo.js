(function () {
  const DEFAULT_RADIUS_METERS = 300;
  const DEFAULT_MAX_ACCURACY_METERS = 300;

  function distanceMeters(from, to) {
    const earthRadius = 6371000;
    const fromLat = toRadians(Number(from.latitude));
    const toLat = toRadians(Number(to.latitude));
    const deltaLat = toRadians(Number(to.latitude) - Number(from.latitude));
    const deltaLng = toRadians(Number(to.longitude) - Number(from.longitude));
    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function nearbyDeliveries({ coords, deliveries, radiusMeters = DEFAULT_RADIUS_METERS, maxAccuracyMeters = DEFAULT_MAX_ACCURACY_METERS }) {
    if (!coords || !isFiniteNumber(coords.latitude) || !isFiniteNumber(coords.longitude)) {
      throw new Error("location_unavailable");
    }
    if (isFiniteNumber(coords.accuracy) && Number(coords.accuracy) > maxAccuracyMeters) {
      throw new Error("low_accuracy");
    }

    return (deliveries || [])
      .filter(isEligibleDelivery)
      .map((delivery) => ({
        delivery,
        distance: distanceMeters(
          { latitude: coords.latitude, longitude: coords.longitude },
          { latitude: delivery.geocode_lat, longitude: delivery.geocode_lng },
        ),
      }))
      .filter((item) => item.distance <= radiusMeters)
      .sort((left, right) => left.distance - right.distance);
  }

  function outcomeForPosition(options) {
    const candidates = nearbyDeliveries(options);
    if (candidates.length === 0) {
      return { type: "none", candidates };
    }
    if (candidates.length === 1) {
      return { type: "single", candidates };
    }
    return { type: "multiple", candidates };
  }

  function formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  }

  function isEligibleDelivery(delivery) {
    return (
      delivery &&
      !delivery.status &&
      delivery.geocode_status === "success" &&
      isFiniteNumber(delivery.geocode_lat) &&
      isFiniteNumber(delivery.geocode_lng)
    );
  }

  function isFiniteNumber(value) {
    return Number.isFinite(Number(value));
  }

  function toRadians(value) {
    return (value * Math.PI) / 180;
  }

  window.SmartPhoto = {
    DEFAULT_MAX_ACCURACY_METERS,
    DEFAULT_RADIUS_METERS,
    distanceMeters,
    formatDistance,
    nearbyDeliveries,
    outcomeForPosition,
  };
})();
