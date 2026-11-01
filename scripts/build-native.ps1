$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nativeSource = Join-Path $projectRoot 'src\native\VoldeScan.cs'
$nativeOutputDirectory = Join-Path $projectRoot 'src\native\bin'
$nativeOutput = Join-Path $nativeOutputDirectory 'VoldeScan.exe'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
  $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework C# derleyicisi bulunamadı.' }
if (-not (Test-Path -LiteralPath $nativeSource)) { throw 'Yerel tarayıcı kaynak dosyası bulunamadı.' }
New-Item -ItemType Directory -Path $nativeOutputDirectory -Force | Out-Null
& $compiler '/nologo' '/target:exe' '/platform:x64' '/optimize+' '/reference:System.Drawing.dll' ('/out:' + $nativeOutput) $nativeSource
if ($LASTEXITCODE -ne 0) { throw 'Yerel tarayıcı derlenemedi.' }
Write-Output ('Yerel tarayıcı hazır: ' + $nativeOutput)
$updateSource = Join-Path $projectRoot 'src\native\VoldenaUpdate.cs'
$updateOutput = Join-Path $nativeOutputDirectory 'VoldenaUpdate.exe'
$updateManifest = Join-Path $projectRoot 'build\update-helper.manifest'
& $compiler '/nologo' '/target:winexe' '/platform:x64' '/optimize+' '/reference:System.Windows.Forms.dll' '/reference:System.Drawing.dll' '/reference:System.Web.Extensions.dll' ('/win32manifest:' + $updateManifest) ('/out:' + $updateOutput) $updateSource
if ($LASTEXITCODE -ne 0) { throw 'Güncelleme yardımcısı derlenemedi.' }
Write-Output ('Güncelleme yardımcısı hazır: ' + $updateOutput)
