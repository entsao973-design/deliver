# Let's Encrypt SSL 認證設置指南

本文說明如何使用 Let's Encrypt 與 win-acme 在 IIS 上申請 SSL 憑證，並設定強制 HTTPS。

本文以目前正式入口為例：

```text
網域：dli.morris.com.tw
IIS 網站：DeliveryProofProxy
Python 後端：http://192.168.0.5:8000
```

## 1. 官方下載與參考來源

- Let's Encrypt FAQ：<https://letsencrypt.org/docs/faq/>
- Let's Encrypt ACME Client 清單：<https://letsencrypt.org/docs/client-options/>
- win-acme 官方網站：<https://www.win-acme.com/>
- win-acme Getting Started：<https://www.win-acme.com/manual/getting-started>
- win-acme Automatic Renewal：<https://www.win-acme.com/manual/automatic-renewal>
- win-acme Validation Problems：<https://www.win-acme.com/manual/validation-problems>

Let's Encrypt 是免費、自動化的公開憑證機構。win-acme 是 Windows / IIS 常用的 ACME client。

## 2. 憑證申請前條件

申請前請確認：

- `dli.morris.com.tw` DNS A record 已指向 IIS 對外 IP。
- 若有 AAAA record，IPv6 也必須能正確連到 IIS；若沒有 IPv6，請不要設定錯誤 AAAA record。
- 外部網路可以連到 IIS TCP `80`。
- 外部網路可以連到 IIS TCP `443`。
- IIS 已建立 `DeliveryProofProxy` 網站。
- IIS 網站已有 HTTP binding：

```text
Type: http
Host name: dli.morris.com.tw
Port: 80
```

HTTP-01 驗證需要 port `80` 可被 Let's Encrypt 從外部連線。不要只開 `443`。

## 3. 安裝 win-acme

### 3.1 下載

1. 到 win-acme 官方網站：<https://www.win-acme.com/>
2. 下載建議版本：

```text
win-acme.v2.x.x.x.x64.trimmed.zip
```

一般 IIS 憑證申請使用 `x64 trimmed` 即可。若需要額外 DNS plugin，再考慮 `pluggable` 版本。

### 3.2 解壓縮

建議解壓縮到固定位置：

```text
C:\Program Files\win-acme
```

不要解壓到桌面、下載資料夾或臨時資料夾，因為 win-acme 會建立自動續約工作排程，路徑必須長期存在。

### 3.3 啟動

用系統管理員 PowerShell：

```powershell
cd "C:\Program Files\win-acme"
.\wacs.exe
```

若 Windows 顯示 SmartScreen 或安全警告，請確認來源是 win-acme 官方網站或官方 GitHub release。

## 4. 使用互動模式申請 IIS 憑證

建議第一次使用互動模式，較不容易選錯。

1. 用系統管理員 PowerShell 執行：

```powershell
cd "C:\Program Files\win-acme"
.\wacs.exe
```

2. 主選單選擇：

```text
N: Create new certificate
```

3. 若 IIS 網站設定正確，可選擇預設 IIS 模式。

4. 選擇 `DeliveryProofProxy` 網站或包含 `dli.morris.com.tw` 的 binding。

5. 選擇網域：

```text
dli.morris.com.tw
```

6. 第一次建立 ACME account 時：
   - 同意 Let's Encrypt terms of service。
   - 輸入管理用 email。

7. 驗證方式建議先使用 win-acme 預設：

```text
HTTP validation / SelfHosting
```

8. 憑證儲存與安裝：
   - Store：Windows Certificate Store
   - Installation：IIS bindings

9. 完成後 win-acme 會：
   - 取得 Let's Encrypt 憑證。
   - 建立或更新 IIS HTTPS binding。
   - 建立自動續約工作排程。

## 5. 使用命令列申請憑證

若已熟悉 win-acme，可使用命令列。以下為範例，正式執行前請先用 `.\wacs.exe --help` 確認當前版本參數。

