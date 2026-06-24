# IIS 反向代理安裝設置指南

本文說明如何在 Windows 主機安裝 IIS，並使用 IIS + URL Rewrite + Application Request Routing (ARR) 將外部網址反向代理到「配送存證平台」Python 服務。

本文以目前正式入口為例：

```text
外部網址：https://dli.morris.com.tw
IIS 反向代理目標：http://127.0.0.1:8000
Python 平台預設 port：8000
```

若 IIS 和 Python 平台在同一台主機，反向代理目標可改成：

```text
http://127.0.0.1:8000
```

## 1. 官方下載與參考來源

- IIS Windows Server 安裝指令：<https://learn.microsoft.com/en-us/powershell/module/servermanager/install-windowsfeature>
- IIS URL Rewrite 官方下載：<https://www.iis.net/downloads/microsoft/url-rewrite>
- IIS Application Request Routing 官方下載：<https://www.iis.net/downloads/microsoft/application-request-routing>
- Microsoft 反向代理設定範例：<https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/reverse-proxy-with-url-rewrite-v2-and-application-request-routing>

## 2. 部署架構

```text
使用者手機 / 電腦
  -> https://dli.morris.com.tw
  -> IIS :443 HTTPS
  -> URL Rewrite / ARR
  -> http://127.0.0.1:8000
  -> Python 配送存證平台
  -> SQL Server
  -> storage/photos
```

重點：

- 對外只開放 IIS 的 `80`、`443`。
- Python 平台的 `8000` 建議只允許 IIS 主機或內部網路連線。
- 手機 PWA、定位、程式內相機建議一定使用 HTTPS。
- SSL 憑證與強制 HTTPS 請看 `Let;s Encrypt SSL認證設置指南.md`。

## 3. 安裝前準備

請先確認：

- 網域 `dli.morris.com.tw` 已指向 IIS 對外入口。
- 防火牆允許外部 TCP `80`、`443` 到 IIS。
- IIS 主機可以連到 Python 主機 `127.0.0.1:8000`。
- Python 平台已可用內部網址開啟，例如：

```powershell
Invoke-WebRequest http://127.0.0.1:8000/driver -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:8000/admin -UseBasicParsing
```

若 IIS 和 Python 在同一台主機，改測：

```powershell
Invoke-WebRequest http://127.0.0.1:8000/driver -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:8000/admin -UseBasicParsing
```

## 4. 安裝 IIS

### 4.1 Windows Server 圖形介面安裝

1. 開啟 `Server Manager`。
2. 點選 `Manage` -> `Add Roles and Features`。
3. 選擇 `Role-based or feature-based installation`。
4. 選擇目前伺服器。
5. 勾選 `Web Server (IIS)`。
6. 在 Role Services 建議勾選：
   - `Web Server`
   - `Common HTTP Features`
   - `Default Document`
   - `Static Content`
   - `HTTP Errors`
   - `Health and Diagnostics`
   - `HTTP Logging`
   - `Request Monitor`
   - `Security`
   - `Request Filtering`
   - `Application Development`
   - `WebSocket Protocol`
   - `Management Tools`
   - `IIS Management Console`
   - `IIS Management Scripts and Tools`
7. 按 `Install`。
8. 安裝完成後開啟瀏覽器測試：

```text
http://localhost
```

若看到 IIS 預設頁，代表 IIS 已啟用。

### 4.2 Windows Server PowerShell 安裝

用系統管理員 PowerShell 執行：

```powershell
Install-WindowsFeature -Name Web-Server,Web-Mgmt-Tools,Web-Scripting-Tools,Web-Default-Doc,Web-Static-Content,Web-Http-Errors,Web-Http-Logging,Web-Request-Monitor,Web-Filtering,Web-WebSockets -IncludeManagementTools
```

檢查 IIS 服務：

```powershell
Get-Service W3SVC
Start-Service W3SVC
```

檢查 IIS 是否回應：

```powershell
Invoke-WebRequest http://localhost -UseBasicParsing
```

### 4.3 Windows 10/11 專業版安裝

若是開發或測試主機，可以使用「Windows 功能」：

