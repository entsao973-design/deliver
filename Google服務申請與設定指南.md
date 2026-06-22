# Google 服務申請與設定指南

本文只說明「配送存證平台」需要的 Google 服務申請與設定：

- Google Geocoding API：把配送地址轉成 GPS 經緯度，供「定位達交」比對距離。
- Google Cloud Vision API：供「掃號達交」做 OCR 辨識。

部署主機安裝、Python、SQL Server、工作排程啟動，請看 `部署主機安裝指南-工作排程版.md`。

請勿把 API key、service account JSON、private key、`config.json` 提交到 GitHub。

## 1. 本系統如何使用 Google 服務

### 1.1 Geocoding

Excel 匯入後，系統會讀取配送地址，呼叫 Google Geocoding API 取得：

```text
geocode_lat
geocode_lng
geocode_status
geocode_error
```

物流士使用「定位達交」時，手機提供目前 GPS，系統再拿配送地址 GPS 比對 300 公尺內單據。

後端設定來源：

```json
"geocoding": {
  "enabled": true,
  "provider": "google",
  "api_key_env": "GOOGLE_GEOCODING_API_KEY",
  "country_hint": "Taiwan",
  "country_code": "TW",
  "timeout_seconds": 5
}
```

實際 API key 放在 Windows 機器環境變數：

```text
GOOGLE_GEOCODING_API_KEY
```

### 1.2 Cloud Vision OCR

物流士按「掃號達交」時，手機只送出取景框裁切後的小圖到本平台後端。後端使用 Google Cloud Vision API 做文字辨識。

後端設定來源：

```json
"scan_ocr": {
  "enabled": true,
  "provider": "google_vision",
  "credentials_file_env": "GOOGLE_APPLICATION_CREDENTIALS",
  "feature_type": "TEXT_DETECTION",
  "timeout_seconds": 10
}
```

實際 service account JSON 路徑放在 Windows 機器環境變數：

```text
GOOGLE_APPLICATION_CREDENTIALS
```

## 2. 建立 Google Cloud Project 與 Billing

Geocoding 與 Vision 可以放在同一個 Google Cloud Project，管理上比較單純。

建議專案名稱：

```text
delivery-proof-platform
```

步驟：

1. 到 Google Cloud Console。
2. 建立或選擇一個 Project。
3. 確認 Billing 已啟用。
4. 建議設定預算與費用警示。
5. 記下 Project ID，日後排查會用到。

## 3. 申請 Google Geocoding API

### 3.1 啟用 API

1. Google Cloud Console 進入目標 Project。
2. 進入 `APIs & Services`。
3. 搜尋並啟用：

```text
Geocoding API
```

注意：這是 Google Maps Platform 的 Geocoding API。

### 3.2 建立 API key

1. 進入 `APIs & Services` → `Credentials`。
2. 選擇 `Create credentials`。
3. 選擇 `API key`。
4. 複製新 API key。
5. 立刻進入該 API key 的設定頁，補上限制。

### 3.3 限制 API key

建議限制：

- API restrictions：只允許 `Geocoding API`。
- Application restrictions：
  - 若部署主機或公司出口 IP 固定，選擇 IP address restriction，填入固定對外 IP。
  - 若出口 IP 不固定，至少一定要做 API restrictions 和用量限制。

建議再設定：

- 每日配額上限。
- Billing budget alert。
- API 使用量監控。

### 3.4 設定 Windows 機器環境變數

以系統管理員 PowerShell 執行：

```powershell
setx GOOGLE_GEOCODING_API_KEY "你的_Geocoding_API_KEY" /M
```

`/M` 表示寫入機器層級環境變數。重開機後仍存在。

注意：

- 目前已開啟的 PowerShell 不一定立刻讀到新值。
- 已在跑的工作排程也不會自動讀到新值。
- 設定後請重啟工作排程。

不要直接印出完整 key。檢查長度即可：

```powershell
$key = [Environment]::GetEnvironmentVariable("GOOGLE_GEOCODING_API_KEY", "Machine")
$key.Length
```

## 4. 申請 Google Cloud Vision API

### 4.1 啟用 API

1. Google Cloud Console 進入目標 Project。
2. 進入 `APIs & Services`。
3. 搜尋並啟用：

```text
Cloud Vision API
```

### 4.2 建立 service account

1. 進入 `IAM & Admin` → `Service Accounts`。
2. 選擇 `Create service account`。
3. 建議名稱：

