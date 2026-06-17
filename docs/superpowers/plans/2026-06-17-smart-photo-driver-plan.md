# Smart Photo Driver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a driver-side smart photo button that matches the phone's current location to nearby undelivered GPS-enabled orders and starts the existing photo workflow.

**Architecture:** Keep smart matching in the browser so it can work from the currently loaded delivery list and preserve the existing offline photo queue. Add a focused helper file for distance and candidate logic, then wire it into `static/app.js` and the driver page UI.

**Tech Stack:** Plain JavaScript, HTML dialog, CSS, existing Python HTTP backend, existing Node tests, existing Python unittest suite.

---

### Task 1: Smart Photo Matching Helper

**Files:**
- Create: `static/smart-photo.js`
- Create: `tests/smart_photo.test.js`
- Modify: `static/index.html`

- [ ] **Step 1: Write failing Node tests**

Create `tests/smart_photo.test.js` to load `static/smart-photo.js` in a VM context and verify:

```js
test("distanceMeters returns nearby Taiwan distances", () => {
  const distance = SmartPhoto.distanceMeters(
    { latitude: 25.033964, longitude: 121.564468 },
    { latitude: 25.034, longitude: 121.565 },
  );
  assert.ok(distance > 40);
  assert.ok(distance < 70);
});
```

Also test:

```js
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
```

- [ ] **Step 2: Run failing tests**

Run: `node --test tests\smart_photo.test.js`

Expected: fail because `static/smart-photo.js` does not exist.

- [ ] **Step 3: Implement helper**

Create `static/smart-photo.js` with:

- `distanceMeters(from, to)` using the haversine formula.
- `nearbyDeliveries({ coords, deliveries, radiusMeters, maxAccuracyMeters })`.
- `formatDistance(meters)`.
- `outcomeForPosition({ coords, deliveries })`.
- Browser export: `window.SmartPhoto = {...}`.

- [ ] **Step 4: Verify helper tests**

Run: `node --test tests\smart_photo.test.js`

Expected: pass.

### Task 2: Driver UI Wiring

**Files:**
- Modify: `static/index.html`
- Modify: `static/app.js`
- Modify: `static/styles.css`
- Modify: `tests/entry_pages.test.js`

- [ ] **Step 1: Write failing markup/CSS tests**

Extend `tests/entry_pages.test.js` to assert:

- `#smartPhotoButton` exists.
- `#smartPhotoButton` appears before `#refreshButton`.
- `static/index.html` loads `/static/smart-photo.js` before `/static/app.js`.
- `static/styles.css` applies the same height rule to `#smartPhotoButton` and `#refreshButton`.

- [ ] **Step 2: Run failing tests**

Run: `node --test tests\entry_pages.test.js`

Expected: fail because the button and script are not present.

- [ ] **Step 3: Add UI shell**

In `static/index.html`:

- Add `<button id="smartPhotoButton" class="secondary-button" type="button">智慧拍照</button>` immediately before refresh.
- Add a compact `#smartPhotoDialog` for candidate selection.
- Add `<script src="/static/smart-photo.js"></script>` before `app.js`.

In `static/styles.css`:

- Apply the existing refresh height to both `#smartPhotoButton` and `#refreshButton`.
- Add compact dialog/list styles.

- [ ] **Step 4: Wire behavior**

In `static/app.js`:

- Add `smartPhotoButton`, `smartPhotoDialog`, `smartPhotoCandidates`, `smartPhotoNormal`, `smartPhotoAbnormal`, and close button references.
- Add `state.smartPhotoCandidates = []`.
- On button click, call geolocation.
- If geolocation fails or accuracy is poor, show the fallback message.
- If one match exists, show one confirmation row.
- If multiple matches exist, show sorted candidate rows.
- Candidate click calls `startCapture(candidate.delivery, selectedStatus)`.

- [ ] **Step 5: Verify driver page tests**

Run: `node --test tests\entry_pages.test.js tests\smart_photo.test.js`

Expected: pass.

### Task 3: Full Verification

**Files:**
- Modify: `artifacts/執行紀錄.md`

- [ ] **Step 1: Run all Python tests**

Run: `python -m unittest discover -s tests`

Expected: pass.

- [ ] **Step 2: Run all Node tests**

Run: `node --test tests\entry_pages.test.js tests\pwa_assets.test.js tests\admin_api_response.test.js tests\admin_filter_options.test.js tests\admin_photo_view.test.js tests\offline_upload_queue.test.js tests\photo_dialog_spacing.test.js tests\smart_photo.test.js`

Expected: pass.

- [ ] **Step 3: Run compile and diff checks**

Run:

```powershell
python -m compileall delivery_app
git diff --check
```

Expected: pass.

- [ ] **Step 4: Browser verification**

Open `http://localhost:8000/driver` and verify:

- `智慧拍照` appears left of `重新整理`.
- Buttons have matching height.
- Existing login and page load still work.

- [ ] **Step 5: Record work**

Append key actions and test results to `artifacts/執行紀錄.md`.
