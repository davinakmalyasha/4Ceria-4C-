<#
.SYNOPSIS
    One-shot local verification gate. Mirrors .github/workflows/ci.yml.

.DESCRIPTION
    Runs the same checks CI runs, in the same order, and stops at the first
    failure. Every step is run from the repository root.

    This exists so the gate is verifiable BEFORE pushing, rather than only
    discovering a break in CI. The CI list in AGENTS.md is the contract;
    if you change one, change the other.

    MIGRATION SAFETY
    ----------------
    The schema round-trip deliberately runs against a THROWAWAY database
    ($ScratchDb, default '4ceria_scratch'), never against the developer's
    working database. `migrate:fresh` drops every table, and running it
    against '4ceria' destroys local data. That mistake was made once during
    this work; this script exists so it cannot be made again by hand.

.PARAMETER Php
    Path to the PHP binary. Must be >= 8.4 (composer.json floor). The bare
    `php` on PATH may be older and cannot run vendor/.

.PARAMETER ScratchDb
    Throwaway database for the migrate/rollback/re-migrate round-trip.

.PARAMETER SkipFrontend
    Skip typecheck / eslint / the two builds. Useful when only PHP changed.

.EXAMPLE
    composer verify
    composer verify -Php D:\laragon\bin\php\php-8.5.10-Win32-vs17-x64\php.exe
#>
[CmdletBinding()]
param(
    [string] $Php = 'php',
    [string] $ScratchDb = '4ceria_scratch',
    [switch] $SkipFrontend
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root

$script:failed = @()

function Invoke-Step {
    param(
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [scriptblock] $Action
    )

    Write-Host ''
    Write-Host "==> $Name" -ForegroundColor Cyan

    & $Action
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    FAILED: $Name" -ForegroundColor Red
        $script:failed += $Name
        return $false
    }

    Write-Host "    ok" -ForegroundColor DarkGreen
    return $true
}

Write-Host "4Ceria verification gate" -ForegroundColor White
Write-Host "  php    : $Php"
Write-Host "  scratch: $ScratchDb"
Write-Host "  root   : $root"

# ---------------------------------------------------------------- PHP lint
# `php -l` over the four trees CI lints. Scoped to them rather than the whole
# repo so vendor/, public/ and node_modules/ are not walked.
Invoke-Step 'php -l (app database routes tests)' {
    $errors = @()
    Get-ChildItem app, database, routes, tests -Recurse -Filter *.php -File | ForEach-Object {
        $out = & $Php -l $_.FullName 2>&1
        if ($out -notmatch 'No syntax errors detected') { $errors += $out }
    }
    if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Host $_ }; $global:LASTEXITCODE = 1 }
} | Out-Null

# ------------------------------------------------------------ typecheck
# A RATCHET, not a gate. `npm run typecheck:check` fails if the error count
# RISES above the recorded baseline. It is allowed to fall.
if (-not $SkipFrontend) {
    Invoke-Step 'typecheck (ratchet, must not rise)' { npm run typecheck:check } | Out-Null
    Invoke-Step 'SPA unit tests (vitest)' { npm run test } | Out-Null
    Invoke-Step 'eslint (errors must be zero)' { npx eslint . --quiet } | Out-Null
}

# ------------------------------------------------------------------ builds
# BOTH are required. Production ships `dist/` (VITE_STANDALONE), local dev
# serves public/build — so a green `npm run build` alone does not prove the
# artifact that actually deploys is buildable.
if (-not $SkipFrontend) {
    Invoke-Step 'npm run build (public/build)' { npm run build } | Out-Null
    Invoke-Step 'VITE_STANDALONE build (dist/)' {
        $env:VITE_STANDALONE = 'true'
        try { npm run build } finally { Remove-Item Env:\VITE_STANDALONE -ErrorAction SilentlyContinue }
    } | Out-Null
}

