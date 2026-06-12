# 配送拍照存檔系統

Android 手機瀏覽器可用的配送拍照 MVP。系統會讀取每日配送 Excel，司機以帳號、密碼、車號登入後，只看到該車號的配送單據。

## 目前功能

- 讀取 `.xlsm` 配送紀錄。
- 讀取所有第 4 列 A 欄為 `序號` 的配送分頁。
- A3 讀車號、C3 讀物流士、H3 讀配送日期。
- 第 5 列起讀資料，A 欄必須是數字序號才處理；非數字列會略過。
- A 欄序號若有合併儲存格，合併範圍內的列都視為同一客戶，直到下一個數字序號。
- B 欄客戶名稱、I 欄公司名稱、K 欄出貨單號。
- 依客戶名稱、公司名稱、出貨單號排序。
- 出貨單可標記 `正常` 或 `異常` 達交。
- 已達交單據預設隱藏，可切換顯示。
- 已達交單據可瀏覽照片、重新拍照、改正常/異常。
- 手機拍照後壓縮為長邊 1800px JPEG。
- 照片儲存路徑：

```text
正常達交：storage/photos/YYYYMMDD/公司名稱/出貨單號.JPG
異常達交：storage/photos/YYYYMMDD/公司名稱/出貨單號_異常.JPG
```

## 執行方式

先確認 `config.json` 的 `excel_path` 指向當日配送 Excel。

預設測試帳密：

```text
司機帳號：driver
司機密碼：1234

管理帳號：admin
管理密碼：admin123
```

啟動服務：

```powershell
python server.py
```

在電腦瀏覽器開：

```text
http://localhost:8000
```

手機與電腦在同一個 Wi-Fi 時，請改用電腦區網 IP，例如：

```text
http://192.168.1.10:8000
```

## 測試車號

目前提供的 Excel 可用這些車號測試：

```text
RFC-7983
RFW-9372
RFW-3960
```

## 多個配送日期

系統會保留不同配送日期的資料。同一車號若有多個日期，手機畫面會顯示 `配送日期` 選單；只有一個日期時會自動隱藏。

管理人員可以在管理後台的 `匯入 Excel` 頁面上傳另一個日期的 Excel。

## 管理後台

管理員登入後會進入：

```text
http://localhost:8000/admin
```

管理後台目前包含：

- `配送狀態`：依開始日期、結束日期、公司名稱、物流士篩選全部出貨單，並可觀看照片；日期預設為查詢當日。
- `刪除區`：已達交後被刪除的單據會移到此區，畫面顏色不同，仍可觀看照片，並提供永久刪除。
- `匯入 Excel`：配送表製作者可從瀏覽器上傳或拖放 `.xlsm` / `.xlsx`，支援多選。
- `封存照片`：選擇日期後，依該日期下各公司照片資料夾產生 ZIP 檔，並可勾選多個 ZIP 下載。
- `帳號管理`：新增、更新、刪除帳號，角色分為 `司機` 與 `管理人員`。

Excel 匯入規則：

- 成功匯入後，伺服器暫存的 Excel 檔會自動刪除。
- 以出貨單號比對既有資料。
- 相同出貨單號且內容相同會略過。
- 相同出貨單號但車號、配送日期、物流士等資料變更時，若尚未達交會更新。
- 已達交的出貨單不可被重新匯入覆蓋。

照片封存規則：

- 封存日期使用 `YYYY-MM-DD` 選擇，輸出檔名使用 `YYYYMMDD_公司名稱.zip`。
- 每個公司一個 ZIP。
- 系統會封存新版路徑 `YYYYMMDD/公司名稱/` 的照片。
- 也相容舊版路徑 `YYYYMMDD/正常/公司名稱/` 與 `YYYYMMDD/異常/公司名稱/`。

刪除規則：

- 未達交單據刪除後直接永久刪除。
- 已達交單據刪除後移入刪除區。
- 刪除區可瀏覽照片，也可永久刪除。

登入規則：

- 密碼錯誤會顯示目前失敗次數。
- 同一帳號連續錯誤 5 次會鎖定 10 分鐘。
- 管理人員登入後進管理後台。
- 司機登入後進配送拍照畫面。

## 後續接雲端

目前照片先存本機 `storage/photos`。之後若決定使用 Firebase Cloud Storage、Google Drive 或 OneDrive，可以把 `delivery_app/repository.py` 內的照片寫入邏輯替換為雲端上傳；前端流程不需要大改。

## SQL Server Express 儲存

系統可使用 SQL Server Express 儲存配送紀錄、帳號、達交狀態與照片路徑；圖檔本身不寫入資料庫，仍以檔案形式保存在 `storage/photos`，封存 ZIP 保存在 `data/archives`。

`config.json` 設定 `storage_backend` 為 `sqlserver` 後，啟動時會建立資料庫與資料表：

```json
{
  "storage_backend": "sqlserver",
  "database": {
    "type": "sqlserver",
    "server": "192.168.0.5",
    "database": "DeliveryPhotoArchive",
    "username": "YOUR_SQL_LOGIN",
    "password": "YOUR_SQL_PASSWORD",
    "driver": "ODBC Driver 17 for SQL Server",
    "encrypt": true,
    "trust_server_certificate": true,
    "create_database": true,
    "timeout": 5
  }
}
```

部署主機需要安裝：

- Microsoft ODBC Driver 17 或 18 for SQL Server
- Python 套件 `pyodbc`
- SQL Server Express 啟用 TCP/IP，並開放 SQL Server 使用的連線埠

如果 SQL 登入沒有建立資料庫權限，可先由資料庫管理者建立 `DeliveryPhotoArchive`，再把 `create_database` 改為 `false`。
