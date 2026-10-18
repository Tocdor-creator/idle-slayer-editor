@echo off
title Editor de Save - Idle Slayer
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)
node server.js %*
if errorlevel 1 pause
