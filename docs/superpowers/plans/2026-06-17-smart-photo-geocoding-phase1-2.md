# Smart Photo Geocoding Phase 1-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve Excel delivery addresses and prepare backend geocoding fields/cache for later smart photo matching.

**Architecture:** Add address/geocode fields to imported delivery records, expose them through JSON and SQL Server repositories, and add a focused `delivery_app/geocoding.py` module with provider-neutral result/status handling. SQL Server support includes a migration script and runtime compatibility when the production database has not yet been migrated.

**Tech Stack:** Python standard library, openpyxl importer, JSON repository, SQL Server repository, unittest.

---

### Task 1: Address Import Test

**Files:**
- Modify: `tests/test_excel_importer.py`
- Modify: `delivery_app/excel_importer.py`

- [ ] Write a failing test that `build_delivery_workbook()` addresses in column C are imported and merged-sequence blank address rows inherit the previous address.
- [ ] Run `python -m unittest tests.test_excel_importer.ImporterRulesTest.test_imports_address_from_excel_rows` and confirm it fails because `address` is missing.
- [ ] Update `excel_importer.py` to track `current_address`, read column C, and include `address` plus empty geocode defaults in each record.
- [ ] Re-run the targeted unittest and confirm it passes.

### Task 2: Geocode Result Module

**Files:**
- Create: `delivery_app/geocoding.py`
- Create: `tests/test_geocoding.py`

- [ ] Write failing tests for `normalize_address()`, `default_geocode_fields(address)`, and fake provider application.
- [ ] Run `python -m unittest tests.test_geocoding` and confirm imports fail before the module exists.
- [ ] Implement `GeocodeResult`, statuses, address normalization, default geocode fields, `DisabledGeocoder`, `StaticGeocoder`, and `apply_geocode_result()`.
- [ ] Re-run `python -m unittest tests.test_geocoding` and confirm it passes.

### Task 3: JSON Repository Preservation

**Files:**
- Modify: `tests/test_excel_importer.py`
- Modify: `delivery_app/repository.py`

- [ ] Write failing tests that public records include address/geocode fields, unchanged addresses preserve successful geocode data, and changed addresses reset geocode data to pending.
- [ ] Run the targeted unittest methods and confirm they fail.
- [ ] Update JSON repository merge, public record, and same-imported-fields logic to carry address/geocode fields.
- [ ] Re-run the targeted unittest methods and confirm they pass.

### Task 4: SQL Server Schema And Compatibility

**Files:**
- Modify: `delivery_app/sqlserver_store.py`
- Create: `docs/sql/2026-06-17-add-delivery-geocode-fields.sql`
- Modify: `tests/test_sqlserver_startup.py` or create source-level schema test.

- [ ] Write source-level tests that the SQL schema has address/geocode fields and a cache table, and the migration script contains the same columns.
- [ ] Run the test and confirm it fails before SQL code/script updates.
- [ ] Add SQL Server delivery fields, CREATE TABLE columns, optional ALTER-column setup for `initialize_schema=true`, cache table SQL, and migration script.
- [ ] Keep runtime compatibility by normalizing missing geocode keys in `public_delivery()` and record normalization.
- [ ] Re-run SQL-related tests and confirm they pass.

### Task 5: Config, Docs, And Verification

**Files:**
- Modify: `config.example.json`
- Modify: `artifacts/執行紀錄.md`

- [ ] Add disabled-by-default `geocoding` config sample using `api_key_env`.
- [ ] Record implementation details in `artifacts/執行紀錄.md`.
- [ ] Run full Python tests: `python -m unittest discover -s tests -p "test_*.py"`.
- [ ] Run frontend tests: `node --test tests\entry_pages.test.js tests\pwa_assets.test.js tests\admin_api_response.test.js tests\admin_filter_options.test.js tests\admin_photo_view.test.js tests\offline_upload_queue.test.js tests\photo_dialog_spacing.test.js`.
- [ ] Run `git diff --check`.
