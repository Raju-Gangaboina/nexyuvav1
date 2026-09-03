@echo off
setlocal enabledelayedexpansion
set ROOT=%~dp0

echo ========================================
echo   NexYuva Launcher
echo ========================================
echo.

REM --- Check backend venv exists ---
if not exist "%ROOT%backend\venv\Scripts\python.exe" (
    echo [ERROR] Backend venv not found at backend\venv
    echo         Run this first:
    echo           cd backend
    echo           py -3.12 -m venv venv
    echo           venv\Scripts\python.exe -m pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

REM --- Check backend .env exists ---
if not exist "%ROOT%backend\.env" (
    echo [ERROR] backend\.env not found. Create it with DATABASE_URL and JWT_SECRET_KEY.
    echo.
    pause
    exit /b 1
)

REM --- Check backend-node node_modules exists ---
if not exist "%ROOT%backend-node\node_modules" (
    echo [ERROR] backend-node\node_modules not found.
    echo         Run: cd backend-node ^&^& npm install
    echo.
    pause
    exit /b 1
)

REM --- Check frontend-web node_modules exists ---
if not exist "%ROOT%frontend-web\node_modules" (
    echo [ERROR] frontend-web\node_modules not found.
    echo         Run: cd frontend-web ^&^& npm install
    echo.
    pause
    exit /b 1
)

REM --- Fresh-start guard: kill anything already listening on our ports
REM     before launching, so every run starts from a clean slate instead
REM     of a new process landing next to an old one (that dual-process
REM     situation is what silently caused requests to hit stale code
REM     before). --reload uvicorn also spawns a worker subprocess -- taskkill
REM     /T kills that child along with the parent so nothing is orphaned.
echo Clearing any servers already running on our ports...
call :kill_port 6379 "Redis"
call :kill_port 8000 "NexYuva Backend"
call :kill_port 4000 "NexYuva Backend-Node"
call :kill_port 3000 "NexYuva Frontend"
timeout /t 2 /nobreak >nul

echo [OK] All prerequisites found. Starting servers...
echo.

echo Starting Redis (event bus, port 6379)...
start "NexYuva Redis" cmd /k "cd /d C:\redis\Redis-8.8.0-Windows-x64-msys2 && redis-server.exe --port 6379"

timeout /t 2 /nobreak >nul

echo Starting NexYuva Backend (FastAPI, port 8000)...
start "NexYuva Backend" cmd /k "cd /d %ROOT%backend && venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"

timeout /t 4 /nobreak >nul

echo Starting NexYuva Backend-Node (port 4000)...
start "NexYuva Backend-Node" cmd /k "cd /d %ROOT%backend-node && npm run dev"

timeout /t 4 /nobreak >nul

echo Starting NexYuva Frontend (port 3000)...
start "NexYuva Frontend" cmd /k "cd /d %ROOT%frontend-web && npm run dev"

timeout /t 6 /nobreak >nul

echo Opening browser...
start "" "http://localhost:3000"

echo.
echo ========================================
echo   All four servers launching in their own windows:
echo     Redis:         localhost:6379
echo     Backend:       http://localhost:8000/docs
echo     Backend-Node:  http://localhost:4000
echo     Frontend:      http://localhost:3000
echo   Close those windows (or Ctrl+C in them) to stop.
echo ========================================
echo.
pause

goto :eof

:kill_port
REM %1 = port number, %2 = friendly name
set FOUND_ANY=0
for /f "tokens=5" %%P in ('netstat -aon ^| findstr /r /c:":%~1 .*LISTENING"') do (
    echo   Stopping %~2 on port %~1 ^(PID %%P^)...
    taskkill /PID %%P /T /F >nul 2>&1
    set FOUND_ANY=1
)
if !FOUND_ANY! EQU 0 echo   Port %~1 ^(%~2^) was already free.
goto :eof
