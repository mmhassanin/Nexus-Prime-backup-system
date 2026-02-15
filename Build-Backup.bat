@echo off
:: setlocal ensures any variables created here are destroyed when the window closes!
setlocal

title Nexus Smart Backup - Secure Builder 🛡️
color 0b

:start
cls
echo ==========================================
echo    NEXUS BACKUP - SECURE DEPLOYMENT
echo ==========================================
echo.
echo [1] Build Local Only (No GitHub Upload)
echo [2] Build and Publish to GitHub (Requires Token)
echo.
set /p CHOICE="Choose an option (1 or 2): "

if "%CHOICE%"=="1" goto build_local
if "%CHOICE%"=="2" goto build_publish
goto start

:build_local
echo.
echo [1/2] Cleaning old build files...
if exist "dist-build" rmdir /s /q "dist-build"
echo [2/2] Building the Portable Application locally...
call npm run build
goto finish

:build_publish
echo.
echo ==========================================
echo ⚠️ SECURE MODE: Your token will NOT be saved to the disk.
echo It will be destroyed from memory immediately after publishing.
echo ==========================================
set /p GH_TOKEN="Paste your GitHub Token here (Right-click to paste) and press Enter: "
echo.
echo [1/2] Cleaning old build files...
if exist "dist-build" rmdir /s /q "dist-build"
echo [2/2] Building and Publishing to GitHub...
call npm run publish-release
goto finish

:finish
echo.
echo ==========================================
if %ERRORLEVEL% EQU 0 (
    color 0a
    echo [V] OPERATION SUCCESSFUL! 
) else (
    color 0c
    echo [X] OPERATION FAILED! Error Code: %ERRORLEVEL%
)
echo ==========================================
echo.
echo Press any key to close securely and wipe memory.
pause >nul
endlocal
exit