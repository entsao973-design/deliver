const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  downloadInBatches,
  fetchAndSaveFile,
} = require("../static/admin-archive-download.js");

const staticRoot = path.join(__dirname, "..", "static");

test("admin bulk archive download loads and uses the batch helper", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");
  const workerJs = fs.readFileSync(path.join(staticRoot, "service-worker.js"), "utf8");
  const helperIndex = html.indexOf('/static/admin-archive-download.js');
  const adminIndex = html.indexOf('/static/admin.js');

  assert.ok(helperIndex >= 0);
  assert.ok(adminIndex > helperIndex);
  assert.match(workerJs, /"\/static\/admin-archive-download\.js"/);
  assert.match(adminJs, /async function downloadSelectedArchives\(\)/);
  assert.match(adminJs, /AdminArchiveDownload\.downloadInBatches\(/);
  assert.match(adminJs, /AdminArchiveDownload\.fetchAndSaveFile\(/);
  assert.match(adminJs, /下載中 \$\{completed\}\/\$\{total\}/);
});

test("archive file is fully fetched before its browser download is triggered", async () => {
  const events = [];
  const blob = { size: 128 };
  const link = {
    click() {
      events.push("click");
    },
    remove() {
      events.push("remove");
    },
  };
  const documentRef = {
    body: {
      append(value) {
        assert.equal(value, link);
        events.push("append");
      },
    },
    createElement(tagName) {
      assert.equal(tagName, "a");
      return link;
    },
  };
  const urlApi = {
    createObjectURL(value) {
      assert.equal(value, blob);
      events.push("create-url");
      return "blob:archive";
    },
    revokeObjectURL(value) {
      assert.equal(value, "blob:archive");
      events.push("revoke-url");
    },
  };

  await fetchAndSaveFile("test.zip", "/archive/test.zip", {
    documentRef,
    urlApi,
    fetchImpl: async (url, options) => {
      assert.equal(url, "/archive/test.zip");
      assert.deepEqual(options, { cache: "no-store", credentials: "same-origin" });
      events.push("fetch");
      return {
        ok: true,
        status: 200,
        blob: async () => {
          events.push("blob");
          return blob;
        },
      };
    },
    schedule: (callback, milliseconds) => {
      assert.equal(milliseconds, 1000);
      events.push("schedule-revoke");
      callback();
    },
  });

  assert.equal(link.href, "blob:archive");
  assert.equal(link.download, "test.zip");
  assert.deepEqual(events, [
    "fetch",
    "blob",
    "create-url",
    "append",
    "click",
    "remove",
    "schedule-revoke",
    "revoke-url",
  ]);
});

test("archive file download rejects an unsuccessful server response", async () => {
  let createdLink = false;

  await assert.rejects(
    fetchAndSaveFile("missing.zip", "/archive/missing.zip", {
      fetchImpl: async () => ({
        ok: false,
        status: 404,
        blob: async () => ({ size: 0 }),
      }),
      documentRef: {
        createElement() {
          createdLink = true;
          return {};
        },
      },
      urlApi: {},
    }),
    { message: "missing.zip 下載失敗（HTTP 404）" },
  );

  assert.equal(createdLink, false);
});

test("archive downloads process more than ten files sequentially in batches of eight", async () => {
  const names = Array.from({ length: 18 }, (_, index) => `archive-${index + 1}.zip`);
  const downloaded = [];
  const waits = [];
  const progress = [];
  let activeDownloads = 0;
  let maxActiveDownloads = 0;

  const result = await downloadInBatches(names, async (name) => {
    activeDownloads += 1;
    maxActiveDownloads = Math.max(maxActiveDownloads, activeDownloads);
    await Promise.resolve();
    downloaded.push(name);
    activeDownloads -= 1;
  }, {
    batchSize: 8,
    batchDelayMs: 1000,
    wait: async (milliseconds) => waits.push(milliseconds),
    onProgress: (state) => progress.push({ ...state }),
  });

  assert.deepEqual(downloaded, names);
  assert.equal(maxActiveDownloads, 1);
  assert.deepEqual(waits, [1000, 1000]);
  assert.deepEqual(progress.at(-1), {
    completed: 18,
    total: 18,
    successCount: 18,
    failureCount: 0,
  });
  assert.deepEqual(result, {
    total: 18,
    successCount: 18,
    failures: [],
  });
});

test("archive download batches continue after a file fails and report that file", async () => {
  const attempted = [];

  const result = await downloadInBatches([
    "first.zip",
    "broken.zip",
    "last.zip",
  ], async (name) => {
    attempted.push(name);
    if (name === "broken.zip") {
      throw new Error("HTTP 500");
    }
  }, {
    batchSize: 8,
    wait: async () => {},
  });

  assert.deepEqual(attempted, ["first.zip", "broken.zip", "last.zip"]);
  assert.equal(result.total, 3);
  assert.equal(result.successCount, 2);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].name, "broken.zip");
  assert.equal(result.failures[0].error.message, "HTTP 500");
});
