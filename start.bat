@echo off
echo Starting WMS Application...

REM Start backend
cd backend
start cmd /k "python -m pip install -r requirements.txt && python backend.py"

REM Start frontend
cd ..
npm start