#!/usr/bin/env bash
set -euo pipefail

# Substitute env vars into /etc/odbc.ini (supports container runtime overrides)
if [ -f /etc/odbc.ini ]; then
  envsubst < /etc/odbc.ini > /tmp/odbc.ini.rendered || true
  cp /tmp/odbc.ini.rendered /etc/odbc.ini || true
fi

# Export connection string if not provided
: "${DB_DSN:=fec}"
: "${DB_USER:=informix}"
: "${DB_PASSWORD:=informix}"
: "${PORT:=5000}"

export DB_DSN DB_USER DB_PASSWORD PORT

# Run the backend using waitress (already defined in backend.py)
exec python backend.py
