from flask import Flask, jsonify, request, g
from flask_cors import CORS
from decimal import Decimal, InvalidOperation
from datetime import datetime
from dotenv import load_dotenv

# extra imports for logging/debugging and DB
import logging
import sys
import time
import uuid
import os
import pyodbc
import json
import socket
import traceback

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)

# CORS for API endpoints
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=False)

# Low-level WSGI middleware to force-request logging before Flask/Waitress
class RequestLoggerMiddleware:
    def __init__(self, app, logfile=None):
        self.app = app
        self.logfile = logfile or os.path.join(os.path.dirname(__file__), 'request_debug.log')

    def __call__(self, environ, start_response):
        try:
            method = environ.get('REQUEST_METHOD')
            path = environ.get('PATH_INFO')
            qs = environ.get('QUERY_STRING', '')
            # Read limited body safely and rewind wsgi.input for Flask
            try:
                length = int(environ.get('CONTENT_LENGTH') or 0)
            except Exception:
                length = 0
            body_preview = ''
            if length > 0 and 'wsgi.input' in environ:
                try:
                    data = environ['wsgi.input'].read(length)
                    body_preview = data.decode('utf-8', 'ignore')[:1000]
                    # rewind input
                    from io import BytesIO
                    environ['wsgi.input'] = BytesIO(data)
                except Exception:
                    body_preview = '<unreadable>'

            try:
                with open(self.logfile, 'a', encoding='utf-8') as f:
                    f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} REQ_MIDDLEWARE {method} {path}?{qs} body={body_preview}\n")
            except Exception:
                pass
        except Exception:
            try:
                with open(self.logfile, 'a', encoding='utf-8') as f:
                    f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} REQ_MIDDLEWARE error writing log\n")
            except Exception:
                pass

        return self.app(environ, start_response)

# Activate middleware so it runs before waitress/flask handlers
app.wsgi_app = RequestLoggerMiddleware(app.wsgi_app)

# Structured logger
logger = logging.getLogger("wms")
log_level = os.getenv('LOG_LEVEL', 'INFO').upper()
logger.setLevel(getattr(logging, log_level, logging.INFO))
handler = logging.StreamHandler(sys.stdout)

class RequestIdFilter(logging.Filter):
    def filter(self, record):
        try:
            record.req_id = getattr(g, "req_id", "-")
        except Exception:
            record.req_id = "-"
        return True

handler.addFilter(RequestIdFilter())
handler.setFormatter(logging.Formatter(
    "%(asctime)s %(levelname)s [req_id=%(req_id)s] %(message)s"
))
if not logger.handlers:
    logger.addHandler(handler)

# Mirror handlers to waitress logger and optionally log to file
try:
    LOG_TO_FILE = os.getenv('LOG_TO_FILE', '0') == '1'
    if LOG_TO_FILE:
        from logging.handlers import RotatingFileHandler
        log_file = os.path.join(os.path.dirname(__file__), 'backend.log')
        file_handler = RotatingFileHandler(log_file, maxBytes=5 * 1024 * 1024, backupCount=3)
        file_handler.setFormatter(handler.formatter)
        file_handler.addFilter(RequestIdFilter())
        logger.addHandler(file_handler)

    # Ensure waitress logging (and other libs) use our handler so logs appear
    lib_logger = logging.getLogger('waitress')
    lib_logger.setLevel(logger.level)
    # copy handlers
    for h in logger.handlers:
        lib_logger.addHandler(h)
except Exception:
    # don't fail app startup for logging issues
    pass


# Database connection settings (from env)
DB_DSN = os.getenv('DB_DSN', 'fec')
DB_USER = os.getenv('DB_USER', 'informix')
DB_PASSWORD = os.getenv('DB_PASSWORD', 'informix')
connection_string = f'DSN={DB_DSN};UID={DB_USER};PWD={DB_PASSWORD};'


def connect_to_db():
    try:
        return pyodbc.connect(connection_string)
    except Exception as e:
        logger.exception('Unable to connect to the database')
        raise


def format_delivery_date(date_str):
    try:
        # Parse the input string to a datetime object
        delivery_date = datetime.strptime(date_str, "%a, %d %b %Y %H:%M:%S GMT")
        # Return the formatted string (e.g., "25 Jan 2025")
        return delivery_date.strftime("%d %b %Y")
    except Exception:
        return date_str


