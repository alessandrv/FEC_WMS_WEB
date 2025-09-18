# Docker Deployment (WMS)

This guide helps you build and run the React frontend + Flask backend (Informix via ODBC) with Docker.

## 1. Prerequisites
- Docker Engine & Docker Compose v2
- Access to an Informix database (network reachable)
- (Optional) IBM Informix Client SDK if you need the genuine driver. Current image includes placeholder paths.

## 2. Environment Variables
Create a `.env` at repo root (copy from `.env.example`):
```
DB_DSN=fec
DB_HOST=your-informix-host
DB_PORT=1526
DB_SERVER=ol_informix1170
DB_NAME=fecdb
DB_USER=informix
DB_PASSWORD=secret
PORT=5000
```

`DB_DSN` must match the section name in `odbc.ini` (currently `fec`).

## 3. Informix ODBC Driver
The Dockerfile expects libraries at `/opt/informix/lib/cli/iclit09b.so`.
If you have the Informix Client SDK locally:
1. Download / extract it to a folder (e.g. `informix-sdk/`).
2. Mount it as a volume in compose OR bake it into the image.

Example (host path -> named volume approach):
```
docker volume create informix-sdk
# Copy your extracted SDK libs into the volume using a helper container (one-time)
```
Alternatively, place a `ifxcli.tar.gz` inside `backend/` and uncomment the extraction lines in `backend/Dockerfile`.

## 4. Build & Run
```
# Build images
docker compose build

# Start stack
docker compose up -d

# View logs
docker compose logs -f backend
```
Backend: http://localhost:5000/api/health  
Frontend: http://localhost:8080/

## 5. Proxying
The frontend Nginx proxies `/api` -> `backend:5000`. Adjust `frontend/nginx.conf` if your API path differs.

## 6. Health Checks
- Backend exposes `/api/health` for container orchestration.
- Frontend uses a simple HTTP GET on `/`.

## 7. Common Issues
| Problem | Cause | Fix |
|---------|-------|-----|
| pyodbc can't connect | Driver path invalid | Ensure Informix libs exist at `/opt/informix/lib/cli/` and `odbcinst.ini` matches |
| SQLConnect: IM002 | Missing DSN | Check `/etc/odbc.ini` got env substitution; rebuild or exec into container |
| SSL / network | Firewall or host unreachable | Verify `DB_HOST` resolvable & port open |

## 8. Testing ODBC Inside Container
```
docker exec -it wms-backend bash
isql fec $DB_USER $DB_PASSWORD -v
```
Install `isql` (unixODBC) if needed:
```
apt-get update && apt-get install -y unixodbc-bin
```

## 9. Rebuilding After Changes
```
docker compose up -d --build backend
```

## 10. Production Notes
- Add proper logging & gunicorn if scaling horizontally (Waitress fine for small load).
- Pin a specific Informix Client SDK version.
- Add resource limits in compose / orchestrator.
- Use secrets management instead of plaintext `.env`.

## 11. Clean Up
```
docker compose down
```

## 12. Extending
- Add a `Dockerfile.dev` for live reload (mount source, run `flask --reload`).
- Add a CI pipeline to build & push images.

---
Have fun shipping! 🚀
