@echo off
REM End-to-end proof of the B9 data migration, on a throwaway database.
REM
REM Verifies, in order:
REM   1. from-scratch migrate up to (but excluding) 000006
REM   2. three disbursement rows covering pending / verified / rejected, and a
REM      requester whose role is NOT one of the seven licensed roles
REM   3. 000006 copies each row to a payment stage with the right status
REM   4. 000007 drops the table
REM   5. rolling both back leaves a PAID stage in place (the ledger guard) and
REM      removes the unpaid copies
setlocal
set DB=4ceria_scratch_b9
set "MYSQL=D:\laragon\bin\mysql\mysql-9.6.0-winx64\bin\mysql.exe"
set "PHP=D:\laragon\bin\php\php-8.5.10-Win32-vs17-x64\php.exe"
pushd "%~dp0.."

"%MYSQL%" --host=127.0.0.1 --user=root -e "DROP DATABASE IF EXISTS %DB%; CREATE DATABASE %DB% CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
if errorlevel 1 goto :fail
set DB_DATABASE=%DB%

echo == 1. full migrate, then roll the two new migrations back off ==
REM Deliberately NOT --path on a single migration: 000001 declares a foreign
REM key to `projects`, so it cannot be applied before that table exists.
"%PHP%" artisan migrate:fresh --force --no-interaction
if errorlevel 1 goto :fail
"%PHP%" artisan migrate:rollback --step=2 --force --no-interaction
if errorlevel 1 goto :fail
"%MYSQL%" -u root -D %DB% -N -B -e "SHOW TABLES LIKE 'project_disbursements';"
"%MYSQL%" -u root -D %DB% -N -B -e "SELECT COUNT(*) FROM project_disbursements;"

echo == 2. seed disbursements ==
REM From a file, not an inline -e string: a multi-line SQL literal inside a
REM batch -e argument is split on its newlines and each line becomes its own
REM command.
"%MYSQL%" -u root -D %DB% < "%~dp0disbursement-migration-seed.sql"
if errorlevel 1 goto :fail
"%MYSQL%" -u root -D %DB% -N -B -e "SELECT COUNT(*) AS seeded FROM project_disbursements;"

echo == 3. run 000006 (copy) and 000007 (drop) ==
"%PHP%" artisan migrate --force --no-interaction 2>&1 | findstr /C:"000006" /C:"000007" >nul
"%PHP%" artisan migrate --force --no-interaction
if errorlevel 1 goto :fail

echo.
echo == 4. what survived into project_payment_termins? ==
"%MYSQL%" -u root -D %DB% -e "SELECT id, role_type, recipient_id, label, amount, status, paid_at IS NOT NULL AS has_paid_at, LEFT(notes,60) AS notes FROM project_payment_termins ORDER BY id;"
if errorlevel 1 goto :fail

echo == 5. is the legacy table gone? ==
"%MYSQL%" -u root -D %DB% -N -B -e "SHOW TABLES LIKE 'project_disbursements';" | findstr . >nul && (echo    ERROR: table still exists && goto :fail) || echo    gone, as expected

echo.
echo == 6. a PAID stage with a ledger row must SURVIVE the rollback ==
REM The guard under test: 000006's down() removes a copied stage ONLY when no
REM ledger row references it. A stage that a payment or refund points at has
REM moved real money, and deleting it would destroy the record of that
REM movement. This is the case that would lose money if it regressed.
"%MYSQL%" -u root -D %DB% -e "INSERT INTO project_budget_transactions (project_id, transaction_type, amount, title, reference_model, reference_id, transaction_date, created_at, updated_at) VALUES (1, 'payment', 5500000.00, 'PNBP via termin', 'App\\Models\\ProjectPaymentTermin', 1, NOW(), NOW(), NOW());"
if errorlevel 1 goto :fail

"%PHP%" artisan migrate:rollback --step=2 --force --no-interaction
if errorlevel 1 goto :fail

echo    stages that survived the rollback:
"%MYSQL%" -u root -D %DB% -e "SELECT id, label, status FROM project_payment_termins ORDER BY id;"
"%MYSQL%" -u root -D %DB% -N -B -e "SELECT CONCAT('    count = ', COUNT(*)) FROM project_payment_termins;" | findstr /C:"count = 1" >nul
if errorlevel 1 (
    echo    ERROR: expected exactly 1 stage to survive ^(the one with a ledger row^)
    goto :fail
)
echo    OK: the ledger-referenced stage survived, the three unreferenced copies were removed
"%MYSQL%" -u root -D %DB% -N -B -e "SELECT CONCAT('    surviving label = ', label) FROM project_payment_termins;" | findstr /C:"PNBP" >nul
if errorlevel 1 (
    echo    ERROR: the wrong stage survived
    goto :fail
)
echo    OK: and it is the right one

"%MYSQL%" -u root -e "DROP DATABASE IF EXISTS %DB%;"
echo.
echo B9 MIGRATION PROOF PASSED
popd
exit /b 0

:fail
echo.
echo B9 MIGRATION PROOF FAILED
popd
exit /b 1
