# 配送紀錄維護 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在管理端依配送日期閉區間永久清除所有配送紀錄、照片日期資料夾與封存 ZIP。

**Architecture:** 在兩個 repository 實作相同的 `cleanup_delivery_history(start_date, end_date)` 介面；JSON 與 SQL Server 各自負責資料庫刪除，共用 repository 模組中的日期驗證與檔案清理函式。Web 層新增管理員端點，既有管理頁新增一個維護頁籤並沿用按鈕鎖定與訊息顯示機制。

**Tech Stack:** Python 3、`unittest`、SQL Server/pyodbc repository、原生 HTTP server、原生 HTML/CSS/JavaScript、Node.js test runner。

---

### Task 1: JSON repository 日期區間清理

**Files:**
- Modify: `delivery_app/repository.py`
- Modify: `tests/test_excel_importer.py`

- [ ] **Step 1: 寫入失敗測試**

在 `DeliveryRepositoryTest` 新增測試，直接建立四筆不同日期與狀態的 JSON 紀錄，以及日期內外的照片資料夾、合法與不合法 ZIP：

```python
def test_cleanup_delivery_history_removes_all_records_and_files_in_inclusive_range(self):
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        data_file = root / "deliveries.json"
        photo_root = root / "photos"
        archive_root = root / "archives"
        records = [
            make_delivery_record("before", "2026-06-09", "Before", "Driver"),
            make_delivery_record("open", "2026-06-10", "Open", "Driver"),
            {**make_delivery_record("done", "2026-06-11", "Done", "Driver"), "status": "normal"},
            {**make_delivery_record("deleted", "2026-06-12", "Deleted", "Driver", "2026-06-13T10:00:00"), "status": "abnormal"},
            make_delivery_record("after", "2026-06-13", "After", "Driver"),
        ]
        data_file.write_text(json.dumps({"deliveries": records}, ensure_ascii=False), encoding="utf-8")
        for folder in ("20260609", "20260610", "20260611", "20260612", "20260613", "notes"):
            (photo_root / folder).mkdir(parents=True)
            (photo_root / folder / "file.jpg").write_bytes(b"photo")
        archive_root.mkdir()
        for filename in (
            "20260609_Before.zip",
            "20260610_Open.zip",
            "20260612_Deleted.ZIP",
            "20260613_After.zip",
            "unmatched.zip",
        ):
            (archive_root / filename).write_bytes(b"zip")

        repo = DeliveryRepository(None, str(data_file), str(photo_root), str(archive_root))
        summary = repo.cleanup_delivery_history("2026-06-10", "2026-06-12")

        saved_ids = [item["id"] for item in json.loads(data_file.read_text(encoding="utf-8"))["deliveries"]]
        self.assertEqual(saved_ids, ["before", "after"])
        self.assertEqual(summary, {
            "deleted_records": 3,
            "deleted_photo_date_folders": 3,
            "deleted_archives": 2,
        })
        self.assertFalse((photo_root / "20260610").exists())
        self.assertFalse((photo_root / "20260611").exists())
        self.assertFalse((photo_root / "20260612").exists())
        self.assertTrue((photo_root / "20260609").exists())
        self.assertTrue((photo_root / "20260613").exists())
        self.assertTrue((photo_root / "notes").exists())
        self.assertTrue((archive_root / "20260609_Before.zip").exists())
        self.assertTrue((archive_root / "20260613_After.zip").exists())
        self.assertTrue((archive_root / "unmatched.zip").exists())

        self.assertEqual(repo.cleanup_delivery_history("2026-06-10", "2026-06-12"), {
            "deleted_records": 0,
            "deleted_photo_date_folders": 0,
            "deleted_archives": 0,
        })
```

另新增無效日期與反向區間測試：

