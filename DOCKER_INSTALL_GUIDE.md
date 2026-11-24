# Docker Installation Guide for AIVOA.AI RCA Module

## 🐳 Install Docker Desktop on Windows

### Option 1: Download & Install (Recommended)

1. **Download Docker Desktop for Windows**
   - Go to: https://www.docker.com/products/docker-desktop/
   - Click **"Download for Windows"**
   - Run the installer (`Docker Desktop Installer.exe`)

2. **During Installation**
   - ✅ Check **"Use WSL 2 instead of Hyper-V"** (recommended)
   - ✅ Check **"Add Docker to PATH"**
   - Click **OK** / **Install**

3. **After Installation**
   - **Restart your computer** (required for WSL 2)
   - Launch **Docker Desktop** from Start menu
   - Accept the license agreement
   - Sign in or skip (optional)

4. **Verify Installation**
   ```powershell
   docker --version
   docker compose version
   ```

---

### Option 2: Using Winget (Command Line)

```powershell
# Run as Administrator
winget install Docker.DockerDesktop
```

Then restart computer and launch Docker Desktop.

---

### Option 3: Using Chocolatey

```powershell
# Run as Administrator
choco install docker-desktop
```

---

## 🔧 Post-Installation Setup for This Project

### 1. Enable WSL 2 (if not done during install)
```powershell
# Run as Administrator
wsl --install
# Restart computer
```

### 2. Configure Docker Resources (Optional but Recommended)
Open Docker Desktop → Settings (gear icon) → Resources → Advanced:
- **CPUs**: 4+ (or half your cores)
- **Memory**: 8 GB+ (or half your RAM)
- **Disk**: 64 GB+
- Click **Apply & Restart**

### 3. Start the Project
```powershell
# Navigate to project
cd D:\C\AIVOA_AI

# Build and start all services
docker compose up --build -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

---

## 🌐 Access Points After Startup

| Service | URL |
|---------|-----|
| **Frontend (React App)** | http://localhost:3000 |
| **Backend API** | http://localhost:8000 |
| **API Documentation (Swagger)** | http://localhost:8000/docs |
| **Database (PostgreSQL)** | localhost:5432 |
| **Redis** | localhost:6379 |

---

## 🛠️ Useful Commands

```powershell
# Stop all services
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v

# Rebuild after code changes
docker compose up --build -d

# View specific service logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres

# Enter backend container for debugging
docker compose exec backend bash

# Run database migrations manually
docker compose exec backend python -c "from app.db.session import engine; from app.models.models import Base; Base.metadata.create_all(bind=engine)"
```

---

## ❗ Troubleshooting

### "Docker daemon not running"
- Open Docker Desktop app
- Wait for "Docker Desktop is running" status

### "Port already in use"
```powershell
# Check what's using port 3000/8000/5432
netstat -ano | findstr :3000
# Kill process if needed
taskkill /PID <PID> /F
```

### "WSL 2 not enabled"
```powershell
# Run as Administrator
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
wsl --set-default-version 2
# Restart computer
```

### "Permission denied" on Windows
- Run PowerShell as **Administrator**
- Or add your user to `docker-users` group:
  ```powershell
  net localgroup docker-users %USERNAME% /add
  # Log out and back in
  ```

### Build fails on backend
```powershell
# Clean build
docker compose down -v
docker system prune -f
docker compose up --build -d
```

---

## 📋 Minimum System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Windows 10 64-bit (Build 19041+) | Windows 11 |
| **RAM** | 8 GB | 16 GB+ |
| **CPU** | 2 cores | 4+ cores |
| **Disk** | 20 GB free | 50 GB+ free |
| **Virtualization** | Enabled in BIOS | Enabled |

---

## ✅ Verify Everything Works

After `docker compose up --build -d`:

1. **Wait 30-60 seconds** for all containers to start
2. **Check health**:
   ```powershell
   docker compose ps
   # All services should show "Up" or "healthy"
   ```
3. **Open browser**: http://localhost:3000
4. **Test API**: http://localhost:8000/docs

---

## 🆘 Need Help?

- **Docker Desktop Docs**: https://docs.docker.com/desktop/
- **WSL 2 Guide**: https://docs.microsoft.com/en-us/windows/wsl/install
- **Project Issues**: Check `docker compose logs -f` for errors