```text
delivery-vision-ocr
```

4. 建立後進入該 service account。
5. 到 `Keys`。
6. 選擇 `Add key` → `Create new key`。
7. Key type 選 `JSON`。
8. 下載 JSON 檔。

### 4.3 放置 JSON 檔

建議放在 repo 外：

```text
C:\DeliveryProof\secrets\delivery-vision-ocr.json
```

不要放在：

```text
C:\DeliveryProof\配送存證平台
C:\DeliveryProof\配送存證平台\static
C:\DeliveryProof\配送存證平台\storage
```

也不要放到任何會被 Git 管理的資料夾。

### 4.4 設定檔案權限

若工作排程使用 `SYSTEM` 執行，通常本機檔案可讀。但正式主機仍建議限制權限。

以系統管理員 PowerShell 執行：

```powershell
New-Item -ItemType Directory -Force C:\DeliveryProof\secrets
icacls C:\DeliveryProof\secrets /inheritance:r
icacls C:\DeliveryProof\secrets /grant:r "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)R"
```

若工作排程改用專用帳號，例如 `DeliverySvc`，請加上：

```powershell
icacls C:\DeliveryProof\secrets /grant "DeliverySvc:(OI)(CI)R"
```

### 4.5 設定 Windows 機器環境變數

以系統管理員 PowerShell 執行：

```powershell
setx GOOGLE_APPLICATION_CREDENTIALS "C:\DeliveryProof\secrets\delivery-vision-ocr.json" /M
```

檢查路徑是否存在：

```powershell
$cred = [Environment]::GetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", "Machine")
Test-Path $cred
```

## 5. 設定 config.json

在部署主機：

```powershell
cd C:\DeliveryProof\配送存證平台
notepad config.json
```

啟用 Geocoding：

```json
"geocoding": {
  "enabled": true,
  "provider": "google",
  "api_key_env": "GOOGLE_GEOCODING_API_KEY",
  "country_hint": "Taiwan",
  "country_code": "TW",
  "timeout_seconds": 5
}
```

啟用 Vision OCR：

```json
"scan_ocr": {
  "enabled": true,
  "provider": "google_vision",
  "credentials_file_env": "GOOGLE_APPLICATION_CREDENTIALS",
  "feature_type": "TEXT_DETECTION",
  "timeout_seconds": 10
}
```

注意：

- 不要把 API key 寫進 `config.json`。
- 不要把 JSON private key 內容寫進 `config.json`。
- `config.json` 只寫環境變數名稱。

## 6. 安裝 Python client library

部署主機的 `.venv` 必須有 `google-cloud-vision`。

```powershell
cd C:\DeliveryProof\配送存證平台
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip show google-cloud-vision
```

`requirements.txt` 應包含：

```text
google-cloud-vision>=3.7
```

## 7. 重啟工作排程

設定環境變數或修改 `config.json` 後，重啟平台：

```powershell
schtasks /end /tn "DeliveryProof"
schtasks /run /tn "DeliveryProof"
```

檢查網站：

```powershell
Invoke-WebRequest http://127.0.0.1:8000/static/app-version.json
```

若工作排程停不掉，手動找 PID：

```powershell
netstat -ano | findstr ":8000"
Stop-Process -Id 看到的PID -Force
schtasks /run /tn "DeliveryProof"
```

## 8. 測試 Geocoding

### 8.1 確認環境變數存在

```powershell
$key = [Environment]::GetEnvironmentVariable("GOOGLE_GEOCODING_API_KEY", "Machine")
if ($key) { "GEOCODING_KEY_EXISTS length=$($key.Length)" } else { "GEOCODING_KEY_MISSING" }
```

### 8.2 匯入 Excel 後查詢狀態

在 SQL Server Management Studio 執行：

```sql
SELECT geocode_status, COUNT(*) AS count
FROM dbo.deliveries
GROUP BY geocode_status;
```

查失敗原因：

```sql
SELECT TOP 50 delivery_date, company, invoice_no, address, geocode_status, geocode_error
FROM dbo.deliveries
WHERE geocode_status <> N'ok'
ORDER BY delivery_date DESC;
```

常見狀態：

- `ok`：已完成經緯度。
- `pending`：等待轉換。
- `empty`：地址空白。
- `failed`：轉換失敗，請看 `geocode_error`。

## 9. 測試 Cloud Vision OCR

### 9.1 確認 credentials 路徑

