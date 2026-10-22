from flask import Flask, jsonify, request
import pyodbc
from flask_cors import CORS
from decimal import Decimal, InvalidOperation
import uuid
from datetime import datetime, date
import json
import os
from dotenv import load_dotenv
import calendar
import re

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

CORS(app)  # Enable CORS for all routes

def format_delivery_date(date_str):
    try:
        # Parse the input string to a datetime object
        delivery_date = datetime.strptime(date_str, "%a, %d %b %Y %H:%M:%S GMT")
        # Return the formatted string (e.g., "25 Jan 2025")
        return delivery_date.strftime("%d %b %Y")
    except ValueError:
        return date_str  # Return the original string if the date format is invalid

# Oracle Skyline connection (schema FECITALIA). Requires the 32-bit Oracle 11g client
# and therefore the 32-bit Python. ERP tables are read through the wms_v_* views
# (sql/oracle/02_erp_views.sql) which expose the old Informix column names.
DB_DRIVER = os.getenv('DB_DRIVER', 'Oracle in OraClient11g_home1_32bit')
DB_DBQ = os.getenv('DB_DBQ', 'SRVSKY:1521/SKYLINE')
DB_USER = os.getenv('DB_USER', 'FECITALIA')
DB_PASSWORD = os.getenv('DB_PASSWORD', 'manager')
connection_string = f'Driver={{{DB_DRIVER}}};DBQ={DB_DBQ};Uid={DB_USER};Pwd={DB_PASSWORD};'

# Main warehouse in Skyline (was dep_code '1' in Informix)
MAGAZZINO_PRINCIPALE = os.getenv('SKY_MAGAZZINO', 'BAS01')
# Warehouses considered by /api/articolo-offerte (Informix: 1,20,32,48,60,81)
MAGAZZINI_OFFERTE = [m.strip() for m in os.getenv('SKY_MAGAZZINI_OFFERTE', 'BAS01,20,32,48,60,81').split(',')]

# Oracle returns UPPERCASE column names: lowercase them so cursor.description keys
# and row.attribute access keep the Informix names used across this file and the frontend.
pyodbc.lowercase = True

def _normalize_value(value):
    # Oracle NUMBER arrives as float/Decimal: integral values become int (like Informix INTEGER)
    if isinstance(value, float):
        return int(value) if value.is_integer() else value
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    # Oracle DATE always carries a time: pure dates become date (like Informix DATE)
    if isinstance(value, datetime) and value.time() == datetime.min.time():
        return value.date()
    return value

def _normalize_row(row):
    if row is not None:
        for i, value in enumerate(row):
            row[i] = _normalize_value(value)
    return row

class OracleCursor:
    """pyodbc cursor proxy that normalizes fetched values; rows stay pyodbc.Row objects."""

    def __init__(self, cursor):
        self._cursor = cursor

    def execute(self, sql, *params):
        self._cursor.execute(sql, *params)
        return self

    def fetchone(self):
        return _normalize_row(self._cursor.fetchone())

    def fetchall(self):
        return [_normalize_row(row) for row in self._cursor.fetchall()]

    def fetchmany(self, size=1):
        return [_normalize_row(row) for row in self._cursor.fetchmany(size)]

    def __iter__(self):
        for row in self._cursor:
            yield _normalize_row(row)

    def __getattr__(self, name):
        return getattr(self._cursor, name)

class OracleConnection:
    """pyodbc connection proxy returning OracleCursor objects."""

    def __init__(self, conn):
        object.__setattr__(self, '_conn', conn)

    def cursor(self):
        return OracleCursor(self._conn.cursor())

    def __getattr__(self, name):
        return getattr(self._conn, name)

    def __setattr__(self, name, value):
        setattr(self._conn, name, value)

def connect_to_db():
    try:
        conn = pyodbc.connect(connection_string)
    except pyodbc.Error as e:
        raise Exception(f"Unable to connect to the database: {str(e)}")
    cursor = conn.cursor()
    cursor.execute("ALTER SESSION SET NLS_NUMERIC_CHARACTERS = '.,'")
    cursor.close()
    return OracleConnection(conn)

def normalizza_fornitore(codice):
    """Supplier codes are 'F' + Skyline partitario; accept the bare partitario too."""
    codice = (codice or '').strip().upper()
    return codice if codice.startswith('F') else f"F{codice}"

# Package labels:
#   new  'ARTICOLO,ANNO,TIPO,NUMERO'   e.g. '0SW948MI,2026,CA,000038' -> Skyline purchase document 2026/CA/38
#   old  'ARTICOLO,FORNITORE,MOVIMENTO' e.g. '0TA100PX,F504358,83005'  -> ADAPTA movement 83005
_DOCUMENTO_RE = re.compile(r'(?:^|[,\s])(\d{4})\s*[,/\-]\s*([A-Z]{1,3})\s*[,/\-]\s*(\d+)\s*$')

def normalizza_movimento(codice):
    """Movement key stored in wms_items.id_mov and used by wms_v_movimenti.mov_code:
    'ANNO/TIPO/NUMERO' for Skyline documents, the plain number for ADAPTA movements.
    Accepts a full label, 'ANNO/TIPO/NUMERO', 'ANNO,TIPO,NUMERO' or an ADAPTA number."""
    codice = str(codice or '').strip().upper()
    if not codice:
        return ''
    documento = _DOCUMENTO_RE.search(codice)
    if documento:
        anno, tipo, numero = documento.groups()
        return f"{anno}/{tipo}/{int(numero)}"
    parti = [p.strip() for p in codice.split(',') if p.strip()]
    if len(parti) >= 3:  # old label: the movement is the last field (the supplier is ignored)
        codice = parti[-1]
    return str(int(codice)) if codice.isdigit() else codice

def articolo_da_barcode(codice):
    """The article is always the first field of a label."""
    return str(codice or '').split(',')[0].strip()

def parse_log_date(value, end_of_day=False):
    """Log filters arrive as 'YYYY-MM-DD[ HH:MM:SS]' strings; Oracle needs a real datetime."""
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(value[:19], fmt)
            if fmt == "%Y-%m-%d" and end_of_day:
                parsed = parsed.replace(hour=23, minute=59, second=59)
            return parsed
        except ValueError:
            continue
    raise ValueError(f"Formato data non valido: {value}")
    
# Endpoint to fetch logs
@app.route('/api/operation-logs', methods=['GET'])
def get_operation_logs():
    """
    Get operation logs with filtering and pagination.
    Can filter by operation_type, article_code, and undoable status.
    """
    try:
        # Get query parameters
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)
        operation_type = request.args.get('operation_type')
        article_code = request.args.get('article_code')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        undoable_only = request.args.get('undoable_only', 'false').lower() == 'true'
        search_text = request.args.get('search_text')  # Add search_text parameter
        
        # Limit page size
        if per_page > 100:
            per_page = 100
        
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Build query conditions
        conditions = []
        params = []
        
        if operation_type:
            conditions.append("operation_type = ?")
            params.append(operation_type)
        
        if article_code:
            conditions.append("article_code = ?")
            params.append(article_code)
            
        if start_date:
            conditions.append("log_ts >= ?")
            params.append(parse_log_date(start_date))

        if end_date:
            conditions.append("log_ts <= ?")
            params.append(parse_log_date(end_date, end_of_day=True))

        if undoable_only:
            conditions.append("can_undo = 1 AND is_undone = 0")

        # Add search text condition
        if search_text:
            conditions.append("(operation_details LIKE ? OR article_code LIKE ? OR operation_type LIKE ?)")
            search_pattern = f"%{search_text}%"
            params.extend([search_pattern, search_pattern, search_pattern])
        
        # Construct the WHERE clause
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        # Count total matching records
        count_query = f"SELECT COUNT(*) AS total FROM wms_log {f'WHERE {where_clause}' if where_clause else ''}"
        cursor.execute(count_query, params)
        total = cursor.fetchone()[0]
        
        # Calculate pagination
        offset = (page - 1) * per_page
        
        # Get paginated results
        query = f"""
        SELECT
            id, log_ts AS "timestamp", operation_type, operation_details, log_user AS "user",
            CASE
                WHEN ip_address = ? THEN ip_address || ' (TU)'
                ELSE ip_address
            END as ip_address,
            article_code, source_location, destination_location, quantity,
            is_undone, can_undo, additional_data
        FROM wms_log
        {f"WHERE {where_clause}" if where_clause else ""}
        ORDER BY log_ts DESC, id DESC
        OFFSET {int(offset)} ROWS FETCH NEXT {int(per_page)} ROWS ONLY
        """
        # Add the current IP address to params for the CASE expression
        current_ip = request.remote_addr
        params.insert(0, current_ip)
        
        # Execute the query
        cursor.execute(query, params)
        
        # Convert rows to dictionaries
        logs = []
        columns = [column[0] for column in cursor.description]
        
        for row in cursor.fetchall():
            log = dict(zip(columns, row))
            
            # Parse additional_data if it exists
            if log.get('additional_data'):
                try:
                    log['additional_data'] = json.loads(log['additional_data'])
                except:
                    pass  # Keep as string if not valid JSON
            
            # Convert timestamp to string if needed (a midnight DATE is normalized to date)
            if isinstance(log.get('timestamp'), date):
                log['timestamp'] = log['timestamp'].strftime("%Y-%m-%d %H:%M:%S")

            # NUMBER(1) flags -> booleans, as Informix BOOLEAN returned
            log['is_undone'] = bool(log.get('is_undone'))
            log['can_undo'] = bool(log.get('can_undo'))

            # Include a flag indicating if this operation can be undone now
            log['can_revert'] = log.get('can_undo') and not log.get('is_undone')
            
            logs.append(log)
        
        conn.close()
        
        return jsonify({
            'logs': logs,
            'pagination': {
                'total': total,
                'page': page,
                'per_page': per_page,
                'total_pages': (total + per_page - 1) // per_page
            }
        }), 200
        
    except Exception as e:
        print(f"Error retrieving operation logs: {str(e)}")
        return jsonify({'error': str(e)}), 500

def log_operation(operation_type, operation_details, user=None, ip_address=None, article_code=None, 
               source_location=None, destination_location=None, quantity=None, can_undo=True, additional_data=None):
    """
    Log an operation in the database with detailed information for potential reversal.
    
    Parameters:
    - operation_type: Type of operation (INSERT, UPDATE, DELETE, etc.)
    - operation_details: Description of what happened
    - user: Username who performed the operation
    - ip_address: IP address of the user
    - article_code: The article code involved
    - source_location: Source location (for transfers, pickups)
    - destination_location: Destination location (for transfers)
    - quantity: Quantity involved
    - can_undo: Whether this operation can be undone
    - additional_data: Any additional data as JSON string
    """
    conn = connect_to_db()
    cursor = conn.cursor()
    
    if not user:
        user = "system"
    
    try:
        # Convert additional_data to string if it's not None
        additional_data_str = json.dumps(additional_data) if additional_data else None
        
        query = """
        INSERT INTO wms_log
        (log_ts, operation_type, operation_details, log_user, ip_address,
         article_code, source_location, destination_location, quantity, is_undone, can_undo, additional_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        """

        cursor.execute(
            query,
            (
                datetime.now().replace(microsecond=0),

                operation_type,
                (operation_details or '')[:255],
                user,
                ip_address,
                article_code,
                source_location,
                destination_location,
                int(quantity) if quantity is not None else None,
                1 if can_undo else 0,
                additional_data_str
            )
        )
        
        conn.commit()
    except Exception as e:
        print(f"Error logging operation: {e}")
    finally:
        conn.close()

