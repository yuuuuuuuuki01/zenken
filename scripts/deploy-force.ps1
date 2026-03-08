# deploy-force.ps1
# 実行方法: .\scripts\deploy-force.ps1

$ErrorActionPreference = "Stop"
$projectName = "gigacompute-fleet"
$root = Get-Location
$serverDir = "$root\server"
$distDir = "$serverDir\dist"
$publicDistDir = "$distDir\public"
$sourcePublicDir = "$serverDir\public"
$viewsDir = "$serverDir\views"
$distViewsDir = "$distDir\views"

# 1. タイムスタンプ（ハッシュ代わり）の生成
$hash = Get-Date -Format "yyyyMMddHHmmss"
Write-Host "--- Using Build Hash: $hash ---" -ForegroundColor Cyan

# 2. クリーンアップ
Write-Host "--- Cleaning up old dist directory ---"
if (Test-Path $distDir) {
    Remove-Item -Recurse -Force $distDir
}

# 3. サーバーのフルビルド
Write-Host "--- Building Server (Full Build) ---"
Set-Location $serverDir
npm run build
Set-Location $root

# 4. 公開ディレクトリの準備とハッシュ付与 (Cache Busting)
Write-Host "--- Preparing public files & views with Cache Busting ---"
New-Item -ItemType Directory -Force $publicDistDir | Out-Null
Get-ChildItem -Path $sourcePublicDir | Where-Object { $_.Name -ne "downloads" } | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $publicDistDir -Recurse -Force
}

# Viewsディレクトリのコピー（Functions配備用）
New-Item -ItemType Directory -Force $distViewsDir | Out-Null
Copy-Item -Path "$viewsDir\*" -Destination $distViewsDir -Recurse -Force

$portals = @("admin", "client-portal", "worker-portal")
foreach ($portal in $portals) {
    $dir = "$publicDistDir\$portal"
    if (Test-Path $dir) {
        Write-Host "  Processing $portal..."
        
        # JSファイル名の変更
        if (Test-Path "$dir\app.js") {
            Rename-Item "$dir\app.js" "app.$hash.js"
        }
        if (Test-Path "$dir\js\login.js") {
            Rename-Item "$dir\js\login.js" "login.$hash.js"
        }
        if (Test-Path "$dir\js\dashboard.js") {
            Rename-Item "$dir\js\dashboard.js" "dashboard.$hash.js"
        }
        # CSSファイル名の変更
        if (Test-Path "$dir\style.css") {
            Rename-Item "$dir\style.css" "style.$hash.css"
        }
        
        # HTML内の参照を更新
        if (Test-Path "$dir\index.html") {
            $content = Get-Content "$dir\index.html" -Raw -Encoding UTF8
            # Use regex to replace app.*.js and style.*.css with the new hashed versions
            $content = $content -replace 'src="app(\.[a-zA-Z0-9]+)?\.js"', "src=`"app.$hash.js`""
            $content = $content -replace 'src="js/login(\.[a-zA-Z0-9]+)?\.js"', "src=`"js/login.$hash.js`""
            $content = $content -replace 'href="style(\.[a-zA-Z0-9]+)?\.css"', "href=`"style.$hash.css`""
            $content | Set-Content "$dir\index.html" -Encoding UTF8
        }
        
    }
}

# サーバーサイドテンプレート(EJS)内の参照を更新 (client-portal用アセット)
if (Test-Path "$distViewsDir\dashboard.ejs") {
    $content = Get-Content "$distViewsDir\dashboard.ejs" -Raw -Encoding UTF8
    $content = $content -replace 'src="/?client-portal/js/dashboard(\.[a-zA-Z0-9]+)?\.js"', "src=`"/client-portal/js/dashboard.$hash.js`""
    $content = $content -replace 'href="/?client-portal/style(\.[a-zA-Z0-9]+)?\.css"', "href=`"/client-portal/style.$hash.css`""
    $content | Set-Content "$distViewsDir\dashboard.ejs" -Encoding UTF8
}

# サーバーサイドテンプレート(EJS)内の参照を更新 (worker-dashboard.ejs用アセット)
if (Test-Path "$distViewsDir\worker-dashboard.ejs") {
    $content = Get-Content "$distViewsDir\worker-dashboard.ejs" -Raw -Encoding UTF8
    # worker-dashboard.ejs は /worker-portal/style.css などを参照している
    $content = $content -replace 'href="/?worker-portal/style(\.[a-zA-Z0-9]+)?\.css"', "href=`"/worker-portal/style.$hash.css`""
    # Missing fix: use href instead of src for css
    $content = $content -replace 'src="/worker-portal/style\.[a-zA-Z0-9]+\.css"', "href=`"/worker-portal/style.$hash.css`""
    $content | Set-Content "$distViewsDir\worker-dashboard.ejs" -Encoding UTF8
}

# 5. デプロイの実行
Write-Host "--- Deploying to Firebase ---" -ForegroundColor Green
firebase deploy --only "hosting,functions" --project $projectName

Write-Host "`nSuccessfully deployed with clean build and cache busting!" -ForegroundColor Green
