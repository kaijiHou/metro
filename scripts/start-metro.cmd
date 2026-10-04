@echo off
setlocal
chcp 65001 >nul
title Metro Planner
cd /d "%~dp0.."
if errorlevel 1 goto failed

curl.exe --noproxy "*" --silent --max-time 2 http://127.0.0.1:5173/ 2>nul | findstr /L /C:"<title>Metro Planner" >nul
if not errorlevel 1 (
  start "" "http://127.0.0.1:5173/"
  exit /b 0
)

where node.exe >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请先安装 Node.js 后重试。
  goto failed
)
if not exist "node_modules\vite\bin\vite.js" (
  echo 请先在项目目录执行 npm ci 安装依赖，然后重新双击启动。
  goto failed
)

echo 正在启动地铁线路规划器，稍后会自动打开浏览器。
echo 使用期间请保留此窗口，可以最小化；关闭窗口即可停止服务。
echo 地址：http://127.0.0.1:5173/
call npm.cmd run dev -- --port 5173 --strictPort --open
if errorlevel 1 goto failed
exit /b 0

:failed
echo 启动未完成，请查看上面的提示。
pause
exit /b 1
