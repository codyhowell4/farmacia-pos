# Resizes the brand master logo (public/brand/apolo-logo.png) into every
# icon slot used by the main site and the customer-app PWA.
# Run from the repo root:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/generate-pwa-icons.ps1
Add-Type -AssemblyName System.Drawing

$master = "public/brand/apolo-logo.png"
if (-not (Test-Path $master)) { throw "Master logo not found: $master" }

function Resize-Logo([int]$Size, [string]$OutPath) {
    $src = [System.Drawing.Image]::FromFile((Resolve-Path $master))
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $Size, $Size)
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    $src.Dispose()
    Write-Output "wrote $OutPath ($Size x $Size)"
}

Resize-Logo 32  "public/favicon-32x32.png"
Resize-Logo 192 "public/customer-app/icon-192x192.png"
Resize-Logo 512 "public/customer-app/icon-512x512.png"
Resize-Logo 180 "public/customer-app/apple-touch-icon.png"
