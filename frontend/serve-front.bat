@echo off
REM Wrapper to start the static server for PM2 on Windows
cd /d %~dp0
npx serve -s build -l 3001 --single
