# Generate Android launcher padding from the committed original artwork.
node (Join-Path $PSScriptRoot 'generate-icons.cjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
