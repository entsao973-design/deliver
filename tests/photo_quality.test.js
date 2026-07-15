const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  analyzeRgba,
  loadEnabled,
  saveEnabled,
} = require("../static/photo-quality.js");

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}

function makeRgba(width, height, grayAt) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const gray = grayAt(x, y);
      rgba[offset] = gray;
      rgba[offset + 1] = gray;
      rgba[offset + 2] = gray;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

test("photo clarity preference defaults to disabled and is stored per user", () => {
  const storage = makeStorage();

  assert.equal(loadEnabled(storage, "alice"), false);
  saveEnabled(storage, "alice", true);
  assert.equal(loadEnabled(storage, "alice"), true);
  assert.equal(loadEnabled(storage, "bob"), false);
  saveEnabled(storage, "alice", false);
  assert.equal(loadEnabled(storage, "alice"), false);
});

test("photo clarity analysis flags a flat image as possibly blurry", () => {
  const width = 64;
  const height = 64;
  const result = analyzeRgba(makeRgba(width, height, () => 128), width, height);

  assert.equal(result.possibly_blurry, true);
  assert.equal(result.sharpness, 0);
});

test("photo clarity analysis accepts a sharp high-contrast pattern", () => {
  const width = 64;
  const height = 64;
  const rgba = makeRgba(width, height, (x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 255 : 0));
  const result = analyzeRgba(rgba, width, height);

  assert.equal(result.possibly_blurry, false);
  assert.ok(result.sharpness > 100);
  assert.ok(result.contrast > 50);
});
