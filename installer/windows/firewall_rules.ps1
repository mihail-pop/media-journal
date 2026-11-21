# Function library only. The startup helper obtains administrator approval before
# making changes; merely loading this file never changes Windows Firewall.

function Get-FirewallRuleIdentity {
    param([Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)]$State)

    if ($Root -notmatch '^[A-Za-z]:[\\/]' -or $Root.StartsWith('\\')) {
        throw 'Firewall access requires an installation on a local drive.'
    }
    $normalizedRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    if ($normalizedRoot -eq [IO.Path]::GetPathRoot($normalizedRoot).TrimEnd('\')) {
        throw 'The firewall installation folder is invalid.'
    }
    $identifier = [guid]::Empty
    if ($State.product -ne 'media-journal-windows' -or $State.schema_version -ne 1 -or
        -not [guid]::TryParse([string]$State.installation_id, [ref]$identifier) -or
        $identifier -eq [guid]::Empty) {
        throw 'The firewall installation marker is invalid.'
    }
    $token = $identifier.ToString('N')
    [pscustomobject]@{
        Root = $normalizedRoot
        Name = 'MediaJournal-LAN-' + $token
        Description = 'Media Journal installer LAN rule v1; installation=' + $token + '; root=' + $normalizedRoot
    }
}

function Get-FirewallConfigValue {
    param([Parameter(Mandatory = $true)]$Config,
        [Parameter(Mandatory = $true)][string]$Name)

    if ($Config -is [Collections.IDictionary]) {
        if (-not $Config.Contains($Name)) { throw "The firewall setting '$Name' is missing." }
        return $Config[$Name]
    }
    $property = $Config.PSObject.Properties[$Name]
    if ($null -eq $property) { throw "The firewall setting '$Name' is missing." }
    return $property.Value
}

function Get-ValidatedFirewallConfig {
    param([Parameter(Mandatory = $true)]$Config)

    $lan = Get-FirewallConfigValue -Config $Config -Name 'lan'
    $port = Get-FirewallConfigValue -Config $Config -Name 'port'
    if ($lan -isnot [bool]) { throw 'The LAN setting must be true or false.' }
    if (($port -isnot [int] -and $port -isnot [long]) -or $port -lt 1024 -or $port -gt 65535) {
        throw 'The firewall port must be a number from 1024 to 65535.'
    }
    [pscustomobject]@{ Lan = $lan; Port = [int]$port }
}

function Assert-FirewallPathNoLinks {
    param([Parameter(Mandatory = $true)][string]$Path)

    $current = $Path
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $entry = Get-Item -LiteralPath $current -Force
            if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'Firewall access cannot use linked installation paths.'
            }
        }
        $parent = [IO.Directory]::GetParent($current)
        if ($null -eq $parent) { break }
        $current = $parent.FullName
    }
}

