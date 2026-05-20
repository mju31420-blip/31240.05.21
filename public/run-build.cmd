@echo off
node "%~dp0..\scripts\build-index.mjs" > "%~dp0build-log.txt" 2>&1
