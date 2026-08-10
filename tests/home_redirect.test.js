const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "static", "home-redirect.js"), "utf8");

function loadHomeRedirect(overrides = {}) {
  const context = {
    document: overrides.document,
    navigator: overrides.navigator || {},
    screen: overrides.screen || {},
    location: overrides.location || { pathname: "/", replace() {} },
    window: {},
  };
  context.window.document = context.document;
  context.window.navigator = context.navigator;
  context.window.screen = context.screen;
  context.window.location = context.location;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.HomeRedirect;
}

test("home redirect classifies phones and tablets as driver devices", () => {
  const redirect = loadHomeRedirect();

  assert.equal(redirect.entryPathForDevice({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
    maxTouchPoints: 5,
    viewportWidth: 390,
  }), "/driver");
  assert.equal(redirect.entryPathForDevice({
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
    maxTouchPoints: 5,
    viewportWidth: 412,
  }), "/driver");
  assert.equal(redirect.entryPathForDevice({
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
    maxTouchPoints: 5,
    viewportWidth: 820,
  }), "/driver");
  assert.equal(redirect.entryPathForDevice({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    maxTouchPoints: 5,
    viewportWidth: 834,
  }), "/driver");
});

test("home redirect classifies desktop as admin device", () => {
  const redirect = loadHomeRedirect();

  assert.equal(redirect.entryPathForDevice({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    maxTouchPoints: 0,
    viewportWidth: 1366,
  }), "/admin");
});

test("home redirect marks only an installed iOS PWA for isolated viewport styling", () => {
  function classRecorder() {
    const classes = new Set();
    return {
      classes,
      document: {
        documentElement: {
          classList: {
            toggle(name, enabled) {
              if (enabled) {
                classes.add(name);
              } else {
                classes.delete(name);
              }
            },
          },
        },
      },
    };
  }

  const installed = classRecorder();
  const installedRedirect = loadHomeRedirect({
    document: installed.document,
    navigator: { standalone: true },
  });
  assert.equal(installedRedirect.applyIosStandaloneClass(), true);
  assert.equal(installed.classes.has("ios-standalone"), true);

  const browser = classRecorder();
  const browserRedirect = loadHomeRedirect({
    document: browser.document,
    navigator: { standalone: false },
  });
  assert.equal(browserRedirect.applyIosStandaloneClass(), false);
  assert.equal(browser.classes.has("ios-standalone"), false);

  const android = classRecorder();
  const androidRedirect = loadHomeRedirect({
    document: android.document,
    navigator: {
      userAgent: "Mozilla/5.0 (Linux; Android 16; Pixel 10)",
    },
  });
  assert.equal(androidRedirect.applyIosStandaloneClass(), false);
  assert.equal(android.classes.has("ios-standalone"), false);
});

test("home redirect only redirects the root path", () => {
  const calls = [];
  const redirect = loadHomeRedirect({
    location: {
      pathname: "/",
      replace: (target) => calls.push(target),
    },
    navigator: {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      maxTouchPoints: 0,
    },
    screen: { width: 1366 },
  });

  redirect.redirectHomeByDevice();
  assert.deepEqual(calls, ["/admin"]);

  calls.length = 0;
  redirect.redirectHomeByDevice({
    location: {
      pathname: "/driver",
      replace: (target) => calls.push(target),
    },
    navigator: {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      maxTouchPoints: 0,
    },
    screen: { width: 1366 },
  });
  assert.deepEqual(calls, []);
});