```python
def test_cleanup_delivery_history_rejects_invalid_date_range(self):
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        repo = DeliveryRepository(None, str(root / "deliveries.json"), str(root / "photos"), str(root / "archives"))
        with self.assertRaisesRegex(ValueError, "日期格式"):
            repo.cleanup_delivery_history("2026-02-30", "2026-03-01")
        with self.assertRaisesRegex(ValueError, "開始日期"):
            repo.cleanup_delivery_history("2026-03-02", "2026-03-01")
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `.venv\Scripts\python.exe -m unittest tests.test_excel_importer.DeliveryRepositoryTest.test_cleanup_delivery_history_removes_all_records_and_files_in_inclusive_range tests.test_excel_importer.DeliveryRepositoryTest.test_cleanup_delivery_history_rejects_invalid_date_range -v`

Expected: FAIL，指出 `DeliveryRepository` 沒有 `cleanup_delivery_history`。

- [ ] **Step 3: 實作最小清理功能**

在 `delivery_app/repository.py`：

- 匯入 `shutil` 與 `date`。
- 新增 `parse_cleanup_date_range(start_date, end_date) -> tuple[date, date]`，使用 `datetime.strptime(value, "%Y-%m-%d").date()` 嚴格驗證。
- 新增 `cleanup_history_files(photo_root, archive_root, start, end)`：
  - 照片只巡覽 `photo_root` 第一層目錄，僅接受完整八碼 `%Y%m%d` 名稱，以 `shutil.rmtree` 刪除日期內資料夾。
  - ZIP 只巡覽 `archive_root` 第一層檔案，副檔名不分大小寫為 `.zip`，以前八碼 `%Y%m%d` 判斷日期後 `unlink()`。
  - 回傳兩個刪除數量。
- 新增 `DeliveryRepository.cleanup_delivery_history`：
  - 先驗證日期。
  - 在 lock 內移除 `delivery_date` 位於閉區間內的所有紀錄並寫回。
  - lock 釋放後清理照片與 ZIP。
  - 回傳三個摘要欄位。

- [ ] **Step 4: 執行測試確認通過**

Run: `.venv\Scripts\python.exe -m unittest tests.test_excel_importer.DeliveryRepositoryTest.test_cleanup_delivery_history_removes_all_records_and_files_in_inclusive_range tests.test_excel_importer.DeliveryRepositoryTest.test_cleanup_delivery_history_rejects_invalid_date_range -v`

Expected: 2 tests PASS。

- [ ] **Step 5: 提交**

```powershell
git add delivery_app/repository.py tests/test_excel_importer.py
git commit -m "Add JSON delivery history cleanup"
```

### Task 2: SQL Server repository 清理

**Files:**
- Modify: `delivery_app/sqlserver_store.py`
- Create: `tests/test_sqlserver_maintenance.py`

- [ ] **Step 1: 寫入失敗測試**

建立輕量 fake connection/cursor，patch `SqlServerBase.__init__` 與 repository `_connect()`，驗證：

```python
def test_cleanup_delivery_history_deletes_inclusive_range_and_commits(self):
    cursor = FakeCursor(rowcount=7)
    connection = FakeConnection(cursor)
    repo = make_repository(self, connection)

    summary = repo.cleanup_delivery_history("2026-06-10", "2026-06-12")

    sql, params = cursor.executions[0]
    self.assertIn("DELETE FROM dbo.deliveries", sql)
    self.assertIn("delivery_date >= ?", sql)
    self.assertIn("delivery_date <= ?", sql)
    self.assertNotIn("status", sql.lower())
    self.assertNotIn("deleted_at", sql.lower())
    self.assertEqual(params, ("2026-06-10", "2026-06-12"))
    self.assertTrue(connection.committed)
    self.assertFalse(connection.rolled_back)
    self.assertEqual(summary["deleted_records"], 7)
