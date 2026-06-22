# Google Vision OCR 申請與安裝步驟

此文件說明如何把「掃號達交」改用 Google Cloud Vision OCR。系統設計是：手機只把取景框裁切後的小圖送到本平台後端，由後端呼叫 Google Vision；Google 金鑰不會放在手機或前端 JavaScript。

官方文件：

- Cloud Vision OCR：https://docs.cloud.google.com/vision/docs/ocr
- Vision 認證：https://docs.cloud.google.com/vision/docs/authentication
- Application Default Credentials：https://docs.cloud.google.com/docs/authentication/application-default-credentials
- Vision Python client library：https://docs.cloud.google.com/vision/docs/libraries

## 1. Google Cloud 專案

可以使用目前 Geocoding API 所在的同一個 Google Cloud 專案，帳單也會在同一個專案內。但不要把 Geocoding API key 拿來當 Vision OCR 金鑰。

建議分工：

```text
GOOGLE_GEOCODING_API_KEY：地址轉 GPS 使用
GOOGLE_APPLICATION_CREDENTIALS：Google Vision OCR 使用
```

## 2. 啟用 Cloud Vision API

1. 進入 Google Cloud Console。
2. 選擇目前平台使用的專案。
3. 確認 Billing 已啟用。
4. 搜尋並啟用 `Cloud Vision API`。
5. 若未來只做掃號 OCR，不需要啟用 Cloud Storage，也不需要把照片上傳到 Google Cloud Storage。

## 3. 建立服務帳戶與金鑰

1. 到 `IAM 與管理` -> `服務帳戶`。
2. 建立服務帳戶，例如：

```text
delivery-vision-ocr
```

3. 不要授予 Owner、Editor、Viewer 這類過大的角色。
4. 本系統是直接送圖片 bytes 到 Vision API，不指定 Cloud Storage 檔案；通常不需要 Cloud Storage 權限。
5. 在服務帳戶內建立 JSON 金鑰。
6. 下載 JSON 檔後，放到伺服器安全位置，例如：

```text
C:\ProgramData\delivery-proof\google-vision-service-account.json
```

注意：

- 此 JSON 金鑰等同 Google 服務存取憑證，不可上傳 GitHub。
- 不要放在專案資料夾內。
- 不要放在 `static`、`data`、`storage` 等可能被服務或備份同步到外部的位置。

## 4. 安裝 Python 套件

在平台主機執行：

```powershell
cd C:\Users\duncan.DUNCAN-PC\Documents\配送存證平台
python -m pip install -r requirements.txt
```

或單獨安裝：

```powershell
python -m pip install google-cloud-vision
```

## 5. 設定 Windows 環境變數

以系統環境變數方式設定，重開機後仍會保留：

```powershell
setx GOOGLE_APPLICATION_CREDENTIALS "C:\ProgramData\delivery-proof\google-vision-service-account.json" /M
```

設定後需要重新啟動服務，讓 Python 程式讀到新的環境變數。

若平台是用一般命令列啟動，關閉該命令列後重新開啟再啟動服務。

若平台是用 Windows 服務或排程啟動，需重新啟動該服務或重開機。

## 6. 修改 config.json

在 `config.json` 加入或修改：

```json
{
  "scan_ocr": {
    "enabled": true,
    "provider": "google_vision",
    "credentials_file_env": "GOOGLE_APPLICATION_CREDENTIALS",
    "feature_type": "TEXT_DETECTION",
    "timeout_seconds": 10
  }
}
```

說明：

- `enabled`: `true` 才啟用雲端掃號。
- `provider`: 目前支援 `google_vision`。
- `credentials_file_env`: 讀取服務帳戶 JSON 路徑的環境變數名稱。
- `feature_type`: 建議先用 `TEXT_DETECTION`，適合拍照中的短文字、單號。
- 若紙本很像密集文件，可改測 `DOCUMENT_TEXT_DETECTION`，但掃號單號通常先用 `TEXT_DETECTION`。

## 7. 重啟平台

```powershell
cd C:\Users\duncan.DUNCAN-PC\Documents\配送存證平台
python server.py
```

或使用既有啟動腳本：

```powershell
.\start-server.ps1
```

## 8. 驗證方式

1. 用物流士帳號登入司機介面。
2. 按 `掃號達交`。
3. 將單號放在取景框內。
4. 按 `拍照掃號`。
5. 正常情況：
   - 前端把取景框裁切圖送到本平台後端。
   - 後端呼叫 Google Vision OCR。
   - 前端用 OCR 文字比對配送單據。
   - 找到單筆時直接顯示候選；多筆時列出選項。

## 9. 常見錯誤

### Google Cloud Vision 套件尚未安裝

處理：

```powershell
python -m pip install -r requirements.txt
```

### 雲端掃號尚未啟用

處理：

- 檢查 `config.json` 的 `scan_ocr.enabled` 是否為 `true`。
- 重新啟動平台。

### Google Vision OCR 失敗

處理：

- 確認 Cloud Vision API 已啟用。
- 確認 Billing 已啟用。
- 確認 `GOOGLE_APPLICATION_CREDENTIALS` 指向正確 JSON。
- 確認 JSON 檔沒有被移動或刪除。
- 重新啟動平台服務。

### 手機無網路

Google Vision OCR 需要平台後端能連到 Google API。若手機或平台主機無法連線，系統會退回目前本機 OCR；若本機 OCR 仍無法辨識，請自行選擇單號拍照。

## 10. 安全注意事項

- 服務帳戶 JSON 不可 commit。
- 不要把 `GOOGLE_APPLICATION_CREDENTIALS` 的內容貼到聊天或文件。
- 前端不保存 Google key。
- 手機不直接呼叫 Google Vision。
- 後端 API 會驗證物流士 token，避免未登入的人濫用 OCR。
