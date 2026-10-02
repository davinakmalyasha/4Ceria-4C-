<#
.SYNOPSIS
    Regenerates the PWA brand icons in public/ from the theme colours.

.DESCRIPTION
    Draws the "4C" mark at each required size and writes:
        public/pwa-192x192.png
        public/pwa-512x512.png
        public/favicon.ico   (a PNG-compressed 32px ICO entry)

    The colours are the ones declared in vite.config.ts's PWA manifest, so the
    icons and the installed-app chrome cannot drift apart silently:
        dark #09090b   (theme_color / background_color)
        red  #FF2D20   (brand accent)

    The generated files ARE committed. This script exists so they can be
    regenerated after a brand change, not so they can be built at deploy time --
    which would mean shipping a Windows-only System.Drawing dependency into a
    Linux container.

.PARAMETER ProjectRoot
    Repository root. Defaults to the parent of this script's own directory, so
    the script works from any checkout on any machine.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/generate-pwa-icons.ps1

.NOTES
    Requires Windows (System.Drawing). On other platforms the committed PNGs are
    already correct and this script is simply not applicable.
#>
param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

if (-not $ProjectRoot) {
    throw "Could not resolve the repository root from '$PSScriptRoot'. Pass -ProjectRoot explicitly."
}

$publicDir = Join-Path $ProjectRoot 'public'

if (-not (Test-Path -LiteralPath $publicDir)) {
    throw "No public/ directory at '$publicDir'. Pass -ProjectRoot <repo-root>."
}

Add-Type -AssemblyName System.Drawing

function New-BrandIcon {
    param([int]$Size)

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $dark = [System.Drawing.Color]::FromArgb(9, 9, 11)      # #09090b (app theme_color)
    $red  = [System.Drawing.Color]::FromArgb(255, 45, 32)   # #FF2D20 (brand)

    $g.Clear($dark)

    $pad = [int]($Size * 0.16)
    $box = $Size - (2 * $pad)
    $radius = [int]($Size * 0.18)
    $brushDark = New-Object System.Drawing.SolidBrush($dark)
    $brushRed  = New-Object System.Drawing.SolidBrush($red)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($pad, $pad, $radius * 2, $radius * 2, 180, 90)
    $path.AddArc($pad + $box - $radius * 2, $pad, $radius * 2, $radius * 2, 270, 90)
    $path.AddArc($pad + $box - $radius * 2, $pad + $box - $radius * 2, $radius * 2, $radius * 2, 0, 90)
    $path.AddArc($pad, $pad + $box - $radius * 2, $radius * 2, $radius * 2, 90, 90)
    $path.CloseFigure()
    $g.FillPath($brushRed, $path)

    $fontSize = [int]($Size * 0.34)
    $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $brushWhite = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.DrawString("4C", $font, $brushWhite, ([float]($Size / 2)), ([float]($Size / 2 + $Size * 0.01)), $fmt)

    $g.Dispose()
    return $bmp
}

$png192 = New-BrandIcon -Size 192
$png192.Save((Join-Path $publicDir 'pwa-192x192.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$png192.Dispose()

$png512 = New-BrandIcon -Size 512
$png512.Save((Join-Path $publicDir 'pwa-512x512.png'), [System.Drawing.Imaging.ImageFormat]::Png)

# Build a valid .ico wrapping a 32px PNG (PNG-compressed ICO entry).
$ms = New-Object System.IO.MemoryStream
$png32 = New-BrandIcon -Size 32
$pngStream = New-Object System.IO.MemoryStream
$png32.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $pngStream.ToArray()

$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0)          # reserved
$bw.Write([UInt16]1)          # type: icon
$bw.Write([UInt16]1)          # count
$bw.Write([byte]32)           # width
$bw.Write([byte]32)           # height
$bw.Write([byte]0)            # palette
$bw.Write([byte]0)            # reserved
$bw.Write([UInt16]1)          # planes
$bw.Write([UInt16]32)         # bpp
$bw.Write([UInt32]$pngBytes.Length)
$bw.Write([UInt32]22)         # offset (6 + 16)
$bw.Write($pngBytes)
$bw.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $publicDir 'favicon.ico'), $ms.ToArray())
$bw.Dispose(); $ms.Dispose(); $pngStream.Dispose(); $png32.Dispose(); $png512.Dispose()

Write-Output "generated under ${publicDir}:"

# Name the three files explicitly. `Get-ChildItem -LiteralPath <dir> -Include ...`
# only honours -Include when the path ends in a wildcard, so pairing it with
# -LiteralPath and -Recurse silently ignored the filter and printed the entire
# public/ tree -- build artifacts, service worker, every chunk.
$generated = @('pwa-192x192.png', 'pwa-512x512.png', 'favicon.ico')

foreach ($name in $generated) {
    $item = Get-Item -LiteralPath (Join-Path $publicDir $name) -ErrorAction SilentlyContinue

    if ($item) {
        "  {0} - {1} bytes" -f $item.Name, $item.Length
    } else {
        "  {0} - MISSING" -f $name
    }
}