```

另測試 execute 失敗時 rollback 且不執行檔案清理，並測試日期驗證沿用共用函式。

- [ ] **Step 2: 執行測試確認失敗**

Run: `.venv\Scripts\python.exe -m unittest tests.test_sqlserver_maintenance -v`

Expected: FAIL，指出 `SqlServerRepository` 沒有 `cleanup_delivery_history`。

- [ ] **Step 3: 實作 SQL Server 方法**

在 `delivery_app/sqlserver_store.py` 匯入 `cleanup_history_files` 與 `parse_cleanup_date_range`，新增：

```python
def cleanup_delivery_history(self, start_date: str, end_date: str) -> dict[str, int]:
    start, end = parse_cleanup_date_range(start_date, end_date)
    with self._lock:
        with self._connect() as connection:
            cursor = connection.cursor()
            try:
                cursor.execute(
                    """
DELETE FROM dbo.deliveries
WHERE delivery_date >= ?
  AND delivery_date <= ?
""",
                    start.isoformat(),
                    end.isoformat(),
                )
                deleted_records = max(int(cursor.rowcount or 0), 0)
                connection.commit()
            except Exception:
                connection.rollback()
                raise
    file_summary = cleanup_history_files(self.photo_root, self.archive_root, start, end)
    return {"deleted_records": deleted_records, **file_summary}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `.venv\Scripts\python.exe -m unittest tests.test_sqlserver_maintenance -v`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add delivery_app/sqlserver_store.py tests/test_sqlserver_maintenance.py
git commit -m "Add SQL Server delivery history cleanup"
```

### Task 3: 管理員清理 API

**Files:**
- Modify: `delivery_app/web.py`
- Modify: `tests/test_web_error_handling.py`

- [ ] **Step 1: 寫入失敗測試**

在 web integration tests 新增：

```python
def test_admin_cleanup_removes_all_history_in_date_range(self):
    records = [
        make_web_delivery("before", "2026-06-09"),
        make_web_delivery("open", "2026-06-10"),
        make_web_delivery("deleted", "2026-06-12", status="normal", deleted_at="2026-06-13T10:00:00"),
        make_web_delivery("after", "2026-06-13"),
    ]
    with running_server_with_deliveries(records) as (address, data_file):
        status, content_type, content = request_json(
            address,
            "POST",
            "/api/admin/maintenance/cleanup",
            body={"token": "admin-token", "start_date": "2026-06-10", "end_date": "2026-06-12"},
            headers={"Content-Type": "application/json"},
        )
        saved_ids = [item["id"] for item in json.loads(data_file.read_text(encoding="utf-8"))["deliveries"]]

    self.assertEqual(status, 200)
    self.assertIn("application/json", content_type)
    self.assertEqual(saved_ids, ["before", "after"])
    self.assertEqual(json.loads(content)["summary"]["deleted_records"], 2)
```

另測試無 token 回傳 401、無效日期與反向區間回傳 400 且資料不變。

- [ ] **Step 2: 執行測試確認失敗**

Run: `.venv\Scripts\python.exe -m unittest tests.test_web_error_handling -v`

Expected: 新測試 FAIL，端點回傳 404。

- [ ] **Step 3: 新增路由與 handler**

在 `_route_post` 加入精確路由：

```python
elif parsed.path == "/api/admin/maintenance/cleanup":
    self._handle_admin_maintenance_cleanup()
```

新增 handler，讀取 JSON、驗證管理員、呼叫 repository 並回傳摘要：

```python
def _handle_admin_maintenance_cleanup(self) -> None:
    body = self._read_json()
    if not self._admin_from_body(body):
        return
    summary = app.repo.cleanup_delivery_history(
        str(body.get("start_date", "")),
        str(body.get("end_date", "")),
    )
    self._send_json({"ok": True, "summary": summary})
```

日期錯誤由既有 `do_POST` 的 `ValueError` 處理轉為 400 JSON。

- [ ] **Step 4: 執行測試確認通過**

Run: `.venv\Scripts\python.exe -m unittest tests.test_web_error_handling -v`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add delivery_app/web.py tests/test_web_error_handling.py
git commit -m "Expose admin history cleanup API"
```

### Task 4: 管理頁維護介面

**Files:**
- Modify: `static/admin.html`
- Modify: `static/admin.js`
- Modify: `static/admin.css`
- Modify: `tests/entry_pages.test.js`

- [ ] **Step 1: 寫入失敗測試**

在 `tests/entry_pages.test.js` 新增靜態契約測試，驗證：

