# Render the app's simple vector mark with Windows GDI+. Assets are committed,
# so this is only needed when changing the mark, not for normal builds.
Add-Type -AssemblyName System.Drawing
$dhikrAssetDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../assets'))
foreach ($dhikrKind in @('icon', 'adaptive-icon', 'monochrome-icon')) {
    $dhikrBitmap = [System.Drawing.Bitmap]::new(1024, 1024)
    $dhikrGraphics = [System.Drawing.Graphics]::FromImage($dhikrBitmap)
    $dhikrGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $dhikrGraphics.Clear([System.Drawing.Color]::Transparent)
    if ($dhikrKind -eq 'icon') {
        $dhikrGraphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#080F2E'))
    }
    $dhikrColor = if ($dhikrKind -eq 'monochrome-icon') { [System.Drawing.Color]::Black } else { [System.Drawing.ColorTranslator]::FromHtml('#71C5F2') }
    $dhikrPen = [System.Drawing.Pen]::new($dhikrColor, 28)
    $dhikrBrush = [System.Drawing.SolidBrush]::new($dhikrColor)
    $dhikrMark = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $dhikrMark.AddBezier(512, 312, 536, 440, 584, 488, 712, 512)
    $dhikrMark.AddBezier(712, 512, 584, 536, 536, 584, 512, 712)
    $dhikrMark.AddBezier(512, 712, 488, 584, 440, 536, 312, 512)
    $dhikrMark.AddBezier(312, 512, 440, 488, 488, 440, 512, 312)
    $dhikrMark.CloseFigure()
    $dhikrGraphics.DrawEllipse($dhikrPen, 252, 252, 520, 520)
    $dhikrGraphics.FillPath($dhikrBrush, $dhikrMark)
    $dhikrBitmap.Save((Join-Path $dhikrAssetDirectory "$dhikrKind.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $dhikrMark.Dispose()
    $dhikrBrush.Dispose()
    $dhikrPen.Dispose()
    $dhikrGraphics.Dispose()
    $dhikrBitmap.Dispose()
}
