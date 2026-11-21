# Configure optional startup and the installation's local-network firewall rule.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidateSet('Configure', 'Remove', 'Firewall')][string]$Action,
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [ValidateSet('manual', 'after-login', 'before-login')][string]$Mode = 'manual',
    [switch]$ElevatedWorker,
    [string]$ResultFile
)

# Use Windows PowerShell's own modules, including when Setup inherited a PS7 path.
$env:PSModulePath = [IO.Path]::Combine($PSHOME, 'Modules')
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$root = $null

function Assert-NoLinks([string]$Path) {
    $current = $Path
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            if (((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'Startup cannot use symbolic links or junctions.'
            }
        }
        $parent = [IO.Directory]::GetParent($current)
        if ($null -eq $parent) { break }
        $current = $parent.FullName
    }
}

function Quote-Native([string]$Value) {
    if ($Value -ne '' -and $Value -notmatch '[\s"]') { return $Value }
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    return '"' + [regex]::Replace($escaped, '(\\+)$', '$1$1') + '"'
}

function Assert-TreeNoLinks([string]$Folder) {
    Assert-NoLinks $Folder
    $pending = New-Object 'Collections.Generic.Stack[string]'
    $pending.Push($Folder)
    while ($pending.Count -gt 0) {
        foreach ($item in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'Startup cannot use symbolic links or junctions.'
            }
            if ($item.PSIsContainer) { $pending.Push($item.FullName) }
        }
    }
}

function Invoke-Native([string]$File, [string[]]$Arguments) {
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $File
    $info.Arguments = ($Arguments | ForEach-Object { Quote-Native $_ }) -join ' '
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.WorkingDirectory = $root
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    try {
        if (-not $process.Start()) { throw 'Could not start the startup helper.' }
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw "Startup command failed (exit code $($process.ExitCode))." }
    }
    finally { $process.Dispose() }
}

function Owned-ServiceExists {
    $registry = 'HKLM:\SYSTEM\CurrentControlSet\Services\' + $serviceName
    if (-not (Test-Path -LiteralPath $registry)) { return $false }
    $properties = Get-ItemProperty -LiteralPath $registry
    if (-not [string]::Equals($properties.ImagePath.Trim(), $serviceCommand, [StringComparison]::OrdinalIgnoreCase) -or
        -not [string]::Equals($properties.ObjectName, 'NT AUTHORITY\LocalService', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The Windows service does not match this installation.'
    }
    return $true
}

function Set-StartupMode([string]$NewMode) {
    $configPath = Join-Path $root 'config.json'
    if (-not (Test-Path -LiteralPath $configPath)) { return }
    Assert-NoLinks $configPath
    $temporary = $configPath + '.tmp'
    Assert-NoLinks $temporary
    $config = [IO.File]::ReadAllText($configPath) | ConvertFrom-Json
    $config | Add-Member -MemberType NoteProperty -Name startup_mode -Value $NewMode -Force
    [IO.File]::WriteAllText($temporary, ($config | ConvertTo-Json -Depth 32), (New-Object Text.UTF8Encoding($false)))
    # Windows PowerShell 5.1 binds $null to an empty string for this overload.
    [IO.File]::Replace($temporary, $configPath, [NullString]::Value)
}

function Set-ServiceFolderAccess([string]$Folder, [Security.AccessControl.FileSystemRights]$Rights, [bool]$Add) {
    if (-not (Test-Path -LiteralPath $Folder -PathType Container)) { return }
    Assert-NoLinks $Folder
    $identity = New-Object Security.Principal.SecurityIdentifier('S-1-5-19')
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, $Rights,
        [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',
        [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
    $acl = Get-Acl -LiteralPath $Folder
    if ($Add) { $acl.AddAccessRule($rule) }
    else {
        $matching = @($acl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier]) | Where-Object {
            $_.IdentityReference.Value -eq $identity.Value -and $_.FileSystemRights -eq $rule.FileSystemRights -and
            $_.InheritanceFlags -eq $rule.InheritanceFlags -and $_.PropagationFlags -eq $rule.PropagationFlags -and
            $_.AccessControlType -eq $rule.AccessControlType
        })
        if ($matching.Count -eq 0) { return }
        $acl.RemoveAccessRuleSpecific($rule)
    }
    Set-Acl -LiteralPath $Folder -AclObject $acl
}

function Set-ServiceAccess([bool]$Add) {
    # LocalService can read code, but it can modify only its library and logs.
    # Its standard traverse privilege avoids any change to the user's profile ACL.
    Set-ServiceFolderAccess $root ([Security.AccessControl.FileSystemRights]::ReadAndExecute) $Add
    foreach ($name in @('library', 'logs')) {
        Set-ServiceFolderAccess (Join-Path $root $name) ([Security.AccessControl.FileSystemRights]::Modify) $Add
    }
}

function Stop-OwnedService {
    $service = Get-Service -Name $serviceName -ErrorAction Stop
    try {
        if ($service.Status -ne [ServiceProcess.ServiceControllerStatus]::Stopped) {
            $service.Stop()
            $service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Stopped, [TimeSpan]::FromSeconds(140))
        }
    }
    finally { $service.Dispose() }
}

