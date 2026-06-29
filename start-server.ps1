$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerScript = Join-Path $ProjectRoot "server.py"
$ConfigPath = Join-Path $ProjectRoot "config.json"
$OutLog = Join-Path $ProjectRoot "server.out.log"
$ErrLog = Join-Path $ProjectRoot "server.err.log"
$LifecycleLog = Join-Path $ProjectRoot "server.lifecycle.log"
$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$Port = 8000
$Config = $null
$DatabaseConfig = $null
$WaitForSqlServer = $false
$SqlReadyTimeoutSeconds = 180
$SqlReadyRetrySeconds = 5
$SqlReadyQueryTimeoutSeconds = 5

function Write-LifecycleLog {
    param([string]$Message)
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -LiteralPath $LifecycleLog -Encoding UTF8 -Value "[$Timestamp] $Message"
}

function Get-ObjectProperty {
    param(
        [object]$Object,
        [string]$Name,
        [object]$Default = $null
    )

    if ($null -eq $Object) {
        return $Default
    }

    $Property = $Object.PSObject.Properties[$Name]
    if ($null -eq $Property) {
        return $Default
    }

    return $Property.Value
}

function Get-IntConfigValue {
    param(
        [object]$Object,
        [string]$Name,
        [int]$Default
    )

    $Value = Get-ObjectProperty $Object $Name $null
    if ($null -eq $Value -or "$Value" -eq "") {
        return $Default
    }

    return [int]$Value
}

function Get-BoolConfigValue {
    param(
        [object]$Object,
        [string]$Name,
        [bool]$Default
    )

    $Value = Get-ObjectProperty $Object $Name $null
    if ($null -eq $Value -or "$Value" -eq "") {
        return $Default
    }

    if ($Value -is [bool]) {
        return $Value
    }

    return @("1", "true", "yes", "on") -contains ([string]$Value).ToLowerInvariant()
}

function Test-SqlServerBackend {
    param([object]$ConfigObject)

    $DatabaseObject = Get-ObjectProperty $ConfigObject "database" $null
    $Backend = Get-ObjectProperty $ConfigObject "storage_backend" $null
    if ($null -eq $Backend -or "$Backend" -eq "") {
        $Backend = Get-ObjectProperty $DatabaseObject "type" "json"
    }

    return @("sqlserver", "mssql") -contains ([string]$Backend).ToLowerInvariant()
}

function Get-SqlServerServiceInfo {
    param([object]$DatabaseObject)

    $ExplicitServiceName = Get-ObjectProperty $DatabaseObject "sqlserver_service_name" $null
    if ($null -ne $ExplicitServiceName -and "$ExplicitServiceName" -ne "") {
        return [pscustomobject]@{
            Name = [string]$ExplicitServiceName
            Explicit = $true
        }
    }

    $Server = [string](Get-ObjectProperty $DatabaseObject "server" "")
    if ($Server -match "\\([^\\,]+)") {
        return [pscustomobject]@{
            Name = "MSSQL`$$($Matches[1])"
            Explicit = $false
        }
    }

    $ServerName = $Server.Split(",")[0].Trim().ToLowerInvariant()
    if (@(".", "(local)", "localhost", "127.0.0.1", "::1") -contains $ServerName) {
        return [pscustomobject]@{
            Name = "MSSQLSERVER"
            Explicit = $false
        }
    }

    return [pscustomobject]@{
        Name = $null
        Explicit = $false
    }
}

function Wait-SqlServerServiceReady {
    param(
        [object]$ServiceInfo,
        [datetime]$Deadline,
        [int]$RetrySeconds
    )

    if ($null -eq $ServiceInfo -or [string]::IsNullOrWhiteSpace($ServiceInfo.Name)) {
        Write-LifecycleLog "SQL Server service name was not resolved; checking query readiness only."
        return $true
    }

    Write-LifecycleLog "Waiting for SQL Server service '$($ServiceInfo.Name)' to be Running."
    while ((Get-Date) -lt $Deadline) {
        $Service = Get-Service -Name $ServiceInfo.Name -ErrorAction SilentlyContinue
        if ($Service -and $Service.Status -eq "Running") {
            Write-LifecycleLog "SQL Server service '$($ServiceInfo.Name)' is Running."
            return $true
        }

        if (-not $Service -and -not $ServiceInfo.Explicit) {
            Write-LifecycleLog "SQL Server service '$($ServiceInfo.Name)' was not found; checking query readiness only."
            return $true
        }

        if (-not $Service) {
            Write-LifecycleLog "SQL Server service '$($ServiceInfo.Name)' was not found; retrying in $RetrySeconds seconds."
        } else {
            Write-LifecycleLog "SQL Server service '$($ServiceInfo.Name)' status is $($Service.Status); retrying in $RetrySeconds seconds."
        }
        Start-Sleep -Seconds $RetrySeconds
    }

    Write-LifecycleLog "Timed out waiting for SQL Server service '$($ServiceInfo.Name)'."
    return $false
}

