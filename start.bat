@echo off
REM Startup script for AIVOA.AI RCA Module (Windows)

echo 🚀 Starting AIVOA.AI - AI-Powered RCA Module
echo =============================================

REM Check if .env exists
if not exist backend\.env (
    echo ⚠️  backend\.env not found. Creating from template...
    copy backend\.env.example backend\.env
    echo 📝 Please edit backend\.env and add your GROQ_API_KEY
    pause
    exit /b 1
)

REM Check for Groq API key
findstr /R /C:"GROQ_API_KEY=" backend\.env >nul
if errorlevel 1 (
    echo ⚠️  GROQ_API_KEY not set in backend\.env
    echo 📝 Please edit backend\.env and add your Groq API key from https://console.groq.com/keys
    pause
    exit /b 1
)

echo ✅ Environment configured

REM Start Docker services
echo 🐳 Starting Docker services...
docker-compose up -d postgres redis

REM Wait for services
echo ⏳ Waiting for database and Redis...
timeout /t 5 /nobreak >nul

REM Check if backend dependencies are installed
if not exist backend\venv (
    echo 📦 Creating Python virtual environment...
    cd backend
    python -m venv venv
    call venv\Scripts\activate
    python -m pip install --upgrade pip
    pip install -r requirements.txt
    cd ..
)

REM Check if frontend dependencies are installed
if not exist frontend\node_modules (
    echo 📦 Installing frontend dependencies...
    cd frontend
    npm install
    cd ..
)

echo.
echo ✅ All dependencies ready!
echo.
echo To start the application, run:
echo   Terminal 1: cd backend && venv\Scripts\activate && uvicorn app.main:app --reload
echo   Terminal 2: cd frontend && npm run dev
echo.
echo Or use Docker Compose for everything:
echo   docker-compose up --build
echo.
echo Access points:
echo   Frontend: http://localhost:3000
echo   Backend API: http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo.
pause