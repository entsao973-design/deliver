$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerScript = Join-Path $ProjectRoot "server.py"
$ConfigPath = Join-Path $ProjectRoot "config.json"
$OutLog = Join-Path $ProjectRoot "server.out.log"
$ErrLog = Join-Path $ProjectRoot "server.err.log"
$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$Port = 8000

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
& $Python $ServerScript 1>> $OutLog 2>> $ErrLog
exit $LASTEXITCODE
