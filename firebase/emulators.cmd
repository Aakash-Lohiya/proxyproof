@echo off
rem Starts the Auth + Firestore emulators for local development (UI at http://localhost:4000).
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
set "PATH=%JAVA_HOME%\bin;C:\Program Files\nodejs;%PATH%"
set "JAVA_TOOL_OPTIONS="
set "FIREBASE_EMULATORS_PATH=D:\firebase-emulators"
cd /d "%~dp0"
npx firebase emulators:start --only auth,firestore --project proxyproof-demo
