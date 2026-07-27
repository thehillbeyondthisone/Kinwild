@echo off
REM ---------------------------------------------------------------------------
REM  quickstart.bat - start both dev servers in this workspace.
REM
REM    Kinwild (small-world-integration)  http://localhost:2001
REM    Creature Creator (this repo)       http://localhost:5173
REM
REM  Each server opens in its own window; close that window to stop it.
REM  Pass "kinwild" or "creature" to start only one:
REM      quickstart.bat kinwild
REM ---------------------------------------------------------------------------
setlocal

set "ROOT=%~dp0"
REM %~dp0 keeps a trailing backslash; inside a quoted cd it would escape the
REM closing quote, so keep a stripped copy for the start commands.
set "ROOTDIR=%ROOT:~0,-1%"
set "KINWILD=%ROOT%small-world-integration"
set "WHICH=%~1"
if "%WHICH%"=="" set "WHICH=all"

echo.
echo   Kinwild workspace quickstart
echo   ----------------------------

REM --- node present? ---------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo   [!] Node.js was not found on PATH.
  echo       Install it from https://nodejs.org and run this again.
  goto :fail
)
for /f "delims=" %%v in ('node --version') do echo   node %%v

REM --- kinwild ---------------------------------------------------------------
if /i "%WHICH%"=="creature" goto :creature

if not exist "%KINWILD%\package.json" (
  echo   [!] Missing "%KINWILD%".
  echo       That folder holds the Kinwild app and its git history - it is not
  echo       a build artifact. If it is gone, restore it before continuing.
  goto :fail
)

if not exist "%KINWILD%\node_modules" (
  echo   installing Kinwild dependencies ^(first run only^)...
  pushd "%KINWILD%"
  call npm install
  if errorlevel 1 ( popd & echo   [!] npm install failed. & goto :fail )
  popd
)

echo   starting Kinwild            http://localhost:2001
start "Kinwild :2001" cmd /k "cd /d "%KINWILD%" && npm run dev"

if /i "%WHICH%"=="kinwild" goto :done

REM --- creature creator ------------------------------------------------------
:creature
if not exist "%ROOT%node_modules" (
  echo   installing Creature Creator dependencies ^(first run only^)...
  pushd "%ROOT%"
  call npm install
  if errorlevel 1 ( popd & echo   [!] npm install failed. & goto :fail )
  popd
)

echo   starting Creature Creator   http://localhost:5173
start "Creature Creator :5173" cmd /k "cd /d "%ROOTDIR%" && npm run dev"

:done
REM Vite needs a moment to bind before the browser will connect.
timeout /t 4 /nobreak >nul
if /i not "%WHICH%"=="creature" (
  start "" "http://localhost:2001"
) else (
  start "" "http://localhost:5173"
)

echo.
echo   Ready. Close a server window to stop that server.
echo.
endlocal
exit /b 0

:fail
echo.
endlocal
exit /b 1
