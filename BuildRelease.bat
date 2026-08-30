@echo off
REM ============================================================
REM  Personal-Hub -- Release APK Build Script
REM  Runs typecheck + lint, then assembles the Android release APK.
REM  Output: android\app\build\outputs\apk\release\app-release.apk
REM ============================================================
setlocal enabledelayedexpansion

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

echo [1/3] TypeScript typecheck...
call npx tsc --noEmit
if errorlevel 1 (
    echo.
    echo *** Typoecheck failed. Aborting. ***
    exit /b 1
)

echo.
echo [2/3] ESLint...
call npx expo lint
if errorlevel 1 (
    echo.
    echo *** Lint failed. Aborting. ***
    exit /b 1
)

echo.
echo [3/3] Building release APK via Gradle...
cd /d "%PROJECT_DIR%android"
call gradlew :app:assembleRelease --no-daemon
if errorlevel 1 (
    echo.
    echo *** APK build failed. ***
    exit /b 1
)

echo.
echo === BUILD SUCCESS ===
for /f "delims=" %%f in ('dir /b "%PROJECT_DIR%android\app\build\outputs\apk\release\*.apk" 2^>nul') do set "APK_NAME=%%f"
if not defined APK_NAME set "APK_NAME=app-release.apk"
echo Release APK:
echo   "%PROJECT_DIR%android\app\build\outputs\apk\release\%APK_NAME%"
echo.
echo Install on device/emulator:
echo   adb install -r "%PROJECT_DIR%android\app\build\outputs\apk\release\%APK_NAME%"
endlocal
