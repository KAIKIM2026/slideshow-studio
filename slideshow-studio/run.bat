@echo off
setlocal
cd /d "%~dp0"

REM ===== Slideshow Studio - Windows launcher =====
REM Uses the bundled ffmpeg; no Python required.

set "SLIDESHOW_FFMPEG_PATH=%~dp0ffmpeg\ffmpeg.exe"

if not exist "%SLIDESHOW_FFMPEG_PATH%" (
  echo [ERROR] ffmpeg not found:
  echo   %SLIDESHOW_FFMPEG_PATH%
  echo Place ffmpeg.exe in the "ffmpeg" folder next to this file.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First run: installing dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [ERROR] npm install failed. Make sure Node.js is installed.
    pause
    exit /b 1
  )
)

echo Launching Slideshow Studio...
call npm start

if errorlevel 1 (
  echo.
  echo [Slideshow Studio exited with an error]
  pause
)
endlocal