function Invoke-SqlcmdReadyCheck {
    param(
        [object]$DatabaseObject,
        [int]$QueryTimeoutSeconds
    )

    $SqlCmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
    if (-not $SqlCmd) {
        return $null
    }

    $Server = [string](Get-ObjectProperty $DatabaseObject "server" "")
    $Database = [string](Get-ObjectProperty $DatabaseObject "database" "DeliveryPhotoArchive")
    $Username = [string](Get-ObjectProperty $DatabaseObject "username" "")
    $Password = [string](Get-ObjectProperty $DatabaseObject "password" "")
    $TrustServerCertificate = Get-BoolConfigValue $DatabaseObject "trust_server_certificate" $true

    if ([string]::IsNullOrWhiteSpace($Server) -or [string]::IsNullOrWhiteSpace($Database)) {
        return $false
    }

    $Arguments = @(
        "-S", $Server,
        "-d", $Database,
        "-l", [string]$QueryTimeoutSeconds,
        "-Q", "SET NOCOUNT ON; SELECT 1",
        "-b"
    )
    if ($TrustServerCertificate) {
        $Arguments += "-C"
    }

    $PreviousPassword = $env:SQLCMDPASSWORD
    try {
        if (-not [string]::IsNullOrWhiteSpace($Username)) {
            if ([string]::IsNullOrWhiteSpace($Password)) {
                return $false
            }
            $env:SQLCMDPASSWORD = $Password
            $Arguments += @("-U", $Username)
        } else {
            $Arguments += "-E"
        }

        & $SqlCmd.Source @Arguments *> $null
        return $LASTEXITCODE -eq 0
    } finally {
        if ($null -eq $PreviousPassword) {
            Remove-Item Env:SQLCMDPASSWORD -ErrorAction SilentlyContinue
        } else {
            $env:SQLCMDPASSWORD = $PreviousPassword
        }
    }
}

