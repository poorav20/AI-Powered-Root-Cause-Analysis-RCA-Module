#!/bin/bash
# Startup script for AIVOA.AI RCA Module

set -e

echo "🚀 Starting AIVOA.AI - AI-Powered RCA Module"
echo "============================================="

# Check if .env exists
if [ ! -f backend/.env ]; then
    echo "⚠️  backend/.env not found. Creating from template..."
    cp backend/.env.example backend/.env
    echo "📝 Please edit backend/.env and add your GROQ_API_KEY"
    exit 1
fi

# Check for Groq API key
if ! grep -q "GROQ_API_KEY=" backend/.env || grep -q "GROQ_API_KEY=$" backend/.env || grep -q "GROQ_API_KEY=your_groq_api_key_here" backend/.env; then
    echo "⚠️  GROQ_API_KEY not set in backend/.env"
    echo "📝 Please edit backend/.env and add your Groq API key from https://console.groq.com/keys"
    exit 1
fi

echo "✅ Environment configured"

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose up -d postgres redis

# Wait for services to be healthy
echo "⏳ Waiting for database and Redis..."
sleep 5

# Check if backend dependencies are installed
if [ ! -d "backend/venv" ]; then
    echo "📦 Creating Python virtual environment..."
    cd backend
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
    cd ..
fi

# Check if frontend dependencies are installed
if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
fi

echo ""
echo "✅ All dependencies ready!"
echo ""
echo "To start the application, run:"
echo "  Terminal 1: cd backend && source venv/bin/activate && uvicorn app.main:app --reload"
echo "  Terminal 2: cd frontend && npm run dev"
echo ""
echo "Or use Docker Compose for everything:"
echo "  docker-compose up --build"
echo ""
echo "Access points:"
echo "  Frontend: http://localhost:3000"
echo "  Backend API: http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"