@app.before_request
def _before_request():
    # assign a request id and start time
    g.req_id = uuid.uuid4().hex
    g.t0 = time.time()

    # Quick preflight response for CORS
    if request.method == 'OPTIONS':
        resp = app.make_response(("", 204))
        resp.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
        resp.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = request.headers.get(
            'Access-Control-Request-Headers', 'Content-Type, Authorization'
        )
        resp.headers['Vary'] = 'Origin'
        logger.debug(f"Preflight OPTIONS {request.path} Origin={request.headers.get('Origin')}")
        return resp

    # Log incoming request summary
    try:
        body_preview = None
        if request.is_json:
            payload = request.get_json(silent=True)
            if isinstance(payload, dict):
                body_preview = {k: ("<large>" if len(str(v)) > 200 else v) for k, v in list(payload.items())[:30]}
            else:
                body_preview = '<json>'
        else:
            body_preview = request.get_data(cache=False, as_text=True)[:500]
    except Exception:
        body_preview = '<unreadable>'

    logger.info(f"{request.method} {request.path} origin={request.headers.get('Origin')} ct={request.headers.get('Content-Type')} ip={request.remote_addr} body={body_preview}")
    # Also print a short line to stdout so container logs / pm2 captures at least this
    try:
        print(f"REQ {g.req_id} {request.method} {request.path} body_preview={str(body_preview)[:200]}")
    except Exception:
        pass


@app.after_request
def add_cors_headers(resp):
    # Always attach CORS headers (also on errors)
    resp.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
    resp.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    resp.headers['Vary'] = 'Origin'
    try:
        dt = (time.time() - getattr(g, 't0', time.time())) * 1000.0
        logger.info(f"Response {request.method} {request.path} -> {resp.status_code} in {dt:.1f}ms")
    except Exception:
        pass
    return resp


