# Internal installer helper. The graphical Setup wizard calls this; users do not
# need PowerShell, Python or pip commands to install Media Journal.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Validate', 'ValidatePort', 'Prepare', 'Install', 'ConfigureStartup', 'Uninstall')]
    [string]$Action,
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [ValidateRange(1024, 65535)][int]$Port = 8084,
    [ValidateSet('manual', 'after-login', 'before-login')][string]$StartupMode = 'manual',
    [switch]$AllowLAN,
    [switch]$DeleteData
)

# Setup can inherit PowerShell 7's module path when launched from a terminal.
# These helpers run in Windows PowerShell and need its matching built-in modules.
$env:PSModulePath = [IO.Path]::Combine($PSHOME, 'Modules')
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$script:LogPath = $null

function Write-SetupLog([string]$Text) {
    [Console]::Out.WriteLine($Text)
    if ($script:LogPath) {
        Add-Content -LiteralPath $script:LogPath -Value $Text -Encoding UTF8
    }
}

function Test-AvailablePort([int]$Candidate) {
    $socket = New-Object Net.Sockets.Socket([Net.Sockets.AddressFamily]::InterNetwork,
        [Net.Sockets.SocketType]::Stream, [Net.Sockets.ProtocolType]::Tcp)
    $ipv6 = $null
    try {
        $socket.ExclusiveAddressUse = $true
        $socket.Bind((New-Object Net.IPEndPoint([Net.IPAddress]::Any, $Candidate)))
        if ([Net.Sockets.Socket]::OSSupportsIPv6) {
            $ipv6 = New-Object Net.Sockets.Socket([Net.Sockets.AddressFamily]::InterNetworkV6,
                [Net.Sockets.SocketType]::Stream, [Net.Sockets.ProtocolType]::Tcp)
            $ipv6.DualMode = $false
            $ipv6.ExclusiveAddressUse = $true
            $ipv6.Bind((New-Object Net.IPEndPoint([Net.IPAddress]::IPv6Any, $Candidate)))
        }
        return $true
    }
    catch [Net.Sockets.SocketException] { return $false }
    finally {
        if ($null -ne $ipv6) { $ipv6.Dispose() }
        $socket.Dispose()
    }
}

function Get-AvailablePort {
    # Suggest 80xx, keeping the last two digits distinct from common defaults.
    # Binding also checks Windows port reservations before suggesting a number.
    $candidates = @(8000..8099 | Where-Object { $_.ToString().Substring(2) -notmatch '[0357]' })
    foreach ($candidate in Get-Random -InputObject $candidates -Count $candidates.Count) {
        if (Test-AvailablePort $candidate) { return $candidate }
    }
    throw 'No available port was found. Close another application and try again.'
}

function Get-PrivatePython {
    $pythonRoot = Join-Path $script:Root 'runtime\python'
    $installations = @(Get-ChildItem -LiteralPath $pythonRoot -Directory | Where-Object {
        $_.Name -match '^cpython-3\.13\.\d+-windows-x86_64-none$' -and
        ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0
    } | Sort-Object { [version]($_.Name -replace '^cpython-([\d.]+)-.*$', '$1') } -Descending)
    if ($installations.Count -eq 0) { throw 'Python could not be prepared. Run Setup again.' }
    $basePython = Join-Path $installations[0].FullName 'python.exe'
    Assert-NoReparsePoint $basePython
    if (-not (Test-Path -LiteralPath $basePython -PathType Leaf)) {
        throw 'Python is incomplete. Run Setup again.'
    }
    # uv creates a minor-version alias as a junction. Environments use the real,
    # versioned path so updates and cleanup never need to follow that junction.
    $alias = Join-Path $pythonRoot 'cpython-3.13-windows-x86_64-none'
    if (Test-Path -LiteralPath $alias) {
        $item = Get-Item -LiteralPath $alias -Force
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            $target = [IO.Path]::GetFullPath([string]@($item.Target)[0])
            if (-not $target.StartsWith($pythonRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
                [IO.Path]::GetDirectoryName($target) -ne $pythonRoot -or
                [IO.Path]::GetFileName($target) -notmatch '^cpython-3\.13\.\d+-windows-x86_64-none$') {
                throw 'The Python installation contains an unexpected linked folder.'
            }
            Assert-NoReparsePoint $target
            [IO.Directory]::Delete($alias)
        }
    }
    return $basePython
}

