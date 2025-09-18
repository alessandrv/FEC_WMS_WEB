# Backend Dockerfile for Flask + pyodbc (Informix)
# Stage 1: build dependencies
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_VERSION=0 \
    PIP_NO_CACHE_DIR=1

# Install system deps: unixODBC & build tools (some needed for pyodbc)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ make unixodbc unixodbc-dev curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
WORKDIR /app
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# (Optional) Place Informix Client SDK here if available via build context
# Expecting a tar.gz dropped into backend/ifxcli.tar.gz (excluded by default). Provide instructions in README.
# RUN tar -xzf ifxcli.tar.gz -C /opt/informix && \
#     echo "/opt/informix/lib" > /etc/ld.so.conf.d/informix.conf && ldconfig

# Copy application code
COPY . .

# ODBC configuration (can be overridden by volume/env)
COPY odbcinst.ini /etc/odbcinst.ini
COPY odbc.ini /etc/odbc.ini

# Expose Flask port
EXPOSE 5000

# Healthcheck hitting the Flask health endpoint
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:5000/api/health || exit 1

# Entrypoint wrapper (ensures env -> config, then launches waitress)
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
