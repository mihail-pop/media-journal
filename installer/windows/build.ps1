# Build the graphical installer; this never installs or starts Media Journal.
[CmdletBinding()]
param(
    [string]$CompilerPath,
    [ValidatePattern('^\d+\.\d+\.\d+(\.\d+)?$')][string]$Version = '1.0.0'
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$buildRoot = Join-Path $repoRoot 'build\windows-installer'
New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-VerifiedFile([string]$Url, [string]$Path, [string]$SHA256) {
    if (-not (Test-Path -LiteralPath $Path) -or
        (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash -ne $SHA256) {
        Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Path
    }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash -ne $SHA256) {
        throw "Checksum verification failed: $Path"
    }
}

# Deliberately pinned. Update version + official SHA-256 together when updating
# the bootstrap tooling, rather than trusting a mutable latest-download URL.
$uvVersion = '0.13.9'
$uvZip = Join-Path $buildRoot "uv-$uvVersion.zip"
Get-VerifiedFile "https://github.com/astral-sh/uv/releases/download/$uvVersion/uv-x86_64-pc-windows-msvc.zip" $uvZip 'edd61f7f5728a56cc62455386661860bdfc7bab65872f39b0c25bdcc1d8e1beb'
$uvFolder = Join-Path $buildRoot 'uv'
Expand-Archive -LiteralPath $uvZip -DestinationPath $uvFolder -Force
$uvBinary = Join-Path $uvFolder 'uv.exe'
$uvLicense = Join-Path $buildRoot 'uv-LICENSE-MIT.txt'
Get-VerifiedFile "https://raw.githubusercontent.com/astral-sh/uv/$uvVersion/LICENSE-MIT" $uvLicense '860e3d7a86b84e6a7012c7a635fc64df475cebc6cce34dfeb73a5982ec58176c'

if (-not $CompilerPath) {
    $candidates = @((Join-Path $repoRoot 'build\windows-tools\inno\ISCC.exe'),
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe")
    $CompilerPath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}
if (-not $CompilerPath -or -not (Test-Path -LiteralPath $CompilerPath -PathType Leaf)) {
    throw 'Inno Setup 6.7.4 or newer is needed to build the installer. Pass -CompilerPath with the path to ISCC.exe.'
}
# The official compiler executable has a 0.0.0.0 file version. Its compiler
# checks language/features directly, rather than trusting that resource value.
foreach ($file in @('journal_launcher.py', 'installed_settings.py', 'bootstrap.ps1',
    'service_host.py', 'startup_service.ps1', 'firewall_rules.ps1')) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $file))) { throw "Missing installer source: $file" }
}
& $CompilerPath "/DInstallerVersion=$Version" "/DUvBinary=$uvBinary" "/DUvLicense=$uvLicense" (Join-Path $PSScriptRoot 'setup.iss')
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed (exit code $LASTEXITCODE)." }
$setup = Join-Path $repoRoot 'dist\windows\MediaJournalSetup.exe'
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $setup).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($setup + '.sha256', "$hash  MediaJournalSetup.exe`n", (New-Object Text.UTF8Encoding($false)))
Write-Host "Built: $setup"
Write-Host "SHA-256: $hash"