@app.errorhandler(Exception)
def _unhandled_error(e):
    # Log stacktrace and return JSON with req_id for correlation
    logger.exception(f"Unhandled error on {request.method} {request.path}")
    # Ensure traceback and req_id visible in stdout for containerized environments
    try:
        print(f"ERROR {getattr(g, 'req_id', '-')} {request.method} {request.path} {str(e)}")
        traceback.print_exc()
    except Exception:
        pass
    return jsonify({
        'error': 'internal_server_error',
        'message': str(e),
        'req_id': getattr(g, 'req_id', '-')
    }), 500
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
            conditions.append("timestamp >= ?")
            params.append(start_date)
            
        if end_date:
            conditions.append("timestamp <= ?")
            params.append(end_date)
        
        if undoable_only:
            conditions.append("can_undo = 't' AND is_undone = 'f'")

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
        SELECT {f"SKIP {offset}" if offset > 0 else ""} {"FIRST " + str(per_page)}
            id, timestamp, operation_type, operation_details, user, 
            CASE 
                WHEN ip_address = ? THEN ip_address || ' (TU)'
                ELSE ip_address 
            END as ip_address,
            article_code, source_location, destination_location, quantity, 
            is_undone, can_undo, additional_data
        FROM wms_log
        {f"WHERE {where_clause}" if where_clause else ""}
        ORDER BY timestamp DESC
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
            
            # Convert timestamp to string if needed
            if isinstance(log.get('timestamp'), datetime):
                log['timestamp'] = log['timestamp'].strftime("%Y-%m-%d %H:%M:%S")
                
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
        (timestamp, operation_type, operation_details, user, ip_address, 
         article_code, source_location, destination_location, quantity, can_undo, additional_data) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        cursor.execute(
            query, 
            (
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),

                operation_type,
                operation_details,
                user,
                ip_address,
                article_code,
                source_location,
                destination_location,
                quantity,
                can_undo,
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
        query = "SELECT amg_desc FROM mganag WHERE amg_code = ?"
        cursor.execute(query, (codice_articolo,))
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
        query = "select m.dep_qcar - m.dep_qsca, m.dep_arti, g.amg_dest  from mgdepo m inner join mganag g on (m.dep_arti = g.amg_code) where (m.dep_arti like ?) and m.dep_code = '1'"
        cursor.execute(query, (codice_articolo,))
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
        query = "select gim_arti, gim_desc, gim_des2, gim_qmov from mggior where gim_code = ? and gim_arti is not null"
        cursor.execute(query, (movimento,))
        
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
@app.route('/api/fornitore-ragione-sociale', methods=['GET'])
def get_ragione_sociale_fornitore():
    codice_fornitore = request.args.get('codice_fornitore')
    if not codice_fornitore:
        return jsonify({'error': 'Missing codice_fornitore parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        query = "SELECT des_clifor FROM agclifor WHERE cod_clifor = ?"
        cursor.execute(query, (codice_fornitore,))
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

@app.route('/api/fornitore-ragione-sociale', methods=['GET'])
def get_ragione_sociale():
    codice_fornitore = request.args.get('scaffale')
    if not codice_fornitore:
        return jsonify({'error': 'Missing scaffale parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        query = "SELECT des_clifor FROM agclifor WHERE cod_clifor = ?"
        cursor.execute(query, (codice_fornitore,))
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
        query = "SELECT DISTINCT oft_cofo, ofc_arti FROM ofordit, ofordic, outer agclifor WHERE oft_cofo = ? AND ofc_arti = ? AND oft_cofo = cod_clifor;"
        cursor.execute(query, (codice_fornitore, codice_articolo))
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
CAST(w.id_art AS VARCHAR(20)) as id_art,
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
            format_strings = ','.join(['?'] * len(id_arts))
            cursor.execute(f"""
                SELECT 
                    CAST(m.dep_arti AS VARCHAR(20)) as dep_arti,
                    m.dep_qcar - m.dep_qsca as system_qty,
                    g.amg_dest
                FROM mgdepo m 
                INNER JOIN mganag g ON m.dep_arti = g.amg_code
                WHERE m.dep_code = '1' 
                AND CAST(m.dep_arti AS VARCHAR(20)) IN ({format_strings})
            """, id_arts)
            system_data = cursor.fetchall()
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
        if limit < 1 or limit > 1000:
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
            LEFT JOIN mganag mg ON wi.id_art = mg.amg_code
            WHERE 1=1
        """
        count_params = []

        if article_filter:
            count_query += " AND CAST(wi.id_art AS VARCHAR(20)) LIKE ?"
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
            SELECT SKIP ? FIRST ? DISTINCT wi.id_art
            FROM wms_items wi
            LEFT JOIN mganag mg ON wi.id_art = mg.amg_code
            WHERE 1=1
        """
        id_art_params = [offset, limit]

        if article_filter:
            id_art_query += " AND CAST(wi.id_art AS VARCHAR(20)) LIKE ?"
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
        placeholders = ','.join(['?'] * len(id_art_list))
        items_query = f"""
            SELECT 
                wi.*,               -- All fields from wms_items
                mg.amg_desc,        -- Description from mganag
                mg.amg_des2         -- Secondary Description from mganag
            FROM 
                wms_items wi
            LEFT JOIN 
                mganag mg ON wi.id_art = mg.amg_code
            WHERE 
                wi.id_art IN ({placeholders})
                {location_condition}
            ORDER BY 
                wi.id_art, wi.scaffale, wi.colonna, wi.piano
        """
        
        # Combine id_art_list with location parameters
        query_params = id_art_list + location_params
        cursor.execute(items_query, tuple(query_params))
        items_rows = cursor.fetchall()

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
    codice_fornitore = request.args.get('codice_fornitore')

    if not codice_movimento or not codice_articolo:
        return jsonify({'error': 'Missing codice_movimento or codice_articolo parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()

        # Build the query dynamically based on the value of codice_fornitore
        if codice_fornitore == 'F000000':
            query = '''SELECT DISTINCT
                oft.oft_cofo, 
                ofc.ofc_arti,
                bf.blt_code
            FROM 
                ofordit oft
            JOIN 
                ofordic ofc 
            ON 
                oft.oft_tipo = ofc.ofc_tipo 
                AND ofc.ofc_arti = ?
            JOIN 
                mggior mg 
            ON 
                ofc.ofc_arti = mg.gim_arti 
                AND mg.gim_code = ?
            JOIN 
                bfbolt bf 
            ON 
                mg.gim_code = bf.blt_code 
                AND bf.blt_cocl = oft.oft_cofo
            WHERE 
                bf.blt_code = mg.gim_code;
            '''
            cursor.execute(query, (codice_articolo, codice_movimento))
        else:
            query = '''SELECT DISTINCT
                oft.oft_cofo, 
                ofc.ofc_arti,
                bf.blt_code
            FROM 
                ofordit oft
            JOIN 
                ofordic ofc 
            ON 
                oft.oft_tipo = ofc.ofc_tipo 
                AND oft.oft_cofo = ? 
                AND ofc.ofc_arti = ?
            JOIN 
                mggior mg 
            ON 
                ofc.ofc_arti = mg.gim_arti 
                AND mg.gim_code = ?
            JOIN 
                bfbolt bf 
            ON 
                mg.gim_code = bf.blt_code 
                AND bf.blt_cocl = oft.oft_cofo
            WHERE 
                bf.blt_code = mg.gim_code;
            '''
            cursor.execute(query, (codice_fornitore, codice_articolo, codice_movimento))

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


@app.route('/api/coerenza-dati', methods=['GET'])
def check_coerenza_dati():
    codice_movimento = request.args.get('codice_movimento')
    codice_articolo = request.args.get('codice_articolo')
    codice_fornitore = request.args.get('codice_fornitore')
    if not codice_movimento or not codice_articolo or not codice_fornitore:
        return jsonify({'error': 'Missing codice_movimento, codice_articolo, or codice_fornitore parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        query = "SELECT * FROM mggior WHERE gim_arti = ? AND gim_code = ?"
        cursor.execute(query, (codice_articolo, codice_movimento))
        if cursor.fetchall():
            query = "SELECT * FROM bfbolt WHERE blt_cocl = ? AND blt_code = ?"
            cursor.execute(query, (codice_fornitore, codice_movimento))
            coerenza = len(cursor.fetchall()) > 0
            return jsonify({'coerenza': coerenza})
        return jsonify({'coerenza': False})

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
        conn = pyodbc.connect(connection_string)
        cursor = conn.cursor()

        # Define a query
        query = '''
        SELECT o.oft_tipo, o.oft_code, o.oft_stat, o.oft_data, o.oft_cofo, a.des_clifor, o.oft_inarrivo
        FROM ofordit o
        LEFT JOIN agclifor a ON o.oft_cofo = a.cod_clifor
        WHERE o.oft_stat = 'A'
        ORDER BY o.oft_inarrivo DESC, o.oft_data DESC
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
        conn = pyodbc.connect(connection_string)
        cursor = conn.cursor()

        # Define a query for detailed data
        query = '''
        SELECT ofc_arti, ofc_riga, ofc_desc, ofc_des2, ofc_qord, ofc_dtco, ofc_stato, ofc_qtarrivata, ofc_inarrivo
        FROM ofordic
        WHERE ofc_tipo = ? AND ofc_code = ? AND ofc_arti IS NOT NULL AND ofc_arti != ''
        ORDER BY ofc_inarrivo DESC
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

        cursor.execute(query, (area, scaffale, colonna, piano, articolo))
        
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
        cursor.execute(query, (id_mov, area, scaffale, colonna, piano, id_art))
        
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
            codice_articolo = item.get('articoloCode')
            codice_movimento = item.get('movimentoCode')
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
            codice_articolo = item.get('articoloCode')
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
    codice_articolo = data.get('codice_articolo')
    codice_movimento = data.get('codice_movimento')
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

@app.route('/api/update-pacchi', methods=['POST', 'OPTIONS'])
def update_pacchi():
    # Handle preflight quickly
    if request.method == 'OPTIONS':
        return ('', 204)

    try:
        data = request.get_json(force=True, silent=False)
    except Exception as e:
        logger.exception('Failed to parse JSON payload in update-pacchi')
        return jsonify({'error': 'invalid_json', 'message': str(e)}), 400

    # Extract parameters from the request
    articolo = data.get('articolo')
    area = data.get('area')
    scaffale = data.get('scaffale')
    colonna = data.get('colonna')
    piano = data.get('piano')
    quantity = data.get('quantity')
    odl = data.get('odl')  # New parameter for ODL

    logger.debug(f"update-pacchi called articolo={articolo} area={area} scaffale={scaffale} colonna={colonna} piano={piano} quantity={quantity} odl={odl}")

    # Validate input parameters
    if not all([articolo, area, scaffale, colonna, piano, quantity]):
        logger.warning('update-pacchi missing required params')
        return jsonify({'error': 'missing_parameters'}), 400

    # Convert quantity to Decimal
    try:
        quantity = Decimal(str(quantity))
    except (ValueError, TypeError, InvalidOperation) as ex:
        logger.exception('Invalid quantity in update-pacchi')
        return jsonify({'error': 'invalid_quantity', 'message': str(ex)}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()

        # Step 1: Check total available quantity
        total_quantity_query = '''
        SELECT SUM(qta) AS total_qta
        FROM wms_items
        WHERE id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?
        '''
        cursor.execute(total_quantity_query, (articolo, area, scaffale, colonna, piano))
        result = cursor.fetchone()
        logger.debug(f'total quantity query result: {result}')

        if not result or result[0] is None:
            logger.warning('No quantity found at location')
            return jsonify({'error': 'no_quantity', 'available': 0}), 400

        total_available_quantity = Decimal(result[0])
        if total_available_quantity < quantity:
            logger.warning('Insufficient quantity')
            return jsonify({'error': 'insufficient_quantity', 'available': float(total_available_quantity)}), 400

        # Step 2: Get pacchi
        pacchi_query = '''
        SELECT id_pacco, qta, dimensione
        FROM wms_items
        WHERE id_art = ? AND area = ? AND scaffale = ? AND colonna = ? AND piano = ?
        ORDER BY qta ASC
        '''
        cursor.execute(pacchi_query, (articolo, area, scaffale, colonna, piano))
        pacchi = cursor.fetchall()
        logger.debug(f'fetched {len(pacchi)} pacchi')

        if not pacchi:
            logger.warning('No pacchi at location')
            return jsonify({'error': 'no_pacchi'}), 400

        remaining_quantity = quantity
        updated = False
        volume_mapping = {'Piccolo': 40000, 'Medio': 100000, 'Grande': 300000, 'Zero': 0}
        total_volume_to_add = 0

        for pacco in pacchi:
            if remaining_quantity <= 0:
                break
            pacco_id = pacco[0]
            pacco_qta = Decimal(pacco[1])
            pacco_dim = pacco[2]
            take = min(pacco_qta, remaining_quantity)
            logger.debug(f'Using pacco {pacco_id} qta={pacco_qta} take={take}')
            if pacco_qta == take:
                cursor.execute('DELETE FROM wms_items WHERE id_pacco = ?', (pacco_id,))
            else:
                new_qta = pacco_qta - take
                cursor.execute('UPDATE wms_items SET qta = ? WHERE id_pacco = ?', (float(new_qta), pacco_id))
            total_volume_to_add += volume_mapping.get(pacco_dim, 0) * float(take)
            remaining_quantity -= take
            updated = True

        if remaining_quantity > 0:
            logger.error(f'Remaining after processing pacchi: {remaining_quantity}')
            conn.rollback()
            return jsonify({'error': 'insufficient_after_processing', 'missing': float(remaining_quantity)}), 500

        # Update shelf volume and commit
        cursor.execute('UPDATE wms_scaffali SET volume_libero = volume_libero + ? WHERE area = ? AND scaffale = ? AND colonna = ? AND piano = ?', (total_volume_to_add, area, scaffale, colonna, piano))
        conn.commit()

        source_location = f"{area}-{scaffale}-{colonna}-{piano}"
        operation_details = f"{f'ODL: {odl} - ' if odl else ''}Prelievo articolo {articolo} da {source_location} - QTA: {int(quantity)}"
        additional_data = {'odl': odl}
        log_operation(
            operation_type='PRELIEVO',
            operation_details=operation_details,
            user='current_user',
            ip_address=request.remote_addr,
            article_code=articolo,
            source_location=source_location,
            quantity=quantity,
            can_undo=True,
            additional_data=additional_data
        )
        logger.info(operation_details)

        if odl:
            try:
                cursor.execute('INSERT INTO wms_prelievi (odl, id_art, qta) VALUES (?, ?, ?)', (odl, articolo, float(quantity)))
                conn.commit()
            except Exception:
                logger.exception('Failed inserting into wms_prelievi')

        return jsonify({'status': 'ok'})

    except pyodbc.Error as e:
        try:
            conn.rollback()
        except Exception:
            pass
        operation_details = f"Prelievo articolo {articolo} da {area}-{scaffale}-{colonna}-{piano} - QTA: {int(quantity)} - MERCE NON SCARICATA"
        logger.exception(operation_details)
        log_operation(
            operation_type='ERRORE',
            operation_details=operation_details,
            user='current_user',
            ip_address=request.remote_addr
        )
        return jsonify({'error': 'db_error', 'message': str(e)}), 500

    finally:
        if 'cursor' in locals():
            try:
                cursor.close()
            except Exception:
                pass
        if 'conn' in locals():
            try:
                conn.close()
            except Exception:
                pass

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
        SELECT FIRST 1 id_pacco 
        FROM wms_items 
        WHERE id_art = ? 
          AND area = ? 
          AND scaffale = ? 
          AND colonna = ? 
          AND piano = ? 
          AND qta = ?
        ORDER BY id_pacco DESC
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

        # First query: Get gol_octi, gol_occo, gol_ocri from mpordgol where gol_mpco = 'codice_ordine'
        query1 = """
        SELECT gol_octi, gol_occo, gol_ocri
        FROM mpordgol
        WHERE gol_mpco = ?
        """
        cursor.execute(query1, (codice_ordine,))
        first_row = cursor.fetchone()

        if not first_row:
            return jsonify({'error': 'Ordine non trovato'}), 404

        gol_octi, gol_occo, gol_ocri = first_row

        # Second query: Get all rows from mpordgol where gol_octi = 'gol_octi' and gol_occo = 'gol_occo'
        query2 = """
        SELECT gol_octi, gol_occo, gol_ocri, gol_nume, gol_mpco, gol_qord, gol_qpro, gol_qres
        FROM mpordgol
        WHERE gol_octi = ? AND gol_occo = ?
        """
        cursor.execute(query2, (gol_octi, gol_occo))
        rows = cursor.fetchall()
        esci = False
        # Find the row after the known gol_ocri value
        found_row = None
        next_row = None
        
        for row in rows:
            if row.gol_ocri > gol_ocri:
                found_row = row
                esci = True
            if esci:
                next_row = row
                print(next_row)
                break

                # If no subsequent row is found, set gol_ocri_new to a large number (e.g., max int)
        if not found_row:
            gol_ocri_new = float('inf')  # No next row found, so consider all subsequent rows
        else:
            # Extract gol_octi, gol_occo, gol_ocri values from the found row
            gol_octi_new, gol_occo_new, gol_ocri_new, prossimo_ordine = found_row.gol_octi, found_row.gol_occo, found_row.gol_ocri, next_row.gol_ocri

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
        query3 = """
SELECT 
    m.mpl_figlio AS occ_arti,
    p.occ_qmov * m.mpl_coimp AS occ_qmov,
    mg.amg_desc AS occ_desc,
    mg.amg_des2 AS occ_des2,
    p.occ_riga,
    m.mpl_padre,
        p.occ_qmov as mpl_qta
FROM 
    ocordic p
JOIN 
    mplegami m ON p.occ_arti = m.mpl_padre
LEFT JOIN
    mganag mg ON m.mpl_figlio = mg.amg_code
WHERE 
    p.occ_tipo = ?
    AND p.occ_code = ?
    AND p.occ_riga >= ?
    AND (m.mpl_dafi >= TODAY or m.mpl_dafi is null)
    AND p.occ_riga <= (
        SELECT MIN(p1.occ_riga)
        FROM ocordic p1
        WHERE p1.occ_arti IS NOT NULL
          AND p1.occ_tipo = ?
          AND p1.occ_code = ?
          AND p1.occ_riga >= ?
    )

UNION ALL
SELECT 
    p.occ_arti,
    p.occ_qmov,
    mg.amg_desc AS occ_desc,
    mg.amg_des2 AS occ_des2,
    p.occ_riga,
    CAST(NULL AS VARCHAR) AS mpl_padre,
    CAST(NULL AS INT) AS mpl_qta

FROM 
    ocordic p
LEFT JOIN
    mganag mg ON p.occ_arti = mg.amg_code
WHERE 
    p.occ_tipo = ?
    AND p.occ_code = ?
    AND p.occ_riga >= ?
    AND NOT EXISTS (
        SELECT 1 
        FROM mplegami m 
        WHERE m.mpl_padre = p.occ_arti
    )
    AND (
         /* If there is a row with occ_arti NULL, return only rows before it */
         p.occ_riga < (
             SELECT MIN(p2.occ_riga)
             FROM ocordic p2
             WHERE p2.occ_tipo = ?
               AND p2.occ_code = ?
               AND p2.occ_riga >= ?
               AND p2.occ_arti IS NULL
         )
         /* Or, if no such row exists, return all rows */
         OR (
             SELECT MIN(p2.occ_riga)
             FROM ocordic p2
             WHERE p2.occ_tipo = ?
               AND p2.occ_code = ?
               AND p2.occ_riga >= ?
               AND p2.occ_arti IS NULL
         ) IS NULL
    )
ORDER BY 
    p.occ_riga;
        """
        # Find the minimum gol_ocri greater than current gol_ocri
        next_ocri_values = [row.gol_ocri for row in rows if row.gol_ocri > gol_ocri]
        prossimo_ordine = min(next_ocri_values) if next_ocri_values else 999999999  # Use a large number

        # Modify the query parameters to handle the "no next row" case
        params = (
            gol_octi, gol_occo, gol_ocri,  # First block
            gol_octi, gol_occo, gol_ocri,  # Subquery in first block
            gol_octi, gol_occo, gol_ocri,  # Subquery in second block
            gol_octi, gol_occo, gol_ocri,
            gol_octi, gol_occo, gol_ocri,
        )

        cursor.execute(query3, params)
        final_rows = cursor.fetchall()

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
                id_pacco ASC;
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
    articolo_id = request.args.get('articolo_id')
    required_quantity = request.args.get('quantity', type=int)

    if not articolo_id or required_quantity is None:
        return jsonify({'error': 'Missing articolo_id or quantity parameter'}), 400

    try:
        conn = connect_to_db()
        cursor = conn.cursor()

        # Step 1: Fetch articolo description
        query_desc = """
            SELECT amg_desc, amg_des2
            FROM mganag
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

@app.route('/api/ordini-fornitore', methods=['GET'])
def get_ordini_fornitore():
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        query = '''
SELECT 
    oft_tipo, 
    oft_code, 
    oft_stat, 
    oft_data, 
    oft_stat,
    ag.des_clifor AS cliente_nome,
  	oft_inarrivo,  
	oft_actz
FROM 
    ofordit AS o
JOIN 
    agclifor AS ag 
ON 
    o.oft_cofo = ag.cod_clifor
ORDER BY 
    oft_data DESC;'''
        cursor.execute(query)
        # Get column names from cursor description
        columns = [column[0] for column in cursor.description]
        # Fetch all rows and convert them into a list of dictionaries
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        return jsonify({'results': results})

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

from flask import jsonify, request
import pyodbc

@app.get("/api/ordine-details")
def get_article_details():
    ofc_tipo = request.args.get('ofc_tipo')
    ofc_code = request.args.get('ofc_code')
    if not ofc_tipo or not ofc_code:
        return jsonify({'error': 'Missing ofc_code or ofc_tipo parameter'}), 400

    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()

        # SQL query with placeholders for parameters
        query = """
        SELECT 
            ofc_arti, 
            (ofc_desc || ' ' || ofc_des2) AS article_description, 
            ofc_dtco, 
            ofc_qtarrivata, 
            ofc_inarrivo,
            ofc_qord,
            ofc_riga,
            ofc_inarrivo
        FROM 
            ofordic 
        WHERE 
            ofc_tipo = ? AND ofc_code = ?
        """

        # Execute the query with parameters
        cursor.execute(query, (ofc_tipo, ofc_code))

        # Fetch results and convert to a list of dictionaries
        columns = [column[0] for column in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        filtered_results = [result for result in results if result['ofc_arti'] is not None]

        # Close the database connection
        cursor.close()
        conn.close()

        # Check if results are empty and return an error if needed
        if not filtered_results:
            return jsonify({'error': 'No records found for the given tipo and code.'}), 404

        # Return results as JSON
        return jsonify({'results': filtered_results})

    except pyodbc.Error as e:
        print(f"Database error: {str(e)}")
        return jsonify({'error': 'Internal Server Error', 'details': str(e)}), 500
@app.put("/api/update-quantity")
def update_quantity():
    data = request.get_json()
    ofc_tipo = data.get('ofc_tipo')
    ofc_code = data.get('ofc_code')
    new_quantity = data.get('ofc_qtarrivata')
    ofc_riga = data.get('ofc_riga')
    # Validate inputs
    if not all([ofc_tipo, ofc_code, new_quantity, ofc_riga]):
        return jsonify({'error': 'Missing required parameters'}), 400

    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # SQL update query
        update_query = """
        UPDATE ofordic
        SET ofc_qtarrivata = ? , ofc_inarrivo = 'N'
        WHERE ofc_tipo = ? AND ofc_code = ? and ofc_riga = ?

        
        """
        print(ofc_tipo, ofc_code, new_quantity, ofc_riga)
        # Execute the update query with parameters
        cursor.execute(update_query, (new_quantity, ofc_tipo, ofc_code, ofc_riga))
        conn.commit()

        # Check if any rows were updated
        if cursor.rowcount == 0:
            return jsonify({'error': f'{new_quantity, ofc_tipo, ofc_code, ofc_riga}'}), 404
        operation_details = f"Quantità arrivata segnalata con successo ordine {ofc_tipo}-{ofc_code} - RIGA:{ofc_riga} - QTA: {new_quantity}"

        log_operation(
            operation_type="UPDATE",
            operation_details=operation_details,
            user="current_user",  # Replace with actual user info if available
            ip_address=request.remote_addr
        )
        return jsonify({'message': 'Quantity updated successfully'}), 200

    except pyodbc.Error as e:
        print(f"Database error: {str(e)}")
        return jsonify({'error': 'Internal Server Error', 'details': str(e)}), 500

    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

@app.route('/api/articoli-in-arrivo', methods=['GET'])
def articoli_in_arrivo():
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        query = '''
SELECT 
    o.ofc_tipo, 
    o.ofc_arti,
    (o.ofc_desc || ' ' || o.ofc_des2) AS article_description, 
    o.ofc_code, 
    o.ofc_dtco, 
    o.ofc_inarrivo,
    NVL(SUM(w.qta), 0) AS total_quantity  -- Replace COALESCE or IFNULL with NVL
FROM 
    ofordic AS o
LEFT JOIN 
    wms_items AS w ON o.ofc_arti = w.id_art  -- Join with wms_items on ofc_arti and id_art
WHERE 
    o.ofc_dtco >= TODAY 
    AND o.ofc_arti IS NOT NULL
GROUP BY 
    o.ofc_tipo, 
    o.ofc_arti,
    o.ofc_desc, 
    o.ofc_des2, 
    o.ofc_code, 
    o.ofc_dtco, 
    o.ofc_inarrivo
ORDER BY 
    o.ofc_dtco ASC;

'''
        cursor.execute(query)
        # Get column names from cursor description
        columns = [column[0] for column in cursor.description]
        # Fetch all rows and convert them into a list of dictionaries
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        return jsonify({'results': results})

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

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
        SELECT FIRST 1 id_pacco 
        FROM wms_items 
        WHERE id_art = ? 
          AND area = ? 
          AND scaffale = ? 
          AND colonna = ? 
          AND piano = ? 
          AND qta = ?
        ORDER BY id_pacco DESC
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
        movimento_query = """SELECT gim_arti FROM mggior 
                          WHERE gim_code = ? AND gim_arti IS NOT NULL"""
        cursor.execute(movimento_query, (movimento,))
        movimento_items = [row.gim_arti for row in cursor.fetchall()]
        
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

        query = """
        select amg_code c_articolo, amp_lead lt,

nvl((select sum(ofc_qord-ofc_qcon) from ofordic where ofc_arti = amg_code and ofc_feva = 'N'
  and ofc_dtco <= last_day(today)),0) +
nvl((select sum(mol_quaor-mol_quari) from mpordil where mol_parte = amg_code and mol_stato in ('A')
  and mol_dats <= last_day(today)),0) off_mc,
nvl((select sum(ofc_qord-ofc_qcon) from ofordic where ofc_arti = amg_code and ofc_feva = 'N'
  and ofc_dtco between last_day(add_months(today,0))+1 and last_day(add_months(today,+1))),0) +
nvl((select sum(mol_quaor-mol_quari) from mpordil where mol_parte = amg_code and mol_stato in ('A')
  and mol_dats between last_day(add_months(today,0))+1 and last_day(add_months(today,+1))),0) off_ms,
 
nvl((select sum(ofc_qord-ofc_qcon) from ofordic where ofc_arti = amg_code and ofc_feva = 'N'
  and ofc_dtco between last_day(add_months(today,+1))+1 and last_day(add_months(today,+2))),0) +
nvl((select sum(mol_quaor-mol_quari) from mpordil where mol_parte = amg_code and mol_stato in ('A')
  and mol_dats between last_day(add_months(today,+1))+1 and last_day(add_months(today,+2))),0) off_msa,
 
nvl((select sum(ofc_qord-ofc_qcon) from ofordic where ofc_arti = amg_code and ofc_feva = 'N'
  and ofc_dtco >= last_day(add_months(today,2))+1),0) +
nvl((select sum(mol_quaor-mol_quari) from mpordil where mol_parte = amg_code and mol_stato in ('A')
  and mol_dats >= last_day(add_months(today,2))+1),0) off_mss
from mganag, mppoli
where amg_code = amp_code and amp_depo = 1
and  amg_stat = 'D' 
and nvl(amg_fagi,'S') = 'S'
and amg_code = ?
and amg_code in (select dep_arti from mgdepo where dep_code in (1,20,32,48,60,81)
and dep_qgiai+dep_qcar-dep_qsca+dep_qord+dep_qorp+dep_qpre+dep_qprp <> 0)
        """

        cursor.execute(query, (codice_articolo,))
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
            mplegami m
        WHERE 
            m.mpl_padre = ?
        """

        cursor.execute(query, (padre,))
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
    movimento = data.get('movimento')
    
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
            "UPDATE wms_log SET is_undone = 't' WHERE id = ?",
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
                    "UPDATE wms_log SET is_undone = 't' WHERE id = ?",
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
            id_pacco ASC;
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
                    FROM mganag
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
                SELECT first 1 inspection_date 
                FROM wms_inspections 
                WHERE is_current = 1 
                ORDER BY inspection_date DESC 
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
                    if "unique constraint" in str(e).lower() or "u2852_9030159" in str(e):
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
                                LIMIT 1
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
        
        # Validate input parameters
        if not all([id_art, area, scaffale, colonna, piano, new_quantity, old_quantity]):
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
            """
            cursor.execute(verify_query, (id_art, area, scaffale, colonna, piano))
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
                INSERT INTO wms_items (id_art, area, scaffale, colonna, piano, qta, dimensione)
                VALUES (?, ?, ?, ?, ?, ?, 'Zero')
                """
                cursor.execute(insert_query, (id_art, area, scaffale, colonna, piano, quantity_diff))
                
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
                ORDER BY qta ASC
                """
                cursor.execute(packages_query, (id_art, area, scaffale, colonna, piano))
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
            operation_details = f"Quantità aggiornata per articolo {id_art} in {area}-{scaffale}-{colonna}-{piano}: {old_quantity} a {new_quantity}"
            
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
@app.route('/api/health', methods=['GET'])
def health_check():
    """Simple health check endpoint for container orchestration."""
    return jsonify({"status": "ok"})

# Start the server with waitress if this file is run directly
if __name__ == '__main__':
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

