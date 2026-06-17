const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "static", "smart-photo.js"), "utf8");
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const SmartPhoto = context.window.SmartPhoto;

test("distanceMeters returns nearby Taiwan distances", () => {
  const distance = SmartPhoto.distanceMeters(
    { latitude: 25.033964, longitude: 121.564468 },
    { latitude: 25.034, longitude: 121.565 },
  );

  assert.ok(distance > 40);
  assert.ok(distance < 70);
});

test("nearbyDeliveries keeps only undelivered GPS success records within range", () => {
  const matches = SmartPhoto.nearbyDeliveries({
    coords: { latitude: 25.033964, longitude: 121.564468, accuracy: 20 },
    deliveries: [
      { id: "near", status: null, geocode_status: "success", geocode_lat: 25.034, geocode_lng: 121.565 },
      { id: "done", status: "normal", geocode_status: "success", geocode_lat: 25.034, geocode_lng: 121.565 },
      { id: "nogps", status: null, geocode_status: "pending" },
      { id: "far", status: null, geocode_status: "success", geocode_lat: 24.1, geocode_lng: 121.5 },
    ],
    radiusMeters: 300,
    maxAccuracyMeters: 300,
  });

  assert.deepEqual(matches.map((item) => item.delivery.id), ["near"]);
});

test("nearbyDeliveries rejects low accuracy location", () => {
  assert.throws(
    () =>
      SmartPhoto.nearbyDeliveries({
        coords: { latitude: 25.033964, longitude: 121.564468, accuracy: 500 },
        deliveries: [],
        radiusMeters: 300,
        maxAccuracyMeters: 300,
      }),
    /low_accuracy/,
  );
});

test("outcomeForPosition reports no candidates and multiple candidates", () => {
  const none = SmartPhoto.outcomeForPosition({
    coords: { latitude: 25.033964, longitude: 121.564468, accuracy: 20 },
    deliveries: [{ id: "far", status: null, geocode_status: "success", geocode_lat: 24.1, geocode_lng: 121.5 }],
  });
  assert.equal(none.type, "none");

  const multiple = SmartPhoto.outcomeForPosition({
    coords: { latitude: 25.033964, longitude: 121.564468, accuracy: 20 },
    deliveries: [
      { id: "b", status: null, geocode_status: "success", geocode_lat: 25.0345, geocode_lng: 121.565 },
      { id: "a", status: null, geocode_status: "success", geocode_lat: 25.034, geocode_lng: 121.565 },
    ],
  });

  assert.equal(multiple.type, "multiple");
  assert.deepEqual(multiple.candidates.map((item) => item.delivery.id), ["a", "b"]);
});

test("formatDistance formats meters and kilometers", () => {
  assert.equal(SmartPhoto.formatDistance(42), "42m");
  assert.equal(SmartPhoto.formatDistance(1250), "1.3km");
});
