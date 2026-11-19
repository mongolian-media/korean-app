@echo off
chcp 65001 >nul
title MONGOLIAN MEDIA — Гар утаснаас холбогдох ба суулгах
echo.
echo ========================================================
echo   MONGOLIAN MEDIA — Гар утсандаа АПП суулгах
echo ========================================================
echo.
echo QR код болон утасны холбоосыг нээж байна...
cd /d "%~dp0"
python start.py phone
pause
