@echo off
rem Kill processes listening on vite (5173..5179) and relay (8787..8789).
setlocal enabledelayedexpansion

for /l %%P in (5173,1,5179) do call :killport %%P
for /l %%P in (8787,1,8789) do call :killport %%P

echo done.
exit /b

:killport
set "PORT=%~1"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    echo killing PID %%P on port %PORT%
    taskkill /F /PID %%P >nul 2>&1
)
exit /b