```powershell
cd "C:\Program Files\win-acme"

.\wacs.exe `
  --source iis `
  --host dli.morris.com.tw `
  --validation selfhosting `
  --store certificatestore `
  --installation iis `
  --sslport 443 `
  --accepttos `
  --emailaddress "admin@example.com"
```

若有多個 IIS site，建議加上 `--siteid` 指定網站 ID。

查 IIS site ID：

```powershell
Import-Module WebAdministration
Get-ChildItem IIS:\Sites | Select-Object Name,Id,State,Bindings
```

範例：

```powershell
.\wacs.exe `
  --source iis `
  --siteid 2 `
  --host dli.morris.com.tw `
  --validation selfhosting `
  --store certificatestore `
  --installation iis `
  --sslport 443 `
  --accepttos `
  --emailaddress "admin@example.com"
```

## 6. 設定 IIS HTTPS Binding

若 win-acme 沒有自動建立 HTTPS binding，可手動確認。

1. 開啟 `IIS Manager`。
2. 點選 `DeliveryProofProxy`。
3. 右側點選 `Bindings...`。
4. 應有：

```text
Type: https
Host name: dli.morris.com.tw
Port: 443
SSL certificate: win-acme / Let's Encrypt 憑證
```

5. 若沒有，點 `Add...` 新增：
   - Type：`https`
   - IP address：`All Unassigned`
   - Port：`443`
   - Host name：`dli.morris.com.tw`
   - 勾選 `Require Server Name Indication`
   - SSL certificate：選擇剛剛申請的憑證

SNI 建議勾選，尤其同一台 IIS 可能有多個 HTTPS 網站。

## 7. 強制 HTTPS

強制 HTTPS 建議使用 URL Rewrite 規則。

### 7.1 注意 ACME challenge 例外

若使用 HTTP-01 驗證，`/.well-known/acme-challenge/` 不應被錯誤轉向或反向代理擋住。

win-acme 官方文件也提醒：URL Rewrite 可能攔截 ACME challenge，因此應建立例外規則。

### 7.2 web.config 建議範例

以下範例包含：

- ACME challenge 例外
- HTTP 強制轉 HTTPS
- HTTPS 反向代理到 Python
- 上傳大小限制 100 MB

請放在：

```text
C:\inetpub\DeliveryProofProxy\web.config
```

內容：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <security>
      <requestFiltering>
        <requestLimits maxAllowedContentLength="104857600" />
      </requestFiltering>
    </security>
    <rewrite>
      <rules>
        <rule name="LetsEncryptChallengeBypass" stopProcessing="true">
          <match url="^\.well-known/acme-challenge/.*$" />
          <action type="None" />
        </rule>

        <rule name="RedirectHttpToHttps" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{HTTPS}" pattern="off" ignoreCase="true" />
          </conditions>
          <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
        </rule>

        <rule name="ReverseProxyToDeliveryProof" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://192.168.0.5:8000/{R:1}" appendQueryString="true" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

若 IIS 和 Python 在同一台主機，將：

```xml
http://192.168.0.5:8000/{R:1}
```

改為：

```xml
http://127.0.0.1:8000/{R:1}
```

### 7.3 用 IIS Manager 建立 HTTPS redirect

1. 點選 `DeliveryProofProxy`。
2. 開啟 `URL Rewrite`。
3. 新增 `Blank rule`。
4. 設定：
   - Name：`RedirectHttpToHttps`
   - Pattern：`(.*)`
   - Conditions 新增：
     - Condition input：`{HTTPS}`
     - Pattern：`off`
   - Action type：`Redirect`
   - Redirect URL：`https://{HTTP_HOST}/{R:1}`
   - Redirect type：`Permanent (301)`
   - Stop processing：勾選
5. 確保此規則位於反向代理規則之前。
6. 確保 ACME challenge bypass 位於最前面。

規則順序應為：

```text
1. LetsEncryptChallengeBypass
2. RedirectHttpToHttps
3. ReverseProxyToDeliveryProof
```

