# Google Geocoding API Key 申請後步驟

## 1. Google Cloud Console 設定

1. 進入 Google Cloud Console。
2. 建立或選擇本專案使用的 Google Cloud 專案。
3. 啟用帳單功能。
4. 啟用 `Geocoding API`。
5. 建立 API key。

## 2. API Key 安全限制

建議至少設定以下限制：

- Application restrictions：若部署主機有固定對外 IP，建議限制為該伺服器 IP。
- API restrictions：限制只能使用 `Geocoding API`。

不要把 API key 寫入 Git、程式碼或公開文件。

## 3. 將 API Key 放入 Windows 環境變數

若服務用目前登入帳號執行，可使用：

```powershell
setx GOOGLE_GEOCODING_API_KEY "你的API_KEY"
```

若服務是用系統服務或其他帳號執行，請用系統管理員 PowerShell 設定系統環境變數：

```powershell
setx GOOGLE_GEOCODING_API_KEY "你的API_KEY" /M
```

設定完成後，需要重新開啟 PowerShell 或重啟服務，程式才會讀到新的環境變數。

## 4. 修改 config.json

在 `config.json` 加入或確認以下設定：

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

`api_key_env` 表示程式會從 Windows 環境變數 `GOOGLE_GEOCODING_API_KEY` 讀取 API key。
`country_code` 會讓 Google Geocoding 查詢限制在台灣，建議保留 `TW`。

## 5. 重啟平台服務

設定完成後，重啟平台：

```powershell
python server.py
```

若原本已經有服務在執行，請先停止舊服務，再啟動新版服務。

## 6. 使用方式

完成設定並重啟後：

- 管理端匯入 Excel 後，系統會背景處理待定位地址。
- 系統啟動時，也會嘗試處理尚未定位的 pending 地址。
- 相同地址會使用 `address_geocode_cache` 快取，避免重複呼叫 Google Geocoding API。

## 7. 注意事項

- Google Geocoding API 可能產生費用，請在 Google Cloud 設定預算提醒。
- 地址定位可能出現無結果、多結果或定位失敗，系統會記錄在 `geocode_status` 與 `geocode_error`。
- 正式使用前，建議先用少量 Excel 資料測試定位結果是否符合預期。

## 8. 常見錯誤

### This API is not activated on your API project

代表 API key 已經被程式讀到，但該 Google Cloud 專案尚未啟用 Geocoding API。

處理方式：

1. 進入 Google Cloud Console。
2. 確認目前選到的是產生該 API key 的同一個專案。
3. 到 API Library 搜尋並啟用 `Geocoding API`。
4. 確認該專案已啟用帳單。
5. 回到本平台，將 failed 資料重設為 pending 後重啟服務。

重設 SQL：

```sql
UPDATE dbo.deliveries
SET geocode_status = N'pending',
    geocode_error = NULL,
    geocode_updated_at = NULL,
    geocode_provider = NULL,
    geocode_place_id = NULL,
    geocode_lat = NULL,
    geocode_lng = NULL
WHERE geocode_status = N'failed'
  AND geocode_error LIKE N'This API is not activated%';
```
