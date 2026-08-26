@echo off
setlocal
cd /d "%~dp0"

echo Stopping anything on port 5173...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
  taskkill /PID %%P /F >nul 2>&1
)

timeout /t 1 /nobreak >nul

echo Starting HTTPS LAN server...
call npm run dev:network
pause
