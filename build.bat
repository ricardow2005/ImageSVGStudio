@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
title Image SVG Studio - Windows Build

set "APP_NAME=ImageSVGStudio"
set "WAILS_VERSION=v2.10.2"
set "APP_VERSION=0.2.10"
set "BUILD_COMMIT=local"
set "BUILD_DATE=unknown"
set "WAILS_CMD=wails"

echo ============================================================
echo   Image SVG Studio - Build Windows x64
 echo ============================================================
echo.

where go >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Go nao foi encontrado no PATH.
    goto :error
)

where node >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Node.js nao foi encontrado no PATH.
    goto :error
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERRO] npm nao foi encontrado no PATH.
    goto :error
)

for /f "tokens=3" %%I in ('findstr /C:"Version" "version\version.go"') do set "APP_VERSION=%%~I"

where git >nul 2>nul
if not errorlevel 1 (
    for /f "delims=" %%I in ('git rev-parse --short HEAD 2^>nul') do set "BUILD_COMMIT=%%I"
)

where powershell >nul 2>nul
if not errorlevel 1 (
    for /f "delims=" %%I in ('powershell -NoProfile -Command "[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')"') do set "BUILD_DATE=%%I"
)

where wails >nul 2>nul
if errorlevel 1 (
    echo [INFO] Instalando Wails CLI %WAILS_VERSION%...
    call go install github.com/wailsapp/wails/v2/cmd/wails@%WAILS_VERSION%
    if errorlevel 1 goto :error

    for /f "delims=" %%I in ('go env GOPATH') do set "GOPATH_VALUE=%%I"
    if exist "!GOPATH_VALUE!\bin\wails.exe" (
        set "WAILS_CMD=!GOPATH_VALUE!\bin\wails.exe"
    ) else (
        echo [ERRO] wails.exe nao foi localizado em GOPATH\bin.
        goto :error
    )
)

echo.
echo Versao: %APP_VERSION%
echo Commit: %BUILD_COMMIT%
echo Data:   %BUILD_DATE%
echo.

echo [1/2] Instalando dependencias do frontend...
pushd frontend
call npm install
if errorlevel 1 (
    popd
    goto :error
)
popd

echo [2/2] Gerando executavel Windows AMD64...
call "%WAILS_CMD%" build -platform windows/amd64 -clean -ldflags "-X image-svg-studio/version.Version=%APP_VERSION% -X image-svg-studio/version.Commit=%BUILD_COMMIT% -X image-svg-studio/version.BuildDate=%BUILD_DATE%"
if errorlevel 1 goto :error

set "EXE_PATH=%CD%\build\bin\%APP_NAME%.exe"
if not exist "%EXE_PATH%" (
    echo [ERRO] Executavel nao encontrado: %EXE_PATH%
    goto :error
)

echo.
echo ============================================================
echo   BUILD CONCLUIDO
 echo ============================================================
echo %EXE_PATH%
for %%F in ("%EXE_PATH%") do echo Tamanho: %%~zF bytes
exit /b 0

:error
echo.
echo [ERRO] O build falhou.
exit /b 1