function Set-LoginStartup([bool]$Enabled) {
    $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    $name = 'MediaJournal-' + ([guid]$state.installation_id).ToString('N')
    $command = '"' + (Join-Path $script:Root 'runtime\env\Scripts\pythonw.exe') + '" "' +
        (Join-Path $script:Root 'support\journal_launcher.py') + '" start --root "' + $script:Root + '"'
    if ($Enabled) {
        if (-not (Test-Path -LiteralPath $key)) { New-Item -Path $key | Out-Null }
        New-ItemProperty -LiteralPath $key -Name $name -Value $command -PropertyType String -Force | Out-Null
    }
    elseif (Test-Path -LiteralPath $key) {
        $existing = Get-ItemProperty -LiteralPath $key -Name $name -ErrorAction SilentlyContinue
        if ($existing -and $existing.$name -eq $command) {
            Remove-ItemProperty -LiteralPath $key -Name $name
        }
    }
    # Remove only this installation's older fixed-name startup entry.
    if (Test-Path -LiteralPath $key) {
        $legacy = Get-ItemProperty -LiteralPath $key -Name 'MediaJournalInstaller' -ErrorAction SilentlyContinue
        if ($legacy -and $legacy.MediaJournalInstaller -eq $command) {
            Remove-ItemProperty -LiteralPath $key -Name 'MediaJournalInstaller'
        }
    }
}

function Assert-NoReparsePoint([string]$Path) {
    $itemPath = $Path
    while ($itemPath) {
        if (Test-Path -LiteralPath $itemPath) {
            $item = Get-Item -LiteralPath $itemPath -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Setup cannot use symbolic links or junctions: $itemPath"
            }
        }
        $parent = [IO.Directory]::GetParent($itemPath)
        if ($null -eq $parent) { break }
        $itemPath = $parent.FullName
    }
}

