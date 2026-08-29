@echo off
chcp 65001 >nul
cd /d %~dp0

echo ============================================================
echo   اختبار سيناريوهات التزامن - سكة
echo ============================================================
echo.

node -v >nul 2>nul
if errorlevel 1 (
  echo Node.js مش متثبّت على الجهاز.
  echo نزّل نسخة LTS من https://nodejs.org وثبّتها، وبعدين شغّل الملف ده تاني.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo أول مرة بتشغّل المشروع - بنثبّت المكتبات المطلوبة، استنى شوية...
  echo.
  call npm install
  echo.
)

node concurrency-tests\interactive.mjs

echo.
pause