function Get-PrivateFirewallProgram {
    param([Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)]$State)

    $identity = Get-FirewallRuleIdentity -Root $Root -State $State
    $release = [string]$State.active_release
    if ($release -notmatch '^\d{14}-[a-f0-9]{8}$') {
        throw 'The active release is incomplete. Run Setup again.'
    }
    $configuration = Join-Path $identity.Root ('releases\' + $release + '\env\pyvenv.cfg')
    Assert-FirewallPathNoLinks $configuration
    if (-not (Test-Path -LiteralPath $configuration -PathType Leaf) -or
        (Get-Item -LiteralPath $configuration).Length -gt 65536) {
        throw 'The private Python environment is incomplete. Run Setup again.'
    }
    $homeValues = @([IO.File]::ReadAllLines($configuration) | Where-Object { $_ -match '^home\s*=' })
    if ($homeValues.Count -ne 1) { throw 'The private Python location is invalid.' }
    $homePath = ($homeValues[0] -replace '^home\s*=\s*', '').Trim()
    if ($homePath -notmatch '^[A-Za-z]:[\\/]') { throw 'The private Python location is invalid.' }
    $homePath = [IO.Path]::GetFullPath($homePath).TrimEnd('\')
    $pythonRoot = Join-Path $identity.Root 'runtime\python'
    if (-not [string]::Equals([IO.Path]::GetDirectoryName($homePath), $pythonRoot,
        [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($homePath) -notmatch '^cpython-\d+\.\d+\.\d+-windows-x86_64-none$') {
        throw 'The Python environment points outside this installation.'
    }
    # Windows venv pythonw.exe is a redirector. Firewall rules must match the
    # real base executable it launches, which remains stable across app releases.
    $program = Join-Path $homePath 'pythonw.exe'
    Assert-FirewallPathNoLinks $program
    if (-not (Test-Path -LiteralPath $program -PathType Leaf)) {
        throw 'The private Python executable is missing. Run Setup again.'
    }
    return $program
}

function Get-OwnedFirewallRule {
    param([Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)]$State,
        $Policy)

    $identity = Get-FirewallRuleIdentity -Root $Root -State $State
    if ($null -eq $Policy) { $Policy = New-Object -ComObject HNetCfg.FwPolicy2 }
    $matches = @($Policy.Rules | Where-Object {
        [string]::Equals([string]$_.Name, $identity.Name, [StringComparison]::OrdinalIgnoreCase)
    })
    foreach ($rule in $matches) {
        if (-not [string]::Equals([string]$rule.Description, $identity.Description,
            [StringComparison]::OrdinalIgnoreCase)) {
            throw 'A firewall rule with this name belongs to another configuration. No rules were changed.'
        }
    }
    # COM removal operates by name. Refuse ambiguous entries even when their
    # descriptions match, rather than accidentally removing more than one rule.
    if ($matches.Count -gt 1) {
        throw 'Multiple firewall rules have this installation name. No rules were changed.'
    }
    if ($matches.Count -eq 1) { return $matches[0] }
}

function Test-OwnedFirewallRuleMatches {
    param([Parameter(Mandatory = $true)]$Rule,
        [Parameter(Mandatory = $true)][string]$Program,
        [Parameter(Mandatory = $true)][int]$Port)

    return ($Rule.Enabled -and [int]$Rule.Direction -eq 1 -and [int]$Rule.Action -eq 1 -and
        [int]$Rule.Protocol -eq 6 -and [int]$Rule.Profiles -eq 2 -and
        [string]::Equals([string]$Rule.ApplicationName, $Program, [StringComparison]::OrdinalIgnoreCase) -and
        [string]$Rule.LocalPorts -eq [string]$Port -and [string]$Rule.RemotePorts -eq '*' -and
        [string]$Rule.RemoteAddresses -eq 'LocalSubnet' -and [string]$Rule.LocalAddresses -eq '*' -and
        [string]$Rule.InterfaceTypes -eq 'All' -and [string]$Rule.ServiceName -eq '' -and
        -not $Rule.EdgeTraversal)
}

function Test-FirewallChangeNeedsAdmin {
    param([Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)]$State,
        $Config,
        [switch]$Remove,
        $Policy)

    $rule = Get-OwnedFirewallRule -Root $Root -State $State -Policy $Policy
    if ($Remove) { return $null -ne $rule }
    $settings = Get-ValidatedFirewallConfig -Config $Config
    if (-not $settings.Lan) { return $null -ne $rule }
    $program = Get-PrivateFirewallProgram -Root $Root -State $State
    if ($null -eq $rule) { return $true }
    return -not (Test-OwnedFirewallRuleMatches -Rule $rule -Program $program -Port $settings.Port)
}

function Set-OwnedFirewallRule {
    param([Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)]$State,
        $Config,
        [switch]$Remove,
        $Policy)

    $identity = Get-FirewallRuleIdentity -Root $Root -State $State
    if ($null -eq $Policy) { $Policy = New-Object -ComObject HNetCfg.FwPolicy2 }
    $rule = Get-OwnedFirewallRule -Root $Root -State $State -Policy $Policy
    $settings = $null
    if (-not $Remove) { $settings = Get-ValidatedFirewallConfig -Config $Config }
    if ($Remove -or -not $settings.Lan) {
        if ($null -ne $rule) { $null = $Policy.Rules.Remove($identity.Name) }
        return
    }
    $program = Get-PrivateFirewallProgram -Root $Root -State $State
    if ($null -ne $rule -and (Test-OwnedFirewallRuleMatches -Rule $rule -Program $program -Port $settings.Port)) {
        return
    }
    $existing = $null -ne $rule
    if (-not $existing) { $rule = New-Object -ComObject HNetCfg.FwRule }
    else {
        # If an update fails midway, leave access closed rather than temporarily
        # broadening the rule. Running Setup again safely retries the update.
        $rule.Enabled = $false
        if ([int]$rule.Protocol -in @(1, 58)) { $rule.IcmpTypesAndCodes = '' }
    }
    $rule.Name = $identity.Name
    $rule.Description = $identity.Description
    $rule.Grouping = 'Media Journal'
    $rule.Direction = 1
    $rule.Action = 1
    $rule.Protocol = 6
    $rule.ApplicationName = $program
    # Application rules leave the optional service restriction unset. An empty
    # service string can pass its setter but be rejected when COM adds the rule.
    if ($existing -and -not [string]::IsNullOrEmpty([string]$rule.ServiceName)) {
        $rule.ServiceName = [NullString]::Value
    }
    $rule.LocalPorts = [string]$settings.Port
    $rule.RemotePorts = '*'
    $rule.LocalAddresses = '*'
    $rule.RemoteAddresses = 'LocalSubnet'
    $rule.Profiles = 2
    $rule.InterfaceTypes = 'All'
    $rule.EdgeTraversal = $false
    $rule.Enabled = $true
    if (-not $existing) { $null = $Policy.Rules.Add($rule) }
}