function Get-SafeRoot {
    if ($InstallRoot -notmatch '^[A-Za-z]:[\\/]' -or $InstallRoot.StartsWith('\\')) {
        throw 'Choose a folder on a local drive.'
    }
    $root = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
    $driveRoot = [IO.Path]::GetPathRoot($root).TrimEnd('\')
    if ($root -eq $driveRoot) { throw 'Choose a dedicated folder, not the root of a drive.' }
    $protected = @($env:USERPROFILE, $env:LOCALAPPDATA, $env:APPDATA,
        $env:WINDIR, $env:ProgramFiles, ${env:ProgramFiles(x86)},
        [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('MyDocuments'))
    foreach ($path in $protected) {
        if ($path -and $root -eq [IO.Path]::GetFullPath($path).TrimEnd('\')) {
            throw 'Choose a dedicated Media Journal folder, not an existing system or personal folder.'
        }
    }
    Assert-NoReparsePoint $root
    if (Test-Path -LiteralPath $root -PathType Leaf) { throw 'The installation path is a file.' }
    if (Test-Path -LiteralPath (Join-Path $root 'manage.py')) {
        throw 'This is an existing source installation. Choose a separate empty folder; Setup will not change your current app.'
    }
    return $root
}

function Get-InstallState([string]$Root, [bool]$Required) {
    $marker = Join-Path $Root 'install-state.json'
    if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) {
        if ($Required) { throw 'The Media Journal installation marker is missing. No files were removed.' }
        if ((Test-Path -LiteralPath $Root) -and @(Get-ChildItem -LiteralPath $Root -Force).Count -gt 0) {
            throw 'This folder is not empty and was not created by this installer. Choose a separate empty folder.'
        }
        return $null
    }
    Assert-NoReparsePoint $marker
    $state = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
    $installationId = [guid]::Empty
    if ($state.product -ne 'media-journal-windows' -or $state.schema_version -ne 1 -or
        -not [guid]::TryParse([string]$state.installation_id, [ref]$installationId) -or
        $installationId -eq [guid]::Empty) {
        throw 'This folder has an unrecognized installation marker. Choose a separate empty folder.'
    }
    return $state
}

function Assert-ManagedPaths([string]$Root) {
    # Check targets before Inno overwrites support files or this helper executes
    # an existing runtime. Checking only the selected root misses child links.
    foreach ($relative in @('support', 'support\licenses', 'runtime', 'runtime\env',
        'runtime\env\Scripts\python.exe', 'runtime\env\Scripts\pythonw.exe',
        'runtime\python', 'runtime\cache', 'releases', 'library', 'logs', 'logs\setup.log',
        'support\firewall_rules.ps1', 'config.json', 'update-request.json', 'update-transaction.json')) {
        Assert-NoReparsePoint (Join-Path $Root $relative)
    }
    $support = Join-Path $Root 'support'
    if (Test-Path -LiteralPath $support -PathType Container) {
        $null = Get-OwnedCleanupTarget 'support'
    }
}

function ConvertTo-NativeArgument([string]$Value) {
    # Windows command-line quoting, including embedded quotes and trailing slashes.
    if ($Value -ne '' -and $Value -notmatch '[\s"]') { return $Value }
    $quoted = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    return '"' + [regex]::Replace($quoted, '(\\+)$', '$1$1') + '"'
}

function Invoke-PrivateCommand([string]$File, [string[]]$Arguments, [switch]$Capture) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $File
    $info.Arguments = ($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' '
    $info.WorkingDirectory = $script:Root
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = New-Object Text.UTF8Encoding($false)
    $info.StandardErrorEncoding = New-Object Text.UTF8Encoding($false)
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    $captured = New-Object 'Collections.Generic.List[string]'
    $lastDiagnostic = ''
    $actionableError = ''
    try {
        if (-not $process.Start()) { throw "Unable to start $File" }
        $outTask = $process.StandardOutput.ReadLineAsync()
        $errTask = $process.StandardError.ReadLineAsync()
        # Drain both streams together: pip/uv can write progress to stderr even
        # on success, and reading one stream to its end first can deadlock.
        while ($null -ne $outTask -or $null -ne $errTask) {
            if ($null -ne $outTask -and $outTask.IsCompleted) {
                $line = $outTask.GetAwaiter().GetResult()
                if ($null -eq $line) { $outTask = $null }
                else {
                    if ($line.Trim()) { $lastDiagnostic = $line }
                    if (-not $actionableError -and $line -match '^(error:|ERROR\|)') { $actionableError = $line }
                    $captured.Add($line)
                    Write-SetupLog $line
                    $outTask = $process.StandardOutput.ReadLineAsync()
                }
            }
            if ($null -ne $errTask -and $errTask.IsCompleted) {
                $line = $errTask.GetAwaiter().GetResult()
                if ($null -eq $line) { $errTask = $null }
                else {
                    if ($line.Trim()) { $lastDiagnostic = $line }
                    if (-not $actionableError -and $line -match '^(error:|ERROR\|)') { $actionableError = $line }
                    Write-SetupLog $line
                    $errTask = $process.StandardError.ReadLineAsync()
                }
            }
            if ($null -ne $outTask -or $null -ne $errTask) { Start-Sleep -Milliseconds 30 }
        }
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) {
            if ($actionableError) { throw ($actionableError + " (exit code $($process.ExitCode)).") }
            if ($lastDiagnostic) { throw ($lastDiagnostic + " (exit code $($process.ExitCode)).") }
            throw "The command failed (exit code $($process.ExitCode)). See the setup log for details."
        }
    }
    finally { $process.Dispose() }
    if ($Capture) { return $captured.ToArray() }
}

function Get-OwnedCleanupTarget([string]$RelativePath) {
    $target = [IO.Path]::GetFullPath((Join-Path $script:Root $RelativePath))
    if (-not $target.StartsWith($script:Root + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Cleanup path is outside this installation. No files were removed.'
    }
    Assert-NoReparsePoint $target
    if (-not (Test-Path -LiteralPath $target)) { return }
    # Reject links inside a generated tree too, before starting any deletion.
    $pending = New-Object 'Collections.Generic.Stack[string]'
    $pending.Push($target)
    while ($pending.Count -gt 0) {
        foreach ($item in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Cleanup found a symbolic link or junction: $($item.FullName). No files were removed from this folder."
            }
            if ($item.PSIsContainer) { $pending.Push($item.FullName) }
        }
    }
    return $target
}

try {
    $script:Root = Get-SafeRoot
    $state = Get-InstallState $script:Root ($Action -eq 'Uninstall')
    if ($state) { Assert-ManagedPaths $script:Root }
    if ($Action -eq 'Validate') {
        $configPath = Join-Path $script:Root 'config.json'
        if ($state -and (Test-Path -LiteralPath $configPath -PathType Leaf)) {
            Assert-NoReparsePoint $configPath
            $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
            if ($config.port -ge 1024 -and $config.port -le 65535) { Write-SetupLog "CONFIG_PORT|$($config.port)" }
            if ($config.lan) { Write-SetupLog 'CONFIG_LAN|1' } else { Write-SetupLog 'CONFIG_LAN|0' }
            $mode = 'manual'
            if ($config.PSObject.Properties.Name -contains 'startup_mode' -and
                $config.startup_mode -in @('manual', 'after-login', 'before-login')) {
                $mode = $config.startup_mode
            }
            Write-SetupLog "CONFIG_STARTUP|$mode"
        }
        else {
            Write-SetupLog "CONFIG_PORT|$(Get-AvailablePort)"
            Write-SetupLog 'CONFIG_STARTUP|manual'
        }
        exit 0
    }
    if ($Action -eq 'ValidatePort') {
        if (-not (Test-AvailablePort $Port)) {
            # An update may keep the port of this installation's running server.
            $ownedServer = $false
            if ($state) {
                try {
                    $request = [Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/__media_journal_installer__/health")
                    $request.Proxy = $null
                    $request.Timeout = 1000
                    $request.ReadWriteTimeout = 1000
                    $response = $request.GetResponse()
                    try {
                        $reader = New-Object IO.StreamReader($response.GetResponseStream())
                        try {
                            $buffer = New-Object char[] 4097
                            $length = $reader.ReadBlock($buffer, 0, $buffer.Length)
                            if ($length -gt 4096) { throw 'Unexpected response from the selected port.' }
                            $health = (New-Object string($buffer, 0, $length)) | ConvertFrom-Json
                        }
                        finally { $reader.Dispose() }
                        $ownedServer = $health.installation_id -eq $state.installation_id
                    }
                    finally { $response.Dispose() }
                }
                catch { $ownedServer = $false }
            }
            if (-not $ownedServer) { throw "Port $Port is in use. Choose another port." }
        }
        exit 0
    }
    if ($Action -eq 'Prepare' -and $null -eq $state) {
        New-Item -ItemType Directory -Path $script:Root -Force | Out-Null
        $state = [ordered]@{ schema_version = 1; product = 'media-journal-windows';
            installation_id = [guid]::NewGuid().ToString(); active_release = $null;
            owner_sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value }
        $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes(($state | ConvertTo-Json))
        $stream = [IO.File]::Open((Join-Path $script:Root 'install-state.json'),
            [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    }
    if ($null -eq $state) { throw 'The installation marker is missing.' }
    if ($Action -eq 'Prepare' -and $state.PSObject.Properties.Name -notcontains 'owner_sid' -and
        -not ($state -is [Collections.IDictionary] -and $state.Contains('owner_sid'))) {
        # Record the interactive owner before any startup helper requests UAC.
        $state | Add-Member -NotePropertyName owner_sid -NotePropertyValue ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
        $marker = Join-Path $script:Root 'install-state.json'
        $temporaryMarker = $marker + '.tmp'
        Assert-NoReparsePoint $temporaryMarker
        [IO.File]::WriteAllText($temporaryMarker, ($state | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
        [IO.File]::Replace($temporaryMarker, $marker, [NullString]::Value)
    }
    $python = Join-Path $script:Root 'runtime\env\Scripts\python.exe'
    $launcher = Join-Path $script:Root 'support\journal_launcher.py'
    $env:PYTHONUTF8 = '1'
    $env:PYTHONNOUSERSITE = '1'
    foreach ($variable in @('PYTHONHOME', 'PYTHONPATH', 'VIRTUAL_ENV',
        'UV_PYTHON_PREFERENCE', 'UV_MANAGED_PYTHON', 'UV_NO_MANAGED_PYTHON',
        'UV_PYTHON', 'UV_PYTHON_CPYTHON_BUILD')) {
        Remove-Item -LiteralPath ('Env:\' + $variable) -ErrorAction SilentlyContinue
    }
    $env:UV_NO_CONFIG = '1'
    $env:UV_NO_MODIFY_PATH = '1'
    $env:UV_PYTHON_INSTALL_BIN = '0'
    $env:UV_PYTHON_INSTALL_REGISTRY = '0'
    $env:UV_PYTHON_NO_REGISTRY = '1'
    $env:UV_PYTHON_ARCH = 'x86_64'
    $env:UV_PYTHON_INSTALL_DIR = Join-Path $script:Root 'runtime\python'
    $env:UV_CACHE_DIR = Join-Path $script:Root 'runtime\cache'

    if ($Action -eq 'Prepare') {
        if ((Test-Path -LiteralPath $python) -and (Test-Path -LiteralPath $launcher)) {
            Write-SetupLog 'STATUS|Stopping this installation before updating...'
            Invoke-PrivateCommand $python @($launcher, 'stop', '--root', $script:Root, '--for-update')
        }
        exit 0
    }
    if ($Action -eq 'Install') {
        New-Item -ItemType Directory -Path (Join-Path $script:Root 'logs') -Force | Out-Null
        $script:LogPath = Join-Path $script:Root 'logs\setup.log'
        $uv = Join-Path $script:Root 'support\uv.exe'
        if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
            Write-SetupLog 'STATUS|Downloading Python...'
            Invoke-PrivateCommand $uv @('python', 'install', '3.13', '--managed-python', '--no-registry', '--no-bin', '--no-config', '--no-progress', '--color', 'never')
            $basePython = Get-PrivatePython
            Write-SetupLog 'STATUS|Preparing Media Journal...'
            Invoke-PrivateCommand $uv @('venv', (Join-Path $script:Root 'runtime\env'), '--python', $basePython, '--no-python-downloads', '--no-config', '--no-progress', '--color', 'never')
        }
        Write-SetupLog 'STATUS|Installing Media Journal...'
        $arguments = @($launcher, 'install', '--root', $script:Root, '--port', [string]$Port)
        if ($AllowLAN) { $arguments += '--lan' } else { $arguments += '--local-only' }
        Invoke-PrivateCommand $python $arguments
        Write-SetupLog 'STATUS|Media Journal is ready.'
        exit 0
    }
    if ($Action -eq 'ConfigureStartup') {
        Write-SetupLog 'STATUS|Applying startup and network settings...'
        Invoke-PrivateCommand (Join-Path $PSHOME 'powershell.exe') @('-NoLogo', '-NoProfile',
            '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
            (Join-Path $script:Root 'support\startup_service.ps1'), '-Action', 'Configure',
            '-InstallRoot', $script:Root, '-Mode', $StartupMode)
        Set-LoginStartup ($StartupMode -eq 'after-login')
        Write-SetupLog 'STATUS|Startup and network settings saved.'
        exit 0
    }
    if ($Action -eq 'Uninstall') {
        # Preflight every tree before the helper changes state or any directory
        # is removed. A rejected later tree must not leave earlier ones deleted.
        $cleanupTargets = @(foreach ($folder in @('releases', 'runtime', 'staticfiles', 'logs', 'support\__pycache__')) {
            Get-OwnedCleanupTarget $folder
        })
        Write-SetupLog 'STATUS|Stopping Media Journal and preparing removal...'
        $startupHelper = Join-Path $script:Root 'support\startup_service.ps1'
        if (Test-Path -LiteralPath $startupHelper -PathType Leaf) {
            Invoke-PrivateCommand (Join-Path $PSHOME 'powershell.exe') @('-NoLogo', '-NoProfile',
                '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $startupHelper,
                '-Action', 'Remove', '-InstallRoot', $script:Root)
        }
        Set-LoginStartup $false
        if ((Test-Path -LiteralPath $python) -and (Test-Path -LiteralPath $launcher)) {
            $arguments = @($launcher, 'uninstall', '--root', $script:Root)
            if ($DeleteData) { $arguments += '--delete-data' }
            Invoke-PrivateCommand $python $arguments
        }
        elseif ($state.active_release -or
            (Test-Path -LiteralPath (Join-Path $script:Root 'update-transaction.json'))) {
            throw 'The private launcher is missing. Run Setup to repair this installation before uninstalling; your library has been kept.'
        }
        elseif ($DeleteData -and (Test-Path -LiteralPath (Join-Path $script:Root 'library'))) {
            # A partial first setup cannot have started a server, but preserve
            # its library unless a working launcher can validate/remove it.
            throw 'Run Setup to repair the private launcher before deleting this library. You can uninstall now while keeping the library instead.'
        }
        foreach ($target in $cleanupTargets) { Remove-Item -LiteralPath $target -Recurse -Force }
        if ($DeleteData) {
            foreach ($file in @('config.json', 'install-state.json')) {
                $path = Join-Path $script:Root $file
                Assert-NoReparsePoint $path
                if (Test-Path -LiteralPath $path -PathType Leaf) { Remove-Item -LiteralPath $path -Force }
            }
        }
        # Also cover repaired older installations whose Inno file list predates
        # this helper. Current installers track it in their normal uninstall log.
        $firewallLibrary = Join-Path $script:Root 'support\firewall_rules.ps1'
        Assert-NoReparsePoint $firewallLibrary
        if (Test-Path -LiteralPath $firewallLibrary -PathType Leaf) {
            Remove-Item -LiteralPath $firewallLibrary -Force
        }
        exit 0
    }
}
catch {
    Write-SetupLog ('ERROR|' + $_.Exception.Message)
    exit 1
}