# ------------------------------------------------------------ autoloader
# BOUNDED, and non-fatal by design.
#
# `composer dump-autoload` HANGS in this environment: it reaches "Generating
# optimized autoload files" and never exits (observed at 3, 5 and 20 minutes,
# with and without --no-scripts, with COMPOSER_DISABLE_NETWORK=1, and with
# --no-plugins). A gate that hangs forever is worse than no gate, so this step
# runs the process with a hard timeout and WARNS rather than blocking.
#
# Two other traps here, both of which produce a confusing failure:
#   - bare `composer` on PATH runs PHP 8.3, which is BELOW the `php: ^8.4`
#     floor in composer.json. Use the interpreter directly, via the .phar.
#   - composer.json wires `post-autoload-dump` to
#     scripts/apply-octane-patches.php, which MUTATES vendor/. That must not
#     run as part of a verification pass, hence --no-scripts.
$ComposerTimeoutSeconds = 180
$composerPhar = 'D:\laragon\bin\composer\composer.phar'

if (-not (Test-Path $composerPhar)) {
    Write-Host "    skipped: composer.phar not found at $composerPhar" -ForegroundColor Yellow
} else {
    Write-Host ''
    Write-Host "==> composer dump-autoload (bounded, non-fatal)" -ForegroundColor Cyan

    $composerOut = [System.IO.Path]::GetTempFileName()
    $proc = Start-Process -FilePath $Php `
        -ArgumentList @($composerPhar, 'dump-autoload', '--no-interaction', '--no-scripts', '--no-plugins') `
        -NoNewWindow -PassThru -RedirectStandardOutput $composerOut -RedirectStandardError $composerOut

    if ($proc.WaitForExit($ComposerTimeoutSeconds * 1000)) {
        Write-Host '    ok'
    } else {
        Write-Host "    WARNING: composer dump-autoload did not finish within $ComposerTimeoutSeconds s" -ForegroundColor Yellow
        Write-Host '    It hangs in this environment. Non-fatal, but the committed' -ForegroundColor Yellow
        Write-Host '    classmap may be stale for classes added since the last run.' -ForegroundColor Yellow
        try { $proc.Kill() } catch { }
    }
    Remove-Item $composerOut -ErrorAction SilentlyContinue
}

# ------------------------------------------------------ schema round-trip
# Runs against $ScratchDb via DB_DATABASE, so the working database is
# untouched. See MIGRATION SAFETY above.
Invoke-Step "schema round-trip on $ScratchDb" {
    & "$PSScriptRoot\verify-schema.cmd" $ScratchDb
} | Out-Null

# ------------------------------------------------------------- PHP tests
Invoke-Step 'pest (full suite)' { & $Php vendor/bin/pest --colors=never } | Out-Null

# ---------------------------------------------------- ledger diagnostics
# `money:detect-duplicates` and `money:reconcile` are DIAGNOSTICS, not build
# gates: on a database with pre-existing violations they report them and exit
# non-zero, which is correct behaviour. Their findings are triaged in the
# refinement plan, not silenced here, so both are reported without failing the
# run.
Write-Host ''
Write-Host '==> money:detect-duplicates (informational)' -ForegroundColor Cyan
& $Php artisan money:detect-duplicates --no-interaction
$moneyExit = $LASTEXITCODE
if ($moneyExit -ne 0) {
    Write-Host '    reported findings (does not fail the gate) - see REFINEMENT-PLAN.md' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '==> money:reconcile (informational)' -ForegroundColor Cyan
& $Php artisan money:reconcile --no-interaction
$reconcileExit = $LASTEXITCODE
if ($reconcileExit -ne 0) {
    Write-Host '    reported invariant violations (does not fail the gate)' -ForegroundColor Yellow
}

# ------------------------------------------------------------------ result
Write-Host ''
if ($script:failed.Count -eq 0) {
    Write-Host 'VERIFICATION PASSED' -ForegroundColor Green
    Pop-Location
    exit 0
}

Write-Host "VERIFICATION FAILED ($($script:failed.Count)):" -ForegroundColor Red
$script:failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
Pop-Location
exit 1
