$ErrorActionPreference = "Stop"
$hash = Get-Date -Format "yyyyMMddHHmmss"
$publicDistDir = "c:\agent\gigacompute\server\dist\public"
$sourcePublicDir = "c:\agent\gigacompute\server\public"

Write-Host "--- Clean Build and Hash Assets ($hash) ---"

# 1. Clear directories
if (Test-Path $publicDistDir) {
    Remove-Item -Recurse -Force $publicDistDir
}
New-Item -ItemType Directory -Force $publicDistDir | Out-Null
Copy-Item -Path "$sourcePublicDir\*" -Destination $publicDistDir -Recurse -Force

# 2. Hash function using UTF8 WITHOUT BOM
function Add-HashToAssets($targetPath) {
    if (-not (Test-Path $targetPath)) { return }
    Write-Host "  Processing $targetPath..."
    
    # Rename JS/CSS
    Get-ChildItem -Path $targetPath -File | ForEach-Object {
        if ($_.Extension -eq ".js" -or $_.Extension -eq ".css") {
            if ($_.Name -notlike "*.*.*") {
                $newName = "$($_.BaseName).$hash$($_.Extension)"
                Rename-Item $_.FullName $newName -Force
            }
        }
    }

    # Update HTML references
    $utf8NoBOM = New-Object System.Text.UTF8Encoding($false)
    Get-ChildItem -Path $targetPath -File -Filter "*.html" | ForEach-Object {
        $content = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
        
        $content = $content -replace 'src="app\.js"', "src=`"app.$hash.js`""
        $content = $content -replace "src='app\.js'", "src='app.$hash.js'"
        $content = $content -replace 'href="style\.css"', "href=`"style.$hash.css`""
        $content = $content -replace "href='style\.css'", "href='style.$hash.css'"
        
        [System.IO.File]::WriteAllText($_.FullName, $content, $utf8NoBOM)
    }
}

# 3. Execution
Add-HashToAssets $publicDistDir
$allDirs = Get-ChildItem -Path $publicDistDir -Directory -Recurse
foreach ($d in $allDirs) {
    Add-HashToAssets $d.FullName
}

Write-Host "Success: $hash"
