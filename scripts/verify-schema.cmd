@echo off
REM Scratch-schema verification runner (gitignored, local only).
REM Runs a from-scratch migration against a throwaway database and verifies
REM that the resulting schema matches every Eloquent model.
REM
REM Usage:  scripts\verify-schema.cmd [database_name]
setlocal
set DB=%~1
if "%DB%"=="" set DB=4ceria_scratch

set "MYSQL=D:\laragon\bin\mysql\mysql-9.6.0-winx64\bin\mysql.exe"
set "PHP=D:\laragon\bin\php\php-8.5.10-Win32-vs17-x64\php.exe"
set "ROOT=%~dp0.."
pushd "%ROOT%"

echo == dropping and recreating %DB% ==
"%MYSQL%" --host=127.0.0.1 --user=root -e "DROP DATABASE IF EXISTS %DB%; CREATE DATABASE %DB% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if errorlevel 1 goto :fail

set DB_DATABASE=%DB%

echo == migrate:fresh (this is slow: MySQL ENUM alters rebuild whole tables) ==
"%PHP%" artisan migrate:fresh --force --no-interaction
if errorlevel 1 goto :fail

echo == schema:verify ==
"%PHP%" artisan schema:verify --no-interaction
if errorlevel 1 goto :fail

echo == rollback the last 3 batches (CI does this) ==
"%PHP%" artisan migrate:rollback --step=3 --force --no-interaction
if errorlevel 1 goto :fail

echo == re-apply ==
"%PHP%" artisan migrate --force --no-interaction
if errorlevel 1 goto :fail

echo == schema:verify (after round-trip) ==
"%PHP%" artisan schema:verify --no-interaction
if errorlevel 1 goto :fail

echo.
echo SCHEMA VERIFICATION PASSED
popd
exit /b 0

:fail
echo.
echo SCHEMA VERIFICATION FAILED
popd
exit /b 1
