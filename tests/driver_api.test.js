const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "static", "driver-api.js"), "utf8");

function loadApi(fetchImpl) {
  const context = {
    fetch: fetchImpl,
    window: {},
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.DriverApi;
}

test("DriverApi.request sends JSON bodies and parses JSON responses", async () => {
  const calls = [];
  const api = loadApi(async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ ok: true }),
    };
  });

  const result = await api.request("/api/example", {
    method: "POST",
    body: { token: "abc" },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls[0].url, "/api/example");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Content-Type"], "application/json");
  assert.equal(calls[0].options.body, JSON.stringify({ token: "abc" }));
});

test("DriverApi.request throws backend JSON error messages with status", async () => {
  const api = loadApi(async () => ({
    ok: false,
    status: 418,
    json: async () => ({ error: "登入失敗" }),
  }));

  await assert.rejects(
    () => api.request("/api/fail"),
    (error) => error.message === "登入失敗" && error.status === 418,
  );
});
