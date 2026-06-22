# PWA Update Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Android PWA users less likely to stay on stale screens after deployments, while avoiding reloads that could interrupt pending offline photo uploads.

**Architecture:** Keep the service worker network-first behavior and add a small explicit app version file. Move update decisions into `static/pwa.js`: login screens may activate immediately, active work screens show an update banner, and pending photo uploads block reload until the queue clears.

**Tech Stack:** Plain JavaScript PWA service worker, Node `node:test`, Python static server.

---

### Task 1: PWA Version And Cache Coverage

**Files:**
- Create: `static/app-version.json`
- Modify: `static/service-worker.js`
- Modify: `tests/pwa_assets.test.js`

- [ ] **Step 1: Write failing tests**

Add assertions that `app-version.json` exists, the service worker cache name includes the same version, and the shell cache includes new driver modules plus the version file.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests\pwa_assets.test.js`

Expected: FAIL because `static/app-version.json` does not exist and the shell cache does not include the new files.

- [ ] **Step 3: Implement minimal version/cache changes**

Create `static/app-version.json`, update `CACHE_NAME`, and add `/static/app-version.json`, `/static/driver-api.js`, `/static/smart-photo.js`, and `/static/driver-smart-delivery.js` to `SHELL_ASSETS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests\pwa_assets.test.js`

Expected: PASS.

### Task 2: Explicit Update Prompt And Pending Upload Guard

**Files:**
- Modify: `static/pwa.js`
- Modify: `static/app.js`
- Modify: `static/styles.css`
- Modify: `tests/pwa_assets.test.js`
- Modify: `tests/entry_pages.test.js`

- [ ] **Step 1: Write failing tests**

Add tests for `pwa.js` helpers:

```js
assert.equal(DeliveryPwa.pendingUploadCount(storageWithTwoUploads), 2);
assert.equal(DeliveryPwa.shouldActivateImmediately({ isLoginVisible: true, pendingUploadCount: 0 }), true);
assert.equal(DeliveryPwa.shouldActivateImmediately({ isLoginVisible: false, pendingUploadCount: 0 }), false);
assert.match(DeliveryPwa.updateMessageForPendingCount(2), /待上傳照片 2 筆/);
```

Also assert `app.js` writes `delivery_pending_upload_count` when queue status updates.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests\pwa_assets.test.js tests\entry_pages.test.js`

Expected: FAIL because `pwa.js` does not export helpers and `app.js` does not write the pending count key.

- [ ] **Step 3: Implement minimal update UI**

Rewrite `pwa.js` as a small factory that exports `DeliveryPwa` in tests and initializes in browsers. Add a fixed update banner with an update button. The banner activates the waiting worker or reloads directly only when pending upload count is zero.

- [ ] **Step 4: Track pending upload count**

Update `app.js` inside `updateQueueStatus()` to write `delivery_pending_upload_count` to `localStorage`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests\pwa_assets.test.js tests\entry_pages.test.js`

Expected: PASS.

### Task 3: Full Verification And Notes

**Files:**
- Modify: `artifacts/執行紀錄.md`

- [ ] **Step 1: Run full automated verification**

Run:

```powershell
$testFiles = Get-ChildItem -Path tests -Filter *.test.js | ForEach-Object { $_.FullName }; node --test $testFiles
python -m unittest discover -s tests
python -m compileall delivery_app server.py
git diff --check
```

Expected: all pass; only Git line-ending warnings are acceptable.

- [ ] **Step 2: Record implementation details**

Append the changed files, red/green test results, and manual verification checklist to `artifacts/執行紀錄.md`.