```javascript
test("admin delivery record maintenance requires confirmation before permanent cleanup", () => {
  const html = fs.readFileSync(path.join(staticRoot, "admin.html"), "utf8");
  const css = fs.readFileSync(path.join(staticRoot, "admin.css"), "utf8");
  const adminJs = fs.readFileSync(path.join(staticRoot, "admin.js"), "utf8");

  assert.match(html, /data-view="archive"[^>]*>封存照片<\/button>\s*<button class="tab-button" data-view="maintenance"[^>]*>配送紀錄維護<\/button>/);
  assert.match(html, /id="maintenanceView"[\s\S]*id="maintenanceStartDate"[^>]*type="date"[\s\S]*id="maintenanceEndDate"[^>]*type="date"[\s\S]*id="cleanupDeliveryHistory" class="danger-button"[^>]*>永久清除<\/button>/);
  assert.match(css, /\.admin-tabs\s*\{[\s\S]*grid-template-columns:\s*repeat\(8,/);
  assert.match(css, /#maintenanceView/);
  assert.match(adminJs, /maintenance:\s*document\.querySelector\("#maintenanceView"\)/);
  assert.match(adminJs, /adminEls\.cleanupDeliveryHistory\.addEventListener\("click", cleanupDeliveryHistory\);/);
  assert.match(adminJs, /if \(!confirm\(`[\s\S]*此清除無法恢復，請務必確定後執行[\s\S]*`\)\) \{\s*return;\s*\}/);
  assert.match(adminJs, /AdminOperationState\.runWithButtonLock\(adminEls\.cleanupDeliveryHistory, "清除中\.\.\.",/);
  assert.match(adminJs, /adminApi\("\/api\/admin\/maintenance\/cleanup",[\s\S]*start_date:[\s\S]*end_date:/);
});
```

同時將既有頁籤欄數期待值由 7 改為 8。

- [ ] **Step 2: 執行測試確認失敗**

Run: `node --test tests\entry_pages.test.js`

Expected: 新測試與 8 欄期待 FAIL。

- [ ] **Step 3: 實作最小前端**

在 `admin.html`：

- 封存照片後新增「配送紀錄維護」頁籤。
- 新增 `maintenanceView`，包含開始日期、結束日期與紅色「永久清除」按鈕。

在 `admin.js`：

- 將 maintenance view 與三個控制項加入 `adminEls`。
- 初始化兩個日期為今天。
- 綁定 click。
- 新增 `cleanupDeliveryHistory()`：
  - 空日期顯示「請選擇開始日期與結束日期」。
  - 反向區間顯示「開始日期不得晚於結束日期」。
  - `confirm()` 內容列出日期、全部配送紀錄、已達交照片、封存 ZIP 與不可恢復警告。
  - 確認後使用 `runWithButtonLock` 呼叫新 API。
  - 成功後顯示「已清除配送紀錄 X 筆、照片日期資料夾 Y 個、封存 ZIP Z 個」並重新載入選項與目前清單。

在 `admin.css`：

- 頁籤改為 8 欄。
- 將 `#maintenanceView` 加入既有可滾動頁面 selector。

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test tests\entry_pages.test.js`

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```powershell
git add static/admin.html static/admin.js static/admin.css tests/entry_pages.test.js
git commit -m "Add delivery record maintenance UI"
```

### Task 5: 完整驗證與文件同步

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新使用說明**

在 README 管理端功能與資料清理規則加入：

- 「配送紀錄維護」位於「封存照片」旁。
- 日期區間包含首尾日期。
- 永久清除全部配送紀錄、對應照片與封存 ZIP，且無法恢復。

- [ ] **Step 2: 執行 Python 測試**

Run: `.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v`

Expected: 全部 PASS。

- [ ] **Step 3: 執行 JavaScript 測試**

Run: `node --test tests\*.test.js`

Expected: 全部 PASS。

- [ ] **Step 4: 執行差異與語法檢查**

Run: `git diff --check`

Expected: 無輸出，exit code 0。

Run: `.venv\Scripts\python.exe -m compileall delivery_app`

Expected: exit code 0。

- [ ] **Step 5: 提交文件**

```powershell
git add README.md
git commit -m "Document delivery record maintenance"
```
