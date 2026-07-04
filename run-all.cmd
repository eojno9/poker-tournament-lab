@echo off
setlocal

cd /d "%~dp0"

set "CMD=%~1"
if "%CMD%"=="" set "CMD=dev"

if not exist "node_modules" (
  echo [setup] node_modules not found. running npm.cmd install...
  call npm.cmd install
  if errorlevel 1 goto :fail
)

if /I "%CMD%"=="dev" goto :dev
if /I "%CMD%"=="build" goto :build
if /I "%CMD%"=="test" goto :test
if /I "%CMD%"=="catalog" goto :catalog
if /I "%CMD%"=="import" goto :import
if /I "%CMD%"=="help" goto :help

echo [error] unknown command: %CMD%
goto :help

:dev
echo [run] starting server + web dev...
echo [run] opening web app in browser: http://127.0.0.1:5173
start "" "http://127.0.0.1:5173"
call npm.cmd run dev
goto :end

:build
echo [run] build all packages...
call npm.cmd run build
goto :end

:test
echo [run] running tests...
call npm.cmd run test
goto :end

:catalog
if "%~2"=="" (
  echo [error] missing folder path.
  echo example: run-all.cmd catalog "C:\path\to\HRC-folder"
  goto :fail
)
echo [run] catalog hrc files...
call npm.cmd run catalog:hrc -- "%~2"
goto :end

:import
if "%~2"=="" (
  echo [error] missing folder path.
  echo example: run-all.cmd import "C:\path\to\HRC-folder"
  goto :fail
)
echo [run] import hrc folder...
echo [note] .hrcz files are discarded by policy.
call npm.cmd run import:hrc-folder -- "%~2"
goto :end

:help
echo.
echo Usage:
echo   run-all.cmd                      ^(same as: run-all.cmd dev^)
echo   run-all.cmd dev
echo   run-all.cmd build
echo   run-all.cmd test
echo   run-all.cmd catalog "C:\path\to\HRC-folder"
echo   run-all.cmd import  "C:\path\to\HRC-folder"
echo.
echo Tips:
echo   - dev: starts API + Web together.
echo   - import: scans .zip only and discards .hrcz.
goto :end

:fail
echo [fail] command failed.
exit /b 1

:end
if errorlevel 1 exit /b 1
exit /b 0
