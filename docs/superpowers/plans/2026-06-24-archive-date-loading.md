# Archive Date Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load existing archive ZIP files automatically whenever an administrator changes the archive date.

**Architecture:** Add a shared filesystem query helper used by both repository backends, expose it through an authenticated admin GET endpoint, and call that endpoint from the existing archive view. Guard frontend state with a request sequence so only the latest selected date can render.

**Tech Stack:** Python standard library HTTP server and pathlib, vanilla JavaScript, Node test runner, Python unittest.

---

### Task 1: Archive filesystem query

**Files:**
- Modify: `delivery_app/repository.py`
- Modify: `delivery_app/sqlserver_store.py`
- Test: `tests/test_excel_importer.py`

- [x] Add a failing repository test that creates ZIP files for two dates plus a non-ZIP file and expects only the selected date's ZIP metadata.
- [x] Run `python -m unittest tests.test_excel_importer.ImporterRulesTest.test_list_archives_returns_existing_zips_for_selected_date` and confirm it fails because `list_archives` does not exist.
- [x] Add `list_archive_files(archive_root, delivery_date)` and delegate `list_archives()` to it from both repository classes.
- [x] Re-run the targeted test and confirm it passes.

### Task 2: Authenticated archive list API

**Files:**
- Modify: `delivery_app/web.py`
- Test: `tests/test_web_error_handling.py`

- [x] Add a failing HTTP test for `GET /api/admin/archives?token=admin-token&delivery_date=2026-06-11`.
- [x] Run the targeted unittest and confirm the endpoint returns 404 before implementation.
- [x] Route the GET endpoint through admin authentication and return `{"archives": repo.list_archives(delivery_date)}`.
- [x] Re-run the targeted test and confirm it passes.

### Task 3: Date-change loading

**Files:**
- Modify: `static/admin.js`
- Test: `tests/entry_pages.test.js`

- [x] Add failing source-level assertions for the date change listener, authenticated GET request, request sequence guard, and default checked checkboxes.
- [x] Run `node --test tests/entry_pages.test.js` and confirm the new assertions fail.
- [x] Add `loadArchives()` and invoke it from the date change event and archive tab activation.
- [x] Keep the existing checked checkbox rendering and update the empty message.
- [x] Re-run the targeted Node test and confirm it passes.

### Task 4: Release verification

**Files:**
- Modify: `static/app-version.json`
- Modify: `static/service-worker.js`
- Modify: `artifacts/執行紀錄.md`

- [x] Increment the PWA version in both version files.
- [x] Record implementation and verification results in `artifacts/執行紀錄.md`.
- [x] Run `python -m unittest discover -s tests`.
- [x] Run `node --test tests/*.test.js`.
- [x] Run `git diff --check` and confirm no whitespace errors.
- [ ] Commit and push the verified change.
