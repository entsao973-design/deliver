$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerScript = Join-Path $ProjectRoot "server.py"
$ConfigPath = Join-Path $ProjectRoot "config.json"
$OutLog = Join-Path $ProjectRoot "server.out.log"
$ErrLog = Join-Path $ProjectRoot "server.err.log"
$LifecycleLog = Join-Path $ProjectRoot "server.lifecycle.log"
$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$Port = 8000

function Write-LifecycleLog {
    param([string]$Message)
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -LiteralPath $LifecycleLog -Encoding UTF8 -Value "[$Timestamp] $Message"
}

if (Test-Path -LiteralPath $ConfigPath) {
    $Config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    if ($Config.port) {
        $Port = [int]$Config.port
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

Set-Location -LiteralPath $ProjectRoot
$env:PYTHONUNBUFFERED = "1"
$env:PYTHONFAULTHANDLER = "1"
$RunAs = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
Write-LifecycleLog "Starting server. RunAs=$RunAs Python=$Python Port=$Port ProjectRoot=$ProjectRoot"
& $Python -X faulthandler $ServerScript 1>> $OutLog 2>> $ErrLog
$ExitCode = $LASTEXITCODE
Write-LifecycleLog "Server process exited. ExitCode=$ExitCode"
exit $ExitCode
