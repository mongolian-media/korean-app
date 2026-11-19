@echo off
chcp 65001 >nul
title MONGOLIAN MEDIA — Солонгос хэлний сургалт
echo.
echo ========================================================
echo   MONGOLIAN MEDIA — Солонгос хэлний сургалтын апп
echo ========================================================
echo.
echo Серверийг эхлүүлж байна...
cd /d "%~dp0"
python start.py app
pause
