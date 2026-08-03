@echo off
:: ============================================================
:: SplitReceipt — Multi-AI Orchestrator Launcher (Windows)
:: Run this from anywhere to start the PM orchestration loop.
:: ============================================================

title Kiro PM Orchestrator — SplitReceipt

:: Change to project root
cd /d "%~dp0\.."

:: Check Python is available
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python not found in PATH.
    echo Install Python 3.11+ from https://python.org
    pause
    exit /b 1
)

:: Install Python dependencies for the orchestrator if needed
echo Checking orchestrator dependencies...
python -c "import dotenv" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Installing python-dotenv...
    pip install python-dotenv --quiet
)
python -c "import httpx" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Installing httpx...
    pip install httpx --quiet
)

:: Parse arguments
set MODE=%1

if "%MODE%"=="--watch" goto watch_mode
if "%MODE%"=="-w" goto watch_mode
if "%MODE%"=="--task" goto task_mode
if "%MODE%"=="-t" goto task_mode
if "%MODE%"=="--help" goto help
if "%MODE%"=="-h" goto help

:: Default: interactive mode
echo.
echo ============================================================
echo   Starting Kiro PM Orchestrator in INTERACTIVE mode
echo   Press Ctrl+C to stop.
echo ============================================================
echo.
python .ai\orchestrator.py
goto end

:watch_mode
echo.
echo ============================================================
echo   Starting Kiro PM Orchestrator in WATCH/DAEMON mode
echo   Write a goal to: .ai\memory\new_task.md
echo   The orchestrator will pick it up automatically.
echo   Press Ctrl+C to stop.
echo ============================================================
echo.
python .ai\orchestrator.py --watch
goto end

:task_mode
:: Shift past "--task" / "-t" to get the task string
set TASK=%~2
if "%TASK%"=="" (
    echo [ERROR] No task provided. Usage: run_orchestrator.bat --task "your goal"
    pause
    exit /b 1
)
echo.
echo ============================================================
echo   Running one-shot task: %TASK%
echo ============================================================
echo.
python .ai\orchestrator.py --task "%TASK%"
goto end

:help
echo.
echo Usage: run_orchestrator.bat [MODE] [OPTIONS]
echo.
echo Modes:
echo   (no args)            Interactive mode — type goals in the terminal
echo   --watch / -w         Daemon mode — watches .ai\memory\new_task.md
echo   --task "goal" / -t   One-shot — run a single task and exit
echo   --help / -h          Show this help
echo.
echo Examples:
echo   run_orchestrator.bat
echo   run_orchestrator.bat --watch
echo   run_orchestrator.bat --task "Add unit tests for calculations.py"
echo.
echo To send a task to the daemon from another terminal:
echo   echo Add dark mode to the frontend > .ai\memory\new_task.md
echo.
goto end

:end
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Orchestrator exited with error code %ERRORLEVEL%
    pause
)
