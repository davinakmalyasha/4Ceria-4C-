param([string]$ProjectRoot = "C:\laragon\www\4C-Web")

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
$png192.Save((Join-Path $ProjectRoot "public\pwa-192x192.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$png192.Dispose()

$png512 = New-BrandIcon -Size 512
$png512.Save((Join-Path $ProjectRoot "public\pwa-512x512.png"), [System.Drawing.Imaging.ImageFormat]::Png)

# Build a valid .ico wrapping the 512 png scaled to 32px (PNG-compressed ICO entry)
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
[System.IO.File]::WriteAllBytes((Join-Path $ProjectRoot "public\favicon.ico"), $ms.ToArray())
$bw.Dispose(); $ms.Dispose(); $pngStream.Dispose(); $png32.Dispose(); $png512.Dispose()

Write-Output "generated:"
Get-ChildItem (Join-Path $ProjectRoot "public") -Include "pwa-*.png","favicon.ico" -Recurse | ForEach-Object { "$($_.Name) - $($_.Length) bytes" }
