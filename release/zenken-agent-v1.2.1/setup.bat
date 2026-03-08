@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title ZEN KEN Agent Setup v1.2.1

echo ==========================================
echo   ZEN KEN Agent (Windows)
echo   Version: v1.2.1
echo ==========================================
echo.

set "DEFAULT_DIR=%USERPROFILE%\ZEN KEN"
echo [INFO] Default installation directory:
echo !DEFAULT_DIR!
echo.
set /p "INSTALL_DIR=Enter installation path (Press Enter for default): "

if "!INSTALL_DIR!"=="" set "INSTALL_DIR=!DEFAULT_DIR!"

echo.
echo [1/3] Preparing directory: !INSTALL_DIR!
if not exist "!INSTALL_DIR!" mkdir "!INSTALL_DIR!"

echo [2/3] Copying files...
xcopy /E /I /Y /Q "%~dp0*" "!INSTALL_DIR!"

echo [3/3] Creating Desktop shortcut (ZEN KEN Agent)...
set "TARGET_BAT=!INSTALL_DIR!\start.bat"
set "ICON_PATH=!INSTALL_DIR!\branding\icon.png"
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\ZEN KEN Agent.lnk"

:: Create shortcut via PowerShell to support Icon and WorkingDir
powershell -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT_PATH%');$s.TargetPath='%TARGET_BAT%';$s.WorkingDirectory='!INSTALL_DIR!';$s.Description='ZEN KEN Agent Cockpit';$s.IconLocation='%ICON_PATH%';$s.Save()"

if %ERRORLEVEL% equ 0 (
    echo [OK] Shortcut 'ZEN KEN Agent' created on Desktop.
) else (
    echo [WARNING] Failed to create shortcut.
)

echo.
echo ==========================================
2: echo   Setup Complete!
echo ==========================================
echo Installation path: !INSTALL_DIR!
echo.
echo [TIPS]
echo 1. デスクトップに作成された 'ZEN KEN Agent' をダブルクリックして起動してください。
echo 2. 初回起動時はブラウザ（Edge/Chrome）が「アプリモード（ツールバーなし）」で開きます。
echo.
echo 準備が整いました。このウィンドウを閉じてエージェントを開始してください。
echo.
pause
