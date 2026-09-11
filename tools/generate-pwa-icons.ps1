# Generates the PWA/push icons for the customer app: a white medical cross
# on the brand navy. Overwrites the old 70-byte placeholder PNGs.
# Run from the repo root: powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/generate-pwa-icons.ps1
Add-Type -AssemblyName System.Drawing

function New-ApoloIcon([int]$Size, [string]$Path) {
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    $navy  = [System.Drawing.Color]::FromArgb(0x14, 0x1B, 0x5E)
    $g.Clear($navy)

    # Centered cross kept inside the maskable safe zone (~60% of canvas).
    $bar = [int]($Size * 0.20)
    $len = [int]($Size * 0.60)
    $mid = [int](($Size - $bar) / 2)
    $off = [int](($Size - $len) / 2)

    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillRectangle($brush, $mid, $off, $bar, $len)
    $g.FillRectangle($brush, $off, $mid, $len, $bar)

    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $brush.Dispose()
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "wrote $Path ($Size x $Size)"
}

New-ApoloIcon 192 "public/customer-app/icon-192x192.png"
New-ApoloIcon 512 "public/customer-app/icon-512x512.png"
New-ApoloIcon 72  "public/customer-app/badge-72x72.png"
New-ApoloIcon 180 "public/customer-app/apple-touch-icon.png"
