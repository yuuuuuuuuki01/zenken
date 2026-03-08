@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"
title ZEN KEN Agent v1.2.1

echo ==========================================
echo   ZEN KEN Agent (Windows)
echo   Version: v1.2.1
echo ==========================================
echo.

:: Check for Node.js
where node >nul 2>nul
if !ERRORLEVEL! equ 0 (
    echo [OK] Node.js is already installed.
    goto :start_agent
)

echo [INFO] Node.js was not found.
echo Node.js (v18+) is required to run the agent.
echo Would you like to download and install it automatically?
echo.
set /p user_input="Install now? [Y/N]: "

if /I "!user_input!" neq "Y" (
    echo.
    echo Installation cancelled.
    echo Please install manually from https://nodejs.org/
    pause
    exit /b 1
)

echo.
echo [1/2] Downloading Node.js installer...
set "NODE_MSI=%TEMP%\node_installer.msi"
powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi' -OutFile '%NODE_MSI%'"

if not exist "%NODE_MSI%" (
    echo [ERROR] Download failed.
    pause
    exit /b 1
)

echo [2/2] Installing Node.js... (Admin prompt may appear)
msiexec /i "%NODE_MSI%" /quiet /norestart

echo.
echo Installation complete. Refreshing environment...
:: Manual path refresh
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
set "PATH=!SYS_PATH!;!USR_PATH!;!PATH!"

where node >nul 2>nul
if !ERRORLEVEL! neq 0 (
    echo.
    echo [WARNING] Node.js was installed but path is not yet active.
    echo Please CLOSE this window and run start.bat again.
    pause
    exit /b 0
)

echo.
echo [OK] Node.js setup complete!
echo.

:start_agent
echo [INFO] Installing dependencies...
call npm install --omit=dev --silent

echo.
echo [ZEN KEN] Starting agent...
node provider/backend/index.js
if !ERRORLEVEL! neq 0 (
    echo.
    echo [ERROR] Agent exited with an error.
)
pause
