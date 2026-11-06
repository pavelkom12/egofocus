Describe 'EgoFocus backup verification' {
    BeforeEach { . "$PSScriptRoot/ManageProduction.ps1" }
    It 'verifies a complete backup and rejects corruption' {
        $root = Join-Path $TestDrive 'backup'
        New-Item -ItemType Directory $root | Out-Null
        Set-Content "$root/database.dump" 'test-dump'
        Set-Content "$root/inventory.json" '{"formatVersion":1,"project":"egofocus-production","stamp":"20261106T120000Z"}'
        $lines = foreach ($file in @('database.dump','inventory.json')) {
            "$((Get-FileHash "$root/$file").Hash.ToLowerInvariant())  $file"
        }
        Set-Content "$root/SHA256SUMS" $lines
        (Assert-Backup $root).project | Should Be 'egofocus-production'
        Add-Content "$root/database.dump" 'corrupt'
        { Assert-Backup $root } | Should Throw 'Checksum mismatch'
    }
    It 'rejects incomplete and unsafe checksum lists' {
        $root = Join-Path $TestDrive 'unsafe'
        New-Item -ItemType Directory $root | Out-Null
        Set-Content "$root/SHA256SUMS" 'bad'
        { Assert-Backup $root } | Should Throw 'Expected two'
        Set-Content "$root/SHA256SUMS" @('bad ../database.dump','bad inventory.json')
        { Assert-Backup $root } | Should Throw 'Invalid checksum'
    }
}
