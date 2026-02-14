@echo off
echo ========================================
echo   Iniciando...
echo ========================================
echo.

REM Verificar se node_modules existe
if not exist "node_modules" (
    echo [INFO] Pasta node_modules nao encontrada.
    echo [INFO] Instalando dependencias...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERRO] Falha ao instalar dependencias!
        echo [ERRO] Verifique se o Node.js e npm estao instalados.
        pause
        exit /b 1
    )
    echo.
    echo [OK] Dependencias instaladas com sucesso!
    echo.
) else (
    echo [OK] Dependencias ja instaladas.
    echo.
)

echo [INFO] Iniciando aplicacao...
echo [INFO] A aplicacao estara disponivel em: http://localhost:3000
echo [INFO] O navegador sera aberto automaticamente...
echo.
echo Pressione Ctrl+C para parar a aplicacao.
echo ========================================
echo.

REM Abrir o navegador apos um pequeno delay
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

REM Iniciar a aplicacao
npm run dev