function Invoke-PythonPyodbcReadyCheck {
    param(
        [object]$DatabaseObject,
        [string]$PythonPath,
        [int]$QueryTimeoutSeconds
    )

    if (-not (Test-Path -LiteralPath $PythonPath)) {
        return $false
    }

    $Server = [string](Get-ObjectProperty $DatabaseObject "server" "")
    $Database = [string](Get-ObjectProperty $DatabaseObject "database" "DeliveryPhotoArchive")
    $Driver = [string](Get-ObjectProperty $DatabaseObject "driver" "ODBC Driver 17 for SQL Server")
    $Username = [string](Get-ObjectProperty $DatabaseObject "username" "")
    $Password = [string](Get-ObjectProperty $DatabaseObject "password" "")
    $Encrypt = Get-BoolConfigValue $DatabaseObject "encrypt" $true
    $TrustServerCertificate = Get-BoolConfigValue $DatabaseObject "trust_server_certificate" $true

    if ([string]::IsNullOrWhiteSpace($Server) -or [string]::IsNullOrWhiteSpace($Database)) {
        return $false
    }

    if (-not [string]::IsNullOrWhiteSpace($Username) -and [string]::IsNullOrWhiteSpace($Password)) {
        return $false
    }

    $PreviousServer = $env:DELIVERY_SQL_READY_SERVER
    $PreviousDatabase = $env:DELIVERY_SQL_READY_DATABASE
    $PreviousDriver = $env:DELIVERY_SQL_READY_DRIVER
    $PreviousUsername = $env:DELIVERY_SQL_READY_USERNAME
    $PreviousPassword = $env:DELIVERY_SQL_READY_PASSWORD
    $PreviousEncrypt = $env:DELIVERY_SQL_READY_ENCRYPT
    $PreviousTrust = $env:DELIVERY_SQL_READY_TRUST_SERVER_CERTIFICATE
    $PreviousTimeout = $env:DELIVERY_SQL_READY_TIMEOUT

    $PythonCode = @'
import os
import sys
import pyodbc

def env(name, default=""):
    return os.environ.get(name, default)

def yes_no(value):
    return "yes" if str(value).lower() in {"1", "true", "yes", "on"} else "no"

def odbc_value(value):
    return str(value).replace("}", "}}")

server = env("DELIVERY_SQL_READY_SERVER")
database = env("DELIVERY_SQL_READY_DATABASE")
driver = env("DELIVERY_SQL_READY_DRIVER", "ODBC Driver 17 for SQL Server")
username = env("DELIVERY_SQL_READY_USERNAME")
password = env("DELIVERY_SQL_READY_PASSWORD")
timeout = int(env("DELIVERY_SQL_READY_TIMEOUT", "5") or "5")

if not server or not database:
    sys.exit(2)

parts = [
    "DRIVER={" + odbc_value(driver) + "}",
    "SERVER=" + odbc_value(server),
    "DATABASE=" + odbc_value(database),
    "Encrypt=" + yes_no(env("DELIVERY_SQL_READY_ENCRYPT", "true")),
    "TrustServerCertificate=" + yes_no(env("DELIVERY_SQL_READY_TRUST_SERVER_CERTIFICATE", "true")),
]
if username:
    parts.append("UID=" + odbc_value(username))
    parts.append("PWD=" + odbc_value(password))
else:
    parts.append("Trusted_Connection=yes")

connection = pyodbc.connect(";".join(parts), timeout=timeout)
cursor = connection.cursor()
cursor.execute("SELECT 1")
cursor.fetchone()
connection.close()
'@

    try {
        $env:DELIVERY_SQL_READY_SERVER = $Server
        $env:DELIVERY_SQL_READY_DATABASE = $Database
        $env:DELIVERY_SQL_READY_DRIVER = $Driver
        $env:DELIVERY_SQL_READY_USERNAME = $Username
        $env:DELIVERY_SQL_READY_PASSWORD = $Password
        $env:DELIVERY_SQL_READY_ENCRYPT = [string]$Encrypt
        $env:DELIVERY_SQL_READY_TRUST_SERVER_CERTIFICATE = [string]$TrustServerCertificate
        $env:DELIVERY_SQL_READY_TIMEOUT = [string]$QueryTimeoutSeconds

        & $PythonPath -c $PythonCode *> $null
        return $LASTEXITCODE -eq 0
    } finally {
        $RestoreEnv = @{
            DELIVERY_SQL_READY_SERVER = $PreviousServer
            DELIVERY_SQL_READY_DATABASE = $PreviousDatabase
            DELIVERY_SQL_READY_DRIVER = $PreviousDriver
            DELIVERY_SQL_READY_USERNAME = $PreviousUsername
            DELIVERY_SQL_READY_PASSWORD = $PreviousPassword
            DELIVERY_SQL_READY_ENCRYPT = $PreviousEncrypt
            DELIVERY_SQL_READY_TRUST_SERVER_CERTIFICATE = $PreviousTrust
            DELIVERY_SQL_READY_TIMEOUT = $PreviousTimeout
        }

        foreach ($Item in $RestoreEnv.GetEnumerator()) {
            if ($null -eq $Item.Value) {
                Remove-Item "Env:$($Item.Key)" -ErrorAction SilentlyContinue
            } else {
                Set-Item "Env:$($Item.Key)" $Item.Value
            }
        }
    }
}

function Test-SqlQueryReady {
    param(
        [object]$DatabaseObject,
        [string]$PythonPath,
        [int]$QueryTimeoutSeconds
    )

    $SqlcmdResult = Invoke-SqlcmdReadyCheck $DatabaseObject $QueryTimeoutSeconds
    if ($SqlcmdResult -eq $true) {
        return $true
    }

    return Invoke-PythonPyodbcReadyCheck $DatabaseObject $PythonPath $QueryTimeoutSeconds
}

