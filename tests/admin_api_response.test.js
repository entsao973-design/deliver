const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const AdminApi = require("../static/admin-api.js");

function makeResponse({ ok = true, status = 200, body = "{}" } = {}) {
  return {
    ok,
    status,
    text: async () => body,
  };
}

test("request reports a clear Chinese message when server returns HTML", async () => {
  await assert.rejects(
    AdminApi.request("/api/admin/import", {}, async () => makeResponse({
      ok: false,
      status: 500,
      body: '<!DOCTYPE html><html><body>Server error</body></html>',
    })),
    {
      message: "伺服器回傳非預期頁面，請重新整理或重新登入後再試",
      status: 500,
    },
  );
});

test("request reports oversized Excel uploads without exposing JSON parse errors", async () => {
  await assert.rejects(
    AdminApi.request("/api/admin/import", {}, async () => makeResponse({
      ok: false,
      status: 413,
      body: '<!DOCTYPE html><html><body>Payload too large</body></html>',
    })),
    {
      message: "Excel 檔案太大，上傳失敗，請縮小檔案後再試",
      status: 413,
    },
  );
});

test("request preserves backend JSON error messages", async () => {
  await assert.rejects(
    AdminApi.request("/api/admin/import", {}, async () => makeResponse({
      ok: false,
      status: 400,
      body: JSON.stringify({ error: "只能上傳 Excel 檔案" }),
    })),
    {
      message: "只能上傳 Excel 檔案",
      status: 400,
    },
  );
});

test("request reports network failures in Chinese", async () => {
  await assert.rejects(
    AdminApi.request("/api/admin/import", {}, async () => {
      throw new TypeError("Failed to fetch");
    }),
    {
      message: "網路中斷或服務未啟動，請確認服務後再試",
    },
  );
});

test("admin page loads AdminApi before admin.js", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "static", "admin.html"), "utf8");
  const apiIndex = html.indexOf('/static/admin-api.js');
  const adminIndex = html.indexOf('/static/admin.js');

  assert.ok(apiIndex >= 0);
  assert.ok(adminIndex > apiIndex);
});
