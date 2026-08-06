@echo off
ECHO =============================================================
ECHO   Qis AI Service (Python / FastAPI)
ECHO   Port: 8000
ECHO   Dependencies: fastapi, uvicorn, pandas, numpy, ccxt, pydantic
ECHO =============================================================
ECHO.

cd /d "%~dp0"

REM Check if pip/venv exists
IF NOT EXIST "venv" (
    ECHO Creating Python virtual environment...
    python -m venv venv
)

ECHO Activating virtual environment...
CALL venv\Scripts\activate.bat

ECHO Installing / verifying dependencies...
pip install -r requirements.txt --quiet

ECHO.
ECHO Starting Qis AI Service on http://localhost:8000 ...
ECHO Endpoints:
ECHO   GET  /health
ECHO   POST /analyze/top-pairs     ^(Top 5 Pair Recommendations^)
ECHO   POST /analyze/strategy      ^(AI Grid Strategy Parameters^)
ECHO   GET  /docs                  ^(Swagger UI^)
ECHO.

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

PAUSE