## 8. 測試 HTTPS

### 8.1 本機測試

```powershell
Invoke-WebRequest https://dli.morris.com.tw/driver -UseBasicParsing
Invoke-WebRequest https://dli.morris.com.tw/admin -UseBasicParsing
```

### 8.2 HTTP 是否會跳 HTTPS

```powershell
curl.exe -I http://dli.morris.com.tw/driver
```

應看到類似：

```text
HTTP/1.1 301 Moved Permanently
Location: https://dli.morris.com.tw/driver
```

### 8.3 瀏覽器測試

開啟：

```text
https://dli.morris.com.tw/driver
https://dli.morris.com.tw/admin
```

確認：

- 鎖頭圖示正常。
- 登入正常。
- PWA 可安裝。
- 手機定位與程式內相機可用。
- 管理端匯入 Excel 正常。

## 9. 自動續約

win-acme 成功建立第一張憑證後，會自動建立 Windows 工作排程。

檢查：

```powershell
Get-ScheduledTask | Where-Object { $_.TaskName -like "*win-acme*" -or $_.TaskPath -like "*win-acme*" }
```

查看工作排程資訊：

```powershell
Get-ScheduledTask | Where-Object { $_.TaskName -like "*win-acme*" } | Get-ScheduledTaskInfo
```

win-acme 官方文件說明：預設會每天檢查是否需要續約，通常使用 `SYSTEM` 帳號執行。

## 10. 手動測試續約

用系統管理員 PowerShell：

```powershell
cd "C:\Program Files\win-acme"
.\wacs.exe --renew --force --verbose
```

注意：

- `--force` 會強制嘗試續約，測試不要過度頻繁，避免碰到 Let's Encrypt rate limit。
- 若只是列出目前 renewal：

```powershell
.\wacs.exe --list
```

## 11. win-acme log 位置

常見 log 位置：

```text
%ProgramData%\win-acme\
```

可查看：

```powershell
Get-ChildItem "$env:ProgramData\win-acme" -Recurse -Filter *.log
```

## 12. 常見失敗原因

### 12.1 Port 80 沒有開

HTTP-01 驗證需要外部能連到 TCP `80`。

檢查：

```powershell
Test-NetConnection dli.morris.com.tw -Port 80
```

也要確認路由器、防火牆、IIS binding 都正確。

### 12.2 DNS 指到錯的 IP

檢查：

```powershell
Resolve-DnsName dli.morris.com.tw
```

外部 DNS 查詢結果必須是 IIS 對外入口。

### 12.3 AAAA IPv6 記錄錯誤

若 DNS 有 AAAA record，Let's Encrypt 可能用 IPv6 驗證。若 IPv6 連不到 IIS，會失敗。

處理：

- 正確設定 IPv6 到 IIS，或
- 移除錯誤 AAAA record。

### 12.4 URL Rewrite 擋到 ACME challenge

若強制 HTTPS 或反向代理規則攔截：

```text
/.well-known/acme-challenge/
```

請把 `LetsEncryptChallengeBypass` 放在第一條規則。

### 12.5 CAA record 不允許 Let's Encrypt

若網域有 CAA record，需允許：

```text
letsencrypt.org
```

### 12.6 憑證申請成功但 HTTPS 還是舊憑證

檢查：

- IIS HTTPS binding 是否選到新憑證。
- 是否有多個網站共用同一 Host name。
- 是否 CDN 或外層防火牆終止 SSL。
- 是否瀏覽器快取舊憑證資訊。

## 13. HSTS 建議

HSTS 會要求瀏覽器未來自動使用 HTTPS。正式環境穩定後可考慮啟用。

不建議第一天就開很長時間的 HSTS，避免憑證或 HTTPS 設定錯誤時無法臨時回 HTTP 排錯。

若要啟用，可在 IIS 加 Response Header：

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

初期可先用短一點：

```text
Strict-Transport-Security: max-age=86400
```

確認無問題後再延長。