@app.route('/api/articolo-descrizione', methods=['GET'])
def get_descrizione_articolo():
    codice_articolo = request.args.get('codice_articolo')
    if not codice_articolo:
        return jsonify({'error': 'Missing codice_articolo parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        query = "SELECT amg_desc FROM wms_v_mganag WHERE amg_code = ?"
        cursor.execute(query, (codice_articolo.strip(),))
        result = cursor.fetchone()
        descrizione = result[0] if result else None
        return jsonify({'descrizione': descrizione})

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
@app.route('/api/get-quantita-registrata', methods=['GET'])
def get_quantita_registrata():
    codice_articolo = request.args.get('codice_articolo')
    if not codice_articolo:
        return jsonify({'error': 'Missing codice_articolo parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        query = "select m.dep_qgia, m.dep_arti, g.amg_dest from wms_v_mgdepo m inner join wms_v_mganag g on (m.dep_arti = g.amg_code) where (m.dep_arti like ?) and m.dep_code = ?"
        cursor.execute(query, (codice_articolo.strip(), MAGAZZINO_PRINCIPALE))
        result = cursor.fetchone()
        print(result)
        ragione_sociale = result[0] if result else None
        return jsonify({'espressione': ragione_sociale})

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/get-articoli-movimento', methods=['GET'])
def get_movimento_articoli():
    movimento = request.args.get('movimento')
    if not movimento:
        return jsonify({'error': 'Missing codice_articolo parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        query = "select gim_arti, gim_desc, gim_des2, gim_qmov from wms_v_movimenti where mov_code = ? order by gim_riga"
        cursor.execute(query, (normalizza_movimento(movimento),))
        
        # Fetch all rows
        rows = cursor.fetchall()
        
        # Convert rows to list of dictionaries
        columns = [column[0] for column in cursor.description]
        result = [dict(zip(columns, row)) for row in rows]
        
        return jsonify(result)

    except ValueError:
        return jsonify({'error': 'Invalid movimento parameter'}), 400
    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
@app.route('/api/fornitore-ragione-sociale', methods=['GET'])
def get_ragione_sociale_fornitore():
    codice_fornitore = request.args.get('codice_fornitore')
    if not codice_fornitore:
        return jsonify({'error': 'Missing codice_fornitore parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        query = "SELECT des_clifor FROM wms_v_agclifor WHERE cod_clifor = ?"
        cursor.execute(query, (normalizza_fornitore(codice_fornitore),))
        result = cursor.fetchone()
        ragione_sociale = result[0] if result else None
        return jsonify({'ragione_sociale': ragione_sociale})

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/articolo-coerenza', methods=['GET'])
def check_fornitore_coerenza():
    codice_fornitore = request.args.get('codice_fornitore')
    codice_articolo = request.args.get('codice_articolo')
    
    if not codice_fornitore or not codice_articolo:
        return jsonify({'error': 'Missing codice_fornitore or codice_articolo parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        query = "SELECT DISTINCT ofc_cofo, ofc_arti FROM wms_v_ofordic WHERE ofc_cofo = ? AND ofc_arti = ?"
        cursor.execute(query, (normalizza_fornitore(codice_fornitore), codice_articolo.strip()))
        result = cursor.fetchall()
        coerenza = len(result) > 0
        return jsonify({'coerenza': coerenza})

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/system-quantities', methods=['GET'])
def get_system_quantities():
    """Get quantities grouped by location with system comparison"""
    try:
        conn = connect_to_db()
        cursor = conn.cursor()

        # Get WMS quantities with total per article
        cursor.execute("""
    SELECT
w.id_art,
w.area,
w.scaffale,
w.colonna,
w.piano,
w.wms_qty,
t.total_wms_qty
FROM (
SELECT
id_art,
area,
scaffale,
colonna,
piano,
SUM(qta) as wms_qty
FROM wms_items
GROUP BY id_art, area, scaffale, colonna, piano
) w
JOIN (
SELECT
id_art,
SUM(qta) as total_wms_qty
FROM wms_items
GROUP BY id_art
) t ON w.id_art = t.id_art
""")
        wms_groups = cursor.fetchall()
        columns = [column[0] for column in cursor.description]
        wms_quantities = [dict(zip(columns, row)) for row in wms_groups]

        # Get distinct articles
        id_arts = list({group['id_art'] for group in wms_quantities})

        # Get system quantities for all articles
        system_quantities = {}
        if id_arts:
            # Oracle allows max 1000 items in an IN list: query in chunks
            system_data = []
            for start in range(0, len(id_arts), 900):
                chunk = id_arts[start:start + 900]
                cursor.execute(f"""
                    SELECT
                        m.dep_arti,
                        m.dep_qgia as system_qty,
                        g.amg_dest
                    FROM wms_v_mgdepo m
                    INNER JOIN wms_v_mganag g ON m.dep_arti = g.amg_code
                    WHERE m.dep_code = ?
                    AND m.dep_arti IN ({','.join(['?'] * len(chunk))})
                """, [MAGAZZINO_PRINCIPALE] + chunk)
                system_data.extend(cursor.fetchall())
            system_quantities = {
                row[0]: {
                    'system_quantity': row[1],
                    'amg_dest': row[2]
                } for row in system_data
            }

        # Combine WMS and system data
        results = []
        for group in wms_quantities:
            system_info = system_quantities.get(group['id_art'], {})
            if int(group['total_wms_qty']) != int(system_info.get('system_quantity', 0)):
                
                results.append({
                'id_art': group['id_art'],
                'location': {
                    'area': group['area'],
                    'scaffale': group['scaffale'],
                    'colonna': group['colonna'],
                    'piano': group['piano']
                },
                'wms_quantity': int(group['wms_qty']),
                'total_wms_qty': int(group['total_wms_qty']),
                'system_quantity': int(system_info.get('system_quantity', 0)),
                'difference': int(system_info.get('system_quantity', 0)) - int(group['total_wms_qty']),
                'amg_dest': system_info.get('amg_dest', 'N/A')
            })

        return jsonify({
            'count': len(results),
            'results': results
        }), 200

    except pyodbc.Error as e:
        app.logger.error(f"Database error: {str(e)}")
        return jsonify({'error': 'Database error occurred.'}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/get-items', methods=['GET'])
def get_items():
    try:
        # Parse query parameters with default values
        page = request.args.get('page', default=1, type=int)
        limit = request.args.get('limit', default=50, type=int)
        article_filter = request.args.get('articleFilter', default='', type=str)
        supplier_filter = request.args.get('supplierFilter', default='', type=str)
        filter_string = request.args.get('filterString', default='', type=str)
        description_string = request.args.get("descriptionFilter", default='', type=str)

        # Validate page and limit
        if page < 1:
            return jsonify({'error': 'Page number must be greater than 0.'}), 400
        if limit < 1 or limit > 99999:
            return jsonify({'error': 'Limit must be between 1 and 1000.'}), 400

        # Calculate offset
        offset = (page - 1) * limit

        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()

        # Handle partial location filtering
        location_condition = ""
        location_params = []
        if filter_string:
            location_parts = filter_string.split('-')
            location_fields = ['area', 'scaffale', 'colonna', 'piano']
            
            # Build conditions only for non-empty location parts
            conditions = []
            for i, value in enumerate(location_parts):
                if value.strip():  # Only add condition if value is not empty
                    conditions.append(f"wi.{location_fields[i]} = ?")
                    location_params.append(value.strip())
            
            if conditions:
                location_condition = " AND " + " AND ".join(conditions)

        # Step 1: Count total distinct id_art with applied filters
        count_query = """
            SELECT COUNT(DISTINCT wi.id_art)
            FROM wms_items wi
            LEFT JOIN wms_v_mganag mg ON wi.id_art = mg.amg_code
            WHERE 1=1
        """
        count_params = []

        if article_filter:
            count_query += " AND wi.id_art LIKE ?"
            count_params.append(f"%{article_filter}%")
        if supplier_filter:
            count_query += " AND wi.fornitore LIKE ?"
            count_params.append(f"%{supplier_filter}%")
        if description_string:
            count_query += """ AND (
                UPPER(mg.amg_desc) LIKE UPPER(?) 
                OR UPPER(mg.amg_des2) LIKE UPPER(?)
            )"""
            count_params.extend([f"%{description_string}%", f"%{description_string}%"])
        if location_condition:
            count_query += location_condition
            count_params.extend(location_params)

        cursor.execute(count_query, tuple(count_params))
        total_distinct_id_art = cursor.fetchone()[0]

        # Step 2: Fetch distinct id_art for the current page
        id_art_query = """
            SELECT DISTINCT wi.id_art
            FROM wms_items wi
            LEFT JOIN wms_v_mganag mg ON wi.id_art = mg.amg_code
            WHERE 1=1
        """
        id_art_params = []

        if article_filter:
            id_art_query += " AND wi.id_art LIKE ?"
            id_art_params.append(f"%{article_filter}%")
        if supplier_filter:
            id_art_query += " AND wi.fornitore LIKE ?"
            id_art_params.append(f"%{supplier_filter}%")
        if description_string:
            id_art_query += """ AND (
                UPPER(mg.amg_desc) LIKE UPPER(?) 
                OR UPPER(mg.amg_des2) LIKE UPPER(?)
            )"""
            id_art_params.extend([f"%{description_string}%", f"%{description_string}%"])
        if location_condition:
            id_art_query += location_condition
            id_art_params.extend(location_params)

        id_art_query += f" ORDER BY wi.id_art OFFSET {int(offset)} ROWS FETCH NEXT {int(limit)} ROWS ONLY"

        cursor.execute(id_art_query, tuple(id_art_params))
        id_art_rows = cursor.fetchall()
        id_art_list = [row[0] for row in id_art_rows]

        if not id_art_list:
            return jsonify({
                'items': [],
                'total': total_distinct_id_art,
                'page': page,
                'limit': limit,
                'totalPages': (total_distinct_id_art + limit - 1) // limit
            }), 200

        # Step 3: Fetch all wms_items for the selected id_art and join with mganag for descriptions
        # (Oracle allows max 1000 items in an IN list: query in chunks, id_art order is preserved)
        items_rows = []
        for start in range(0, len(id_art_list), 900):
            chunk = id_art_list[start:start + 900]
            placeholders = ','.join(['?'] * len(chunk))
            items_query = f"""
                SELECT
                    wi.*,               -- All fields from wms_items
                    mg.amg_desc,        -- Description from mganag
                    mg.amg_des2         -- Secondary Description from mganag
                FROM
                    wms_items wi
                LEFT JOIN
                    wms_v_mganag mg ON wi.id_art = mg.amg_code
                WHERE
                    wi.id_art IN ({placeholders})
                    {location_condition}
                ORDER BY
                    wi.id_art, wi.scaffale, wi.colonna, wi.piano
            """
            # Combine id_art chunk with location parameters
            cursor.execute(items_query, tuple(chunk + location_params))
            items_rows.extend(cursor.fetchall())

        # Get column names from cursor description
        columns = [column[0] for column in cursor.description]

        # Convert rows to a list of dictionaries
        items = []
        for row in items_rows:
            row_dict = {}
            for idx, value in enumerate(row):
                row_dict[columns[idx]] = value
            items.append(row_dict)

        # Step 4: Group items by id_art and calculate total quantities
        grouped_items = {}
        for item in items:
            id_art = item.get('id_art')
            if not id_art:
                continue  # Skip if id_art is missing

            if id_art not in grouped_items:
                grouped_items[id_art] = {
                    'id_art': id_art,
                    'fornitore': item.get('fornitore', ''),
                    'totalQta': 0,
                    'description': f"{item.get('amg_desc', '')} {item.get('amg_des2', '')}".strip(),
                    'subItems': []
                }

            grouped_items[id_art]['totalQta'] += item.get('qta', 0)
            grouped_items[id_art]['subItems'].append(item)

        # Convert grouped_items to a list
        result = list(grouped_items.values())

        # Calculate total pages
        total_pages = (total_distinct_id_art + limit - 1) // limit

        return jsonify({
            'items': result,
            'total': total_distinct_id_art,
            'page': page,
            'limit': limit,
            'totalPages': total_pages
        }), 200

    except pyodbc.Error as e:
        app.logger.error(f"Database error: {str(e)}")
        return jsonify({'error': 'Database error occurred.'}), 500

    except Exception as ex:
        app.logger.error(f"Unexpected error: {str(ex)}")
        return jsonify({'error': 'An unexpected error occurred.'}), 500

    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
@app.route('/api/movimento-coerenza', methods=['GET'])
def check_movimento_coerenza():
    codice_movimento = request.args.get('codice_movimento')
    codice_articolo = request.args.get('codice_articolo')

    if not codice_movimento or not codice_articolo:
        return jsonify({'error': 'Missing codice_movimento or codice_articolo parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()

        # Coherent = the article is a row of the movement (Skyline document or ADAPTA movement).
        # The supplier is no longer checked (codice_fornitore is ignored if sent).
        movimento = normalizza_movimento(codice_movimento)
        cursor.execute("SELECT 1 FROM wms_v_movimenti WHERE mov_code = ? AND gim_arti = ? FETCH FIRST 1 ROWS ONLY",
                       (movimento, articolo_da_barcode(codice_articolo)))
        coerenza = cursor.fetchone() is not None
        return jsonify({'coerenza': coerenza, 'movimento': movimento})

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/coerenza-dati', methods=['GET'])
def check_coerenza_dati():
    codice_movimento = request.args.get('codice_movimento')
    codice_articolo = request.args.get('codice_articolo')
    if not codice_movimento or not codice_articolo:
        return jsonify({'error': 'Missing codice_movimento or codice_articolo parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM wms_v_movimenti WHERE mov_code = ? AND gim_arti = ? FETCH FIRST 1 ROWS ONLY",
                       (normalizza_movimento(codice_movimento), articolo_da_barcode(codice_articolo)))
        return jsonify({'coerenza': cursor.fetchone() is not None})

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/fornitori', methods=['GET'])
def get_fornitori():
    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()

        # Define a query
        query = '''
        SELECT o.oft_tipo, o.oft_code, o.oft_stat, o.oft_data, o.oft_cofo, a.des_clifor, o.oft_inarrivo
        FROM wms_v_ofordit o
        LEFT JOIN wms_v_agclifor a ON o.oft_cofo = a.cod_clifor
        WHERE o.oft_stat = 'A'
        ORDER BY o.oft_inarrivo DESC, o.oft_data DESC, o.oft_anno DESC, o.oft_nume DESC
        '''
        # Execute the query
        cursor.execute(query)

        # Fetch all rows
        rows = cursor.fetchall()

        # Convert rows to list of dictionaries
        columns = [column[0] for column in cursor.description]
        result = [dict(zip(columns, row)) for row in rows]

        return jsonify(result)

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/fornitore-details', methods=['GET'])
def get_fornitore_details():
    tipo = request.args.get('tipo')
    code = request.args.get('code')

    if not tipo or not code:
        return jsonify({'error': 'Missing tipo or code parameter'}), 400

    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()

        # Define a query for detailed data (in Oracle '' is NULL, so IS NOT NULL covers both checks)
        query = '''
        SELECT ofc_arti, ofc_riga, ofc_desc, ofc_des2, ofc_qord, ofc_dtco, ofc_stato, ofc_qtarrivata, ofc_inarrivo
        FROM wms_v_ofordic
        WHERE ofc_tipo = ? AND ofc_code = ? AND ofc_arti IS NOT NULL
        ORDER BY ofc_inarrivo DESC, ofc_riga
        '''
        # Execute the query
        cursor.execute(query, (tipo, code))

        # Fetch all rows
        rows = cursor.fetchall()

        # Convert rows to list of dictionaries
        columns = [column[0] for column in cursor.description]
        result = [dict(zip(columns, row)) for row in rows]

        # Combine description fields into one if needed
        for record in result:
            record['ofc_desc1'] = f"{record.get('ofc_desc', '')} {record.get('ofc_des2', '')}".strip()

        return jsonify(result)

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
@app.route('/api/shelves', methods=['GET'])
def get_shelves():
    area = request.args.get('area', 'A')  # Default to area 'A'
    
    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Define the query to fetch shelves based on area
        query = "SELECT * FROM wms_scaffali WHERE area LIKE ?"
        cursor.execute(query, (f'{area}%',))
        
        # Fetch all rows
        rows = cursor.fetchall()
        
        # Convert rows to a list of dictionaries
        columns = [column[0] for column in cursor.description]
        result = [dict(zip(columns, row)) for row in rows]
        
        return jsonify(result)

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/dimensioni', methods=['GET'])
def get_dimensioni():
    
    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Define the query to fetch shelves based on area
        query = "SELECT * FROM wms_volume"
        cursor.execute(query)
        
        # Fetch all rows
        rows = cursor.fetchall()
        
        # Convert rows to a list of dictionaries
        columns = [column[0] for column in cursor.description]
        result = [dict(zip(columns, row)) for row in rows]
        
        return jsonify(result)

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
@app.route('/api/articoli-scaffale', methods=['GET'])
def get_articoli_scaffale():
    area = request.args.get('area')  # Default to area 'A'
    scaffale = request.args.get('scaffale')
    colonna = request.args.get('colonna')
    piano = request.args.get('piano')
    articolo = request.args.get('articolo')
    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Define the query to fetch shelves based on area
        query = "select * FROM wms_items WHERE area = ? AND  scaffale = ? AND colonna= ? AND piano= ? AND id_art= ?"

        cursor.execute(query, (area, scaffale, colonna, piano, articolo_da_barcode(articolo)))
        
        # Fetch all rows
        rows = cursor.fetchall()
        
        # Convert rows to a list of dictionaries
        columns = [column[0] for column in cursor.description]
        result = [dict(zip(columns, row)) for row in rows]
        
        return jsonify(result)

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
@app.route('/api/item-present', methods=['GET'])
def get_item_presence():
    id_art = request.args.get('id-art')
    id_mov = request.args.get('id-mov')
    area = request.args.get('area')  # Default to area 'A'
    scaffale = request.args.get('scaffale')
    colonna = request.args.get('colonna')
    piano = request.args.get('piano')

    print(f"Received parameters: id_art={id_art}, id_mov={id_mov}, area={area}, scaffale={scaffale}, colonna={colonna}, piano={piano}")

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Test a simplified query first
        query = "select * from wms_items where id_art = ?"
        cursor.execute(query, (id_art,))
        rows = cursor.fetchall()

        if not rows:
            print("No results found for id_art:", id_art)

        # Proceed with the full query
        query = "select * from wms_items where id_mov = ? and area = ? and scaffale = ? and colonna = ? and piano = ? and id_art = ?"
        cursor.execute(query, (normalizza_movimento(id_mov), area, scaffale, colonna, piano, id_art))
        
        rows = cursor.fetchall()
        
        columns = [column[0] for column in cursor.description]
        result = [dict(zip(columns, row)) for row in rows]
        
        return jsonify(result)

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/reset-partial-pickups', methods=['POST'])
def elimina_prelievi_parziali():
    data = request.json
    odl = data.get('ordine_lavoro')
    
    if not odl:
        return jsonify({'error': 'Missing ordine_lavoro parameter'}), 400
    
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Delete query to remove all records with the specified ODL
        delete_query = "DELETE FROM wms_prelievi WHERE odl = ?"
        cursor.execute(delete_query, (odl,))
        
        # Get count of affected rows
        affected_rows = cursor.rowcount
        
        # Commit the transaction
        conn.commit()
        
        # Log the operation
        log_operation(
            operation_type="DELETE",
            can_undo=False,

            operation_details=f"Eliminati {affected_rows} prelievi parziali per ODL: {odl}",
            ip_address=request.remote_addr
        )
        
        return jsonify({
            'success': True,
            'message': f'Eliminati {affected_rows} record di prelievo parziale',
            'affected_rows': affected_rows
        }), 200
        
    except pyodbc.Error as e:
        app.logger.error(f"Database error: {str(e)}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    
    except Exception as ex:
        app.logger.error(f"Unexpected error: {str(ex)}")
        return jsonify({'error': f'An unexpected error occurred: {str(ex)}'}), 500
    
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/conferma-inserimento-multiplo', methods=['POST'])
def conferma_inserimento_multiplo():
    data = request.json
    area = data.get('area')
    scaffale = data.get('scaffale')
    colonna = data.get('colonna')
    piano = data.get('piano')
    items = data.get('items')  # List of items to insert
    
    if not (area and scaffale and colonna and piano and items):
        return jsonify({'error': 'Missing required parameters'}), 400
    
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        conn.autocommit = False  # Start transaction

        insert_query = """
        INSERT INTO wms_items (id_art, id_mov, area, scaffale, colonna, piano, qta, dimensione) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        total_volume = 0
        operation_details = []

        # Process each item
        for item in items:
            # Scanned codes can carry stray spaces: stored codes must match exact lookups (picking)
            codice_articolo = articolo_da_barcode(item.get('articoloCode'))
            codice_movimento = normalizza_movimento(item.get('movimentoCode')) or None
            quantita = item.get('quantita')
            dimensioni = item.get('dimensioni', 'Zero')
            
            cursor.execute(insert_query, (
                codice_articolo, 
                codice_movimento, 
                area, 
                scaffale, 
                colonna, 
                piano, 
                quantita, 
                dimensioni
            ))
            
            # Calculate volume (you may need to adjust this based on your volume calculation logic)
      
            
            operation_details.append(f"Articolo {codice_articolo}: {quantita} pezzi")

        # Update shelf volume
        update_query = """
        UPDATE wms_scaffali 
        SET volume_libero = volume_libero - ?
        WHERE area = ? AND scaffale = ? AND colonna = ? AND piano = ?
        """
        cursor.execute(update_query, (total_volume, area, scaffale, colonna, piano))

        conn.commit()

        # Log the operation
        location = f"{area}-{scaffale}-{colonna}-{piano}"
        
        # Log a separate operation for each item to make them individually revertable
        for item in items:
            codice_articolo = (item.get('articoloCode') or '').strip()
            quantita = item.get('quantita')
            item_detail = f"Articolo {codice_articolo}: {quantita} pezzi"
            
            log_operation(
                operation_type="INSERT",
                operation_details=item_detail,
                user="current_user",  # Replace with actual user info
                ip_address=request.remote_addr,
                article_code=codice_articolo,
                destination_location=location,
                quantity=quantita,
                can_undo=True
            )

        return jsonify({'success': True}), 200

    except pyodbc.Error as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
@app.route('/api/conferma-inserimento', methods=['POST'])
def conferma_inserimento():
    data = request.json
    area = data.get('area')
    scaffale = data.get('scaffale')
    colonna = data.get('colonna')
    piano = data.get('piano')
    # Scanned codes can carry stray spaces: stored codes must match exact lookups (picking)
    codice_articolo = articolo_da_barcode(data.get('codice_articolo'))
    # Stored as 'ANNO/TIPO/NUMERO' (Skyline document) or the ADAPTA number
    codice_movimento = normalizza_movimento(data.get('codice_movimento')) or None
    quantita = data.get('quantita')
    dimensioni = data.get('dimensioni')
    numero_pacchi = data.get('numero_pacchi')
    volume_totale = data.get('volume')
    
    if not (area and scaffale and colonna and piano and codice_articolo and quantita and dimensioni and numero_pacchi):
        return jsonify({'error': 'Missing required parameters'}), 400
    
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        conn.autocommit = False  # Start transaction

        insert_query = """
        INSERT INTO wms_items (id_art, id_mov, area, scaffale, colonna, piano, qta, dimensione) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        update_query = """
        UPDATE wms_scaffali 
        SET volume_libero = volume_libero - ?
        WHERE area = ? AND scaffale = ? AND colonna = ? AND piano = ?
        """
        
        for _ in range(numero_pacchi):
            cursor.execute(insert_query, (codice_articolo, codice_movimento, area, scaffale, colonna, piano, quantita, dimensioni))
        cursor.execute(update_query, (volume_totale, area, scaffale, colonna, piano))

        conn.commit()

        # Log the operation
        operation_details = f"Inserimento {numero_pacchi} pacchi con {quantita} articolo {codice_articolo} in {area}-{scaffale}-{colonna}-{piano}"
        location = f"{area}-{scaffale}-{colonna}-{piano}"
        log_operation(
            operation_type="INSERT",
            operation_details=operation_details,
            user="current_user",  # Replace with actual user info if available
            ip_address=request.remote_addr,
            article_code=codice_articolo,
            destination_location=location,
            quantity=quantita * numero_pacchi,
            can_undo=True
        )

        return jsonify({'success': True}), 200

    except pyodbc.Error as e:
        if conn:
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/update-pacchi', methods=['POST'])
def update_pacchi():
    data = request.get_json()

    # Extract parameters from the request
    articolo = data.get('articolo')
    area = data.get('area')
    scaffale = data.get('scaffale')
    colonna = data.get('colonna')
    piano = data.get('piano')
    quantity = data.get('quantity')
    odl = data.get('odl')  # New parameter for ODL

    # Validate input parameters
    if not all([articolo, area, scaffale, colonna, piano, quantity]):
        return jsonify({'error': 'Missing parameters'}), 400

    # Convert quantity to Decimal
    try:
        quantity = Decimal(quantity)
    except (ValueError, TypeError, InvalidOperation):
        return jsonify({'error': 'Invalid quantity value'}), 400

    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()

        # Step 1: Check if total available quantity at the location is sufficient
        total_quantity_query = """
        SELECT SUM(qta) AS total_qta
        FROM wms_items
        WHERE id_art = ?
          AND area = ?
          AND scaffale = ?
          AND colonna = ?
          AND piano = ?
        """
        cursor.execute(total_quantity_query, (articolo, area, scaffale, colonna, piano))
        result = cursor.fetchone()

        if not result or result.total_qta is None:
            return jsonify({'error': 'No pacchi found for the specified articolo and location'}), 404

        total_available_quantity = Decimal(result.total_qta)

        if total_available_quantity < quantity:
            return jsonify({'error': 'Insufficient quantity at the specified location'}), 400

        # Step 2: Retrieve all pacchi matching the articolo and location, ordered by quantity ascending
        pacchi_query = """
        SELECT id_pacco, qta, dimensione
        FROM wms_items
        WHERE id_art = ?
          AND area = ?
          AND scaffale = ?
          AND colonna = ?
          AND piano = ?
        ORDER BY qta ASC
        """
        cursor.execute(pacchi_query, (articolo, area, scaffale, colonna, piano))
        pacchi = cursor.fetchall()

        if not pacchi:
            return jsonify({'error': 'No pacchi found for the specified articolo and location'}), 404

        remaining_quantity = quantity
        updated = False

        volume_mapping = {
            'Piccolo': 40000,
            'Medio': 100000,
            'Grande': 300000,
            'Zero': 0
        }

        total_volume_to_add = 0

        for pacco in pacchi:
            id_pacco = pacco.id_pacco
            qta = int(pacco.qta)
            dimensione = pacco.dimensione

            if remaining_quantity <= 0:
                break

            qta_to_remove = min(qta, remaining_quantity)
            new_qta = qta - qta_to_remove

            if new_qta == 0:
                # Remove the pacco
                delete_query = "DELETE FROM wms_items WHERE id_pacco = ?"
                cursor.execute(delete_query, (id_pacco,))
            else:
                # Update the pacco's quantity
                update_query = "UPDATE wms_items SET qta = ? WHERE id_pacco = ?"
                cursor.execute(update_query, (new_qta, id_pacco))

            # Calculate volume to add back to shelf
            total_volume_to_add += volume_mapping[dimensione] * (int(qta_to_remove) / int(qta))
            remaining_quantity -= qta_to_remove
            updated = True

            if remaining_quantity == 0:
                break

        if remaining_quantity > 0:
            conn.rollback()
            return jsonify({'error': 'Insufficient quantity to fulfill the request'}), 400

        if not updated:
            return jsonify({'error': 'No updates were made.'}), 400

        # Step 3: Update the volume in wms_scaffali
        
        conn.commit()
        source_location = f"{area}-{scaffale}-{colonna}-{piano}"
        operation_details = f"{f'ODL: {odl} - ' if odl else ''}Prelievo articolo {articolo} da {source_location} - QTA: {int(quantity)}"
        
        additional_data = {
            "odl": odl
        }
        log_operation(
            operation_type="PRELIEVO",
            operation_details=operation_details,
            user="current_user",  # Replace with actual user info if available
            ip_address=request.remote_addr,
            article_code=articolo,
            source_location=source_location,
            quantity=quantity,
            can_undo=True,
            additional_data=additional_data
        )
        print(operation_details)
        
         # Only insert into wms_prelievi if odl is provided
        if odl:
            try:
                insert_prelievo_query = """
                INSERT INTO wms_prelievi (odl, id_art, area, scaffale, colonna, piano, qta)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """
                cursor.execute(insert_prelievo_query, (
                    odl,
                    articolo,
                    area,
                    scaffale,
                    colonna,
                    piano,
                    int(quantity)
                ))
                conn.commit()  # Second commit for the prelievi insert
            except pyodbc.Error as e:
                # If the prelievi insert fails, log it but don't roll back the pacchi updates
                log_operation(
                    operation_type="ERRORE",
                    operation_details=f"Errore nell'inserimento del prelievo in wms_prelievi: {str(e)}",
                    user="current_user",
                    ip_address=request.remote_addr
                )
                # Don't return error as the main operation succeeded

        return jsonify({'success': True}), 200

    except pyodbc.Error as e:
        conn.rollback()
        operation_details = f"Prelievo articolo {articolo} da {area}-{scaffale}-{colonna}-{piano} - QTA: {int(quantity)} - MERCE NON SCARICATA"
        print(operation_details)
        log_operation(
            operation_type="ERRORE",
            operation_details=operation_details,
            user="current_user",  # Replace with actual user info if available
            ip_address=request.remote_addr
        )
        return jsonify({'error': str(e)}), 500

    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/prelievi-summary', methods=['GET'])
def get_prelievi_summary():
    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Query to get sum of quantities grouped by ODL and article
        query = """
        SELECT 
            odl,
            id_art,
            SUM(qta) as total_qta
        FROM 
            wms_prelievi
        GROUP BY 
            odl,
            id_art
        ORDER BY 
            odl,
            id_art
        """
        
        cursor.execute(query)
        
        # Fetch all rows
        rows = cursor.fetchall()
        
        # Convert rows to a list of dictionaries
        columns = [column[0] for column in cursor.description]
        result = [dict(zip(columns, row)) for row in rows]
        
        return jsonify(result)

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

# Optional: Add an endpoint to get summary for a specific ODL
@app.route('/api/prelievi-summary/<odl>', methods=['GET'])
def get_prelievi_summary_by_odl(odl):
    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Query to get sum of quantities for a specific ODL
        query = """
        SELECT 
            odl,
            id_art,
            SUM(qta) as total_qta
        FROM 
            wms_prelievi
        WHERE 
            odl = ?
        GROUP BY 
            odl,
            id_art
        ORDER BY 
            id_art
        """
        
        cursor.execute(query, (odl,))
        
        # Fetch all rows
        rows = cursor.fetchall()
        
        # Convert rows to a list of dictionaries
        columns = [column[0] for column in cursor.description]
        result = [dict(zip(columns, row)) for row in rows]
        
        return jsonify(result)

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/trasferimento', methods=['POST'])
def trasferimento():
    data = request.get_json()
    articolo = data.get('articolo')
    area = data.get('area')
    scaffale = data.get('scaffale')
    colonna = data.get('colonna')
    piano = data.get('piano')
    areaDest = data.get('areaDest')
    scaffaleDest = data.get('scaffaleDest')
    colonnaDest = data.get('colonnaDest')
    pianoDest = data.get('pianoDest')
    quantity = data.get('quantity')

    if not all([articolo, area, scaffale, colonna, piano, areaDest, scaffaleDest, colonnaDest, pianoDest, quantity]):
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        quantity = float(quantity)
    except ValueError:
        return jsonify({'error': 'Quantity must be a number'}), 400

    # Validate source and destination are different
    if area == areaDest and scaffale == scaffaleDest and colonna == colonnaDest and piano == pianoDest:
        return jsonify({'error': 'Source and destination locations are the same'}), 400

    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()

        
        # Step 2: Retrieve all pacchi matching the articolo and location, ordered by quantity ascending
        pacchi_query = """
        SELECT id_pacco, qta, dimensione
        FROM wms_items
        WHERE id_art = ?
          AND area = ?
          AND scaffale = ?
          AND colonna = ?
          AND piano = ?
        ORDER BY qta ASC
        """
        cursor.execute(pacchi_query, (articolo, area, scaffale, colonna, piano))
        pacchi = cursor.fetchall()

        if not pacchi:
            return jsonify({'error': 'No pacchi found for the specified articolo and location'}), 404

        remaining_quantity = quantity
        updated = False


       

        for pacco in pacchi:
            id_pacco = pacco.id_pacco
            qta = int(pacco.qta)
            

            if remaining_quantity <= 0:
                break

            qta_to_remove = min(qta, remaining_quantity)
            new_qta = qta - qta_to_remove

            if new_qta == 0:
                # Remove the pacco
                delete_query = "DELETE FROM wms_items WHERE id_pacco = ?"
                cursor.execute(delete_query, (id_pacco,))
            else:
                # Update the pacco's quantity
                update_query = "UPDATE wms_items SET qta = ? WHERE id_pacco = ?"
                cursor.execute(update_query, (new_qta, id_pacco))

            # Calculate volume to add back to shelf
            
            remaining_quantity -= float(qta_to_remove)
            updated = True

            if remaining_quantity == 0:
                break

        if remaining_quantity > 0:
            conn.rollback()
            return jsonify({'error': 'Insufficient quantity to fulfill the request'}), 400

        if not updated:
            return jsonify({'error': 'No updates were made.'}), 400
        
        # Step 3: Update the volume in wms_scaffali
        add_query = """
        INSERT INTO wms_items (id_art, area, scaffale, colonna, piano, qta, dimensione) 
        VALUES (?, ?, ?, ?, ?, ?, 'Zero')
        """
        cursor.execute(add_query, (articolo, areaDest, scaffaleDest, colonnaDest, pianoDest, quantity))
        
        # Get the ID of the newly inserted package using a query that's compatible with Informix
        cursor.execute("""
        SELECT id_pacco
        FROM wms_items
        WHERE id_art = ?
          AND area = ?
          AND scaffale = ?
          AND colonna = ?
          AND piano = ?
          AND qta = ?
        ORDER BY id_pacco DESC
        FETCH FIRST 1 ROWS ONLY
        """, (articolo, areaDest, scaffaleDest, colonnaDest, pianoDest, quantity))
        
        destination_pacco_result = cursor.fetchone()
        destination_pacco_id = destination_pacco_result[0] if destination_pacco_result else None
        
        conn.commit()
        source_location = f"{area}-{scaffale}-{colonna}-{piano}"
        destination_location = f"{areaDest}-{scaffaleDest}-{colonnaDest}-{pianoDest}"
        operation_details = f"Trasferimento articolo {articolo} da {source_location} a {destination_location} - QTA: {int(quantity)}"
        log_operation(
            operation_type="TRANSFER",
            operation_details=operation_details,
            user="current_user",  # Replace with actual user info if available
            ip_address=request.remote_addr,
            article_code=articolo,
            source_location=source_location,
            destination_location=destination_location,
            quantity=quantity,
            can_undo=True,
            additional_data={"destination_pacco_id": destination_pacco_id}
        )

        conn.commit()
        conn.close()

        return jsonify({'success': True}), 200

    except pyodbc.Error as e:
        operation_details = f"Spostamento articolo {articolo} da {area}-{scaffale}-{colonna}-{piano} a {areaDest}-{scaffaleDest}-{colonnaDest}-{pianoDest} - QTA: {int(quantity)} - ERRORE"
        source_location = f"{area}-{scaffale}-{colonna}-{piano}"
        destination_location = f"{areaDest}-{scaffaleDest}-{colonnaDest}-{pianoDest}"
        error_details = f"Errore nel trasferimento articolo {articolo} da {source_location} a {destination_location} - QTA: {int(quantity)}"

        log_operation(
            operation_type="ERROR",
            operation_details=error_details,
            user="current_user",
            ip_address=request.remote_addr,
            article_code=articolo,
            source_location=source_location,
            destination_location=destination_location,
            quantity=quantity,
            can_undo=False
        )
        
        print(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500



@app.route('/api/ordine-lavoro', methods=['GET'])
def process_ordine_lavoro():
    codice_ordine = request.args.get('ordine_lavoro')

    if not codice_ordine:
        return jsonify({'error': 'Missing ordine_lavoro parameter'}), 400

    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()

        # The ODL is a Skyline production launch: 'NRO_LANCIO' (all sottolanci) or 'NRO_LANCIO/SOTTOLANCIO'
        odl_parts = str(codice_ordine).strip().split('/')
        try:
            nro_lancio = int(odl_parts[0])
            nro_sottolancio = int(odl_parts[1]) if len(odl_parts) > 1 and odl_parts[1] else None
        except ValueError:
            return jsonify({'error': 'Ordine non trovato'}), 404

        query_prelievi = """
        SELECT id_art, SUM(qta) as picked_quantity
        FROM wms_prelievi 
        WHERE odl = ?
        GROUP BY id_art
        """
        cursor.execute(query_prelievi, (codice_ordine,))
        picked_items_rows = cursor.fetchall()
        
        
        picked_items = {}
        for row in picked_items_rows:
            picked_items[row.id_art] = int(row.picked_quantity)  # Ensure integer conversion
        # Components planned for the launch (PRW_LANCIO_ART_PREV, already exploded by Skyline).
        # mpl_padre/mpl_qta = article produced by the launch and its quantity, so the frontend
        # groups the components under it like the Informix distinta rows.
        query3 = """
SELECT
    c.occ_arti,
    SUM(c.occ_qmov) AS occ_qmov,
    MAX(mg.amg_desc) AS occ_desc,
    MAX(mg.amg_des2) AS occ_des2,
    MIN(c.occ_riga) AS occ_riga,
    MAX(c.odl_padre) AS mpl_padre,
    -- quantity to produce: sum over the selected sottolanci (a launch can be split one unit per sottolancio)
    (SELECT SUM(l.qta_pianif) FROM prw_lancio l
      WHERE l.nro_lancio = ? AND (? IS NULL OR l.nro_sottolancio = ?)) AS mpl_qta
FROM
    wms_v_odl_componenti c
LEFT JOIN
    wms_v_mganag mg ON c.occ_arti = mg.amg_code
WHERE
    c.odl_code = ?
    AND (? IS NULL OR c.odl_sotto = ?)
    AND c.occ_arti IS NOT NULL
GROUP BY
    c.occ_arti
ORDER BY
    MIN(c.occ_riga)
        """
        cursor.execute(query3, (nro_lancio, nro_sottolancio, nro_sottolancio,
                                nro_lancio, nro_sottolancio, nro_sottolancio))
        final_rows = cursor.fetchall()

        if not final_rows:
            return jsonify({'error': 'Ordine non trovato'}), 404

        # Convert the result to a list of dictionaries
        columns = [column[0] for column in cursor.description]
        result = [dict(zip(columns, row)) for row in final_rows]

        # For each item in final_rows, check wms_items
        detailed_results = []

        for item in result:
            occ_arti = item['occ_arti'].strip()
            occ_qmov = float(item['occ_qmov'])  # Ensure numeric conversion
            occ_desc = item['occ_desc']
            occ_des2 = item['occ_des2']
            mpl_padre = item['mpl_padre']
            mpl_qta = item['mpl_qta']
            # Debug print
            print(f"Processing article {occ_arti} with original quantity {occ_qmov}")
            print(f"Picked quantity from dict: {picked_items.get(occ_arti, 0)}")
            
            # Get picked quantity for this article
            picked_qty = picked_items.get(occ_arti, 0)
            remaining_qty = occ_qmov - picked_qty

            print(f"Calculated remaining quantity: {remaining_qty}")

            # If everything is picked, add a completed entry
            if picked_qty >= occ_qmov:
                detailed_results.append({
                    'occ_arti': occ_arti,
                    'occ_desc_combined': f"{occ_desc} {occ_des2}".strip(),
                    'status': 'completed',
                    'picked_quantity': str(int(picked_qty)),
                    'total_quantity': str(int(occ_qmov)),
                    'remaining_quantity': '0',
                    'needed_quantity': '0',
                    'available_quantity': '0',
                        **({'mpl_padre': mpl_padre} if mpl_padre is not None else {}),
                        **({'mpl_qta': int(mpl_qta)} if mpl_qta is not None else {})
                })
                continue

            # Skip if occ_arti starts with 'EG' or 'CONAI'
            if occ_arti and (occ_arti.startswith('EG') or occ_arti.startswith('CONAI')):
                continue

            # Query wms_items for remaining quantity
            query_wms = """
            SELECT 
                id_art, 
                id_pacco,
                fornitore, 
                area, 
                scaffale, 
                colonna, 
                piano, 
                SUM(qta) AS qta,
                CASE 
                    WHEN scaffale IN ('S', 'R') THEN 1 
                    ELSE 0 
                END AS scaffale_order
            FROM 
                wms_items
            WHERE 
                id_art = ?
            GROUP BY 
                id_art, 
                id_pacco,
                fornitore, 
                area, 
                scaffale, 
                colonna, 
                piano
            ORDER BY
                scaffale_order,
                area,
                scaffale,
                colonna,
                piano,
                id_pacco ASC
            """
            cursor.execute(query_wms, (occ_arti,))
            wms_rows = cursor.fetchall()

            total_available_quantity = sum(wms_row.qta for wms_row in wms_rows)
            needed_quantity = remaining_qty  # Use remaining quantity after picking
            location_groups = {}

            for wms_row in wms_rows:
                if needed_quantity <= 0:
                    break

                wms_qta = float(wms_row.qta)  # Ensure numeric conversion
                location_key = (wms_row.area, wms_row.scaffale, wms_row.colonna, wms_row.piano)

                if wms_row.id_pacco and wms_qta > 0:
                    if location_key not in location_groups:
                        location_groups[location_key] = {
                            'total_available_quantity': 0,
                            'pacchi': [],
                            'location': {
                                'area': wms_row.area,
                                'scaffale': wms_row.scaffale,
                                'colonna': wms_row.colonna,
                                'piano': wms_row.piano,
                            }

                        }

                    qty_to_take = min(wms_qta, needed_quantity)
                    location_groups[location_key]['pacchi'].append({
                        'id_pacco': wms_row.id_pacco,
                        'quantity': qty_to_take
                    })
                    location_groups[location_key]['total_available_quantity'] += qty_to_take
                    needed_quantity -= qty_to_take

            # Always add entry for picked items, even if picked_qty is 0
            pick_status = 'partially_picked' if picked_qty > 0 else 'to_pick'
            
            # Process remaining quantity
            for location_key, group_data in location_groups.items():
                total_qty_in_location = group_data['total_available_quantity']
                
                if total_qty_in_location > 0:
                    detailed_results.append({
                        'occ_arti': occ_arti,
                        'occ_desc_combined': f"{occ_desc} {occ_des2}".strip(),
                        'status': pick_status,
                        'sufficient_quantity': total_qty_in_location >= remaining_qty,
                        'pacchi': group_data['pacchi'],
                        'location': group_data['location'],
                        'available_quantity': str(int(total_qty_in_location)),
                        'needed_quantity': str(int(remaining_qty)),
                        'picked_quantity': str(int(picked_qty)),  # Make sure this is included,
                        **({'mpl_padre': mpl_padre} if mpl_padre is not None else {}),
                                                **({'mpl_qta': int(mpl_qta)} if mpl_qta is not None else {})

                    })

            # Add missing entry if needed
            if needed_quantity > 0:
                detailed_results.append({
                    'occ_arti': occ_arti,
                    'occ_desc_combined': f"{occ_desc} {occ_des2}".strip(),
                    'status': 'missing',
                    'missing': True,
                    'pacchi': None,
                    'location': {
                        'area': None,
                        'scaffale': None,
                        'colonna': None,
                        'piano': None,
                    },
                    'available_quantity': str(int(needed_quantity)),
                    'needed_quantity': str(int(needed_quantity)),
                    'picked_quantity': str(int(picked_qty)),
                        **({'mpl_padre': mpl_padre} if mpl_padre is not None else {}),
                                                **({'mpl_qta': int(mpl_qta)} if mpl_qta is not None else {})

                })

        return jsonify(detailed_results), 200

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
@app.route('/api/articolo-search', methods=['GET'])
def articolo_search():
    articolo_id = articolo_da_barcode(request.args.get('articolo_id'))  # plain code or scanned label
    required_quantity = request.args.get('quantity', type=int)

    if not articolo_id or required_quantity is None:
        return jsonify({'error': 'Missing articolo_id or quantity parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()

        # Step 1: Fetch articolo description
        query_desc = """
            SELECT amg_desc, amg_des2
            FROM wms_v_mganag
            WHERE amg_code = ?
        """
        cursor.execute(query_desc, (articolo_id,))
        desc_row = cursor.fetchone()
        if desc_row:
            occ_desc_combined = f"{desc_row.amg_desc} {desc_row.amg_des2}".strip()
        else:
            occ_desc_combined = 'Descrizione non disponibile'

        # Step 2: Fetch available locations grouped by location only
        query_locations = """
            SELECT 
                area,
                scaffale,
                colonna,
                piano,
                SUM(qta) AS available_quantity
            FROM 
                wms_items
            WHERE 
                id_art = ?
                AND qta > 0
            GROUP BY 
                area, scaffale, colonna, piano
            ORDER BY 
                area, scaffale, colonna, piano
        """
        cursor.execute(query_locations, (articolo_id,))
        location_rows = cursor.fetchall()

        detailed_results = []
        accumulated_quantity = 0

        for row in location_rows:
            if accumulated_quantity >= required_quantity:
                break  # Required quantity fulfilled

            available = row.available_quantity
            
            # Determine how much to pick from this location
            pick_quantity = min(available, required_quantity - accumulated_quantity)

            detailed_results.append({
                'id': str(uuid.uuid4()),  # Unique identifier for React's key
                'occ_arti': articolo_id,
                'occ_desc_combined': occ_desc_combined,
                'available_quantity': pick_quantity,
                'location': {
                    'area': row.area,
                    'scaffale': row.scaffale,
                    'colonna': row.colonna,
                    'piano': row.piano,
                },
                'missing': False,
                'pacchi': None,  # Populate if pacchi info is needed
            })

            accumulated_quantity += pick_quantity

        # Check if there's a missing quantity
        if accumulated_quantity < required_quantity:
            missing_quantity = required_quantity - accumulated_quantity
            detailed_results.append({
                'id': str(uuid.uuid4()),  # Unique identifier
                'occ_arti': articolo_id,
                'occ_desc_combined': occ_desc_combined,
                'available_quantity': required_quantity-accumulated_quantity,
                'picked_quantity': required_quantity,
                'location': {
                    'area': None,
                    'scaffale': None,
                    'colonna': None,
                    'piano': None,
                },
                'missing': True,
                'pacchi': None,
                'missing_quantity': missing_quantity,
            })

        return jsonify(detailed_results), 200

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500

    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/transfer-packages', methods=['POST'])
def transfer_packages():
    """
    Handles the transfer of packages from a starting shelf to a destination shelf.
    Expects a JSON payload with the following structure:
    {
        "startingShelf": "A-A-01-1",
        "destinationShelf": "A-A-02-1",
        "totalVolume": 1000,
        "packages": [
            {
                "area": "A",
                "scaffale": "A",
                "colonna": "01",
                "dimensione": "M",
                "fornitore": "Fornitore XYZ",
                "id_art": "ART123",
                "id_mov": "MOV456",
                "id_pacco": "PAC789",
                "piano": "1",
                "qta": 10
            },
            // ... more packages
        ]
    }
    """
    data = request.get_json()
    
    # --- Step 0: Validate Input Payload ---
    required_fields = ['startingShelf', 'destinationShelf', 'totalVolume', 'packages']
    missing_fields = [field for field in required_fields if field not in data]
    
    if missing_fields:
        return jsonify({'error': f'Missing fields: {", ".join(missing_fields)}'}), 400
    
    starting_shelf = data['startingShelf']
    destination_shelf = data['destinationShelf']
    total_volume = data['totalVolume']
    packages = data['packages']
    
    # Validate that 'packages' is a non-empty list
    if not isinstance(packages, list) or not packages:
        return jsonify({'error': 'Packages must be a non-empty list'}), 400
    
    try:
        # Establish database connection
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Begin transaction
        conn.autocommit = False
        
        # --- Step 1: Verify Destination Shelf ---
        # Expected format: "Area-Scaffale-Colonna-Piano" e.g., "A-A-01-1"
        dest_parts = destination_shelf.split('-')
        if len(dest_parts) != 4:
            conn.rollback()
            return jsonify({'error': f'Invalid destinationShelf format: {destination_shelf}'}), 400
        dest_area, dest_scaffale, dest_colonna, dest_piano = dest_parts
        
        query_dest_shelf = """
            SELECT volume_libero
            FROM wms_scaffali
            WHERE area = ? AND scaffale = ? AND colonna = ? AND piano = ?
        """
        cursor.execute(query_dest_shelf, (dest_area, dest_scaffale, dest_colonna, dest_piano))
        dest_shelf_row = cursor.fetchone()
        
        if not dest_shelf_row:
            conn.rollback()
            return jsonify({'error': f'Destination shelf {destination_shelf} not found'}), 404
        
        dest_volume_libero = dest_shelf_row.volume_libero
        
        if dest_volume_libero < total_volume:
            conn.rollback()
            return jsonify({'error': f'Destination shelf {destination_shelf} does not have enough free volume. Required: {total_volume}, Available: {dest_volume_libero}'}), 400
        
        # --- Step 2: Verify Starting Shelf ---
        start_parts = starting_shelf.split('-')
        if len(start_parts) != 4:
            conn.rollback()
            return jsonify({'error': f'Invalid startingShelf format: {starting_shelf}'}), 400
        start_area, start_scaffale, start_colonna, start_piano = start_parts
        
        query_starting_shelf = """
            SELECT volume_libero
            FROM wms_scaffali
            WHERE area = ? AND scaffale = ? AND colonna = ? AND piano = ?
        """
        cursor.execute(query_starting_shelf, (start_area, start_scaffale, start_colonna, start_piano))
        start_shelf_row = cursor.fetchone()
        
        if not start_shelf_row:
            conn.rollback()
            return jsonify({'error': f'Starting shelf {starting_shelf} not found'}), 404
        
        # --- Step 3: Verify and Update Each Package's Location ---
        update_package_query = """
            UPDATE wms_items
            SET area = ?, scaffale = ?, colonna = ?, piano = ?
            WHERE id_pacco = ?
        """
        
        for pkg in packages:
            # Validate presence of required fields in each package
            pkg_required_fields = ['area', 'scaffale', 'colonna', 'dimensione', 'fornitore', 
                                   'id_art', 'id_mov', 'id_pacco', 'piano', 'qta']
            pkg_missing = [field for field in pkg_required_fields if field not in pkg]
            if pkg_missing:
                conn.rollback()
                return jsonify({'error': f'Missing fields in package: {", ".join(pkg_missing)}'}), 400
            
            # Extract package details
            pkg_area = pkg['area']
            pkg_scaffale = pkg['scaffale']
            pkg_colonna = pkg['colonna']
            pkg_piano = pkg['piano']
            pkg_id_pacco = pkg['id_pacco']
            
            # Verify that the package belongs to the starting shelf
            if not (pkg_area == start_area and 
                    pkg_scaffale == start_scaffale and 
                    pkg_colonna == start_colonna and 
                    str(pkg_piano) == str(start_piano)):
                conn.rollback()
                return jsonify({'error': f'Package {pkg_id_pacco} does not belong to the starting shelf {starting_shelf}'}), 400
            
            # Execute the UPDATE statement for the package
            cursor.execute(update_package_query, (
                dest_area,
                dest_scaffale,
                dest_colonna,
                dest_piano,
                pkg_id_pacco
            ))
        
        # --- Step 4: Update Volume for Starting and Destination Shelves ---
        # Starting Shelf: Add total_volume (since packages are removed from it)
        update_starting_shelf_query = """
            UPDATE wms_scaffali
            SET volume_libero = volume_libero + ?
            WHERE area = ? AND scaffale = ? AND colonna = ? AND piano = ?
        """
        cursor.execute(update_starting_shelf_query, (
            total_volume,
            start_area,
            start_scaffale,
            start_colonna,
            start_piano
        ))
        
        # Destination Shelf: Subtract total_volume (since packages are added to it)
        update_destination_shelf_query = """
            UPDATE wms_scaffali
            SET volume_libero = volume_libero - ?
            WHERE area = ? AND scaffale = ? AND colonna = ? AND piano = ?
        """
        cursor.execute(update_destination_shelf_query, (
            total_volume,
            dest_area,
            dest_scaffale,
            dest_colonna,
            dest_piano
        ))
        
        # --- Commit Transaction ---
        conn.commit()
        

        log_operation(
            operation_type="UPDATE",
            operation_details="DA RIFARE LOGICA",
            user="current_user",  # Replace with actual user info if available
            ip_address=request.remote_addr
        )
        return jsonify({'message': 'Transfer successful', 'totalVolumeTransferred': total_volume}), 200
    
    except pyodbc.Error as e:
        # Rollback in case of any database error
        if 'conn' in locals():
            conn.rollback()
        return jsonify({'error': f'Database error: {str(e)}'}), 500
    
    except Exception as ex:
        # Handle any other unexpected errors
        if 'conn' in locals():
            conn.rollback()
        return jsonify({'error': f'An unexpected error occurred: {str(ex)}'}), 500
    
    finally:
        # Ensure that the cursor and connection are closed properly
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

# Accettazione merce (/api/ordini-fornitore, /api/ordine-details, /api/update-quantity,
# /api/articoli-in-arrivo) removed with the Skyline migration: the feature is dismissed and
# relied on Informix-only columns (oft_inarrivo, ofc_inarrivo, ofc_qtarrivata).

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
import base64
import os


# Office 365 SMTP configuration
# Gmail SMTP configuration
SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT = 587
SENDER_EMAIL = 'accettazionemerce.fecpos@gmail.com'  # Replace with your Gmail address
SENDER_PASSWORD = 'osoh swye mjcb fkzp'  # Replace with your Gmail app-specific password
@app.route('/api/send-email', methods=['POST'])
def send_email():
    data = request.json
    image_base64 = data.get('image')
    order_id = data.get('order_id')
    message_text = data.get('message')  # New field for the message

    if not image_base64 or not order_id or not message_text:
        return jsonify({'error': 'Image, order ID, and message are required'}), 400

    try:
        # Decode the base64 image
        image_data = base64.b64decode(image_base64.split(',')[1])  # Strip out 'data:image/jpeg;base64,' part

        # Create email
        msg = MIMEMultipart()
        msg['From'] = SENDER_EMAIL
        msg['To'] = 'a.piccin@fecpos.it'  # Replace with recipient email
        msg['Subject'] = f"Problema ordine - {order_id}"

        # Attach the message
        text = MIMEText(f"Un problema è emerso per l'ordine {order_id}. Dettagli del problema: {message_text}. Immagine allegata.")
        msg.attach(text)

        # Attach image
        image = MIMEImage(image_data, name="problem.jpg")
        msg.attach(image)

        # Connect to Gmail's SMTP server and send the email
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()  # Upgrade to a secure connection
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.sendmail(SENDER_EMAIL, msg['To'], msg.as_string())
        server.quit()
        operation_details = f"Email accettazione per ordine {order_id} inviata correttamente"

        log_operation(
            operation_type="UPDATE",
            operation_details=operation_details,
            user="current_user",  # Replace with actual user info if available
            ip_address=request.remote_addr
        )
        return jsonify({'message': 'Email sent successfully'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/send-save-confirmation-email', methods=['POST'])
def send_save_confirmation_email():
    data = request.json
    order_id = data.get('order_id')
    items = data.get('items')

    if not order_id or not items:
        return jsonify({'error': 'Order ID and items are required'}), 400

    try:
        # Start the email body as HTML
        email_body = f"""
        <html>
        <body>
        <p>Ordine: {data.get('order_tipo', 'Tipo non disponibile')} - {order_id}</p>
        <p>Fornitore: {data.get('supplier_name', 'Fornitore non disponibile')}</p>
        <p>Consegnato:</p>
        <table border="1" cellpadding="5" cellspacing="0">
        <thead>
            <tr>
                <th>Articolo</th>
                <th>Descrizione</th>
                <th>Arrivata</th>
                <th>Prevista</th>
                <th>Consegna prevista</th>
            </tr>
        </thead>
        <tbody>
        """
        
        for item in items:
            arrived_quantity = item['arrivedQuantity']
            expected_quantity = item['expectedQuantity']
            
            # If arrived quantity is None, replace it with 'Non arrivato'
            arrived_quantity_text = arrived_quantity if arrived_quantity is not None else 'Non arrivato'
            # If expected quantity is None, replace it with 'Non previsto'
            expected_quantity_text = expected_quantity if expected_quantity is not None else 'Non previsto'

            # Clean article description and get other fields
            article = item['article'].strip()
            description = item.get('article_description', 'Descrizione non disponibile')  # Default if description is missing
            deliveryDate = format_delivery_date(item['deliveryDate'])

            # Add item data to the table
            email_body += f"""
            <tr>
                <td>{article}</td>
                <td>{description}</td>
                <td>{arrived_quantity_text}</td>
                <td>{expected_quantity_text}</td>
                <td>{deliveryDate}</td>
            </tr>
            """

        email_body += """
        </tbody>
        </table>
        </body>
        </html>
        """

        # Create the email message
        msg = MIMEMultipart()
        msg['From'] = SENDER_EMAIL
        msg['To'] = 'd.fasano@fecpos.it'  # Replace with recipient email
        msg['Subject'] = f"Ordine ID_{order_id} Consegnato"

        # Attach the email body as HTML
        msg.attach(MIMEText(email_body, 'html'))

        # Connect to Gmail's SMTP server and send the email
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()  # Upgrade to a secure connection
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        server.sendmail(SENDER_EMAIL, msg['To'], msg.as_string())
        server.quit()

        return jsonify({'message': 'Email sent successfully'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500
@app.route('/api/send-help-request', methods=['POST'])
def send_help_request():
    try:
        # Create email
        msg = MIMEMultipart()
        msg['From'] = SENDER_EMAIL
        msg['To'] = 'a.piccin@fecpos.it, d.fasano@fecpos.it'  # Multiple recipients
        msg['Subject'] = "Richiesta di aiuto - WMS"

        # Create the message
        text = MIMEText("Mi serve aiuto con il software WMS.")
        msg.attach(text)

        # Connect to Gmail's SMTP server and send the email
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()  # Upgrade to a secure connection
        server.login(SENDER_EMAIL, SENDER_PASSWORD)
        
        # Send to multiple recipients
        recipients = ['a.piccin@fecpos.it', 'd.fasano@fecpos.it']
        server.sendmail(SENDER_EMAIL, recipients, msg.as_string())
        server.quit()

        # Log the operation
        operation_details = "Richiesta di aiuto WMS inviata"
        log_operation(
            operation_type="HELP",
            operation_details=operation_details,
            user="current_user",
            ip_address=request.remote_addr
        )

        return jsonify({'message': 'Richiesta di aiuto inviata con successo'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/trasferimento-multiplo', methods=['POST'])
def bulk_transfer():
    try:
        transfer_items = request.get_json()
        if not isinstance(transfer_items, list):
            return jsonify({'error': 'Expected array of transfer items'}), 400

        conn = connect_to_db()
        cursor = conn.cursor()
        conn.autocommit = False

        # Validate all items first
        for idx, item in enumerate(transfer_items):
            required_fields = [
                'articolo', 'quantity', 'area', 'scaffale', 
                'colonna', 'piano', 'areaDest', 'scaffaleDest',
                'colonnaDest', 'pianoDest'
            ]
            if not all(item.get(field) for field in required_fields):
                raise ValueError(f"Item {idx+1}: Missing required fields")

            try:
                quantity = Decimal(item['quantity'])
                if quantity <= 0:
                    raise ValueError(f"Item {idx+1}: Quantity must be positive")
            except (ValueError, InvalidOperation):
                raise ValueError(f"Item {idx+1}: Invalid quantity value")

        # Process transfers
        transfer_results = []
        for idx, item in enumerate(transfer_items):
            result = process_single_transfer(cursor, item, idx+1)
            transfer_results.append(result)

        # Log operations
        for result in transfer_results:
            operation_details = f"Trasferimento articolo {result['article_code']} da {result['source_location']} a {result['destination_location']} - QTA: {result['quantity']}"
            
            # Create additional data with destination pacco IDs
            additional_data = {}
            if result['destination_pacco_ids']:
                if len(result['destination_pacco_ids']) == 1:
                    additional_data['destination_pacco_id'] = result['destination_pacco_ids'][0]
                additional_data['all_destination_pacco_ids'] = result['destination_pacco_ids']
            
            log_operation(
                operation_type="TRANSFER",
                operation_details=operation_details,
                user="current_user",
                ip_address=request.remote_addr,
                article_code=result['article_code'],
                source_location=result['source_location'],
                destination_location=result['destination_location'],
                quantity=result['quantity'],
                can_undo=True,
                additional_data=additional_data
            )

        conn.commit()
        return jsonify({'success': True, 'transferred_items': len(transfer_items)}), 200

    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

def process_single_transfer(cursor, item, item_idx):
    articolo = item['articolo']
    quantity = Decimal(item['quantity'])
    src_loc = (item['area'], item['scaffale'], item['colonna'], item['piano'])
    dest_loc = (item['areaDest'], item['scaffaleDest'], item['colonnaDest'], item['pianoDest'])
    
    # Prepare return data
    result = {
        'article_code': articolo,
        'quantity': quantity,
        'source_location': f"{src_loc[0]}-{src_loc[1]}-{src_loc[2]}-{src_loc[3]}",
        'destination_location': f"{dest_loc[0]}-{dest_loc[1]}-{dest_loc[2]}-{dest_loc[3]}",
        'destination_pacco_ids': []
    }

    # Verify locations exist
    for loc, loc_type in [(src_loc, 'source'), (dest_loc, 'destination')]:
        cursor.execute("""
            SELECT 1 FROM wms_scaffali 
            WHERE area=? AND scaffale=? AND colonna=? AND piano=?
        """, loc)
        if not cursor.fetchone():
            raise ValueError(f"Item {item_idx}: {loc_type} location {loc} not found")

    # Retrieve pacchi
    cursor.execute("""
        SELECT id_pacco, qta, dimensione
        FROM wms_items
        WHERE id_art=? AND area=? AND scaffale=? AND colonna=? AND piano=?
        ORDER BY qta ASC
    """, (articolo, *src_loc))
    pacchi = cursor.fetchall()

    if not pacchi:
        raise ValueError(f"Item {item_idx}: No items found at {src_loc}")

    remaining = quantity
    for pacco in pacchi:
        if remaining <= 0: break
        
        qta = Decimal(pacco.qta)
        transfer_qty = min(qta, remaining)
        new_qta = qta - transfer_qty

        # Update source
        if new_qta == 0:
            cursor.execute("DELETE FROM wms_items WHERE id_pacco=?", pacco.id_pacco)
        else:
            cursor.execute("UPDATE wms_items SET qta=? WHERE id_pacco=?", (new_qta, pacco.id_pacco))

        # Create destination
        cursor.execute("""
            INSERT INTO wms_items 
            (id_art, area, scaffale, colonna, piano, qta, dimensione)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (articolo, *dest_loc, transfer_qty, pacco.dimensione))
        
        # Get the ID of the newly inserted package
        cursor.execute("""
        SELECT id_pacco
        FROM wms_items
        WHERE id_art = ?
          AND area = ?
          AND scaffale = ?
          AND colonna = ?
          AND piano = ?
          AND qta = ?
        ORDER BY id_pacco DESC
        FETCH FIRST 1 ROWS ONLY
        """, (articolo, *dest_loc, transfer_qty))
        
        dest_pacco = cursor.fetchone()
        if dest_pacco:
            result['destination_pacco_ids'].append(dest_pacco[0])

        remaining -= transfer_qty

    if remaining > 0:
        raise ValueError(f"Item {item_idx}: Insufficient quantity (missing {remaining})")
        
    return result

@app.route('/api/movimento-location-items', methods=['GET'])
def get_movimento_location_items():
    movimento = request.args.get('movimento')
    area = request.args.get('area')
    scaffale = request.args.get('scaffale')
    colonna = request.args.get('colonna')
    piano = request.args.get('piano')
    
    if not all([movimento, area, scaffale, colonna, piano]):
        return jsonify({'error': 'Missing required parameters'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # First get movimento items
        movimento_query = """SELECT DISTINCT gim_arti FROM wms_v_movimenti
                          WHERE mov_code = ?"""
        cursor.execute(movimento_query, (normalizza_movimento(movimento),))
        movimento_items = [row.gim_arti for row in cursor.fetchall()][:900]
        
        if not movimento_items:
            return jsonify([]), 200

        # Get items in location that match movimento items
        placeholders = ','.join(['?'] * len(movimento_items))
        location_query = f"""SELECT wi.* 
                           FROM wms_items wi
                           WHERE wi.area = ? 
                             AND wi.scaffale = ?
                             AND wi.colonna = ?
                             AND wi.piano = ?
                             AND wi.id_art IN ({placeholders})
                             order by wi.id_art
"""
        
        params = [area, scaffale, colonna, piano] + movimento_items
        cursor.execute(location_query, params)
        
        # Convert results to JSON
        columns = [column[0] for column in cursor.description]
        result = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        return jsonify(result)

    except pyodbc.Error as e:
        app.logger.error(f"Database error: {str(e)}")
        return jsonify({'error': 'Database error occurred.'}), 500
    except Exception as ex:
        app.logger.error(f"Unexpected error: {str(ex)}")
        return jsonify({'error': 'An unexpected error occurred.'}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
@app.route('/api/scaffale-location-items', methods=['GET'])
def get_scaffale_location_items():
    area = request.args.get('area')
    scaffale = request.args.get('scaffale')
    colonna = request.args.get('colonna')
    piano = request.args.get('piano')
    
    if not all([area, scaffale, colonna, piano]):
        return jsonify({'error': 'Missing required parameters'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # First get movimento items
       
        


        # Get items in location that match movimento items
        location_query = f"""SELECT wi.* 
                           FROM wms_items wi
                           WHERE wi.area = ? 
                             AND wi.scaffale = ?
                             AND wi.colonna = ?
                             AND wi.piano = ?
                             order by wi.id_art
                             """
        
        params = [area, scaffale, colonna, piano] 
        cursor.execute(location_query, params)
        
        # Convert results to JSON
        columns = [column[0] for column in cursor.description]
        result = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        return jsonify(result)

    except pyodbc.Error as e:
        app.logger.error(f"Database error: {str(e)}")
        return jsonify({'error': 'Database error occurred.'}), 500
    except Exception as ex:
        app.logger.error(f"Unexpected error: {str(ex)}")
        return jsonify({'error': 'An unexpected error occurred.'}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/item-locations', methods=['GET'])
def get_item_locations():
    articolo = request.args.get('articolo')
    
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        query = """
        SELECT 
            area, scaffale, colonna, piano, SUM(qta) as total_qta
        FROM wms_items
        WHERE id_art = ?
        GROUP BY area, scaffale, colonna, piano
        ORDER BY
            CASE WHEN scaffale IN ('S', 'R') THEN 1 ELSE 0 END,
            area,
            scaffale,
            colonna,
            piano
        """
        cursor.execute(query, (articolo,))
        rows = cursor.fetchall()
        
        return jsonify([dict(row) for row in rows]), 200
        
    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals(): cursor.close()
        if 'conn' in locals(): conn.close()

@app.route('/api/articolo-offerte', methods=['GET'])
def get_articolo_offerte():
    codice_articolo = request.args.get('codice')
    if not codice_articolo:
        return jsonify({'error': 'Missing codice parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()

        # Open purchase (wms_v_ofordic) + production (wms_v_mpordil) quantities by delivery month:
        # off_mc = up to end of this month, off_ms = next month, off_msa = the month after, off_mss = later.
        # Informix filtered on amg_stat/amg_fagi (no Skyline equivalent): cancelled articles are excluded instead.
        magazzini = ','.join(['?'] * len(MAGAZZINI_OFFERTE))
        query = f"""
        select amg_code c_articolo, amg_lead lt,

nvl((select sum(ofc_qord-ofc_qcon) from wms_v_ofordic where ofc_arti = amg_code and ofc_feva = 'N'
  and ofc_dtco <= last_day(trunc(sysdate))),0) +
nvl((select sum(mol_quaor-mol_quari) from wms_v_mpordil where mol_parte = amg_code and mol_stato in ('A')
  and mol_dats <= last_day(trunc(sysdate))),0) off_mc,
nvl((select sum(ofc_qord-ofc_qcon) from wms_v_ofordic where ofc_arti = amg_code and ofc_feva = 'N'
  and ofc_dtco between last_day(add_months(trunc(sysdate),0))+1 and last_day(add_months(trunc(sysdate),+1))),0) +
nvl((select sum(mol_quaor-mol_quari) from wms_v_mpordil where mol_parte = amg_code and mol_stato in ('A')
  and mol_dats between last_day(add_months(trunc(sysdate),0))+1 and last_day(add_months(trunc(sysdate),+1))),0) off_ms,

nvl((select sum(ofc_qord-ofc_qcon) from wms_v_ofordic where ofc_arti = amg_code and ofc_feva = 'N'
  and ofc_dtco between last_day(add_months(trunc(sysdate),+1))+1 and last_day(add_months(trunc(sysdate),+2))),0) +
nvl((select sum(mol_quaor-mol_quari) from wms_v_mpordil where mol_parte = amg_code and mol_stato in ('A')
  and mol_dats between last_day(add_months(trunc(sysdate),+1))+1 and last_day(add_months(trunc(sysdate),+2))),0) off_msa,

nvl((select sum(ofc_qord-ofc_qcon) from wms_v_ofordic where ofc_arti = amg_code and ofc_feva = 'N'
  and ofc_dtco >= last_day(add_months(trunc(sysdate),2))+1),0) +
nvl((select sum(mol_quaor-mol_quari) from wms_v_mpordil where mol_parte = amg_code and mol_stato in ('A')
  and mol_dats >= last_day(add_months(trunc(sysdate),2))+1),0) off_mss
from wms_v_mganag
where amg_dann is null
and amg_code = ?
and (amg_code in (select dep_arti from wms_v_mgdepo where dep_code in ({magazzini})
                  and (dep_qgia <> 0 or dep_qris <> 0))
     or amg_code in (select ofc_arti from wms_v_ofordic where ofc_feva = 'N')
     or amg_code in (select mol_parte from wms_v_mpordil where mol_stato = 'A'))
        """

        cursor.execute(query, [codice_articolo.strip()] + MAGAZZINI_OFFERTE)
        columns = [column[0] for column in cursor.description]
        results = []
        
        for row in cursor.fetchall():
            row_dict = dict(zip(columns, row))
            # Convert numeric fields to integers
            for field in ['off_mc', 'off_ms', 'off_msa', 'off_mss']:
                if field in row_dict:
                    # Handle string values and decimal/float types
                    row_dict[field] = int(float(row_dict[field])) if row_dict[field] is not None else 0
            # Clean up article code whitespace
            row_dict['c_articolo'] = row_dict['c_articolo'].strip()
            results.append(row_dict)

        return jsonify(results)

    except pyodbc.Error as e:
        app.logger.error(f"Database error: {str(e)}")
        return jsonify({'error': 'Database error occurred'}), 500
    except Exception as ex:
        app.logger.error(f"Unexpected error: {str(ex)}")
        return jsonify({'error': 'An unexpected error occurred'}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/get-distinta', methods=['GET'])
def get_articoli_figli():
    padre = request.args.get('articolo')
    if not padre:
        return jsonify({'error': 'Missing padre parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()

        query = """
        SELECT
            m.mpl_figlio AS occ_arti
        FROM
            wms_v_mplegami m
        WHERE
            m.mpl_padre = ?
        ORDER BY m.mpl_seq
        """

        cursor.execute(query, (padre.strip(),))
        columns = [column[0] for column in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]

        return jsonify(results)

    except pyodbc.Error as e:
        app.logger.error(f"Database error: {str(e)}")
        return jsonify({'error': 'Database error occurred'}), 500
    except Exception as ex:
        app.logger.error(f"Unexpected error: {str(ex)}")
        return jsonify({'error': 'An unexpected error occurred'}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
    


@app.route('/api/get-group-locations', methods=['GET'])
def get_group_locations():
    try:
        # Get the JSON payload as a string and parse it
        articles_data = request.args.get('articlesData')
        if not articles_data:
            return jsonify({'error': 'Missing articlesData parameter'}), 400
            
        try:
            articles_data = json.loads(articles_data)
        except json.JSONDecodeError:
            return jsonify({'error': 'Invalid JSON format in articlesData'}), 400

        if not isinstance(articles_data, list) or not articles_data:
            return jsonify({'error': 'articlesData must be a non-empty array'}), 400

        # Validate structure of each item
        for item in articles_data:
            if not isinstance(item, dict) or 'article' not in item or 'quantity' not in item:
                return jsonify({'error': 'Each item must have article and quantity fields'}), 400

        # Extract articles and quantities
        articles = [item['article'] for item in articles_data]
        quantities = [float(item['quantity']) for item in articles_data]
        
        conn = connect_to_db()
        cursor = conn.cursor()

        # Rest of the logic remains the same
        query = """
        SELECT 
            wi.area,
            wi.scaffale,
            wi.colonna,
            wi.piano,
            wi.id_art,
            SUM(wi.qta) as total_qta
        FROM 
            wms_items wi
        WHERE 
            wi.id_art = ?
        GROUP BY 
            wi.area, wi.scaffale, wi.colonna, wi.piano, wi.id_art
        HAVING 
            SUM(wi.qta) >= ?
        """

        # Execute query for each article and store results
        all_locations = []
        for article, qty in zip(articles, quantities):
            cursor.execute(query, (article, qty))
            locations = cursor.fetchall()
            all_locations.append(set((loc[0], loc[1], loc[2], loc[3]) for loc in locations))

        # Find common locations that can accommodate all articles
        if all_locations:
            common_locations = all_locations[0].intersection(*all_locations[1:])
            
            # Get detailed information for common locations
            result_locations = []
            for area, scaffale, colonna, piano in common_locations:
                location_info = {
                    'area': area,
                    'scaffale': scaffale,
                    'colonna': colonna,
                    'piano': piano,
                    'articles': []
                }
                
                # Get quantity information for each article in this location
                for article_data in articles_data:
                    article = article_data['article']
                    cursor.execute("""
                        SELECT SUM(qta) as total_qta
                        FROM wms_items
                        WHERE id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?
                    """, (article, area, scaffale, colonna, piano))
                    qty_result = cursor.fetchone()
                    location_info['articles'].append({
                        'id_art': article,
                        'required_quantity': float(article_data['quantity']),
                        'available_quantity': float(qty_result[0]) if qty_result[0] else 0
                    })
                
                result_locations.append(location_info)

            return jsonify({
                'locations': result_locations
            })
        
        return jsonify({'locations': []})

    except pyodbc.Error as e:
        app.logger.error(f"Database error: {str(e)}")
        return jsonify({'error': 'Database error occurred.'}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()
@app.route('/api/undo-pacchi', methods=['POST'])
def undo_pacchi():
    data = request.get_json()
    
    # Extract parameters from the request
    articolo = data.get('articolo')
    area = data.get('area')
    scaffale = data.get('scaffale')
    colonna = data.get('colonna')
    piano = data.get('piano')
    quantity = data.get('quantity')
    odl = data.get('odl')
    movimento = normalizza_movimento(data.get('movimento')) or None

    # Validate input parameters
    if not all([articolo, area, scaffale, colonna, piano, quantity]):
        return jsonify({'error': 'Missing required parameters'}), 400
    
    try:
        # Convert quantity to Decimal
        try:
            quantity = Decimal(quantity)
        except (ValueError, TypeError, InvalidOperation):
            return jsonify({'error': 'Invalid quantity value'}), 400
        
        conn = connect_to_db()
        cursor = conn.cursor()
        conn.autocommit = False  # Start transaction
        
        # 1. Insert the quantity back into wms_items
        insert_query = """
        INSERT INTO wms_items (id_art, id_mov, area, scaffale, colonna, piano, qta, dimensione) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        cursor.execute(insert_query, (
            articolo, 
            movimento,  # Use the stored movimento
            area, 
            scaffale, 
            colonna, 
            piano, 
            quantity, 
            'Zero'  # Always use 'Zero' for dimension
        ))
        
        # 2. Delete or update corresponding records from wms_prelievi if ODL is provided
        if odl:
            remaining_to_delete = quantity  # 'quantity' is already a Decimal.
            # Fetch all prelievo records for this specific article, location, and ODL.
            select_query = """
            SELECT id, qta FROM wms_prelievi 
            WHERE odl = ? 
              AND id_art = ? 
              AND area = ? 
              AND scaffale = ? 
              AND colonna = ? 
              AND piano = ?
            ORDER BY id ASC
            """
            cursor.execute(select_query, (odl, articolo, area, scaffale, colonna, piano))
            rows = cursor.fetchall()
            
            for row in rows:
                if remaining_to_delete <= 0:
                    break
                current_qta = Decimal(row.qta)
                if current_qta <= remaining_to_delete:
                    # Delete this entire row if its quantity is less than or equal to what's to be undone.
                    cursor.execute("DELETE FROM wms_prelievi WHERE id = ?", (row.id,))
                    remaining_to_delete -= current_qta
                else:
                    # This row has more quantity than needed; update it to subtract the undone quantity.
                    new_qta = current_qta - remaining_to_delete
                    cursor.execute("UPDATE wms_prelievi SET qta = ? WHERE id = ?", (new_qta, row.id))
                    remaining_to_delete = Decimal(0)
        
        # Log the operation
        operation_details = f"Annullamento prelievo articolo {articolo} da {area}-{scaffale}-{colonna}-{piano} - QTA: {int(quantity)}"
        log_operation(
            operation_type="REVERT",
            operation_details=operation_details,
            can_undo=False,

            user="current_user",  # Replace with actual user info if available
            ip_address=request.remote_addr
        )
        
        conn.commit()
        return jsonify({'success': True}), 200
        
    except pyodbc.Error as e:
        conn.rollback()
        app.logger.error(f"Database error: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
    except Exception as ex:
        conn.rollback()
        app.logger.error(f"Unexpected error: {str(ex)}")
        return jsonify({'error': str(ex)}), 500
    
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/batch-update-pacchi', methods=['POST'])
def batch_update_pacchi():
    data = request.get_json()
    items = data.get('items', [])
    odl = data.get('odl')
    
    if not items:
        return jsonify({'error': 'No items provided'}), 400
    
    results = []
    
    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()
        conn.autocommit = False  # Start transaction
        
        for item in items:
            # Extract parameters from the item
            articolo = item.get('articolo')
            area = item.get('area')
            scaffale = item.get('scaffale')
            colonna = item.get('colonna')
            piano = item.get('piano')
            quantity = item.get('quantity')
            row_id = item.get('rowId')
            
            # Validate input parameters
            if not all([articolo, area, scaffale, colonna, piano, quantity]):
                results.append({
                    'rowId': row_id,
                    'success': False,
                    'error': 'Missing parameters'
                })
                continue
            
            # Convert quantity to Decimal
            try:
                quantity = Decimal(quantity)
            except (ValueError, TypeError, InvalidOperation):
                results.append({
                    'rowId': row_id,
                    'success': False,
                    'error': 'Invalid quantity value'
                })
                continue
            
            try:
                # Step 1: Check if total available quantity at the location is sufficient
                total_quantity_query = """
                SELECT SUM(qta) AS total_qta
                FROM wms_items
                WHERE id_art = ?
                  AND area = ?
                  AND scaffale = ?
                  AND colonna = ?
                  AND piano = ?
                """
                cursor.execute(total_quantity_query, (articolo, area, scaffale, colonna, piano))
                result = cursor.fetchone()
                
                if not result or result.total_qta is None:
                    results.append({
                        'rowId': row_id,
                        'success': False,
                        'error': 'No pacchi found for the specified articolo and location'
                    })
                    continue
                
                total_available_quantity = Decimal(result.total_qta)
                
                if total_available_quantity < quantity:
                    results.append({
                        'rowId': row_id,
                        'success': False,
                        'error': 'Insufficient quantity at the specified location'
                    })
                    continue
                
                # Step 2: Retrieve all pacchi matching the articolo and location, ordered by quantity ascending
                pacchi_query = """
                SELECT id_pacco, qta, dimensione
                FROM wms_items
                WHERE id_art = ?
                  AND area = ?
                  AND scaffale = ?
                  AND colonna = ?
                  AND piano = ?
                ORDER BY qta ASC
                """
                cursor.execute(pacchi_query, (articolo, area, scaffale, colonna, piano))
                pacchi = cursor.fetchall()
                
                if not pacchi:
                    results.append({
                        'rowId': row_id,
                        'success': False,
                        'error': 'No pacchi found for the specified articolo and location'
                    })
                    continue
                
                remaining_quantity = quantity
                updated = False
                
                volume_mapping = {
                    'Piccolo': 40000,
                    'Medio': 100000,
                    'Grande': 300000,
                    'Zero': 0
                }
                
                total_volume_to_add = 0
                
                for pacco in pacchi:
                    id_pacco = pacco.id_pacco
                    qta = Decimal(pacco.qta)
                    dimensione = pacco.dimensione
                    
                    if remaining_quantity <= 0:
                        break
                    
                    qta_to_remove = min(qta, remaining_quantity)
                    new_qta = qta - qta_to_remove
                    
                    if new_qta == 0:
                        # Remove the pacco
                        delete_query = "DELETE FROM wms_items WHERE id_pacco = ?"
                        cursor.execute(delete_query, (id_pacco,))
                    else:
                        # Update the pacco's quantity
                        update_query = "UPDATE wms_items SET qta = ? WHERE id_pacco = ?"
                        cursor.execute(update_query, (new_qta, id_pacco))
                    
                    # Calculate volume to add back to shelf
                    total_volume_to_add += volume_mapping[dimensione] * (int(qta_to_remove) / int(qta))
                    remaining_quantity -= qta_to_remove
                    updated = True
                    
                    if remaining_quantity == 0:
                        break
                
                if remaining_quantity > 0:
                    results.append({
                        'rowId': row_id,
                        'success': False,
                        'error': 'Insufficient quantity to fulfill the request'
                    })
                    continue
                
                if not updated:
                    results.append({
                        'rowId': row_id,
                        'success': False,
                        'error': 'No updates were made'
                    })
                    continue
                
                # Log the operation
                operation_details = f"{f'ODL: {odl} - ' if odl else ''}Prelievo articolo {articolo} da {area}-{scaffale}-{colonna}-{piano} - QTA: {int(quantity)}"
                location = f"{area}-{scaffale}-{colonna}-{piano}"
                log_operation(
                    operation_type="PRELIEVO",
                    operation_details=operation_details,
                    user="current_user",  # Replace with actual user info if available
                    ip_address=request.remote_addr,
                    article_code=articolo,
                    source_location=location,
                    quantity=quantity,
                    can_undo=True
                )
                
                # Only insert into wms_prelievi if odl is provided
                if odl:
                    try:
                        insert_prelievo_query = """
                        INSERT INTO wms_prelievi (odl, id_art, area, scaffale, colonna, piano, qta)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """
                        cursor.execute(insert_prelievo_query, (
                            odl,
                            articolo,
                            area,
                            scaffale,
                            colonna,
                            piano,
                            int(quantity)
                        ))
                    except pyodbc.Error as e:
                        # If the prelievi insert fails, log it but don't roll back the pacchi updates
                        log_operation(
                            operation_type="ERRORE",
                            operation_details=f"Errore nell'inserimento del prelievo in wms_prelievi: {str(e)}",
                            user="current_user",
                            ip_address=request.remote_addr
                        )
                
                # Add success result
                results.append({
                    'rowId': row_id,
                    'success': True
                })
                
            except Exception as e:
                # Handle individual item errors without failing the entire batch
                results.append({
                    'rowId': row_id,
                    'success': False,
                    'error': str(e)
                })
        
        # Commit all changes if we got here
        conn.commit()
        
        return jsonify({
            'success': any(result['success'] for result in results),
            'results': results
        }), 200
        
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
        return jsonify({'error': str(e)}), 500
        
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/batch-undo-pacchi', methods=['POST'])
def batch_undo_pacchi():
    data = request.get_json()
    items = data.get('items', [])
    odl = data.get('odl')
    
    if not items:
        return jsonify({'error': 'No items provided'}), 400
    
    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()
        conn.autocommit = False  # Start transaction
        
        for item in items:
            # Extract parameters from the item
            articolo = item.get('articolo')
            area = item.get('area')
            scaffale = item.get('scaffale')
            colonna = item.get('colonna')
            piano = item.get('piano')
            quantity = item.get('quantity')
            
            # Validate input parameters
            if not all([articolo, area, scaffale, colonna, piano, quantity]):
                continue
            
            # Convert quantity to Decimal if it's not already
            if not isinstance(quantity, Decimal):
                try:
                    quantity = Decimal(quantity)
                except (ValueError, TypeError, InvalidOperation):
                    continue
            
            # Insert the item back into inventory
            insert_query = """
            INSERT INTO wms_items (id_art, area, scaffale, colonna, piano, qta, dimensione)
            VALUES (?, ?, ?, ?, ?, ?, 'Zero')
            """
            cursor.execute(insert_query, (articolo, area, scaffale, colonna, piano, quantity))
            
            # If ODL is provided, remove from wms_prelievi
            if odl:
                delete_prelievo_query = """
                DELETE FROM wms_prelievi 
                WHERE odl = ? AND id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?
                """
                cursor.execute(delete_prelievo_query, (odl, articolo, area, scaffale, colonna, piano))
            
            # Log the operation
            operation_details = f"{f'ODL: {odl} - ' if odl else ''}Annullamento prelievo articolo {articolo} da {area}-{scaffale}-{colonna}-{piano} - QTA: {int(quantity)}"
            location = f"{area}-{scaffale}-{colonna}-{piano}"
            log_operation(
                operation_type="INSERT",
                operation_details=operation_details,
                user="current_user",  # Replace with actual user info if available
                ip_address=request.remote_addr,
                article_code=articolo,
                destination_location=location,
                quantity=quantity,
                can_undo=True
            )
        
        # Commit all changes
        conn.commit()
        
        return jsonify({'success': True}), 200
        
    except pyodbc.Error as e:
        if 'conn' in locals():
            conn.rollback()
        operation_details = f"Errore nell'annullamento dei prelievi: {str(e)}"
        log_operation(
            operation_type="ERRORE",
            operation_details=operation_details,
            user="current_user",
            ip_address=request.remote_addr
        )
        return jsonify({'error': str(e)}), 500
        
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/revert-operation', methods=['POST'])
def revert_operation():
    """
    Revert an operation based on its log ID.
    This endpoint uses the detailed information stored in the wms_log table
    to perform the inverse operation and undo changes.
    """
    try:
        data = request.json
        log_id = data.get('log_id')
        
        if not log_id:
            return jsonify({'error': 'Missing log_id parameter'}), 400
        
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Get the operation details from the log
        cursor.execute(
            """SELECT id, operation_type, article_code, source_location, destination_location, 
                    quantity, is_undone, can_undo, additional_data
             FROM wms_log 
             WHERE id = ?""", 
            (log_id,)
        )
        log_entry = cursor.fetchone()
        
        if not log_entry:
            conn.close()
            return jsonify({'error': 'Log entry not found'}), 404
        
        # Check if the operation can be undone
        if log_entry.is_undone:
            conn.close()
            return jsonify({'error': 'This operation has already been undone'}), 400
        
        if not log_entry.can_undo:
            conn.close()
            return jsonify({'error': 'This operation cannot be undone'}), 400
        
        # Extract operation details
        operation_type = log_entry.operation_type
        article_code = log_entry.article_code
        source_location = log_entry.source_location
        destination_location = log_entry.destination_location
        quantity = float(log_entry.quantity) if log_entry.quantity else 0
        additional_data = json.loads(log_entry.additional_data) if log_entry.additional_data else {}
        
        # Parse locations
        if source_location:
            source_parts = source_location.split('-')
            if len(source_parts) >= 4:
                source_area, source_scaffale, source_colonna, source_piano = source_parts[:4]
            else:
                conn.close()
                return jsonify({'error': 'Invalid source location format in log'}), 400
        
        if destination_location:
            dest_parts = destination_location.split('-')
            if len(dest_parts) >= 4:
                dest_area, dest_scaffale, dest_colonna, dest_piano = dest_parts[:4]
            else:
                conn.close()
                return jsonify({'error': 'Invalid destination location format in log'}), 400
        
        # Perform the inverse operation based on operation_type
        if operation_type == "PRELIEVO":
            # For a PRELIEVO, we need to add the quantity back to the source location
            # Check if the item still exists in the location
            cursor.execute(
                "SELECT qta FROM wms_items WHERE id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?",
                (article_code, source_area, source_scaffale, source_colonna, source_piano)
            )
            existing_item = cursor.fetchone()
            
            
                # Create new entry
            cursor.execute(
                    "INSERT INTO wms_items (id_art, area, scaffale, colonna, piano, qta, dimensione) VALUES (?, ?, ?, ?, ?, ?, 'Zero')",
                    (article_code, source_area, source_scaffale, source_colonna, source_piano, quantity)
                )
            
            revert_details = f"Ripristino prelievo: Articolo {article_code} aggiunto a {source_location} - QTA: {int(quantity)}"
        
        elif operation_type == "TRANSFER":
            # For a transfer, we need to move the package from the destination back to the source
            # First, verify that the total quantity is available at the destination
            cursor.execute(
                """SELECT SUM(qta) as total_qta 
                   FROM wms_items 
                   WHERE id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?""",
                (article_code, dest_area, dest_scaffale, dest_colonna, dest_piano)
            )
            total_result = cursor.fetchone()
            
            if not total_result or total_result.total_qta is None or float(total_result.total_qta) < quantity:
                conn.close()
                return jsonify({'error': f'Non è disponibile una quantità sufficiente al trasferimento. Richiesta: {int(quantity)}, Disponibile: {total_result.total_qta if total_result and total_result.total_qta is not None else 0}'}), 400
            
            # Check if we have the exact transfer package ID in additional_data
            transfer_pacco_id = None
            transfer_pacco_ids = []
            
            # Handle both single ID and multiple IDs scenarios
            if additional_data:
                if 'destination_pacco_id' in additional_data:
                    transfer_pacco_id = additional_data['destination_pacco_id']
                    transfer_pacco_ids = [transfer_pacco_id]
                elif 'all_destination_pacco_ids' in additional_data:
                    transfer_pacco_ids = additional_data['all_destination_pacco_ids']
                    
            if transfer_pacco_ids:
                # First verify these packages exist and have sufficient quantity
                placeholders = ','.join(['?'] * len(transfer_pacco_ids))
                cursor.execute(
                    f"""SELECT SUM(qta) as pacco_total 
                       FROM wms_items 
                       WHERE id_pacco IN ({placeholders})
                       AND id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?""",
                    transfer_pacco_ids + [article_code, dest_area, dest_scaffale, dest_colonna, dest_piano]
                )
                pacco_total_result = cursor.fetchone()
                
                if not pacco_total_result or pacco_total_result.pacco_total is None or float(pacco_total_result.pacco_total) < quantity:
                    conn.close()
                    return jsonify({'error': f'I pacchi identificati per questo trasferimento non contengono più una quantità sufficiente. Richiesta: {int(quantity)}, Disponibile nei pacchi: {pacco_total_result.pacco_total if pacco_total_result and pacco_total_result.pacco_total is not None else 0}, probabilmente è avvenuto un ulteriore trasferimento.'}), 400
                
                # Update all identified package locations directly
                remaining_to_move = quantity
                for pacco_id in transfer_pacco_ids:
                    cursor.execute(
                        """SELECT qta FROM wms_items WHERE id_pacco = ?""", 
                        (pacco_id,)
                    )
                    pacco_qty_result = cursor.fetchone()
                    
                    if not pacco_qty_result:
                        continue
                        
                    pacco_qty = float(pacco_qty_result[0])
                    qty_to_move = min(pacco_qty, remaining_to_move)
                    
                    if qty_to_move == pacco_qty:
                        # Move the entire package
                        cursor.execute(
                            """UPDATE wms_items 
                               SET area = ?, scaffale = ?, colonna = ?, piano = ? 
                               WHERE id_pacco = ?""",
                            (source_area, source_scaffale, source_colonna, source_piano, pacco_id)
                        )
                    else:
                        # Split the package - reduce quantity at destination
                        cursor.execute(
                            """UPDATE wms_items SET qta = ? WHERE id_pacco = ?""",
                            (pacco_qty - qty_to_move, pacco_id)
                        )
                        
                        # Create new package at source with the moved quantity
                        cursor.execute(
                            """INSERT INTO wms_items 
                               (id_art, area, scaffale, colonna, piano, qta, dimensione) 
                               SELECT id_art, ?, ?, ?, ?, ?, dimensione 
                               FROM wms_items WHERE id_pacco = ?""",
                            (source_area, source_scaffale, source_colonna, source_piano, qty_to_move, pacco_id)
                        )
                    
                    remaining_to_move -= qty_to_move
                    if remaining_to_move <= 0:
                        break
                
                # Check if all quantity was moved
                if remaining_to_move > 0:
                    conn.close()
                    return jsonify({'error': 'Failed to move all required quantity back to source'}), 400
            else:
                # Legacy approach - find packages at the destination with sufficient total quantity
                cursor.execute(
                    """SELECT id_pacco, qta 
                       FROM wms_items 
                       WHERE id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?
                       ORDER BY qta DESC""",
                    (article_code, dest_area, dest_scaffale, dest_colonna, dest_piano)
                )
                dest_items = cursor.fetchall()
                
                if not dest_items:
                    conn.close()
                    return jsonify({'error': 'Nessun articolo trovato nella posizione di destinazione'}), 400
                
                # Move packages until we've moved the required quantity
                remaining_to_move = quantity
                for dest_item in dest_items:
                    item_id = dest_item.id_pacco
                    item_qty = float(dest_item.qta)
                    
                    qty_to_move = min(item_qty, remaining_to_move)
                    
                    if qty_to_move == item_qty:
                        # Move the entire package
                        cursor.execute(
                            """UPDATE wms_items 
                               SET area = ?, scaffale = ?, colonna = ?, piano = ? 
                               WHERE id_pacco = ?""",
                            (source_area, source_scaffale, source_colonna, source_piano, item_id)
                        )
                    else:
                        # Split the package - reduce quantity at destination
                        cursor.execute(
                            """UPDATE wms_items SET qta = ? WHERE id_pacco = ?""",
                            (item_qty - qty_to_move, item_id)
                        )
                        
                        # Create new package at source with the moved quantity
                        cursor.execute(
                            """INSERT INTO wms_items 
                               (id_art, area, scaffale, colonna, piano, qta, dimensione) 
                               SELECT id_art, ?, ?, ?, ?, ?, dimensione 
                               FROM wms_items WHERE id_pacco = ?""",
                            (source_area, source_scaffale, source_colonna, source_piano, qty_to_move, item_id)
                        )
                    
                    remaining_to_move -= qty_to_move
                    if remaining_to_move <= 0:
                        break
                
                # Check if all quantity was moved
                if remaining_to_move > 0:
                    conn.close()
                    return jsonify({'error': f'Impossibile ripristinare la quantità richiesta. Richiesta: {int(quantity)}, Quantità disponibile: {total_result.total_qta if total_result and total_result.total_qta is not None else 0}'}), 400
            
            revert_details = f"Ripristino trasferimento: Articolo {article_code} spostato da {destination_location} a {source_location} - QTA: {int(quantity)}"
        
        elif operation_type == "INSERT" or operation_type == "MULTIPLE_INSERT":
            # For insert operations, we need to delete entries or reduce quantities
            # The destination_location will contain the location where the item was inserted
            if not destination_location:
                conn.close()
                return jsonify({
                    'error': 'Operazione non annullabile: dati di posizione mancanti', 
                    'details': 'Questa operazione di inserimento è stata effettuata prima dell\'implementazione del sistema di log completo e non può essere annullata. Per favore, esegui manualmente l\'operazione.'
                }), 400
                
            # Check the total quantity at the destination location
            cursor.execute(
                """SELECT SUM(qta) as total_qta 
                   FROM wms_items 
                   WHERE id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?""",
                (article_code, dest_area, dest_scaffale, dest_colonna, dest_piano)
            )
            total_result = cursor.fetchone()
            
            if not total_result or total_result.total_qta is None:
                conn.close()
                return jsonify({'error': 'No items found at the specified location'}), 400
                
            total_quantity = float(total_result.total_qta)
            if total_quantity < quantity:
                conn.close()
                return jsonify({'error': f'La quantità totale corrente è minore della quantità da rimuovere. Richiesta: {int(quantity)}, Disponibile: {int(total_quantity)}'}), 400
            
            # Get all records at this location for this article, ordered by quantity (smallest first)
            cursor.execute(
                """SELECT id_pacco, qta 
                   FROM wms_items 
                   WHERE id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?
                   ORDER BY qta ASC""",
                (article_code, dest_area, dest_scaffale, dest_colonna, dest_piano)
            )
            all_items = cursor.fetchall()
            
            remaining_to_remove = quantity
            
            # Remove quantities from records until we've removed the total required amount
            for item in all_items:
                item_id = item.id_pacco
                item_qty = float(item.qta)
                
                if item_qty <= remaining_to_remove:
                    # Remove this entire record
                    cursor.execute(
                        "DELETE FROM wms_items WHERE id_pacco = ?",
                        (item_id,)
                    )
                    remaining_to_remove -= item_qty
                else:
                    # Reduce this record's quantity
                    new_qty = item_qty - remaining_to_remove
                    cursor.execute(
                        "UPDATE wms_items SET qta = ? WHERE id_pacco = ?",
                        (new_qty, item_id)
                    )
                    remaining_to_remove = 0
                
                # If we've removed all we need, stop
                if remaining_to_remove <= 0:
                    break
                    
            if operation_type == "MULTIPLE_INSERT":
                revert_details = f"Ripristino inserimento multiplo: Articolo {article_code} rimosso da {destination_location} - QTA: {int(quantity)}"
            else:
                revert_details = f"Ripristino inserimento: Articolo {article_code} rimosso da {destination_location} - QTA: {int(quantity)}"
        
        else:
            conn.close()
            return jsonify({'error': f'Cannot undo operation of type {operation_type}'}), 400
        
        # Mark the original operation as undone
        cursor.execute(
            "UPDATE wms_log SET is_undone = 1 WHERE id = ?",
            (log_id,)
        )
        
        # Log the revert operation
        log_operation(
            operation_type="REVERT",
            operation_details=revert_details,
            user="current_user",  # Replace with actual user info if available
            ip_address=request.remote_addr,
            article_code=article_code,
            source_location=destination_location if operation_type == "TRANSFER" else None,
            destination_location=source_location if operation_type == "TRANSFER" else 
                                (destination_location if operation_type == "INSERT" or operation_type == "MULTIPLE_INSERT" else source_location),
            quantity=quantity,
            can_undo=False,
            additional_data={"original_log_id": log_id}
        )
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Operation successfully reverted',
            'details': revert_details
        }), 200
        
    except Exception as e:
        print(f"Error reverting operation: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/batch-revert-operations', methods=['POST'])
def batch_revert_operations():
    """
    Revert multiple operations at once based on their log IDs.
    This endpoint processes all reversals in a single transaction.
    """
    try:
        data = request.json
        log_ids = data.get('log_ids', [])
        
        if not log_ids:
            return jsonify({'error': 'No log_ids provided'}), 400
        
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Start a transaction
        conn.autocommit = False
        
        results = {
            'success': [],
            'failed': []
        }
        
        for log_id in log_ids:
            try:
                # Get the operation details from the log
                cursor.execute(
                    """SELECT id, operation_type, article_code, source_location, destination_location, 
                            quantity, is_undone, can_undo, additional_data
                     FROM wms_log 
                     WHERE id = ?""", 
                    (log_id,)
                )
                log_entry = cursor.fetchone()
                
                if not log_entry:
                    results['failed'].append({
                        'log_id': log_id,
                        'error': 'Log entry not found'
                    })
                    continue
                
                # Check if the operation can be undone
                if log_entry.is_undone:
                    results['failed'].append({
                        'log_id': log_id,
                        'error': 'This operation has already been undone'
                    })
                    continue
                
                if not log_entry.can_undo:
                    results['failed'].append({
                        'log_id': log_id,
                        'error': 'This operation cannot be undone'
                    })
                    continue
                
                # Extract operation details
                operation_type = log_entry.operation_type
                article_code = log_entry.article_code
                source_location = log_entry.source_location
                destination_location = log_entry.destination_location
                quantity = float(log_entry.quantity) if log_entry.quantity else 0
                additional_data = json.loads(log_entry.additional_data) if log_entry.additional_data else {}
                
                # Parse locations
                if source_location:
                    source_parts = source_location.split('-')
                    if len(source_parts) >= 4:
                        source_area, source_scaffale, source_colonna, source_piano = source_parts[:4]
                    else:
                        results['failed'].append({
                            'log_id': log_id,
                            'error': 'Invalid source location format in log'
                        })
                        continue
                
                if destination_location:
                    dest_parts = destination_location.split('-')
                    if len(dest_parts) >= 4:
                        dest_area, dest_scaffale, dest_colonna, dest_piano = dest_parts[:4]
                    else:
                        results['failed'].append({
                            'log_id': log_id,
                            'error': 'Invalid destination location format in log'
                        })
                        continue
                
                # Perform the inverse operation based on operation_type
                if operation_type == "PRELIEVO":
                    # For a PRELIEVO, we need to add the quantity back to the source location
                    # Check if the item still exists in the location
                    cursor.execute(
                        "SELECT qta FROM wms_items WHERE id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?",
                        (article_code, source_area, source_scaffale, source_colonna, source_piano)
                    )
                    existing_item = cursor.fetchone()
                    
                    if existing_item:
                        # Update existing quantity
                        new_quantity = float(existing_item[0]) + quantity
                        cursor.execute(
                            "UPDATE wms_items SET qta = ? WHERE id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?",
                            (new_quantity, article_code, source_area, source_scaffale, source_colonna, source_piano)
                        )
                    else:
                        # Create new entry
                        cursor.execute(
                            "INSERT INTO wms_items (id_art, area, scaffale, colonna, piano, qta, dimensione) VALUES (?, ?, ?, ?, ?, ?, 'Zero')",
                            (article_code, source_area, source_scaffale, source_colonna, source_piano, quantity)
                        )
                    
                    revert_details = f"Ripristino prelievo: Articolo {article_code} aggiunto a {source_location} - QTA: {int(quantity)}"
                
                elif operation_type == "TRANSFER":
                    # For a transfer, we need to move the package from the destination back to the source
                    # First, verify that the total quantity is available at the destination
                    cursor.execute(
                        """SELECT SUM(qta) as total_qta 
                           FROM wms_items 
                           WHERE id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?""",
                        (article_code, dest_area, dest_scaffale, dest_colonna, dest_piano)
                    )
                    total_result = cursor.fetchone()
                    
                    if not total_result or total_result.total_qta is None or float(total_result.total_qta) < quantity:
                        results['failed'].append({
                            'log_id': log_id,
                            'error': f'Not enough quantity at destination location to revert transfer. Required: {quantity}, Available: {total_result.total_qta if total_result and total_result.total_qta is not None else 0}'
                        })
                        continue
                    
                    # Check if we have the exact transfer package ID in additional_data
                    transfer_pacco_id = None
                    transfer_pacco_ids = []
                    
                    # Handle both single ID and multiple IDs scenarios
                    if additional_data:
                        if 'destination_pacco_id' in additional_data:
                            transfer_pacco_id = additional_data['destination_pacco_id']
                            transfer_pacco_ids = [transfer_pacco_id]
                        elif 'all_destination_pacco_ids' in additional_data:
                            transfer_pacco_ids = additional_data['all_destination_pacco_ids']
                            
                    if transfer_pacco_ids:
                        # First verify these packages exist and have sufficient quantity
                        placeholders = ','.join(['?'] * len(transfer_pacco_ids))
                        cursor.execute(
                            f"""SELECT SUM(qta) as pacco_total 
                               FROM wms_items 
                               WHERE id_pacco IN ({placeholders})
                               AND id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?""",
                            transfer_pacco_ids + [article_code, dest_area, dest_scaffale, dest_colonna, dest_piano]
                        )
                        pacco_total_result = cursor.fetchone()
                        
                        if not pacco_total_result or pacco_total_result.pacco_total is None or float(pacco_total_result.pacco_total) < quantity:
                            results['failed'].append({
                                'log_id': log_id,
                                'error': f'The packages identified for this transfer no longer contain sufficient quantity. Required: {quantity}, Available in packages: {pacco_total_result.pacco_total if pacco_total_result and pacco_total_result.pacco_total is not None else 0}'
                            })
                            continue
                        
                        # Update all identified package locations directly
                        remaining_to_move = quantity
                        for pacco_id in transfer_pacco_ids:
                            cursor.execute(
                                """SELECT qta FROM wms_items WHERE id_pacco = ?""", 
                                (pacco_id,)
                            )
                            pacco_qty_result = cursor.fetchone()
                            
                            if not pacco_qty_result:
                                continue
                                
                            pacco_qty = float(pacco_qty_result[0])
                            qty_to_move = min(pacco_qty, remaining_to_move)
                            
                            if qty_to_move == pacco_qty:
                                # Move the entire package
                                cursor.execute(
                                    """UPDATE wms_items 
                                       SET area = ?, scaffale = ?, colonna = ?, piano = ? 
                                       WHERE id_pacco = ?""",
                                    (source_area, source_scaffale, source_colonna, source_piano, pacco_id)
                                )
                            else:
                                # Split the package - reduce quantity at destination
                                cursor.execute(
                                    """UPDATE wms_items SET qta = ? WHERE id_pacco = ?""",
                                    (pacco_qty - qty_to_move, pacco_id)
                                )
                                
                                # Create new package at source with the moved quantity
                                cursor.execute(
                                    """INSERT INTO wms_items 
                                       (id_art, area, scaffale, colonna, piano, qta, dimensione) 
                                       SELECT id_art, ?, ?, ?, ?, ?, dimensione 
                                       FROM wms_items WHERE id_pacco = ?""",
                                    (source_area, source_scaffale, source_colonna, source_piano, qty_to_move, pacco_id)
                                )
                            
                            remaining_to_move -= qty_to_move
                            if remaining_to_move <= 0:
                                break
                        
                        # Check if all quantity was moved
                        if remaining_to_move > 0:
                            results['failed'].append({
                                'log_id': log_id,
                                'error': 'Failed to move all required quantity back to source'
                            })
                            continue
                    else:
                        # Legacy approach - find packages at the destination with sufficient total quantity
                        cursor.execute(
                            """SELECT id_pacco, qta 
                               FROM wms_items 
                               WHERE id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?
                               ORDER BY qta DESC""",
                            (article_code, dest_area, dest_scaffale, dest_colonna, dest_piano)
                        )
                        dest_items = cursor.fetchall()
                        
                        if not dest_items:
                            results['failed'].append({
                                'log_id': log_id,
                                'error': 'No matching items found at destination location'
                            })
                            continue
                        
                        # Move packages until we've moved the required quantity
                        remaining_to_move = quantity
                        for dest_item in dest_items:
                            item_id = dest_item.id_pacco
                            item_qty = float(dest_item.qta)
                            
                            qty_to_move = min(item_qty, remaining_to_move)
                            
                            if qty_to_move == item_qty:
                                # Move the entire package
                                cursor.execute(
                                    """UPDATE wms_items 
                                       SET area = ?, scaffale = ?, colonna = ?, piano = ? 
                                       WHERE id_pacco = ?""",
                                    (source_area, source_scaffale, source_colonna, source_piano, item_id)
                                )
                            else:
                                # Split the package - reduce quantity at destination
                                cursor.execute(
                                    """UPDATE wms_items SET qta = ? WHERE id_pacco = ?""",
                                    (item_qty - qty_to_move, item_id)
                                )
                                
                                # Create new package at source with the moved quantity
                                cursor.execute(
                                    """INSERT INTO wms_items 
                                       (id_art, area, scaffale, colonna, piano, qta, dimensione) 
                                       SELECT id_art, ?, ?, ?, ?, ?, dimensione 
                                       FROM wms_items WHERE id_pacco = ?""",
                                    (source_area, source_scaffale, source_colonna, source_piano, qty_to_move, item_id)
                                )
                            
                            remaining_to_move -= qty_to_move
                            if remaining_to_move <= 0:
                                break
                        
                        # Check if all quantity was moved
                        if remaining_to_move > 0:
                            results['failed'].append({
                                'log_id': log_id,
                                'error': 'Failed to move all required quantity back to source'
                            })
                            continue
                    
                    revert_details = f"Ripristino trasferimento: Articolo {article_code} spostato da {destination_location} a {source_location} - QTA: {int(quantity)}"
                
                elif operation_type == "INSERT" or operation_type == "MULTIPLE_INSERT":
                    # For an insert operation, we need to delete entries or reduce quantities
                    # The destination_location will contain the location where the item was inserted
                    if not destination_location:
                        results['failed'].append({
                            'log_id': log_id,
                            'error': 'Operazione non annullabile: dati di posizione mancanti',
                            'details': 'Questa operazione di inserimento è stata effettuata prima dell\'implementazione del sistema di log completo e non può essere annullata.'
                        })
                        continue
                    
                    # Check the total quantity at the destination location
                    cursor.execute(
                        """SELECT SUM(qta) as total_qta 
                           FROM wms_items 
                           WHERE id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?""",
                        (article_code, dest_area, dest_scaffale, dest_colonna, dest_piano)
                    )
                    total_result = cursor.fetchone()
                    
                    if not total_result or total_result.total_qta is None:
                        results['failed'].append({
                            'log_id': log_id,
                            'error': 'No items found at the specified location'
                        })
                        continue
                        
                    total_quantity = float(total_result.total_qta)
                    if total_quantity < quantity:
                        results['failed'].append({
                            'log_id': log_id,
                            'error': f'La quantità totale corrente è minore della quantità da rimuovere. Richiesta: {int(quantity)}, Disponibile: {int(total_quantity)}'
                        })
                        continue
                    
                    # Get all records at this location for this article, ordered by quantity (smallest first)
                    cursor.execute(
                        """SELECT id_pacco, qta 
                           FROM wms_items 
                           WHERE id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?
                           ORDER BY qta ASC""",
                        (article_code, dest_area, dest_scaffale, dest_colonna, dest_piano)
                    )
                    all_items = cursor.fetchall()
                    
                    remaining_to_remove = quantity
                    
                    # Remove quantities from records until we've removed the total required amount
                    for item in all_items:
                        item_id = item.id_pacco
                        item_qty = float(item.qta)
                        
                        if item_qty <= remaining_to_remove:
                            # Remove this entire record
                            cursor.execute(
                                "DELETE FROM wms_items WHERE id_pacco = ?",
                                (item_id,)
                            )
                            remaining_to_remove -= item_qty
                        else:
                            # Reduce this record's quantity
                            new_qty = item_qty - remaining_to_remove
                            cursor.execute(
                                "UPDATE wms_items SET qta = ? WHERE id_pacco = ?",
                                (new_qty, item_id)
                            )
                            remaining_to_remove = 0
                        
                        # If we've removed all we need, stop
                        if remaining_to_remove <= 0:
                            break
                        
                    if operation_type == "MULTIPLE_INSERT":
                        revert_details = f"Ripristino inserimento multiplo: Articolo {article_code} rimosso da {destination_location} - QTA: {int(quantity)}"
                    else:
                        revert_details = f"Ripristino inserimento: Articolo {article_code} rimosso da {destination_location} - QTA: {int(quantity)}"
                
                else:
                    results['failed'].append({
                        'log_id': log_id,
                        'error': f'Cannot undo operation of type {operation_type}'
                    })
                    continue
                
                # Mark the original operation as undone
                cursor.execute(
                    "UPDATE wms_log SET is_undone = 1 WHERE id = ?",
                    (log_id,)
                )
                
                # Log the revert operation
                log_operation(
                    operation_type="REVERT",
                    operation_details=revert_details,
                    user="current_user",  # Replace with actual user info if available
                    ip_address=request.remote_addr,
                    article_code=article_code,
                    source_location=destination_location if operation_type == "TRANSFER" else None,
                    destination_location=source_location if operation_type == "TRANSFER" else 
                                (destination_location if operation_type == "INSERT" or operation_type == "MULTIPLE_INSERT" else source_location),
                    quantity=quantity,
                    can_undo=False,
                    additional_data={"original_log_id": log_id}
                )
                
                results['success'].append({
                    'log_id': log_id,
                    'message': 'Operation successfully reverted'
                })
                
            except Exception as e:
                # Log the error but continue with other operations
                results['failed'].append({
                    'log_id': log_id,
                    'error': str(e)
                })
        
        # Commit the transaction if there were any successful operations
        if results['success']:
            conn.commit()
        
        conn.close()
        
        return jsonify({
            'summary': {
                'total': len(log_ids),
                'successful': len(results['success']),
                'failed': len(results['failed'])
            },
            'results': results
        }), 200
        
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        print(f"Error in batch revert operations: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/location-items', methods=['GET'])
def get_location_items():
    """
    Get all items in a specific location (area, scaffale, colonna, piano) with details.
    Similar structure to ordine-lavoro endpoint, but filters by location instead of work order.
    """
    area = request.args.get('area')
    scaffale = request.args.get('scaffale')
    colonna = request.args.get('colonna')
    piano = request.args.get('piano')

    # Build filter conditions based on provided parameters
    filter_conditions = []
    params = []
    
    if area:
        filter_conditions.append("area = ?")
        params.append(area)
    if scaffale:
        filter_conditions.append("scaffale = ?")
        params.append(scaffale)
    if colonna:
        filter_conditions.append("colonna = ?")
        params.append(colonna)
    if piano:
        filter_conditions.append("piano = ?")
        params.append(piano)

    if not filter_conditions:
        return jsonify({'error': 'At least one location parameter (area, scaffale, colonna, piano) is required'}), 400

    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()

        # Query wms_items for items at the specified location
        query_wms = f"""
        SELECT 
            id_art, 
            id_pacco,
            id_mov,
            fornitore, 
            area, 
            scaffale, 
            colonna, 
            piano, 
            qta,
            dimensione,
            CASE 
                WHEN scaffale IN ('S', 'R') THEN 1 
                ELSE 0 
            END AS scaffale_order
        FROM 
            wms_items
        WHERE 
            {' AND '.join(filter_conditions)}
            AND qta > 0
        ORDER BY
            scaffale_order,
            area,
            scaffale,
            colonna,
            piano,
            id_pacco ASC
        """
        cursor.execute(query_wms, params)
        wms_rows = cursor.fetchall()

        # Group by article and gather all packages for each
        article_groups = {}
        
        for row in wms_rows:
            id_art = row.id_art.strip() if row.id_art else ''
            
            if id_art not in article_groups:
                # Get article description from mganag table
                query_desc = """
                    SELECT amg_desc, amg_des2
                    FROM wms_v_mganag
                    WHERE amg_code = ?
                """
                cursor.execute(query_desc, (id_art,))
                desc_row = cursor.fetchone()
                
                if desc_row:
                    occ_desc_combined = f"{desc_row.amg_desc} {desc_row.amg_des2}".strip()
                else:
                    occ_desc_combined = 'Descrizione non disponibile'
                
          
                mpl_padre = None
                
                # Initialize article group
                article_groups[id_art] = {
                    'id_art': id_art,
                    'occ_arti': id_art,
                    'occ_desc_combined': occ_desc_combined,
                    'locations': [],
                    'total_quantity': 0,
                    'mpl_padre': mpl_padre  # Include distinta parent if exists
                }
            
            # Add location info
            location_key = (row.area, row.scaffale, row.colonna, row.piano)
            location_exists = False
            
            for loc in article_groups[id_art]['locations']:
                if (loc['area'], loc['scaffale'], loc['colonna'], loc['piano']) == location_key:
                    # Location already exists, add package
                    loc['pacchi'].append({
                        'id_pacco': row.id_pacco,
                        'quantity': float(row.qta),
                        'id_mov': row.id_mov
                    })
                    loc['total_quantity'] += float(row.qta)
                    location_exists = True
                    break
            
            if not location_exists:
                # Add new location
                article_groups[id_art]['locations'].append({
                    'area': row.area,
                    'scaffale': row.scaffale,
                    'colonna': row.colonna,
                    'piano': row.piano,
                    'pacchi': [{
                        'id_pacco': row.id_pacco,
                        'quantity': float(row.qta),
                        'id_mov': row.id_mov
                    }],
                    'total_quantity': float(row.qta)
                })
            
            # Update total quantity
            article_groups[id_art]['total_quantity'] += float(row.qta)
        
        # Format the results to match the ordine-lavoro response structure
        detailed_results = []
        
        for article_id, article_data in article_groups.items():
            # For each location, create an entry
            for location in article_data['locations']:
                detailed_results.append({
                    'occ_arti': article_data['occ_arti'],
                    'occ_desc_combined': article_data['occ_desc_combined'],
                    'status': 'available',
                    'pacchi': location['pacchi'],
                    'location': {
                        'area': location['area'],
                        'scaffale': location['scaffale'],
                        'colonna': location['colonna'],
                        'piano': location['piano'],
                    },
                    'available_quantity': str(int(location['total_quantity'])),
                    'total_quantity': str(int(location['total_quantity'])),
                    **({"mpl_padre": article_data['mpl_padre']} if article_data['mpl_padre'] else {})
                })
        
        # Sort results by article ID
        detailed_results.sort(key=lambda x: x['occ_arti'])
        
        return jsonify(detailed_results), 200

    except Exception as e:
        print(f"Error in get_location_items: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/shelf-inspection', methods=['GET'])
def get_shelf_inspection():
    """
    Get all current shelf inspections for the warehouse map view.
    Returns a list of inspection records with their current status.
    
    Query parameters:
    - cycle: The inspection cycle date to filter by (optional). If not provided, returns current inspections.
    """
    cycle = request.args.get('cycle')
    
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Base query
        if cycle and cycle != 'current':
            try:
                # Convert cycle string to a proper date object for Informix
                cycle_date = datetime.strptime(cycle, "%Y-%m-%d").date()
                
                # Get inspections for a specific date
                query = """
                SELECT i.id, i.shelf_id, i.inspection_date, i.status, i.is_current
                FROM wms_inspections i
                WHERE i.inspection_date = ?
                """
                cursor.execute(query, (cycle_date,))
            except ValueError as e:
                print(f"Error parsing date: {e}")
                return jsonify({'error': f'Invalid date format. Expected YYYY-MM-DD, got: {cycle}'}), 400
        else:
            # Get all current inspections
            query = """
            SELECT i.id, i.shelf_id, i.inspection_date, i.status, i.is_current
            FROM wms_inspections i
            WHERE i.is_current = 1
            """
            cursor.execute(query)
        
        # Convert rows to a list of dictionaries
        columns = [column[0] for column in cursor.description]
        inspections = []
        
        for row in cursor.fetchall():
            inspection = dict(zip(columns, row))
            
            # Format date for frontend
            if inspection.get('inspection_date'):
                try:
                    if not isinstance(inspection['inspection_date'], str):
                        inspection['inspection_date'] = inspection['inspection_date'].strftime("%Y-%m-%d")
                except Exception as e:
                    inspection['inspection_date'] = str(inspection['inspection_date'])
            
            # Check if needs reinspection (6+ months)
            # Only do this check for current inspections
            needs_reinspection = False
            if cycle == 'current' or not cycle:
                if inspection.get('inspection_date'):
                    try:
                        last_date = datetime.strptime(str(inspection['inspection_date']), "%Y-%m-%d") if isinstance(inspection['inspection_date'], str) else inspection['inspection_date']
                        today = datetime.now()
                        
                        # Calculate months difference
                        months_diff = (today.year - last_date.year) * 12 + today.month - last_date.month
                        needs_reinspection = months_diff >= 6
                    except Exception as e:
                        print(f"Error calculating reinspection: {e}")
            
            # For frontend compatibility
            inspection['scaffale'] = inspection['shelf_id']
            inspection['last_check'] = inspection['inspection_date']
            inspection['needs_new_inspection'] = needs_reinspection
            
            inspections.append(inspection)
        
        return jsonify(inspections)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/shelf-inspection/<shelf_id>', methods=['GET'])
def get_single_shelf_inspection(shelf_id):
    """
    Get inspection details for a specific shelf.
    Returns the inspection record with its status.
    
    Query parameters:
    - cycle: The inspection cycle date to filter by (optional). If not provided, returns current inspection.
    """
    cycle = request.args.get('cycle')
    
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Get the inspection for this shelf based on cycle parameter
        if cycle and cycle != 'current':
            try:
                # Convert cycle string to a proper date object for Informix
                cycle_date = datetime.strptime(cycle, "%Y-%m-%d").date()
                
                query = """
                SELECT i.id, i.shelf_id, i.inspection_date, i.status, i.is_current
                FROM wms_inspections i
                WHERE i.shelf_id = ? AND i.inspection_date = ?
                """
                cursor.execute(query, (shelf_id, cycle_date))
            except ValueError as e:
                return jsonify({'error': f'Invalid date format. Expected YYYY-MM-DD, got: {cycle}'}), 400
        else:
            # Get current inspection for this shelf
            query = """
            SELECT i.id, i.shelf_id, i.inspection_date, i.status, i.is_current
            FROM wms_inspections i
            WHERE i.shelf_id = ? AND i.is_current = 1
            """
            cursor.execute(query, (shelf_id,))
        
        result = cursor.fetchone()
        
        # If no inspection exists for the requested parameters
        if not result:
            return jsonify({
                'shelf_id': shelf_id,
                'scaffale': shelf_id,  # For frontend compatibility
                'status': 'to_check',
                'inspection_date': None,
                'last_check': None    # For frontend compatibility
            })
        
        # Convert row to dictionary
        columns = [column[0] for column in cursor.description]
        inspection = dict(zip(columns, result))
        
        # Format date for frontend
        if inspection.get('inspection_date'):
            try:
                if not isinstance(inspection['inspection_date'], str):
                    inspection['inspection_date'] = inspection['inspection_date'].strftime("%Y-%m-%d")
            except Exception as e:
                inspection['inspection_date'] = str(inspection['inspection_date'])
        
        # Check if needs reinspection (6+ months) - only for current cycle
        needs_reinspection = False
        if (cycle == 'current' or not cycle) and inspection.get('inspection_date'):
            try:
                last_date = datetime.strptime(str(inspection['inspection_date']), "%Y-%m-%d") if isinstance(inspection['inspection_date'], str) else inspection['inspection_date']
                today = datetime.now()
                
                # Calculate months difference
                months_diff = (today.year - last_date.year) * 12 + today.month - last_date.month
                needs_reinspection = months_diff >= 6
            except Exception as e:
                print(f"Error calculating reinspection: {e}")
        
        # For frontend compatibility
        inspection['scaffale'] = inspection['shelf_id']
        inspection['last_check'] = inspection['inspection_date']
        inspection['needs_new_inspection'] = needs_reinspection
        
        return jsonify(inspection)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/shelf-inspection-questions/<shelf_id>', methods=['GET'])
def get_shelf_inspection_questions(shelf_id):
    """
    Get question responses for a specific shelf's inspection.
    
    Query parameters:
    - cycle: The inspection cycle date to filter by (optional). If not provided, returns current inspection questions.
    """
    cycle = request.args.get('cycle')
    
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Get the inspection ID based on cycle parameter
        if cycle and cycle != 'current':
            try:
                # Convert cycle string to a proper date object for Informix
                cycle_date = datetime.strptime(cycle, "%Y-%m-%d").date()
                
                query = """
                SELECT id FROM wms_inspections
                WHERE shelf_id = ? AND inspection_date = ?
                """
                cursor.execute(query, (shelf_id, cycle_date))
            except ValueError as e:
                return jsonify({'error': f'Invalid date format. Expected YYYY-MM-DD, got: {cycle}'}), 400
        else:
            # Get current inspection ID
            query = """
            SELECT id FROM wms_inspections
            WHERE shelf_id = ? AND is_current = 1
            """
            cursor.execute(query, (shelf_id,))
        
        inspection_result = cursor.fetchone()
        
        # If no inspection exists for the requested parameters, return empty array
        if not inspection_result:
            return jsonify([])
        
        inspection_id = inspection_result[0]
        
        # Now get all responses for this inspection
        query = """
        SELECT r.question, r.answer, r.notes
        FROM wms_inspection_responses r
        WHERE r.inspection_id = ?
        """
        cursor.execute(query, (inspection_id,))
        
        # Convert rows to a list of dictionaries
        columns = [column[0] for column in cursor.description]
        responses = []
        
        for row in cursor.fetchall():
            response = dict(zip(columns, row))
            # For frontend compatibility
            response['domanda'] = response['question']
            response['risposta'] = response['answer']
            response['note'] = response['notes']
            responses.append(response)
        
        return jsonify(responses)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/shelf-inspection-history/<shelf_id>', methods=['GET'])
def get_shelf_inspection_history(shelf_id):
    """
    Get inspection history for a specific shelf.
    Returns a list of all inspection records for this shelf, including their responses,
    sorted by date (newest first).
    """
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Get all inspections for this shelf
        query = """
        SELECT i.id, i.shelf_id, i.inspection_date, i.status, i.is_current
        FROM wms_inspections i
        WHERE i.shelf_id = ?
        ORDER BY i.inspection_date DESC
        """
        cursor.execute(query, (shelf_id,))
        
        # Convert rows to a list of dictionaries
        columns = [column[0] for column in cursor.description]
        inspection_records = []
        
        # For each inspection record, fetch its associated questions
        for row in cursor.fetchall():
            inspection = dict(zip(columns, row))
            
            # Format date for frontend
            if inspection.get('inspection_date'):
                try:
                    if not isinstance(inspection['inspection_date'], str):
                        inspection['inspection_date'] = inspection['inspection_date'].strftime("%Y-%m-%d")
                except Exception as e:
                    inspection['inspection_date'] = str(inspection['inspection_date'])
            
            # Get question responses for this inspection
            questions_query = """
            SELECT r.question, r.answer, r.notes
            FROM wms_inspection_responses r
            WHERE r.inspection_id = ?
            """
            cursor.execute(questions_query, (inspection['id'],))
            
            # Convert rows to a list of dictionaries
            question_columns = [column[0] for column in cursor.description]
            questions = []
            
            for qrow in cursor.fetchall():
                question = dict(zip(question_columns, qrow))
                # For frontend compatibility
                question['domanda'] = question['question']
                question['risposta'] = question['answer']
                question['note'] = question['notes']
                questions.append(question)
            
            # For frontend compatibility
            inspection['scaffale'] = inspection['shelf_id']
            inspection['last_check'] = inspection['inspection_date']
            inspection['date'] = inspection['inspection_date'] 
            inspection['questions'] = questions
            inspection['has_questions'] = len(questions) > 0
            
            inspection_records.append(inspection)
        
        return jsonify(inspection_records)
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/shelf-inspection-complete/<shelf_id>', methods=['POST'])
def save_complete_shelf_inspection(shelf_id):
    """
    Save a complete inspection for a shelf, including status and question responses.
    
    Request body should contain:
    - status: The inspection status ('buono', 'warning', 'danger', 'to_check')
    - questions: Array of question responses with question text, answer, and optional notes
    - cycle: (Optional) The inspection cycle to save to. If not provided, uses current cycle.
    
    Returns the updated inspection data.
    """
    data = request.get_json()
    status = data.get('status')
    questions = data.get('questions', [])
    cycle = data.get('cycle', 'current')  # Default to current cycle
    
    # Validate status
    valid_statuses = ['buono', 'warning', 'danger', 'to_check']
    if not status or status not in valid_statuses:
        return jsonify({'error': f'Invalid status. Must be one of: {", ".join(valid_statuses)}'}), 400
    
    if not isinstance(questions, list):
        return jsonify({'error': 'Expected an array of question responses'}), 400
    
    conn = None
    cursor = None
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Start transaction
        conn.autocommit = False
        
        inspection_id = None
        new_inspection_created = False
        today_date = datetime.now().date()
        
        # Handle based on cycle parameter
        if cycle != 'current':
            # Non-current cycle (historical) - only allow updates to existing inspections
            try:
                cycle_date = datetime.strptime(cycle, "%Y-%m-%d").date()
                
                # Find existing inspection in the specified historical cycle
                query = "SELECT id FROM wms_inspections WHERE shelf_id = ? AND inspection_date = ?"
                cursor.execute(query, (shelf_id, cycle_date))
                existing_inspection = cursor.fetchone()
                
                if existing_inspection:
                    inspection_id = existing_inspection[0]
                    update_query = "UPDATE wms_inspections SET status = ? WHERE id = ?"
                    cursor.execute(update_query, (status, inspection_id))
                    print(f"Updated historical inspection, ID: {inspection_id}")
                else:
                    return jsonify({'error': 'Cannot create a new inspection in a historical cycle'}), 400
            except ValueError:
                return jsonify({'error': f'Invalid date format for cycle: {cycle}. Expected YYYY-MM-DD'}), 400
        else:
            # Current cycle - find the current inspection date
            # Get the current inspection date from any shelf with is_current=1
            cycle_query = """
                SELECT inspection_date
                FROM wms_inspections
                WHERE is_current = 1
                ORDER BY inspection_date DESC
                FETCH FIRST 1 ROWS ONLY
            """
            cursor.execute(cycle_query)
            cycle_date_result = cursor.fetchone()
            
            # If we have an active cycle, use its date, otherwise use today
            current_cycle_date = cycle_date_result[0] if cycle_date_result and cycle_date_result[0] else today_date
            
            print(f"Current cycle date determined to be: {current_cycle_date}")
            
            # Check if there's already an inspection for this shelf *in this specific cycle date*
            query = """
                SELECT id 
                FROM wms_inspections 
                WHERE shelf_id = ? AND inspection_date = ? AND is_current = 1
            """
            cursor.execute(query, (shelf_id, current_cycle_date))
            existing_inspection = cursor.fetchone()
            
            if existing_inspection:
                # Update existing inspection in current cycle
                inspection_id = existing_inspection[0]
                update_query = "UPDATE wms_inspections SET status = ? WHERE id = ?"
                cursor.execute(update_query, (status, inspection_id))
                print(f"Updated existing inspection in current cycle, ID: {inspection_id}")
            else:
                # Create new inspection for this specific cycle date
                try:
                    print(f"Creating new inspection for shelf {shelf_id} in cycle {current_cycle_date}")
                    insert_query = """
                    INSERT INTO wms_inspections (shelf_id, inspection_date, status, is_current)
                    VALUES (?, ?, ?, 1)
                    """
                    cursor.execute(insert_query, (shelf_id, current_cycle_date, status))
                    
                    # Get the new inspection ID - be more specific with our query
                    cursor.execute("""
                        SELECT id FROM wms_inspections 
                        WHERE shelf_id = ? AND inspection_date = ? AND is_current = 1
                    """, (shelf_id, current_cycle_date))
                    last_id_result = cursor.fetchone()
                    inspection_id = last_id_result[0] if last_id_result else None
                    
                    if not inspection_id:
                        # Try a more general query just in case
                        cursor.execute("SELECT MAX(id) FROM wms_inspections WHERE shelf_id = ?", (shelf_id,))
                        alt_id_result = cursor.fetchone()
                        inspection_id = alt_id_result[0] if alt_id_result else None
                    
                    print(f"Created new inspection in cycle {current_cycle_date}, ID: {inspection_id}")
                    
                    new_inspection_created = True
                except Exception as e:
                    # Handle unique constraint violations
                    if "unique constraint" in str(e).lower() or "ORA-00001" in str(e) or "WMS_INSPECTIONS_UK" in str(e).upper():
                        print(f"Unique constraint violation: {str(e)} - Trying to find existing record")
                        
                        # Find the existing record that caused the constraint violation
                        cursor.execute("""
                            SELECT id FROM wms_inspections 
                            WHERE shelf_id = ? AND inspection_date = ?
                        """, (shelf_id, current_cycle_date))
                        existing_record = cursor.fetchone()
                        
                        if existing_record:
                            inspection_id = existing_record[0]
                            # Make sure to set is_current=1 in case the record exists but was archived
                            update_query = """
                                UPDATE wms_inspections 
                                SET status = ?, is_current = 1 
                                WHERE id = ?
                            """
                            cursor.execute(update_query, (status, inspection_id))
                            print(f"Updated existing inspection (id={inspection_id}) after constraint violation")
                        else:
                            # If we can't find it, let's look more broadly
                            cursor.execute("""
                                SELECT id FROM wms_inspections
                                WHERE shelf_id = ?
                                ORDER BY inspection_date DESC
                                FETCH FIRST 1 ROWS ONLY
                            """, (shelf_id,))
                            any_record = cursor.fetchone()
                            
                            if any_record:
                                inspection_id = any_record[0]
                                # This isn't ideal, but at least we have some record to update
                                update_query = """
                                    UPDATE wms_inspections 
                                    SET status = ?, is_current = 1, inspection_date = ?
                                    WHERE id = ?
                                """
                                cursor.execute(update_query, (status, current_cycle_date, inspection_id))
                                print(f"Updated alternative existing inspection as last resort (id={inspection_id})")
                            else:
                                # If we still can't find anything, we have a real error
                                raise
        
        if not inspection_id:
            conn.rollback()
            return jsonify({'error': 'Failed to create or update inspection record'}), 500
        
        # First, delete any existing responses for this inspection
        delete_query = "DELETE FROM wms_inspection_responses WHERE inspection_id = ?"
        cursor.execute(delete_query, (inspection_id,))
        print(f"Deleted existing responses for inspection ID: {inspection_id}")
        
        # Insert new responses
        inserted_count = 0
        error_details = []
        
        # Process each question individually with improved error handling
        for question in questions:
            q_text = question.get('domanda', question.get('question', ''))
            answer = question.get('risposta', question.get('answer', ''))
            notes = question.get('note', question.get('notes', ''))
            
            # Skip questions with empty question text or answer
            if not q_text or not answer:
                continue
                
            # Truncate fields to prevent errors - match the actual VARCHAR sizes in the database
            if q_text and len(q_text) > 250:  # VARCHAR(255) limit
                q_text = q_text[:250]
                error_details.append({
                    'message': 'Question text was truncated to 250 characters',
                    'question': q_text[:50]
                })
            
            # Normalize answer
            if answer:
                answer = str(answer).upper()
                if answer not in ['SI', 'NO', 'NA']:
                    answer = answer[:2] if answer else 'NA'
                
                if len(answer) > 10:
                    answer = answer[:10]
                    error_details.append({
                        'message': 'Answer was truncated to 10 characters',
                        'question': q_text[:50] if q_text else 'Unknown question'
                    })
            
            # Handle notes field - truncate if needed
            if notes:
                notes = str(notes)
                if len(notes) > 250:  # VARCHAR(256) limit, use 250 to be safe
                    notes = notes[:250]
                    error_details.append({
                        'message': 'Notes were truncated to 250 characters',
                        'question': q_text[:50]
                    })
            else:
                notes = ''  # Ensure notes is a string, not None
            
            # INFORMIX WORKAROUND: Use a simple direct insert approach
            try:
                # Simple direct insert with all parameters to avoid two-step issues
                cursor.execute("""
                INSERT INTO wms_inspection_responses (inspection_id, question, answer, notes)
                VALUES (?, ?, ?, ?)
                """, (inspection_id, q_text, answer, notes))
                
                inserted_count += 1
                
            except Exception as e:
                error_msg = str(e)
                print(f"Error inserting question response: {error_msg}")
                
                # Try another approach for Informix with splitting notes
                try:
                    # Insert with empty notes first
                    cursor.execute("""
                    INSERT INTO wms_inspection_responses (inspection_id, question, answer, notes)
                    VALUES (?, ?, ?, '')
                    """, (inspection_id, q_text, answer))
                    
                    # Get the last inserted ID
                    cursor.execute("SELECT MAX(id) FROM wms_inspection_responses WHERE inspection_id = ?", (inspection_id,))
                    response_id = cursor.fetchone()[0]
                    
                    # Update notes in a separate step if we have them
                    if notes and response_id:
                        cursor.execute("""
                        UPDATE wms_inspection_responses SET notes = ? WHERE id = ?
                        """, (notes, response_id))
                    
                    inserted_count += 1
                    error_details.append({
                        'message': 'Used alternative insertion method',
                        'question': q_text[:50] if q_text else 'Unknown question'
                    })
                    
                except Exception as inner_e:
                    error_msg = str(inner_e)
                    print(f"Alternative approach also failed: {error_msg}")
                    
                    # Last resort: try without parameter binding for notes
                    try:
                        # Escape single quotes in the strings
                        q_text_escaped = q_text.replace("'", "''") if q_text else ""
                        notes_escaped = notes.replace("'", "''") if notes else ""
                        answer_escaped = answer.replace("'", "''") if answer else ""
                        
                        # Build and execute a direct SQL statement
                        direct_sql = f"""
                        INSERT INTO wms_inspection_responses (inspection_id, question, answer, notes)
                        VALUES ({inspection_id}, '{q_text_escaped}', '{answer_escaped}', '{notes_escaped}')
                        """
                        cursor.execute(direct_sql)
                        inserted_count += 1
                        
                        error_details.append({
                            'message': 'Used direct SQL insertion as last resort',
                            'question': q_text[:50] if q_text else 'Unknown question'
                        })
                    except Exception as final_e:
                        print(f"All insertion methods failed: {str(final_e)}")
                        error_details.append({
                            'message': f'Could not save response: {str(final_e)}',
                            'question': q_text[:50] if q_text else 'Unknown question'
                        })
        
        print(f"Inserted {inserted_count} questions in total")
        
        # Commit all changes if we got this far
        conn.commit()
        
        # Return the result
        response_data = {
            'shelf_id': shelf_id,
            'scaffale': shelf_id,  # For frontend compatibility
            'status': status,
            'inspection_date': today_date.strftime("%Y-%m-%d") if new_inspection_created else None,
            'last_check': today_date.strftime("%Y-%m-%d") if new_inspection_created else None,  # For frontend compatibility
            'new_inspection': new_inspection_created,
            'questions_saved': inserted_count
        }
        
        if error_details:
            response_data['warnings'] = True
            response_data['error_details'] = error_details
        
        return jsonify(response_data)
        
    except Exception as e:
        print(f"Exception in save_complete_shelf_inspection: {str(e)}")
        if conn:
            try:
                conn.rollback()
            except:
                pass
        return jsonify({'error': str(e)}), 500
    finally:
        if cursor:
            try:
                cursor.close()
            except:
                pass
        if conn:
            try:
                # Reset autocommit before closing
                conn.autocommit = True
                conn.close()
            except:
                pass

@app.route('/api/inspection-cycles', methods=['GET'])
def get_inspection_cycles():
    """
    Get all available inspection cycles, excluding the current one.
    Returns a list of distinct inspection dates that can be used to view historical inspections.
    """
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Get distinct inspection dates, ordered by newest first, excluding current cycle
        query = """
        SELECT DISTINCT inspection_date, MAX(id) as max_id
        FROM wms_inspections
        WHERE is_current = 0  -- Exclude current cycle
        GROUP BY inspection_date
        ORDER BY inspection_date DESC
        """
        cursor.execute(query)
        
        cycles = []
        for row in cursor.fetchall():
            inspection_date = row[0]
            cycle_id = row[1]
            
            # Skip None dates
            if inspection_date is None:
                continue
                
            # Format date for frontend - ensure it's a proper date object first
            try:
                # Convert to Python date object if it's not already
                if isinstance(inspection_date, str):
                    date_obj = datetime.strptime(inspection_date, "%Y-%m-%d").date()
                else:
                    date_obj = inspection_date
                
                # Format consistently as YYYY-MM-DD
                formatted_date = date_obj.strftime("%Y-%m-%d")
                
                # Get count of inspections for this date
                count_query = """
                SELECT COUNT(*) FROM wms_inspections WHERE inspection_date = ?
                """
                cursor.execute(count_query, (date_obj,))
                count_result = cursor.fetchone()
                count = count_result[0] if count_result else 0
                
                # Format a readable label with date and count
                italian_date = date_obj.strftime("%d/%m/%Y")
                
                cycles.append({
                    'id': formatted_date,
                    'date': formatted_date,
                    'label': f'Ispezione del {italian_date} ({count} scaffali)',
                    'count': count,
                    'cycle_id': cycle_id
                })
            except Exception as e:
                print(f"Error processing date {inspection_date}: {str(e)}")
                # Skip invalid dates
                continue
        
        return jsonify(cycles)
    
    except Exception as e:
        print(f"Error fetching inspection cycles: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/inspection-cycles', methods=['POST'])
def create_inspection_cycle():
    """
    Create a new inspection cycle by archiving all current inspections.
    Creates a clear distinction for the new cycle by using today's date.
    """
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Start transaction
        conn.autocommit = False
        
        # Get today's date for the new cycle
        today_date = datetime.now().date()
        
        # Archive all current inspections
        archive_query = "UPDATE wms_inspections SET is_current = 0 WHERE is_current = 1"
        cursor.execute(archive_query)
        
        # Get the count of archived inspections
        cursor.execute("SELECT COUNT(*) FROM wms_inspections WHERE is_current = 0")
        archived_count = cursor.fetchone()[0]
        
        # Store the new cycle date in the database to make it available for all clients
        # We need to make at least one "marker" record to establish the new cycle
        try:
            # Create a marker record with a special shelf_id to indicate the cycle date
            cursor.execute("""
                INSERT INTO wms_inspections (shelf_id, inspection_date, status, is_current)
                VALUES ('cycle_marker', ?, 'to_check', 1)
            """, (today_date,))
            print(f"Created new cycle marker with date: {today_date}")
        except Exception as marker_error:
            # If the marker already exists, just update it
            print(f"Could not create marker, trying update: {str(marker_error)}")
            cursor.execute("""
                UPDATE wms_inspections 
                SET inspection_date = ?, is_current = 1
                WHERE shelf_id = 'cycle_marker'
            """, (today_date,))
        
        # Commit transaction
        conn.commit()
        
        return jsonify({
            'success': True,
            'message': 'New inspection cycle created',
            'archived_count': archived_count,
            'date': today_date.strftime("%Y-%m-%d")
        })
        
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"Error creating new inspection cycle: {str(e)}")
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/update-location-quantity', methods=['PUT'])
def update_location_quantity():
    """Update quantity for a specific location and article"""
    try:
        data = request.get_json()
        
        # Extract parameters
        id_art = data.get('id_art')
        area = data.get('area')
        scaffale = data.get('scaffale')
        colonna = data.get('colonna')
        piano = data.get('piano')
        new_quantity = data.get('new_quantity')
        old_quantity = data.get('old_quantity')
        # Visualizza magazzino shows one row per location and movement: when 'id_mov' is sent
        # only that movement's packages are changed (null = packages without a movement)
        per_movimento = 'id_mov' in data
        id_mov = normalizza_movimento(data.get('id_mov')) or None
        movimento_condition = (" AND id_mov = ?" if id_mov else " AND id_mov IS NULL") if per_movimento else ""
        movimento_params = (id_mov,) if per_movimento and id_mov else ()
        
        # Validate input parameters
        if not all([id_art, area, scaffale, colonna, piano, new_quantity is not None, old_quantity is not None]):
            return jsonify({'error': 'Missing required parameters'}), 400
        
        # Convert quantity to Decimal
        try:
            new_quantity = Decimal(str(new_quantity))
            old_quantity = Decimal(str(old_quantity))
        except (ValueError, TypeError, InvalidOperation):
            return jsonify({'error': 'Invalid quantity value'}), 400
        
        # Validate that new quantity is not negative
        if new_quantity < 0:
            return jsonify({'error': 'Quantity cannot be negative'}), 400
        
        conn = connect_to_db()
        cursor = conn.cursor()
        conn.autocommit = False  # Start transaction
        
        try:
            # First, verify the current total quantity at this location
            verify_query = """
            SELECT SUM(qta) AS total_qta
            FROM wms_items
            WHERE id_art = ?
              AND area = ?
              AND scaffale = ?
              AND colonna = ?
              AND piano = ?
            """ + movimento_condition
            cursor.execute(verify_query, (id_art, area, scaffale, colonna, piano) + movimento_params)
            result = cursor.fetchone()
            
            if not result or result.total_qta is None:
                return jsonify({'error': 'No items found at the specified location'}), 404
            
            current_total = Decimal(str(result.total_qta))
            
            # Verify that the old quantity matches what we expect
            if current_total != old_quantity:
                return jsonify({'error': f'Quantity mismatch. Expected: {old_quantity}, Current: {current_total}'}), 400
            
            # Calculate the difference
            quantity_diff = new_quantity - old_quantity
            
            if quantity_diff == 0:
                return jsonify({'message': 'No change in quantity'}), 200
            
            if quantity_diff > 0:
                # Adding quantity - create a new package
                insert_query = """
                INSERT INTO wms_items (id_art, id_mov, area, scaffale, colonna, piano, qta, dimensione)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Zero')
                """
                cursor.execute(insert_query, (id_art, id_mov, area, scaffale, colonna, piano, quantity_diff))
                
            else:
                # Removing quantity - need to remove from existing packages
                remaining_to_remove = abs(quantity_diff)
                
                # Get all packages at this location, ordered by quantity (smallest first)
                packages_query = """
                SELECT id_pacco, qta
                FROM wms_items
                WHERE id_art = ?
                  AND area = ?
                  AND scaffale = ?
                  AND colonna = ?
                  AND piano = ?
                """ + movimento_condition + " ORDER BY qta ASC"
                cursor.execute(packages_query, (id_art, area, scaffale, colonna, piano) + movimento_params)
                packages = cursor.fetchall()
                
                for package in packages:
                    if remaining_to_remove <= 0:
                        break
                    
                    package_id = package.id_pacco
                    package_qty = Decimal(str(package.qta))
                    
                    if package_qty <= remaining_to_remove:
                        # Remove entire package
                        cursor.execute("DELETE FROM wms_items WHERE id_pacco = ?", (package_id,))
                        remaining_to_remove -= package_qty
                    else:
                        # Reduce package quantity
                        new_package_qty = package_qty - remaining_to_remove
                        cursor.execute("UPDATE wms_items SET qta = ? WHERE id_pacco = ?", (new_package_qty, package_id))
                        remaining_to_remove = 0
                
                if remaining_to_remove > 0:
                    conn.rollback()
                    return jsonify({'error': 'Insufficient quantity to remove'}), 400
            
            # Log the operation
            operation_details = f"Quantità aggiornata per articolo {id_art}{f' (movimento {id_mov})' if id_mov else ''} in {area}-{scaffale}-{colonna}-{piano}: {old_quantity} a {new_quantity}"
            
            log_operation(
                operation_type="AGGIORNAMENTO_QUANTITA",
                operation_details=operation_details,
                article_code=id_art,
                source_location=f"{area}-{scaffale}-{colonna}-{piano}",
                quantity=abs(quantity_diff),
                additional_data={
                    'old_quantity': float(old_quantity),
                    'new_quantity': float(new_quantity),
                    'quantity_change': float(quantity_diff)
                }
            )
            
            conn.commit()
            
            return jsonify({
                'message': 'Quantity updated successfully',
                'old_quantity': float(old_quantity),
                'new_quantity': float(new_quantity),
                'quantity_change': float(quantity_diff)
            }), 200
            
        except Exception as e:
            conn.rollback()
            raise e
            
    except Exception as e:
        return jsonify({'error': f'Failed to update quantity: {str(e)}'}), 500
    finally:
        if 'conn' in locals():
            conn.close()


# =============================================
# NEW INSPECTION SYSTEM v2 - HELPER FUNCTIONS
# =============================================

def add_months(source_date, months):
    """Add months to a date, handling month overflow correctly"""
    month = source_date.month - 1 + months
    year = source_date.year + month // 12
    month = month % 12 + 1
    day = min(source_date.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def months_between_full(date1, date2):
    """Calculate full months between two dates"""
    if date1 > date2:
        date1, date2 = date2, date1
    
    months = (date2.year - date1.year) * 12 + (date2.month - date1.month)
    
    # If the day hasn't reached the same day in the target month, subtract 1
    if date2.day < date1.day:
        months -= 1
    
    return months


# =============================================
# INSPECTION CYCLES API v2
# =============================================

@app.route('/api/v2/inspection-cycles', methods=['GET'])
def get_inspection_cycles_v2():
    """Get all inspection cycles with status information"""
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Get all cycles ordered by start date
        query = """
        SELECT id, cycle_name, start_date, end_date, is_active, notes, created_at
        FROM wms_inspection_cycles
        ORDER BY start_date DESC
        """
        cursor.execute(query)
        
        cycles = []
        for row in cursor.fetchall():
            cycle = {
                'id': row[0],
                'cycle_name': row[1],
                'start_date': row[2].strftime('%Y-%m-%d') if row[2] else None,
                'end_date': row[3].strftime('%Y-%m-%d') if row[3] else None,
                'is_active': bool(row[4]),
                'notes': row[5],
                'created_at': row[6].strftime('%Y-%m-%d %H:%M:%S') if row[6] else None
            }
            
            # Get inspection count for this cycle
            count_query = "SELECT COUNT(*) FROM wms_shelf_inspections WHERE cycle_id = ?"
            cursor.execute(count_query, (cycle['id'],))
            count_result = cursor.fetchone()
            cycle['inspection_count'] = count_result[0] if count_result else 0
            
            cycles.append(cycle)
        
        return jsonify({
            'success': True,
            'cycles': cycles
        })
        
    except Exception as e:
        print(f"Error fetching cycles: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/v2/inspection-cycles/status', methods=['GET'])
def get_cycle_creation_status_v2():
    """Check if a new cycle can be created (4-month rule)"""
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Get the most recent cycle
        query = """
        SELECT start_date, cycle_name
        FROM wms_inspection_cycles
        ORDER BY start_date DESC
        FETCH FIRST 1 ROWS ONLY
        """
        cursor.execute(query)
        result = cursor.fetchone()
        
        if not result:
            # No cycles exist, can create first one
            return jsonify({
                'success': True,
                'can_create': True,
                'last_cycle_date': None,
                'months_since_last': None,
                'next_allowed_date': date.today().strftime('%Y-%m-%d'),
                'message': 'Nessun ciclo esistente. È possibile creare il primo ciclo.'
            })
        
        last_cycle_date = result[0]
        last_cycle_name = result[1]
        today = date.today()
        
        months_since = months_between_full(last_cycle_date, today)
        can_create = months_since >= 4
        
        next_allowed_date = add_months(last_cycle_date, 4)
        
        return jsonify({
            'success': True,
            'can_create': can_create,
            'last_cycle_date': last_cycle_date.strftime('%Y-%m-%d'),
            'last_cycle_name': last_cycle_name,
            'months_since_last': months_since,
            'next_allowed_date': next_allowed_date.strftime('%Y-%m-%d'),
            'message': f'Ultimo ciclo: {last_cycle_name} del {last_cycle_date.strftime("%d/%m/%Y")}. ' +
                      ('Puoi creare un nuovo ciclo.' if can_create else f'Nuovo ciclo possibile dal {next_allowed_date.strftime("%d/%m/%Y")}.')
        })
        
    except Exception as e:
        print(f"Error checking cycle status: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/v2/inspection-cycles', methods=['POST'])
def create_inspection_cycle_v2():
    """Create a new inspection cycle"""
    try:
        data = request.get_json()
        cycle_name = data.get('cycle_name', f'Ciclo {datetime.now().strftime("%B %Y")}')
        notes = data.get('notes', '')
        is_active = data.get('is_active', True)  # Allow controlling active status
        
        conn = connect_to_db()
        cursor = conn.cursor()
        conn.autocommit = False
        
        today = date.today()
        
        # If creating an active cycle, deactivate current active cycle
        if is_active:
            cursor.execute("UPDATE wms_inspection_cycles SET is_active = 0, end_date = ? WHERE is_active = 1", (today,))
        
        # Create new cycle
        insert_query = """
        INSERT INTO wms_inspection_cycles (cycle_name, start_date, is_active, notes)
        VALUES (?, ?, ?, ?)
        """
        cursor.execute(insert_query, (cycle_name, today, 1 if is_active else 0, notes))
        
        # Get the new cycle ID
        cursor.execute("SELECT id FROM wms_inspection_cycles WHERE start_date = ? AND cycle_name = ?", (today, cycle_name))
        new_cycle = cursor.fetchone()
        new_cycle_id = new_cycle[0] if new_cycle else None
        
        conn.commit()
        
        return jsonify({
            'success': True,
            'cycle_id': new_cycle_id,
            'cycle_name': cycle_name,
            'start_date': today.strftime('%Y-%m-%d'),
            'is_active': is_active,
            'message': f'Nuovo ciclo "{cycle_name}" creato con successo'
        })
        
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
        print(f"Error creating cycle: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/v2/inspection-cycles/close-current', methods=['POST'])
def close_current_inspection_cycle():
    """Close the current active inspection cycle without creating a new one"""
    try:
        data = request.get_json()
        notes = data.get('notes', 'Ciclo chiuso dall\'operatore')
        
        conn = connect_to_db()
        cursor = conn.cursor()
        conn.autocommit = False
        
        today = date.today()
        
        # Get the current active cycle
        cursor.execute("SELECT id, cycle_name FROM wms_inspection_cycles WHERE is_active = 1 FETCH FIRST 1 ROWS ONLY")
        current_cycle = cursor.fetchone()
        
        if not current_cycle:
            return jsonify({
                'success': False,
                'error': 'Nessun ciclo attivo trovato da chiudere'
            }), 400
        
        current_cycle_id = current_cycle[0]
        current_cycle_name = current_cycle[1]
        
        # Close the current cycle
        cursor.execute("""
            UPDATE wms_inspection_cycles 
            SET is_active = 0, end_date = ?, notes = ? 
            WHERE id = ?
        """, (today, notes, current_cycle_id))
        
        conn.commit()
        
        return jsonify({
            'success': True,
            'completed_cycle_id': current_cycle_id,
            'completed_cycle_name': current_cycle_name,
            'end_date': today.strftime('%Y-%m-%d'),
            'message': f'Ciclo "{current_cycle_name}" chiuso con successo'
        })
        
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
        print(f"Error closing cycle: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/v2/inspection-cycles/<cycle_id>/activate', methods=['PUT'])
def activate_inspection_cycle(cycle_id):
    """Activate a specific inspection cycle (deactivates all others)"""
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        conn.autocommit = False
        
        # First, check if the cycle exists
        cursor.execute("SELECT id, cycle_name FROM wms_inspection_cycles WHERE id = ?", (cycle_id,))
        cycle = cursor.fetchone()
        
        if not cycle:
            return jsonify({
                'success': False,
                'error': f'Ciclo con ID {cycle_id} non trovato'
            }), 404
        
        cycle_name = cycle[1]
        
        # Deactivate all current active cycles
        cursor.execute("UPDATE wms_inspection_cycles SET is_active = 0 WHERE is_active = 1")
        
        # Activate the specified cycle
        cursor.execute("UPDATE wms_inspection_cycles SET is_active = 1 WHERE id = ?", (cycle_id,))
        
        conn.commit()
        
        return jsonify({
            'success': True,
            'cycle_id': cycle_id,
            'cycle_name': cycle_name,
            'message': f'Ciclo "{cycle_name}" attivato con successo'
        })
        
    except Exception as e:
        if 'conn' in locals():
            conn.rollback()
        print(f"Error activating cycle: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


# =============================================
# SHELF INSPECTIONS API v2
# =============================================

@app.route('/api/v2/shelf-inspections', methods=['GET'])
def get_shelf_inspections_v2():
    """Get shelf inspections for a specific cycle"""
    try:
        cycle_id = request.args.get('cycle_id')
        
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # If no cycle_id specified, get the active cycle
        if not cycle_id:
            cursor.execute("SELECT id FROM wms_inspection_cycles WHERE is_active = 1 FETCH FIRST 1 ROWS ONLY")
            active_cycle = cursor.fetchone()
            cycle_id = active_cycle[0] if active_cycle else None
            
            if not cycle_id:
                return jsonify({
                    'success': False,
                    'error': 'Nessun ciclo attivo trovato'
                }), 404
        
        # Get cycle information
        cycle_query = """
        SELECT id, cycle_name, start_date, is_active
        FROM wms_inspection_cycles
        WHERE id = ?
        """
        cursor.execute(cycle_query, (cycle_id,))
        cycle_info = cursor.fetchone()
        
        if not cycle_info:
            return jsonify({
                'success': False,
                'error': 'Ciclo non trovato'
            }), 404
        
        # Get inspections for this cycle
        inspections_query = """
        SELECT id, shelf_id, inspection_date, status, inspector_name, notes, created_at, updated_at
        FROM wms_shelf_inspections
        WHERE cycle_id = ?
        ORDER BY shelf_id
        """
        cursor.execute(inspections_query, (cycle_id,))
        
        inspections = []
        for row in cursor.fetchall():
            inspection = {
                'id': row[0],
                'shelf_id': row[1],
                'scaffale': row[1],  # Frontend compatibility
                'inspection_date': row[2].strftime('%Y-%m-%d') if row[2] else None,
                'status': row[3],
                'inspector_name': row[4],
                'notes': row[5],
                'created_at': row[6].strftime('%Y-%m-%d %H:%M:%S') if row[6] else None,
                'updated_at': row[7].strftime('%Y-%m-%d %H:%M:%S') if row[7] else None
            }
            
            # Check if needs reinspection (6+ months from inspection date)
            needs_reinspection = False
            if inspection['inspection_date'] and cycle_info[3]:  # Only for active cycles
                inspection_date = datetime.strptime(inspection['inspection_date'], '%Y-%m-%d').date()
                months_since = months_between_full(inspection_date, date.today())
                needs_reinspection = months_since >= 6
            
            inspection['needs_new_inspection'] = needs_reinspection
            inspection['last_check'] = inspection['inspection_date']  # Frontend compatibility
            
            inspections.append(inspection)
        
        return jsonify({
            'success': True,
            'cycle': {
                'id': cycle_info[0],
                'name': cycle_info[1],
                'start_date': cycle_info[2].strftime('%Y-%m-%d') if cycle_info[2] else None,
                'is_active': bool(cycle_info[3])
            },
            'inspections': inspections
        })
        
    except Exception as e:
        print(f"Error fetching inspections: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/v2/shelf-inspections/<shelf_id>/history', methods=['GET'])
def get_shelf_inspection_history_v2(shelf_id):
    """
    Get inspection history for a specific shelf using the new v2 schema.
    Returns a list of all inspection records for this shelf, including their responses,
    sorted by date (newest first).
    """
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Get all inspections for this shelf from the new schema
        query = """
        SELECT si.id, si.shelf_id, si.inspection_date, si.status, 
               si.inspector_name, si.notes, si.created_at,
               ic.cycle_name
        FROM wms_shelf_inspections si
        JOIN wms_inspection_cycles ic ON si.cycle_id = ic.id
        WHERE si.shelf_id = ?
        ORDER BY si.inspection_date DESC
        """
        cursor.execute(query, (shelf_id,))
        
        inspection_records = []
        
        # For each inspection record, fetch its associated questions and responses
        for row in cursor.fetchall():
            inspection = {
                'id': row[0],
                'shelf_id': row[1],
                'scaffale': row[1],  # Frontend compatibility
                'inspection_date': row[2].strftime("%Y-%m-%d") if row[2] else None,
                'date': row[2].strftime("%Y-%m-%d") if row[2] else None,  # Frontend compatibility
                'last_check': row[2].strftime("%Y-%m-%d") if row[2] else None,  # Frontend compatibility
                'status': row[3],
                'inspector_name': row[4],
                'notes': row[5],
                'created_at': row[6],
                'cycle_name': row[7]
            }
            
            # Get question responses for this inspection
            questions_query = """
            SELECT ir.question_text, ir.answer, ir.notes,
                   iq.question_text as template_question
            FROM wms_inspection_responses ir
            LEFT JOIN wms_inspection_questions iq ON ir.question_id = iq.id
            WHERE ir.inspection_id = ?
            ORDER BY ir.id
            """
            cursor.execute(questions_query, (inspection['id'],))
            
            questions = []
            for qrow in cursor.fetchall():
                question = {
                    'question': qrow[0],
                    'domanda': qrow[0],    # Frontend compatibility
                    'answer': qrow[1],
                    'risposta': qrow[1],   # Frontend compatibility
                    'notes': qrow[2],
                    'note': qrow[2]        # Frontend compatibility
                }
                questions.append(question)
            
            inspection['questions'] = questions
            inspection['has_questions'] = len(questions) > 0
            
            inspection_records.append(inspection)
        
        return jsonify({
            'success': True,
            'inspections': inspection_records
        })
    
    except Exception as e:
        print(f"Error fetching inspection history: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/v2/shelf-inspections/<shelf_id>', methods=['GET'])
def get_shelf_inspection_v2(shelf_id):
    """Get specific shelf inspection with questions and responses"""
    try:
        cycle_id = request.args.get('cycle_id')
        
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # If no cycle_id specified, get the active cycle
        if not cycle_id:
            cursor.execute("SELECT id FROM wms_inspection_cycles WHERE is_active = 1 FETCH FIRST 1 ROWS ONLY")
            active_cycle = cursor.fetchone()
            cycle_id = active_cycle[0] if active_cycle else None
        
        if not cycle_id:
            return jsonify({
                'success': False,
                'error': 'Nessun ciclo specificato o attivo'
            }), 400
        
        # Get inspection
        inspection_query = """
        SELECT id, shelf_id, inspection_date, status, inspector_name, notes
        FROM wms_shelf_inspections
        WHERE cycle_id = ? AND shelf_id = ?
        """
        cursor.execute(inspection_query, (cycle_id, shelf_id))
        inspection_result = cursor.fetchone()
        
        if not inspection_result:
            # Return default state for new inspection
            return jsonify({
                'success': True,
                'inspection': {
                    'id': None,
                    'shelf_id': shelf_id,
                    'scaffale': shelf_id,
                    'status': 'to_check',
                    'inspection_date': None,
                    'inspector_name': None,
                    'notes': None,
                    'questions': []
                }
            })
        
        inspection = {
            'id': inspection_result[0],
            'shelf_id': inspection_result[1],
            'scaffale': inspection_result[1],
            'inspection_date': inspection_result[2].strftime('%Y-%m-%d') if inspection_result[2] else None,
            'status': inspection_result[3],
            'inspector_name': inspection_result[4],
            'notes': inspection_result[5]
        }
        
        # Get responses for this inspection
        responses_query = """
        SELECT r.question_id, r.question_text, r.answer, r.notes
        FROM wms_inspection_responses r
        WHERE r.inspection_id = ?
        ORDER BY r.question_id
        """
        cursor.execute(responses_query, (inspection['id'],))
        
        questions = []
        for row in cursor.fetchall():
            question = {
                'question_id': row[0],
                'question': row[1],
                'domanda': row[1],  # Frontend compatibility
                'answer': row[2],
                'risposta': row[2],  # Frontend compatibility
                'notes': row[3],
                'note': row[3]  # Frontend compatibility
            }
            questions.append(question)
        
        inspection['questions'] = questions
        
        return jsonify({
            'success': True,
            'inspection': inspection
        })
        
    except Exception as e:
        print(f"Error fetching shelf inspection: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/v2/shelf-inspections/<shelf_id>', methods=['POST'])
def save_shelf_inspection_v2(shelf_id):
    """Save or update a shelf inspection with questions and responses"""
    try:
        data = request.get_json()
        cycle_id = data.get('cycle_id')
        status = data.get('status')
        inspector_name = data.get('inspector_name', '')
        notes = data.get('notes', '')
        questions = data.get('questions', [])
        
        # Validate required fields
        if not cycle_id or not status:
            return jsonify({
                'success': False,
                'error': 'cycle_id e status sono obbligatori'
            }), 400
        
        if status not in ['to_check', 'buono', 'warning', 'danger']:
            return jsonify({
                'success': False,
                'error': 'Status non valido'
            }), 400
        
        conn = connect_to_db()
        cursor = conn.cursor()
        conn.autocommit = False
        
        try:
            today = date.today()
            
            # Check if inspection already exists
            check_query = """
            SELECT id FROM wms_shelf_inspections
            WHERE cycle_id = ? AND shelf_id = ?
            """
            cursor.execute(check_query, (cycle_id, shelf_id))
            existing = cursor.fetchone()
            
            inspection_id = None
            
            if existing:
                # Update existing inspection
                inspection_id = existing[0]
                update_query = """
                UPDATE wms_shelf_inspections
                SET status = ?, inspector_name = ?, notes = ?, 
                    inspection_date = ?, updated_at = SYSDATE
                WHERE id = ?
                """
                cursor.execute(update_query, (status, inspector_name, notes, today, inspection_id))
            else:
                # Create new inspection
                insert_query = """
                INSERT INTO wms_shelf_inspections 
                (cycle_id, shelf_id, inspection_date, status, inspector_name, notes)
                VALUES (?, ?, ?, ?, ?, ?)
                """
                cursor.execute(insert_query, (cycle_id, shelf_id, today, status, inspector_name, notes))
                
                # Get the new inspection ID
                cursor.execute("SELECT id FROM wms_shelf_inspections WHERE cycle_id = ? AND shelf_id = ?", (cycle_id, shelf_id))
                new_inspection = cursor.fetchone()
                inspection_id = new_inspection[0] if new_inspection else None
            
            if not inspection_id:
                raise Exception("Impossibile ottenere l'ID dell'ispezione")
            
            # Delete existing responses
            cursor.execute("DELETE FROM wms_inspection_responses WHERE inspection_id = ?", (inspection_id,))
            
            # Insert new responses
            inserted_count = 0
            for question in questions:
                question_id = question.get('question_id')
                question_text = question.get('question', question.get('domanda', ''))
                answer = question.get('answer', question.get('risposta', ''))
                response_notes = question.get('notes', question.get('note', ''))
                
                if not question_text or not answer:
                    continue
                
                # Normalize answer
                answer = str(answer).upper()
                if answer not in ['SI', 'NO', 'NA']:
                    answer = 'NA'
                
                # Truncate if necessary
                question_text = question_text[:500] if question_text else ''
                response_notes = response_notes[:1000] if response_notes else ''
                
                # If no question_id provided, try to find it or use a default
                if not question_id:
                    # Try to find matching question
                    cursor.execute("SELECT id FROM wms_inspection_questions WHERE question_text = ? AND is_active = 1", (question_text,))
                    existing_question = cursor.fetchone()
                    question_id = existing_question[0] if existing_question else 1  # Default to first question
                
                insert_response_query = """
                INSERT INTO wms_inspection_responses 
                (inspection_id, question_id, question_text, answer, notes)
                VALUES (?, ?, ?, ?, ?)
                """
                cursor.execute(insert_response_query, (inspection_id, question_id, question_text, answer, response_notes))
                inserted_count += 1
            
            conn.commit()
            
            return jsonify({
                'success': True,
                'inspection_id': inspection_id,
                'shelf_id': shelf_id,
                'status': status,
                'questions_saved': inserted_count,
                'message': f'Ispezione scaffale {shelf_id} salvata con successo'
            })
            
        except Exception as e:
            conn.rollback()
            raise e
        
    except Exception as e:
        print(f"Error saving inspection: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/v2/inspection-questions', methods=['GET'])
def get_inspection_questions_v2():
    """Get all active inspection questions"""
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        query = """
        SELECT id, question_text, question_order
        FROM wms_inspection_questions
        WHERE is_active = 1
        ORDER BY question_order
        """
        cursor.execute(query)
        
        questions = []
        for row in cursor.fetchall():
            question = {
                'id': row[0],
                'question_id': row[0],
                'question_text': row[1],
                'question': row[1],  # Frontend compatibility
                'domanda': row[1],   # Frontend compatibility
                'question_order': row[2],
                'answer': '',        # Default empty answer
                'risposta': '',      # Frontend compatibility
                'notes': '',         # Default empty notes
                'note': ''           # Frontend compatibility
            }
            questions.append(question)
        
        return jsonify({
            'success': True,
            'questions': questions
        })
        
    except Exception as e:
        print(f"Error fetching questions: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


# ---------------------------------------------------------------------------
# Warehouse map (shared by every page, edited from the "Editor mappa" page)
# The latest wms_map_layout row is the map in use; every save adds a version.
# Editing the map never changes wms_items; saving creates the new shelves in wms_scaffali
# (never deletes any).
# ---------------------------------------------------------------------------

MAP_DEFAULT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'map_layout_default.json')
MAP_SECTION_TYPES = ('shelf', 'customText', 'blocked')
MAP_AREA = 'A'  # the map draws the shelves of area A
MAP_NEW_SHELF_VOLUME = 99999999  # free volume of shelves created from the map (no limit, like X-01-0)


def _shelf_ids_sezione(section):
    """(scaffale, colonna, piano) of every cell of a shelf section: same rule as getShelfId in mapUtils.js."""
    if section.get('type', 'shelf') != 'shelf' or section.get('shelfPattern') not in ('regular', 'horizontal'):
        return set()
    def num(key, default):
        value = section.get(key)
        return default if value is None else int(value)
    starting_value, starting_floor = num('startingValue', 1), num('startingFloor', 1)
    span_row, span_col = num('spanRow', 1) or 1, num('spanCol', 1) or 1
    ids = set()
    for r in range(section['height']):
        for c in range(section['width']):
            if section['shelfPattern'] == 'horizontal':
                shelf, floor = starting_value + r // span_row, starting_floor + c
            else:
                shelf, floor = starting_value + c // span_col, section['height'] - r // span_row + (starting_floor - 1)
            ids.add((section['id'], str(shelf).zfill(2), str(floor)))
    return ids


def _shelf_ids_mappa(layout):
    ids = set()
    for page in layout['pages']:
        for section in page['sections']:
            ids |= _shelf_ids_sezione(section)
    return ids


def _carica_mappa_default():
    with open(MAP_DEFAULT_FILE, encoding='utf-8') as f:
        return json.load(f)


def _valida_mappa(layout):
    """Basic structure check; returns an error message or None."""
    if not isinstance(layout, dict) or not isinstance(layout.get('pages'), list) or not layout['pages']:
        return "La mappa deve contenere almeno una pagina"
    for page in layout['pages']:
        if not isinstance(page, dict):
            return "Pagina non valida"
        for key in ('rows', 'cols'):
            if not isinstance(page.get(key), int) or not 1 <= page[key] <= 200:
                return f"Pagina {page.get('page')}: '{key}' deve essere un intero tra 1 e 200"
        if not isinstance(page.get('sections'), list):
            return f"Pagina {page.get('page')}: sezioni mancanti"
        for section in page['sections']:
            if not isinstance(section, dict) or not section.get('id'):
                return f"Pagina {page.get('page')}: sezione senza codice"
            for key in ('startRow', 'startCol', 'width', 'height'):
                if not isinstance(section.get(key), int) or section[key] < (1 if key in ('width', 'height') else 0):
                    return f"Pagina {page.get('page')}, sezione {section.get('id')}: '{key}' non valido"
            if section.get('type', 'shelf') not in MAP_SECTION_TYPES:
                return f"Pagina {page.get('page')}, sezione {section.get('id')}: tipo non valido"
            try:
                shelf_ids = _shelf_ids_sezione(section)
            except (TypeError, ValueError):
                return f"Pagina {page.get('page')}, sezione {section.get('id')}: numerazione non valida"
            # the shelves are created in wms_scaffali: the codes must fit its columns
            for scaffale, colonna, piano in shelf_ids:
                if len(scaffale) > 2 or len(colonna) > 3 or len(piano) > 2:
                    return (f"Pagina {page.get('page')}: lo scaffale {scaffale}-{colonna}-{piano} non è valido "
                            f"(max 2 caratteri per scaffale e piano, 3 per la colonna)")
    return None


@app.route('/api/map-layout', methods=['GET'])
def get_map_layout():
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        cursor.execute("""SELECT id, layout, created_at, created_by FROM wms_map_layout
                          ORDER BY id DESC FETCH FIRST 1 ROWS ONLY""")
        row = cursor.fetchone()
        if not row:
            # Nothing saved yet: the map is the original layout of the WMS
            return jsonify({**_carica_mappa_default(), 'version': None, 'updated_at': None, 'updated_by': None})
        layout = json.loads(row.layout)
        return jsonify({**layout, 'version': row.id,
                        'updated_at': row.created_at.strftime('%Y-%m-%d %H:%M:%S') if row.created_at else None,
                        'updated_by': row.created_by})
    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/map-layout', methods=['PUT'])
def save_map_layout():
    data = request.get_json() or {}
    layout = {'pages': data.get('pages')}
    errore = _valida_mappa(layout)
    if errore:
        return jsonify({'error': errore}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        conn.autocommit = False
        cursor.execute("INSERT INTO wms_map_layout (layout, created_at, created_by, note) VALUES (?, ?, ?, ?)",
                       (json.dumps(layout, ensure_ascii=False), datetime.now().replace(microsecond=0),
                        (data.get('user') or request.remote_addr or 'current_user')[:50],
                        (data.get('note') or '').strip()[:255] or None))
        cursor.execute("SELECT MAX(id) FROM wms_map_layout")
        version = cursor.fetchone()[0]

        # Shelves drawn on the map but missing in wms_scaffali are created (deposits need the row).
        # Shelves no longer on the map are never deleted: they may still hold packages.
        cursor.execute("SELECT scaffale, colonna, piano FROM wms_scaffali WHERE area = ?", (MAP_AREA,))
        esistenti = {(row.scaffale.strip(), row.colonna.strip(), row.piano.strip()) for row in cursor.fetchall()}
        nuovi = sorted(_shelf_ids_mappa(layout) - esistenti, key=lambda s: (s[0], s[1], int(s[2])))
        if nuovi:
            cursor.executemany(
                "INSERT INTO wms_scaffali (area, scaffale, colonna, piano, volume_libero) VALUES (?, ?, ?, ?, ?)",
                [(MAP_AREA, scaffale, colonna, piano, MAP_NEW_SHELF_VOLUME) for scaffale, colonna, piano in nuovi])
        conn.commit()
        creati = [f"{scaffale}-{colonna}-{piano}" for scaffale, colonna, piano in nuovi]

        log_operation(
            operation_type="MAPPA",
            operation_details=f"Mappa magazzino salvata (versione {version}, "
                              f"{len(creati)} scaffali creati, "
                              f"{len(data.get('scaffali_fuori_mappa') or [])} locazioni con articoli fuori mappa)",
            user="current_user",
            ip_address=request.remote_addr,
            can_undo=False,
            additional_data={'version': version, 'scaffali_creati': creati[:200],
                             'scaffali_fuori_mappa': (data.get('scaffali_fuori_mappa') or [])[:100]}
        )
        return jsonify({'success': True, 'version': version, 'scaffali_creati': creati}), 200
    except pyodbc.Error as e:
        if 'conn' in locals():
            conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/map-layout/history', methods=['GET'])
def get_map_layout_history():
    """Saved versions of the map, newest first (the layout itself is loaded on demand)."""
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, created_at, created_by, note FROM wms_map_layout ORDER BY id DESC")
        versions = [{
            'version': row.id,
            'created_at': row.created_at.strftime('%Y-%m-%d %H:%M:%S') if row.created_at else None,
            'created_by': row.created_by,
            'note': row.note,
        } for row in cursor.fetchall()]
        return jsonify(versions)
    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/map-layout/version/<version>', methods=['GET'])
def get_map_layout_version(version):
    """One saved version, or 'originale' for the map the WMS started from."""
    if version == 'originale':
        return jsonify({**_carica_mappa_default(), 'version': 'originale'})
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, layout FROM wms_map_layout WHERE id = ?", (int(version),))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': f'Versione {version} non trovata'}), 404
        return jsonify({**json.loads(row.layout), 'version': row.id})
    except ValueError:
        return jsonify({'error': 'Versione non valida'}), 400
    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


@app.route('/api/map-occupancy', methods=['GET'])
def get_map_occupancy():
    """Locations holding packages: used to colour the map and to warn about shelves with items."""
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT area, scaffale, colonna, piano,
                   COUNT(*) AS pacchi, SUM(qta) AS qta, COUNT(DISTINCT id_art) AS articoli,
                   MIN(id_art) AS primo_articolo
              FROM wms_items
             WHERE qta > 0
             GROUP BY area, scaffale, colonna, piano
             ORDER BY area, scaffale, colonna, piano""")
        result = [{
            'area': row.area, 'scaffale': row.scaffale, 'colonna': row.colonna, 'piano': row.piano,
            'shelf_id': f"{row.scaffale}-{row.colonna}-{row.piano}",
            'locazione': f"{row.area}-{row.scaffale}-{row.colonna}-{row.piano}",
            'pacchi': row.pacchi, 'qta': row.qta, 'articoli': row.articoli, 'primo_articolo': row.primo_articolo,
        } for row in cursor.fetchall()]
        return jsonify(result)
    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


# =============================================
# INVENTARIO (sql/oracle/05_inventario.sql)
# =============================================

def parse_locazione(value):
    """'A-C-01-1' or a map shelf 'C-01-1' (area A) -> (area, scaffale, colonna, piano), None if not valid."""
    parti = [p.strip().upper() for p in str(value or '').split('-') if p.strip()]
    if len(parti) == 3:
        parti.insert(0, MAP_AREA)
    if len(parti) != 4:
        return None
    area, scaffale, colonna, piano = parti
    if colonna.isdigit():
        colonna = colonna.zfill(2)
    return area, scaffale, colonna, piano

@app.route('/api/inventario', methods=['GET'])
def get_inventario():
    """Inventory rows, newest first. per_page=0 returns every row (Excel export)."""
    page = max(request.args.get('page', 1, type=int), 1)
    per_page = request.args.get('per_page', 50, type=int)
    search_text = (request.args.get('search_text') or '').strip().upper()
    try:
        conn = connect_to_db()
        cursor = conn.cursor()

        where_clause, params = "1=1", []
        if search_text:
            where_clause = """(UPPER(i.id_art) LIKE ? OR UPPER(i.id_mov) LIKE ? OR i.ip_address LIKE ?
                               OR i.area || '-' || i.scaffale || '-' || i.colonna || '-' || i.piano LIKE ?)"""
            params = [f"%{search_text}%"] * 4

        cursor.execute(f"SELECT COUNT(*) FROM wms_inventario i WHERE {where_clause}", params)
        total = cursor.fetchone()[0]

        paging = ""
        if per_page > 0:
            per_page = min(per_page, 200)
            paging = f"OFFSET {(page - 1) * per_page} ROWS FETCH NEXT {per_page} ROWS ONLY"
        cursor.execute(f"""
            SELECT i.id, i.ins_ts, i.id_art, i.id_mov, i.area, i.scaffale, i.colonna, i.piano, i.qta, i.ip_address,
                   TRIM(mg.amg_desc || ' ' || mg.amg_des2) AS descrizione
              FROM wms_inventario i
              LEFT JOIN wms_v_mganag mg ON mg.amg_code = i.id_art
             WHERE {where_clause}
             ORDER BY i.ins_ts DESC, i.id DESC
             {paging}""", params)

        current_ip = request.remote_addr
        rows = [{
            'id': row.id,
            'timestamp': row.ins_ts.strftime("%Y-%m-%d %H:%M:%S") if row.ins_ts else None,
            'codice_articolo': row.id_art,
            'descrizione': row.descrizione,
            'movimento': row.id_mov,
            'locazione': f"{row.area}-{row.scaffale}-{row.colonna}-{row.piano}",
            'quantita': row.qta,
            'ip_address': row.ip_address,
            'is_mine': row.ip_address == current_ip,
        } for row in cursor.fetchall()]

        return jsonify({'rows': rows, 'total': total, 'ip_address': current_ip}), 200
    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/inventario', methods=['POST'])
def add_inventario():
    data = request.json or {}
    codice_articolo = articolo_da_barcode(data.get('codice_articolo')).upper()
    movimento = normalizza_movimento(data.get('movimento')) or None
    locazione = parse_locazione(data.get('locazione'))
    try:
        quantita = int(str(data.get('quantita', '')).strip())
    except ValueError:
        quantita = None

    if not codice_articolo:
        return jsonify({'error': 'Codice articolo mancante'}), 400
    if not locazione:
        return jsonify({'error': 'Locazione non valida (formato A-C-01-1)'}), 400
    if quantita is None or quantita <= 0:
        return jsonify({'error': 'Quantità non valida'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()

        cursor.execute("SELECT 1 FROM wms_v_mganag WHERE amg_code = ? FETCH FIRST 1 ROWS ONLY", (codice_articolo,))
        if cursor.fetchone() is None:
            return jsonify({'error': f"Articolo {codice_articolo} non presente in anagrafica"}), 400

        cursor.execute("SELECT 1 FROM wms_scaffali WHERE area = ? AND scaffale = ? AND colonna = ? AND piano = ?",
                       locazione)
        if cursor.fetchone() is None:
            return jsonify({'error': f"Locazione {'-'.join(locazione)} non presente in magazzino"}), 400

        # A movement that doesn't contain the article is saved anyway: the page only warns
        warning = None
        if movimento:
            cursor.execute("SELECT 1 FROM wms_v_movimenti WHERE mov_code = ? AND gim_arti = ? FETCH FIRST 1 ROWS ONLY",
                           (movimento, codice_articolo))
            if cursor.fetchone() is None:
                warning = f"L'articolo {codice_articolo} non risulta nel movimento {movimento}"

        cursor.execute("""
            INSERT INTO wms_inventario (ins_ts, id_art, id_mov, area, scaffale, colonna, piano, qta, ip_address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (datetime.now().replace(microsecond=0), codice_articolo, movimento, *locazione, quantita,
             request.remote_addr))
        conn.commit()

        return jsonify({'success': True, 'warning': warning, 'movimento': movimento,
                        'locazione': '-'.join(locazione)}), 200
    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/inventario/<int:row_id>', methods=['DELETE'])
def delete_inventario(row_id):
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id_art, id_mov, area, scaffale, colonna, piano, qta, ip_address FROM wms_inventario WHERE id = ?",
                       (row_id,))
        row = cursor.fetchone()
        if row is None:
            return jsonify({'error': 'Riga non trovata'}), 404

        cursor.execute("DELETE FROM wms_inventario WHERE id = ?", (row_id,))
        conn.commit()

        locazione = f"{row.area}-{row.scaffale}-{row.colonna}-{row.piano}"
        log_operation(
            operation_type="INVENTARIO_DELETE",
            operation_details=f"Eliminata riga inventario {row_id}: {row.qta} articolo {row.id_art} in {locazione} (inserita da {row.ip_address})",
            ip_address=request.remote_addr,
            article_code=row.id_art,
            source_location=locazione,
            quantity=row.qta,
            can_undo=False,
            additional_data={'movimento': row.id_mov}
        )
        return jsonify({'success': True}), 200
    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


# Start the server with waitress if this file is run directly
if __name__ == '__main__':
    try:
        from waitress import serve
        import socket
        
        # Get local IP address
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        
        # Default port
        port = int(os.getenv('PORT', 5000))
        
        print(f"Starting Waitress server on {local_ip}:{port}")
        print("Press Ctrl+C to quit")
        
        # Start waitress server
        serve(app, host='0.0.0.0', port=port, threads=6)
    except ImportError:
        print("Waitress not available, using Flask development server")
        # Default port
        port = int(os.getenv('PORT', 5000))
        print(f"Starting Flask development server on port {port}")
        print("Press Ctrl+C to quit")
        app.run(host='0.0.0.0', port=port, debug=True)