```powershell
$cred = [Environment]::GetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", "Machine")
Test-Path $cred
```

### 9.2 測試 Python client 可建立

重新開一個 PowerShell，再執行：

```powershell
cd C:\DeliveryProof\配送存證平台
.\.venv\Scripts\python.exe -c "from google.cloud import vision; vision.ImageAnnotatorClient(); print('Vision client OK')"
```

若成功，會顯示：

```text
Vision client OK
```

### 9.3 手機端測試

1. 使用物流士帳號登入 `/driver`。
2. 按「掃號達交」。
3. 對準紙本出貨單號取景框拍攝。
4. 若查無單據，畫面應顯示 OCR 辨識內容供排查。
5. 若找到單據，應可進入正常/異常達交流程。

## 10. 常見錯誤

### 10.1 Google geocoding API key is not configured

原因：

- `GOOGLE_GEOCODING_API_KEY` 沒有設定。
- 用 `setx` 後沒有重啟工作排程。
- `config.json` 的 `api_key_env` 名稱打錯。

檢查：

```powershell
[Environment]::GetEnvironmentVariable("GOOGLE_GEOCODING_API_KEY", "Machine")
```

### 10.2 Vision client credentials 錯誤

原因：

- `GOOGLE_APPLICATION_CREDENTIALS` 沒有設定。
- JSON 路徑錯誤。
- 工作排程執行帳號沒有讀取 JSON 權限。
- Cloud Vision API 尚未啟用。
- service account key 已停用或刪除。

檢查：

```powershell
$cred = [Environment]::GetEnvironmentVariable("GOOGLE_APPLICATION_CREDENTIALS", "Machine")
Test-Path $cred
```

### 10.3 沒有 google-cloud-vision 套件

錯誤可能類似：

```text
ModuleNotFoundError: No module named 'google.cloud'
```

處理：

```powershell
cd C:\DeliveryProof\配送存證平台
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 10.4 OCR 能呼叫但辨識不佳

可能原因：

- 拍攝距離太遠。
- 紙張反光。
- 取景框沒有對準單號。
- 字太小、手寫太潦草。
- 單號旁邊有太多干擾文字。

建議：

- 讓單號充滿取景框。
- 避免斜拍。
- 光線均勻。
- 儘量拍印刷體或清楚手寫字。

## 11. 金鑰輪換與外洩處理

若 API key 或 service account JSON 曾放進 Git、聊天、截圖、文件，請視為已外洩。

### 11.1 Geocoding API key 輪換

1. 到 Google Cloud Console → `APIs & Services` → `Credentials`。
2. 找到 Geocoding API key。
3. 建立新 key 或使用 rotate 流程。
4. 新 key 設好 API restrictions 與 application restrictions。
5. 在部署主機更新：

```powershell
setx GOOGLE_GEOCODING_API_KEY "新的_Geocoding_API_KEY" /M
```

6. 重啟工作排程。
7. 確認功能正常。
8. 刪除舊 key。

### 11.2 Vision service account key 輪換

1. 到 `IAM & Admin` → `Service Accounts`。
2. 找到 `delivery-vision-ocr`。
3. 到 `Keys`。
4. 建立新的 JSON key。
5. 放到 `C:\DeliveryProof\secrets`。
6. 更新：

```powershell
setx GOOGLE_APPLICATION_CREDENTIALS "C:\DeliveryProof\secrets\新的檔名.json" /M
```

7. 重啟工作排程。
8. 確認 OCR 正常。
9. 刪除舊 key。

## 12. 不可提交 GitHub 的內容

不可提交：

```text
config.json
Google Geocoding API KEY.txt
任何 *金鑰* 資料夾
任何 service account JSON
任何 private key
任何 .pem / .p12 / .pfx / .key
```

提交前可檢查：

```powershell
git status --short
git diff --cached --name-status
git grep --cached -I -n "BEGIN PRIVATE KEY\|private_key\|AIza"
```

如果最後一行列出真正金鑰檔，請停止 commit，先移除追蹤。

## 13. 官方參考

- Google Geocoding API 設定：<https://developers.google.com/maps/documentation/geocoding/guides-v3/get-api-key>
- Google Cloud Vision setup：<https://cloud.google.com/vision/docs/setup>
- Google Cloud Vision authentication：<https://cloud.google.com/vision/docs/authentication>
- Google Cloud service account keys：<https://cloud.google.com/iam/docs/keys-create-delete>
