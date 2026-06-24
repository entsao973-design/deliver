const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadPhotoViewer() {
  const source = fs.readFileSync(path.join(__dirname, "..", "static", "photo-viewer.js"), "utf8");
  const rafCallbacks = [];
  const sandbox = {
    window: {
      addEventListener() {},
    },
    performance: {
      now: () => 0,
    },
    requestAnimationFrame(callback) {
      rafCallbacks.push(callback);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${source}\nthis.createPhotoViewer = createPhotoViewer;`, sandbox);
  return { createPhotoViewer: sandbox.createPhotoViewer, rafCallbacks };
}

function makeClassList() {
  const values = new Set();
  return {
    add(name) {
      values.add(name);
    },
    remove(...names) {
      for (const name of names) {
        values.delete(name);
      }
    },
    toggle(name, enabled) {
      if (enabled) {
        values.add(name);
      } else {
        values.delete(name);
      }
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function makeElement(props = {}) {
  const listeners = {};
  return {
    style: {},
    classList: makeClassList(),
    listeners,
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    setPointerCapture() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: props.clientWidth || 0, height: props.clientHeight || 0 };
    },
    ...props,
  };
}

function makePointerEvent(props = {}) {
  return {
    pointerId: 1,
    pointerType: "touch",
    clientX: 0,
    clientY: 0,
    preventDefault() {},
    ...props,
  };
}

function makeTouchEvent(y, props = {}) {
  return {
    touches: [{ clientX: 20, clientY: y }],
    preventDefault() {},
    ...props,
  };
}

test("photo viewer initializes already-loaded cached images", () => {
  const { createPhotoViewer, rafCallbacks } = loadPhotoViewer();
  const viewport = makeElement({ clientWidth: 300, clientHeight: 200 });
  const image = makeElement({
    complete: true,
    naturalWidth: 1200,
    naturalHeight: 800,
    offsetWidth: 300,
    offsetHeight: 200,
  });

  createPhotoViewer({ viewport, image, useWindowResize: false });

  assert.equal(rafCallbacks.length, 1);
  rafCallbacks[0]();
  assert.equal(image.style.width, "300px");
  assert.equal(image.style.height, "200px");
  assert.ok(image.classList.contains("viewer-ready"));
});

test("photo viewer schedules another reset after image decode", async () => {
  const { createPhotoViewer, rafCallbacks } = loadPhotoViewer();
  let resolveDecode;
  const viewport = makeElement({ clientWidth: 300, clientHeight: 200 });
  const image = makeElement({
    complete: true,
    naturalWidth: 1200,
    naturalHeight: 800,
    offsetWidth: 300,
    offsetHeight: 200,
    decode() {
      return new Promise((resolve) => {
        resolveDecode = resolve;
      });
    },
  });

  createPhotoViewer({ viewport, image, useWindowResize: false });

  assert.equal(rafCallbacks.length, 1);
  assert.equal(typeof resolveDecode, "function");
  resolveDecode();
  await Promise.resolve();
  assert.equal(rafCallbacks.length, 2);
});

test("photo viewer disables native image dragging so zoomed photos can pan", () => {
  const { createPhotoViewer } = loadPhotoViewer();
  const viewport = makeElement({ clientWidth: 300, clientHeight: 200 });
  const image = makeElement({
    draggable: true,
    naturalWidth: 1200,
    naturalHeight: 800,
  });

  createPhotoViewer({ viewport, image, useWindowResize: false });

  assert.equal(image.draggable, false);
});

test("photo viewer does not capture unzoomed single-touch drags", () => {
  const { createPhotoViewer } = loadPhotoViewer();
  let captureCount = 0;
  const viewport = makeElement({
    clientWidth: 300,
    clientHeight: 200,
    setPointerCapture() {
      captureCount += 1;
    },
  });
  const image = makeElement({ naturalWidth: 1200, naturalHeight: 800 });

  createPhotoViewer({ viewport, image, useWindowResize: false });
  viewport.listeners.pointerdown(makePointerEvent({ pointerId: 7, clientY: 20 }));

  assert.equal(captureCount, 0);
  assert.equal(viewport.classList.contains("is-gesturing"), false);
});

test("photo viewer forwards unzoomed single-touch movement to scroll target", () => {
  const { createPhotoViewer } = loadPhotoViewer();
  const scrolls = [];
  let preventDefaultCount = 0;
  const viewport = makeElement({ clientWidth: 300, clientHeight: 200 });
  const image = makeElement({ naturalWidth: 1200, naturalHeight: 800 });
  const scrollTarget = {
    scrollBy(delta) {
      scrolls.push(delta);
    },
  };

  createPhotoViewer({
    viewport,
    image,
    useWindowResize: false,
    touchScrollTarget: () => scrollTarget,
  });
  viewport.listeners.touchstart(makeTouchEvent(120));
  viewport.listeners.touchmove(makeTouchEvent(82, {
    preventDefault() {
      preventDefaultCount += 1;
    },
  }));

  assert.equal(scrolls.length, 1);
  assert.equal(scrolls[0].left, 0);
  assert.equal(scrolls[0].top, 38);
  assert.equal(preventDefaultCount, 1);
  assert.equal(viewport.classList.contains("is-gesturing"), false);
});