function Wait-SqlServerReady {
    param(
        [object]$DatabaseObject,
        [string]$PythonPath,
        [int]$TimeoutSeconds,
        [int]$RetrySeconds,
        [int]$QueryTimeoutSeconds
    )

    $Deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $ServiceInfo = Get-SqlServerServiceInfo $DatabaseObject
    if (-not (Wait-SqlServerServiceReady $ServiceInfo $Deadline $RetrySeconds)) {
        return $false
    }

    Write-LifecycleLog "Waiting for SQL Server readiness. TimeoutSeconds=$TimeoutSeconds RetrySeconds=$RetrySeconds QueryTimeoutSeconds=$QueryTimeoutSeconds"
    while ((Get-Date) -lt $Deadline) {
        if (Test-SqlQueryReady $DatabaseObject $PythonPath $QueryTimeoutSeconds) {
            Write-LifecycleLog "SQL Server readiness check succeeded."
            return $true
        }

        Write-LifecycleLog "SQL Server is not ready for queries; retrying in $RetrySeconds seconds."
        Start-Sleep -Seconds $RetrySeconds
    }

    Write-LifecycleLog "Timed out waiting for SQL Server readiness."
    return $false
}

if (Test-Path -LiteralPath $ConfigPath) {
    $Config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    if ($Config.port) {
        $Port = [int]$Config.port
    }

    if (Test-SqlServerBackend $Config) {
        $DatabaseConfig = Get-ObjectProperty $Config "database" $null
        $StartupConfig = Get-ObjectProperty $Config "startup" $null
        $WaitForSqlServer = Get-BoolConfigValue $StartupConfig "wait_for_sqlserver" $true
        $WaitForSqlServer = Get-BoolConfigValue $DatabaseConfig "wait_for_ready" $WaitForSqlServer
        $SqlReadyTimeoutSeconds = Get-IntConfigValue $StartupConfig "sqlserver_ready_timeout_seconds" $SqlReadyTimeoutSeconds
        $SqlReadyTimeoutSeconds = Get-IntConfigValue $DatabaseConfig "sqlserver_ready_timeout_seconds" $SqlReadyTimeoutSeconds
        $SqlReadyRetrySeconds = Get-IntConfigValue $StartupConfig "sqlserver_ready_retry_seconds" $SqlReadyRetrySeconds
        $SqlReadyRetrySeconds = Get-IntConfigValue $DatabaseConfig "sqlserver_ready_retry_seconds" $SqlReadyRetrySeconds
        $SqlReadyQueryTimeoutSeconds = Get-IntConfigValue $StartupConfig "sqlserver_ready_query_timeout_seconds" $SqlReadyQueryTimeoutSeconds
        $SqlReadyQueryTimeoutSeconds = Get-IntConfigValue $DatabaseConfig "sqlserver_ready_query_timeout_seconds" $SqlReadyQueryTimeoutSeconds
    }
}

try {
    $Client = [System.Net.Sockets.TcpClient]::new()
    $Connect = $Client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if ($Connect.AsyncWaitHandle.WaitOne(500)) {
        $Client.EndConnect($Connect)
        $Client.Close()
        Write-LifecycleLog "Port $Port is already listening; start script exits."
        exit 0
    }
    $Client.Close()
} catch {
    if ($Client) {
        $Client.Close()
    }
}

if (-not (Test-Path -LiteralPath $Python)) {
    $Python = (Get-Command python -ErrorAction Stop).Source
}

if ($WaitForSqlServer) {
    if ($null -eq $DatabaseConfig) {
        Write-LifecycleLog "SQL Server backend is configured, but database settings were not found."
        exit 1
    }

    if (-not (Wait-SqlServerReady $DatabaseConfig $Python $SqlReadyTimeoutSeconds $SqlReadyRetrySeconds $SqlReadyQueryTimeoutSeconds)) {
        Write-LifecycleLog "SQL Server readiness failed; server startup aborted."
        exit 1
    }
}

Set-Location -LiteralPath $ProjectRoot
$env:PYTHONUNBUFFERED = "1"
$env:PYTHONFAULTHANDLER = "1"
$RunAs = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
Write-LifecycleLog "Starting server. RunAs=$RunAs Python=$Python Port=$Port ProjectRoot=$ProjectRoot"
& $Python -X faulthandler $ServerScript 1>> $OutLog 2>> $ErrLog
$ExitCode = $LASTEXITCODE
Write-LifecycleLog "Server process exited. ExitCode=$ExitCode"
exit $ExitCode
