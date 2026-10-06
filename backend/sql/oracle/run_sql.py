"""
Execute an Oracle SQL script (statements separated by ';' at end of line) using the
backend connection settings from backend/.env.

    python sql/oracle/run_sql.py sql/oracle/01_wms_tables.sql sql/oracle/02_erp_views.sql
"""
import os
import re
import sys

import pyodbc
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

CONNECTION_STRING = (
    f"Driver={{{os.getenv('DB_DRIVER', 'Oracle in OraClient11g_home1_32bit')}}};"
    f"DBQ={os.getenv('DB_DBQ', 'SRVSKY:1521/SKYLINE')};"
    f"Uid={os.getenv('DB_USER', 'FECITALIA')};Pwd={os.getenv('DB_PASSWORD', '')};"
)


def statements(path):
    with open(path, encoding='utf-8') as f:
        text = '\n'.join(line for line in f.read().splitlines() if not line.strip().startswith('--'))
    return [s.strip() for s in re.split(r';\s*$', text, flags=re.MULTILINE) if s.strip()]


def main(paths):
    conn = pyodbc.connect(CONNECTION_STRING, autocommit=True)
    cursor = conn.cursor()
    for path in paths:
        for sql in statements(path):
            first_line = sql.splitlines()[0]
            cursor.execute(sql)
            print(f"OK  {os.path.basename(path)}: {first_line}")
    conn.close()


if __name__ == '__main__':
    main(sys.argv[1:])
