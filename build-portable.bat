@echo off
REM Builds release\SimpleMarkdown-<version>-portable.exe
REM Usage:  build-portable.bat            (tests + type checks + portable exe)
REM         build-portable.bat -Zip       (also produce an unzip-and-run .zip)
REM         build-portable.bat -SkipChecks
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-portable.ps1" %*
set ERR=%ERRORLEVEL%
if not "%ERR%"=="0" (
  echo.
  echo Build FAILED with exit code %ERR%.
)
if "%~1"=="" pause
exit /b %ERR%
