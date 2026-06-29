const { test } = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const scriptPath = path.join(__dirname, "..", "start-server.ps1");

test("start-server waits for SQL Server readiness before launching the app", () => {
  const script = fs.readFileSync(scriptPath, "utf8");

  assert.match(script, /function Wait-SqlServerReady/);
  assert.match(script, /function Wait-SqlServerServiceReady/);
  assert.match(script, /function Test-SqlQueryReady/);
  assert.match(script, /function Invoke-SqlcmdReadyCheck/);
  assert.match(script, /function Invoke-PythonPyodbcReadyCheck/);
  assert.match(script, /SQLCMDPASSWORD/);
  assert.match(script, /DELIVERY_SQL_READY_PASSWORD/);
  assert.match(script, /storage_backend/);
  assert.match(script, /database.+type/s);
  assert.match(script, /MSSQL`\$/);
  assert.match(script, /sqlserver_ready_timeout_seconds/);
  assert.match(script, /Write-LifecycleLog "Waiting for SQL Server readiness/);
  assert.match(script, /if \(-not \(Wait-SqlServerReady/);
  assert.match(script, /exit 1/);
  assert.doesNotMatch(script, /Write-LifecycleLog[\s\S]{0,120}password/i);
});

test("start-server.ps1 is valid PowerShell syntax", () => {
  const command = [
    "$tokens=$null;$errors=$null;",
    `[System.Management.Automation.Language.Parser]::ParseFile('${scriptPath.replace(/'/g, "''")}',[ref]$tokens,[ref]$errors) | Out-Null;`,
    "if($errors.Count){$errors | ForEach-Object { Write-Error $_.Message }; exit 1 }",
  ].join("");

  const result = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
