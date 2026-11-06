[CmdletBinding()]
param(
    [ValidateSet('Deploy','Bootstrap','Backup','Restore','Status','Logs','Health','Start','Stop')]
    [string]$Action = 'Status',
    [string]$Server,
    [string]$SshKey,
    [string]$BackupDirectory,
    [string]$BackupRoot = 'F:\Backups\egofocus',
    [string]$ProductionEnv,
    [string]$GitHubDeployKey,
    [string]$BackupPublicKey,
    [switch]$ConfirmReplace
)
$ErrorActionPreference = 'Stop'

function Invoke-Native([string]$File, [string[]]$Arguments) {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File failed (exit $LASTEXITCODE)" }
}
function Invoke-Captured([string]$File, [string[]]$Arguments) {
    $result = @(& $File @Arguments)
    if ($LASTEXITCODE -ne 0) { throw "$File failed (exit $LASTEXITCODE)" }
    return ($result -join "`n").Trim()
}
function Assert-Backup([string]$Directory) {
    $lines = @(Get-Content -LiteralPath (Join-Path $Directory 'SHA256SUMS'))
    if ($lines.Count -ne 2) { throw 'Expected two backup checksums' }
    $seen = @()
    foreach ($line in $lines) {
        if ($line -notmatch '^([a-f0-9]{64})  (database\.dump|inventory\.json)$') { throw 'Invalid checksum entry' }
        $hash = $Matches[1]; $name = $Matches[2]
        if ($name -in $seen) { throw 'Duplicate checksum entry' }
        $seen += $name
        if ((Get-FileHash -LiteralPath (Join-Path $Directory $name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) {
            throw "Checksum mismatch: $name"
        }
    }
    $inventory = Get-Content -Raw -LiteralPath (Join-Path $Directory 'inventory.json') | ConvertFrom-Json
    if ($inventory.formatVersion -ne 1 -or $inventory.project -ne 'egofocus-production' -or $inventory.stamp -notmatch '^\d{8}T\d{6}Z$') {
        throw 'Invalid backup inventory'
    }
    return $inventory
}

function Invoke-Production {
    $target = Import-PowerShellDataFile (Join-Path $PSScriptRoot 'production-target.psd1')
    if (-not $Server) { $Server = $target.HostName }
    if ($Server -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]*$') { throw 'Invalid server' }
    $user = if ($Action -eq 'Backup') { $target.BackupUser } else { $target.DeployUser }
    if ($user -notmatch '^[a-z_][a-z0-9_-]*$') { throw 'Invalid SSH user' }
    if (-not $SshKey) {
        $keyName = if ($Action -eq 'Backup') { 'egofocus_vps_backup' } else { 'ego_vps_admin' }
        $SshKey = Join-Path $env:USERPROFILE ".ssh\$keyName"
    }
    if (-not (Test-Path -LiteralPath $SshKey -PathType Leaf)) { throw "Missing SSH key: $SshKey" }
    $sshOptions = @('-i', $SshKey, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes')
    $destination = "$user@$Server"
    $repository = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
    switch ($Action) {
        'Deploy' {
            $branch = Invoke-Captured git.exe @('-C', $repository, 'branch', '--show-current')
            if ($branch -ne $target.Branch) { throw "Deploy from $($target.Branch)" }
            if (Invoke-Captured git.exe @('-C', $repository, 'status', '--porcelain')) { throw 'Commit the intended changes before deployment' }
            $commit = Invoke-Captured git.exe @('-C', $repository, 'rev-parse', 'HEAD')
            Invoke-Native git.exe @('-C', $repository, 'push', 'origin', $target.Branch)
            # Candidate agent из отправленного commit обновляет поведение текущего запуска.
            $temporary = Join-Path ([IO.Path]::GetTempPath()) "egofocus-$([guid]::NewGuid().ToString('N')).sh"
            $remote = "/tmp/egofocus-deploy-$commit"
            try {
                $body = Invoke-Captured git.exe @('-C', $repository, 'show', "${commit}:scripts/production/Production.sh")
                [IO.File]::WriteAllText($temporary, $body.Replace("`r`n", "`n") + "`n", [Text.UTF8Encoding]::new($false))
                Invoke-Native scp.exe ($sshOptions + @($temporary, "${destination}:$remote"))
                Invoke-Native ssh.exe ($sshOptions + @($destination, "chmod 0700 $remote && $remote deploy"))
                $actual = Invoke-Captured ssh.exe ($sshOptions + @($destination, 'cat /var/lib/egofocus-deploy/deployed-commit'))
                $checkout = Invoke-Captured ssh.exe ($sshOptions + @($destination, 'git -C /opt/egofocus rev-parse HEAD'))
                if ($actual -ne $commit -or $checkout -ne $commit) { throw 'Deployed commit mismatch' }
                Invoke-Native curl.exe @('--fail','--silent','--show-error','--max-time','30','--connect-to',"$($target.DomainName):443:${Server}:443",$target.HealthUrl)
                Write-Host "Deployed $commit"
            } finally {
                if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
                & ssh.exe @sshOptions $destination "rm -f -- $remote"
            }
        }
        'Bootstrap' {
            foreach ($path in @($ProductionEnv, $GitHubDeployKey, $BackupPublicKey)) {
                if (-not $path -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Supply ProductionEnv, GitHubDeployKey and BackupPublicKey' }
            }
            if (Invoke-Captured git.exe @('-C', $repository, 'status', '--porcelain')) { throw 'Commit changes before bootstrap' }
            $commit = Invoke-Captured git.exe @('-C', $repository, 'rev-parse', 'HEAD')
            $remoteHead = Invoke-Captured git.exe @('-C', $repository, 'ls-remote','origin',"refs/heads/$($target.Branch)")
            if (($remoteHead -split '\s+')[0] -ne $commit) { throw 'Push the bootstrap commit first' }
            $id = [guid]::NewGuid().ToString('N')
            $remote = "/tmp/egofocus-bootstrap-$id"
            $bundle = Join-Path ([IO.Path]::GetTempPath()) "egofocus-$id.tar"
            try {
                Invoke-Native git.exe @('-C',$repository,'archive','--format=tar',"--output=$bundle",$commit,'scripts/production')
                Invoke-Native ssh.exe ($sshOptions + @($destination,"install -d -m 0700 $remote"))
                Invoke-Native scp.exe ($sshOptions + @($bundle,"${destination}:$remote/bundle.tar"))
                Invoke-Native scp.exe ($sshOptions + @($ProductionEnv,"${destination}:$remote/production.env"))
                Invoke-Native scp.exe ($sshOptions + @($GitHubDeployKey,"${destination}:$remote/deploy-key"))
                Invoke-Native scp.exe ($sshOptions + @($BackupPublicKey,"${destination}:$remote/backup.pub"))
                $command = "set -eu; test ! -e /etc/egofocus/production.env; test ! -e /root/.ssh/egofocus_github_deploy; install -d -m 0700 /etc/egofocus /root/.ssh; install -m 0600 $remote/production.env /etc/egofocus/production.env; install -m 0600 $remote/deploy-key /root/.ssh/egofocus_github_deploy; tar -xf $remote/bundle.tar -C $remote; EGOFOCUS_BACKUP_PUBLIC_KEY=$remote/backup.pub bash $remote/scripts/production/Bootstrap.sh"
                Invoke-Native ssh.exe ($sshOptions + @($destination,$command))
            } finally {
                if (Test-Path -LiteralPath $bundle) { Remove-Item -LiteralPath $bundle -Force }
                & ssh.exe @sshOptions $destination "rm -rf -- $remote"
            }
        }
        'Backup' {
            $stamp = Invoke-Captured ssh.exe ($sshOptions + @($destination,'sudo /usr/local/sbin/egofocus backup'))
            if ($stamp -notmatch '^\d{8}T\d{6}Z$') { throw 'Invalid server backup identifier' }
            New-Item -ItemType Directory -Force $BackupRoot | Out-Null
            $stage = Join-Path $BackupRoot ".partial-$([guid]::NewGuid().ToString('N'))"
            $final = Join-Path $BackupRoot $stamp
            if (Test-Path -LiteralPath $final) { throw 'Local backup already exists' }
            New-Item -ItemType Directory $stage | Out-Null
            foreach ($file in @('database.dump','inventory.json','SHA256SUMS')) {
                Invoke-Native scp.exe ($sshOptions + @("${destination}:/var/backups/egofocus/$stamp/$file",(Join-Path $stage $file)))
            }
            Assert-Backup $stage | Out-Null
            Move-Item -LiteralPath $stage -Destination $final
            Write-Host "Verified backup: $final"
        }
        'Restore' {
            if (-not $ConfirmReplace) { throw 'Restore replaces EgoFocus data. Supply -ConfirmReplace' }
            $inventory = Assert-Backup $BackupDirectory
            $remote = "/var/backups/egofocus/restore/$($inventory.stamp)-$([guid]::NewGuid().ToString('N'))"
            Invoke-Native ssh.exe ($sshOptions + @($destination,"install -d -m 0700 $remote"))
            foreach ($file in @('database.dump','inventory.json','SHA256SUMS')) {
                Invoke-Native scp.exe ($sshOptions + @((Join-Path $BackupDirectory $file),"${destination}:$remote/$file"))
            }
            Invoke-Native ssh.exe ($sshOptions + @($destination,"/usr/local/sbin/egofocus restore $remote REPLACE_EGOFOCUS_PRODUCTION"))
        }
        default {
            Invoke-Native ssh.exe ($sshOptions + @($destination,"/usr/local/sbin/egofocus $($Action.ToLowerInvariant())"))
        }
    }
}
if ($MyInvocation.InvocationName -ne '.') { Invoke-Production }