function Write-Result([bool]$Success, [string]$Message) {
    if ($ResultFile) {
        $destination = [IO.Path]::GetFullPath($ResultFile)
        if (-not $destination.StartsWith((Join-Path $root 'logs') + '\', [StringComparison]::OrdinalIgnoreCase)) {
            throw 'The startup result path is outside this installation.'
        }
        Assert-NoLinks $destination
        [IO.File]::WriteAllText($destination, (@{ success = $Success; message = $Message } | ConvertTo-Json),
            (New-Object Text.UTF8Encoding($false)))
    }
}

try {
    if ($InstallRoot -notmatch '^[A-Za-z]:[\\/]' -or $InstallRoot.StartsWith('\\')) {
        throw 'Choose a folder on a local drive.'
    }
    $root = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
    Assert-NoLinks $root
    if ($root -eq [IO.Path]::GetPathRoot($root).TrimEnd('\') -or
        -not [string]::Equals($PSScriptRoot, (Join-Path $root 'support'), [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The startup helper must run from its own installation folder.'
    }
    $marker = Join-Path $root 'install-state.json'
    Assert-NoLinks $marker
    $state = [IO.File]::ReadAllText($marker) | ConvertFrom-Json
    $installationId = [guid]::Empty
    if ($state.product -ne 'media-journal-windows' -or $state.schema_version -ne 1 -or
        -not [guid]::TryParse([string]$state.installation_id, [ref]$installationId)) {
        throw 'The installation marker is invalid.'
    }
    if ($state.owner_sid -notmatch '^S-1-\d+(-\d+){1,15}$') { throw 'The installation owner is missing. Run Setup again.' }
    $firewallLibrary = Join-Path $root 'support\firewall_rules.ps1'
    Assert-NoLinks $firewallLibrary
    . $firewallLibrary
    $networkConfig = @{}
    if ($Action -ne 'Remove') {
        $configPath = Join-Path $root 'config.json'
        Assert-NoLinks $configPath
        $networkConfig = [IO.File]::ReadAllText($configPath) | ConvertFrom-Json
    }
    $firewallNeedsAdmin = Test-FirewallChangeNeedsAdmin -Root $root -State $state -Config $networkConfig -Remove:($Action -eq 'Remove')
    $serviceName = 'MediaJournal-' + $installationId.ToString('N')
    $python = Join-Path $root 'runtime\env\Scripts\python.exe'
    $hostScript = Join-Path $root 'support\service_host.py'
    $serviceCommand = '"' + $python + '" -B "' + $hostScript + '" --root "' + $root + '"'
    foreach ($path in @($python, $hostScript, (Join-Path $root 'config.json'), (Join-Path $root 'logs'))) {
        Assert-NoLinks $path
    }
    $serviceExists = Owned-ServiceExists
    $needsAdmin = $firewallNeedsAdmin -or ($Action -ne 'Firewall' -and
        ($serviceExists -or ($Action -eq 'Configure' -and $Mode -eq 'before-login')))
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    $administrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

    if ($needsAdmin -and -not $administrator) {
        if ($ElevatedWorker) { throw 'Administrator approval is required.' }
        $logs = Join-Path $root 'logs'
        New-Item -ItemType Directory -Force -Path $logs | Out-Null
        $resultPath = Join-Path $logs ('startup-result-' + [guid]::NewGuid().ToString('N') + '.json')
        $arguments = @('-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $PSCommandPath,
            '-Action', $Action, '-InstallRoot', $root, '-Mode', $Mode, '-ElevatedWorker', '-ResultFile', $resultPath)
        try {
            $worker = Start-Process -FilePath (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList (($arguments | ForEach-Object { Quote-Native $_ }) -join ' ') -Verb RunAs -WindowStyle Hidden -PassThru -Wait
            try {
                if (Test-Path -LiteralPath $resultPath) {
                    Assert-NoLinks $resultPath
                    $result = [IO.File]::ReadAllText($resultPath) | ConvertFrom-Json
                    if (-not $result.success) { throw $result.message }
                }
                elseif ($worker.ExitCode -ne 0) { throw 'Startup configuration did not finish.' }
            }
            finally { $worker.Dispose() }
        }
        catch {
            if ($_.Exception -is [ComponentModel.Win32Exception] -and $_.Exception.NativeErrorCode -eq 1223) {
                throw 'Administrator approval is required.'
            }
            throw
        }
        finally {
            if (Test-Path -LiteralPath $resultPath) { Remove-Item -LiteralPath $resultPath -Force }
        }
        if ($Action -eq 'Firewall') { Write-Output 'NETWORK_READY' }
        else { Write-Output ('STARTUP_MODE|' + $(if ($Action -eq 'Remove') { 'manual' } else { $Mode })) }
        exit 0
    }

    if ($Action -eq 'Firewall') {
        Set-OwnedFirewallRule -Root $root -State $state -Config $networkConfig
        Write-Result $true 'Network access configured.'
        Write-Output 'NETWORK_READY'
        exit 0
    }
    if ($Action -eq 'Remove') {
        # Remove the rule while the ownership marker still exists. A permissions
        # error must stop uninstall before application files are deleted.
        Set-OwnedFirewallRule -Root $root -State $state -Config $networkConfig -Remove
    }
    if ($Action -eq 'Remove' -or $Mode -ne 'before-login') {
        if ($serviceExists) {
            if ((Test-Path -LiteralPath $python -PathType Leaf) -and
                (Test-Path -LiteralPath (Join-Path $root 'support\journal_launcher.py') -PathType Leaf)) {
                Invoke-Native $python @((Join-Path $root 'support\journal_launcher.py'), 'stop', '--root', $root)
            }
            Stop-OwnedService
            Invoke-Native (Join-Path $env:WINDIR 'System32\sc.exe') @('delete', $serviceName)
        }
        # Also clean a stale grant from a failed first service registration.
        Set-ServiceAccess $false
        Set-StartupMode $(if ($Action -eq 'Remove') { 'manual' } else { $Mode })
    }
    else {
        if (-not (Test-Path -LiteralPath $python -PathType Leaf) -or
            -not (Test-Path -LiteralPath $hostScript -PathType Leaf)) { throw 'The private runtime is incomplete. Run Setup again.' }
        # Stop any current user-session server before handing it to LocalService.
        Invoke-Native $python @((Join-Path $root 'support\journal_launcher.py'), 'stop', '--root', $root)
        Assert-TreeNoLinks $root
        $config = [IO.File]::ReadAllText((Join-Path $root 'config.json')) | ConvertFrom-Json
        $previousMode = 'manual'
        if ($config.PSObject.Properties.Name -contains 'startup_mode') { $previousMode = $config.startup_mode }
        $created = $false
        try {
            Set-ServiceAccess $true
            if (-not $serviceExists) {
                $credential = New-Object Management.Automation.PSCredential('NT AUTHORITY\LocalService', (New-Object Security.SecureString))
                $registered = New-Service -Name $serviceName -BinaryPathName $serviceCommand -DisplayName 'Media Journal' -Description 'Media Journal web application.' -StartupType Automatic -Credential $credential
                $created = $true
                $registered.Dispose()
            }
            else { Set-Service -Name $serviceName -StartupType Automatic }
            # Owner may open/stop the app without UAC; changing service identity,
            # binary path, permissions or deleting it remains administrator-only.
            $sddl = 'D:(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWRPWPLOCRRC;;;' + $state.owner_sid + ')'
            Invoke-Native (Join-Path $env:WINDIR 'System32\sc.exe') @('sdset', $serviceName, $sddl)
            Set-StartupMode 'before-login'
            $service = Get-Service -Name $serviceName
            try {
                $service.Start()
                $service.WaitForStatus([ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(70))
            }
            finally { $service.Dispose() }
        }
        catch {
            $failure = $_
            # A configuration-write error must not prevent service cleanup.
            try { Set-StartupMode $previousMode }
            catch { Write-Output 'The previous startup preference could not be restored.' }
            $removedService = $false
            if ($created) {
                try {
                    Stop-OwnedService
                    Invoke-Native (Join-Path $env:WINDIR 'System32\sc.exe') @('delete', $serviceName)
                    $removedService = $true
                }
                catch { Write-Output 'The service could not be removed after the startup error. Run Setup again to repair it.' }
            }
            if (-not $serviceExists -and (-not $created -or $removedService)) {
                try { Set-ServiceAccess $false }
                catch { Write-Output 'Startup folder permissions could not be restored. Run Setup again to repair them.' }
            }
            throw $failure
        }
    }
    if ($Action -eq 'Configure') {
        Set-OwnedFirewallRule -Root $root -State $state -Config $networkConfig
    }
    Write-Result $true 'Startup and network access configured.'
    Write-Output ('STARTUP_MODE|' + $(if ($Action -eq 'Remove') { 'manual' } else { $Mode }))
    exit 0
}
catch {
    $message = $_.Exception.Message
    if ($root) {
        try { Write-Result $false $message } catch { }
    }
    Write-Output ('ERROR|' + $message)
    exit 1
}