1. 開啟 `控制台`。
2. 進入 `程式和功能`。
3. 點選 `開啟或關閉 Windows 功能`。
4. 勾選 `Internet Information Services`。
5. 展開後確認勾選：
   - `Web Management Tools`
   - `IIS Management Console`
   - `World Wide Web Services`
   - `Common HTTP Features`
   - `Default Document`
   - `Static Content`
   - `HTTP Errors`
   - `Security`
   - `Request Filtering`
   - `Application Development`
   - `WebSocket Protocol`

也可用系統管理員 PowerShell：

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole,IIS-WebServer,IIS-ManagementConsole,IIS-CommonHttpFeatures,IIS-DefaultDocument,IIS-StaticContent,IIS-HttpErrors,IIS-RequestFiltering,IIS-WebSockets -All
```

## 5. 安裝 URL Rewrite

URL Rewrite 是 IIS 反向代理規則的核心元件。

1. 到官方頁面下載：<https://www.iis.net/downloads/microsoft/url-rewrite>
2. 選擇 `English x64 installer`。
3. 以系統管理員身分執行安裝檔。
4. 安裝完成後重開 IIS Manager。
5. 點選網站或伺服器節點，應可看到 `URL Rewrite` 圖示。

注意：

- 正式主機通常使用 x64 installer。
- URL Rewrite 必須在 ARR 之前安裝，因為 ARR 依賴 URL Rewrite。

## 6. 安裝 Application Request Routing (ARR)

ARR 讓 IIS 具備代理轉送能力。

1. 到官方頁面下載：<https://www.iis.net/downloads/microsoft/application-request-routing>
2. 選擇 `ARR 3.0 x64 installer`。
3. 以系統管理員身分執行安裝檔。
4. 安裝完成後重開 IIS Manager。
5. 點選最上層伺服器節點，應可看到 `Application Request Routing Cache`。

官方頁面也註明：ARR 需要 URL Rewrite，請先安裝 URL Rewrite。

## 7. 建立 IIS 反向代理網站

建議建立獨立網站，不直接改 `Default Web Site`。

### 7.1 建立網站資料夾

```powershell
New-Item -ItemType Directory -Force C:\inetpub\dli
```

新增一個簡單測試頁：

```powershell
Set-Content -Encoding UTF8 C:\inetpub\dli\index.html "DeliveryProof IIS Proxy"
```

### 7.2 建立 IIS 網站

1. 開啟 `IIS Manager`。
2. 右鍵 `Sites` -> `Add Website...`。
3. 填入：
   - Site name：`dli`
   - Physical path：`C:\inetpub\dli`
   - Type：`http`
   - IP address：`All Unassigned`
   - Port：`80`
   - Host name：`dli.morris.com.tw`
4. 按 `OK`。

若 `Default Web Site` 也佔用 `*:80` 且沒有 Host name，可能造成衝突。建議：

- 停用 `Default Web Site`，或
- 將 `Default Web Site` 綁定改成其他 port，或
- 確保 `dli` 有正確 Host name。

## 8. 啟用 ARR Proxy

ARR Proxy 預設是關閉的，必須手動啟用。

### 8.1 IIS Manager 設定

1. 開啟 `IIS Manager`。
2. 點選最上層伺服器節點。
3. 開啟 `Application Request Routing Cache`。
4. 右側點選 `Server Proxy Settings...`。
5. 勾選 `Enable proxy`。
6. 建議設定：
   - `Time-out (seconds)`：`180` 或 `300`
   - `Reverse rewrite host in response headers`：可先取消勾選，避免改動後端回應 header
7. 按 `Apply`。

Excel 匯入可能需要較長時間，ARR proxy timeout 不要設太短。

### 8.2 PowerShell / appcmd 設定

也可用系統管理員 PowerShell 執行：

```powershell
& "$env:windir\system32\inetsrv\appcmd.exe" set config -section:system.webServer/proxy /enabled:"True" /preserveHostHeader:"True" /reverseRewriteHostInResponseHeaders:"False" /timeout:"00:03:00" /commit:apphost
```

若此指令回報某個屬性不存在，代表 ARR 版本或 IIS schema 不同；請改用 IIS Manager 圖形介面設定。

## 9. 設定反向代理規則

### 9.1 使用 IIS Manager 新增規則

1. 點選 `dli` 網站。
2. 開啟 `URL Rewrite`。
3. 右側點選 `Add Rule(s)...`。
4. 選擇 `Blank rule`。
5. 設定：
   - Name：`ReverseProxyToDeliveryProof`
   - Requested URL：`Matches the Pattern`
   - Using：`Regular Expressions`
   - Pattern：`(.*)`
   - Action type：`Rewrite`
   - Rewrite URL： http://127.0.0.1:8000/{R:1} 
   - Append query string：勾選
   - Stop processing of subsequent rules：勾選
6. 按 `Apply`。

若 IIS 和 Python 在同一台主機，Rewrite URL 改為：

```text
http://127.0.0.1:8000/{R:1}
```

### 9.2 建議 web.config 範例

可在 `C:\inetpub\dli\web.config` 使用以下範例。

此版本只做反向代理，不含強制 HTTPS。強制 HTTPS 請看 SSL 指南。

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
        <rule name="ReverseProxyToDeliveryProof" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:8000/{R:1}" appendQueryString="true" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

`maxAllowedContentLength="104857600"` 代表允許約 100 MB，避免照片或 Excel 上傳被 IIS 擋掉。

## 10. WebSocket 與長請求注意事項

目前平台主要是一般 HTTP request，沒有必須使用 WebSocket 的核心流程。但仍建議安裝 `WebSocket Protocol`，保留未來功能彈性。

Excel 匯入與照片上傳要注意：

- IIS request size 不可太小。
- ARR timeout 不可太短。
- Python 平台目前 Excel 解析已改成子行程，主網站行程不應被 Excel 解析拖垮。
- 若 IIS 回傳 `502`、`504`，優先檢查 Python 服務是否在 `8000` listening，以及 ARR timeout。

## 11. 測試反向代理

### 11.1 測內部 Python

```powershell
Invoke-WebRequest http://127.0.0.1:8000/driver -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:8000/admin -UseBasicParsing
```

### 11.2 測 IIS HTTP

```powershell
Invoke-WebRequest http://dli.morris.com.tw/driver -UseBasicParsing
Invoke-WebRequest http://dli.morris.com.tw/admin -UseBasicParsing
```

### 11.3 測外部瀏覽器

開啟：

```text
http://dli.morris.com.tw/driver
http://dli.morris.com.tw/admin
```

若 SSL 已設定完成，改測：

```text
https://dli.morris.com.tw/driver
https://dli.morris.com.tw/admin
```

## 12. 常見問題

### 12.1 502 Bad Gateway

可能原因：

- Python 服務沒有啟動。
- Python 服務沒有 listen `8000`。
- IIS 主機連不到 `127.0.0.1:8000`。
- Windows 防火牆擋住 `8000`。

檢查：

```powershell
Test-NetConnection 127.0.0.1 -Port 8000
Invoke-WebRequest http://127.0.0.1:8000/static/app-version.json -UseBasicParsing
```

### 12.2 404 Not Found

可能原因：

- URL Rewrite 規則沒有套在正確網站。
- 網站 Host name 綁定錯誤。
- IIS 請求進到 `Default Web Site` 而不是 `dli`。

檢查：

- IIS `Sites` 的 bindings。
- `dli` 是否 started。
- `web.config` 是否在 `C:\inetpub\dli`。

### 12.3 Excel 或照片上傳失敗

可能原因：

- IIS request size 限制太小。
- ARR timeout 太短。
- Python 服務逾時或沒有回應。

建議：

- `maxAllowedContentLength` 設為 100 MB。
- ARR timeout 設為 180 或 300 秒。
- 查看平台 log：

```powershell
Get-Content C:\DeliveryProof\配送存證平台\server.err.log -Tail 100
Get-Content C:\DeliveryProof\配送存證平台\server.import.log -Tail 100
```

### 12.4 手機 PWA、定位、相機異常

請確認使用：

```text
https://dli.morris.com.tw
```

不要用：

```text
http://dli.morris.com.tw
```

定位與程式內相機都應使用 HTTPS 環境。

