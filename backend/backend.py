from flask import Flask, jsonify, request
import pyodbc
from flask_cors import CORS
from decimal import Decimal
import uuid
from datetime import datetime

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

# Define your connection string
connection_string = 'DSN=fec;UID=informix;PWD=informix;'
def connect_to_db():
    try:
        return pyodbc.connect(connection_string)
    except pyodbc.Error as e:
        raise Exception(f"Unable to connect to the database: {str(e)}")
    
# Endpoint to fetch logs
@app.route('/api/operation-logs', methods=['GET'])
def get_operation_logs():
    try:
        # Get query parameters for filtering
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 10))
        operation_type = request.args.get('operation_type')
        operation_details = request.args.get('operation_details')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        user_ip = request.remote_addr  # Get the current user's IP

        offset = (page - 1) * limit

        conn = connect_to_db()
        cursor = conn.cursor()

        # Base query - modified to include conditional IP display
        query = """
        SELECT {skip} {first} 
            id, 
            timestamp, 
            operation_type, 
            operation_details, 
            user,
            CASE 
                WHEN ip_address = ? THEN ip_address || ' (TU)'
                ELSE ip_address 
            END as ip_address
        FROM wms_log
        WHERE 1=1
        """.format(
            skip=f"SKIP {offset}" if offset > 0 else "",
            first=f"FIRST {limit}"
        )
        
        # Add user_ip as the first parameter
        params = [user_ip]

        # Add filters
        if operation_type:
            query += " AND operation_type = ?"
            params.append(operation_type)
        if operation_details:
            query += " AND UPPER(operation_details) LIKE UPPER(?)"
            params.append(f"%{operation_details}%")
        if start_date:
            query += " AND timestamp >= ?"
            params.append(datetime.strptime(start_date, "%Y-%m-%d"))
        if end_date:
            query += " AND timestamp <= ?"
            params.append(datetime.strptime(end_date, "%Y-%m-%d"))

        # Add ordering
        query += " ORDER BY timestamp DESC"

        cursor.execute(query, params)
        rows = cursor.fetchall()

        # Get column names from cursor description
        columns = [column[0] for column in cursor.description]

        # Convert rows to list of dictionaries
        logs = [dict(zip(columns, row)) for row in rows]

        # Get total count for pagination with the same filters
        count_query = "SELECT COUNT(*) FROM wms_log WHERE 1=1"
        count_params = []

        if operation_type:
            count_query += " AND operation_type = ?"
            count_params.append(operation_type)
        if operation_details:
            count_query += " AND UPPER(operation_details) LIKE UPPER(?)"
            count_params.append(f"%{operation_details}%")
        if start_date:
            count_query += " AND timestamp >= ?"
            count_params.append(datetime.strptime(start_date, "%Y-%m-%d"))
        if end_date:
            count_query += " AND timestamp <= ?"
            count_params.append(datetime.strptime(end_date, "%Y-%m-%d"))

        cursor.execute(count_query, count_params)
        total_count = cursor.fetchone()[0]

        return jsonify({
            'logs': logs,
            'total': total_count,
            'page': page,
            'limit': limit
        })

    except pyodbc.Error as e:
        return jsonify({'error': str(e)}), 500
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

def log_operation(operation_type, operation_details, user=None, ip_address=None):
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Insert log entry into the database
        query = """
        INSERT INTO wms_log (timestamp,operation_type, operation_details, user, ip_address)
        VALUES (CURRENT, ?, ?, ?, ?)
        """
        cursor.execute(query, (operation_type, operation_details, user, ip_address))
        conn.commit()
    except pyodbc.Error as e:
        # Log the error to the console or a file if the logging itself fails
        print(f"Logging error: {str(e)}")
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
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
                wi.id_art
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
        log_operation(
            operation_type="MULTIPLE_INSERT",
            operation_details=", ".join(operation_details),
            user="current_user",  # Replace with actual user info
            ip_address=request.remote_addr
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
        log_operation(
            operation_type="INSERT",
            operation_details=operation_details,
            user="current_user",  # Replace with actual user info if available
            ip_address=request.remote_addr
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
            total_volume_to_add += volume_mapping[dimensione] * (qta_to_remove / qta)
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
        operation_details = f"Prelievo articolo {articolo} da {area}-{scaffale}-{colonna}-{piano} - QTA: {quantity}"

        log_operation(
            operation_type="UPDATE",
            operation_details=operation_details,
            user="current_user",  # Replace with actual user info if available
            ip_address=request.remote_addr
        )
        print(operation_details)
        if new_qta == 0:
            operation_details = f"Pacco contentente {articolo} con quantitativo zero in {area}-{scaffale}-{colonna}-{piano} rimosso."

            log_operation(
                operation_type="DELETE",
                operation_details=operation_details,
                user="current_user",  # Replace with actual user info if available
                ip_address=request.remote_addr
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
        operation_details = f"Prelievo articolo {articolo} da {area}-{scaffale}-{colonna}-{piano} - QTA: {quantity} - MERCE NON SCARICATA"
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

    # Extract parameters from the request
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
            qta = Decimal(pacco.qta)
            

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
        add_query = "INSERT INTO wms_items (id_art, area, scaffale, colonna, piano, qta, dimensione) VALUES (?,  ?, ?, ?, ?, ?, 'Zero')"
        cursor.execute(add_query, (articolo, areaDest, scaffaleDest, colonnaDest, pianoDest, quantity))
        conn.commit()
        operation_details = f"Spostamento articolo {articolo} da {area}-{scaffale}-{colonna}-{piano} a {areaDest}-{scaffaleDest}-{colonnaDest}-{pianoDest} - QTA: {quantity}"

        log_operation(
            operation_type="UPDATE",
            operation_details=operation_details,
            user="current_user",  # Replace with actual user info if available
            ip_address=request.remote_addr
        )
        if new_qta == 0:
            operation_details = f"Pacco contentente {articolo} con quantitativo zero in {area}-{scaffale}-{colonna}-{piano} rimosso."

            log_operation(
                operation_type="DELETE",
                operation_details=operation_details,
                user="current_user",  # Replace with actual user info if available
                ip_address=request.remote_addr
            )
        return jsonify({'success': True}), 200

    except pyodbc.Error as e:
        operation_details = f"Spostamento articolo {articolo} da {area}-{scaffale}-{colonna}-{piano} a {areaDest}-{scaffaleDest}-{colonnaDest}-{pianoDest} - QTA: {quantity} - ERRORE"
        print(operation_details)
        log_operation(
            operation_type="ERRORE",
            operation_details=operation_details,
            user="current_user",  # Replace with actual user info if available
            ip_address=request.remote_addr
        )
        conn.rollback()
        return jsonify({'error': str(e)}), 500

    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()


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

        # Extract gol_octi, gol_occo, gol_ocri values from the found row

        # Third query: Find rows in ocordic between gol_ocri (included) and gol_ocri_new (excluded)
        query3 = """
SELECT 
    m.mpl_figlio AS occ_arti,
    p.occ_qmov * m.mpl_coimp AS occ_qmov,
    mg.amg_desc AS occ_desc,
    mg.amg_des2 AS occ_des2,
    p.occ_riga
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
    p.occ_riga
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
            occ_arti = item['occ_arti']
            occ_qmov = item['occ_qmov']
            occ_desc = item['occ_desc']
            occ_des2 = item['occ_des2']
            
            # Combine descriptions
            occ_desc_combined = f"{occ_desc} {occ_des2}".strip()

            # First, check if this `occ_arti` is in `wms_proibiti`
             # Skip if occ_arti starts with 'EG' or '0S'
            if occ_arti and (occ_arti.startswith('EG') or occ_arti.startswith('CONAI')):
                continue

            # Query wms_items for the current occ_arti
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
            quantity_needed = occ_qmov
            remaining_quantity = quantity_needed

            # Create a dictionary to group results by location only
            location_groups = {}

            # Track how much quantity is still needed
            needed_quantity = remaining_quantity

            for wms_row in wms_rows:
                wms_qta = wms_row.qta
                if needed_quantity <= 0:
                    break

                # Define the key based on location only
                location_key = (wms_row.area, wms_row.scaffale, wms_row.colonna, wms_row.piano)

                # Ensure id_pacco is valid and contributes to fulfilling the required quantity
                if wms_row.id_pacco and wms_qta > 0:
                    # Initialize the group if the location is new
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

                    # Calculate how much we can take from this pacco
                    qty_to_take = min(wms_qta, needed_quantity)
                    
                    # Add this pacco's quantity to the location group
                    location_groups[location_key]['pacchi'].append({
                        'id_pacco': wms_row.id_pacco,
                        'quantity': qty_to_take
                    })
                    location_groups[location_key]['total_available_quantity'] += qty_to_take
                    needed_quantity -= qty_to_take

            # Now process the location groups and add the results
            for location_key, group_data in location_groups.items():
                total_qty_in_location = group_data['total_available_quantity']
                
                if total_qty_in_location > 0:  # Only add results if there's quantity to pick
                    detailed_results.append({
                        'occ_arti': occ_arti,
                        'occ_desc_combined': occ_desc_combined,
                        'sufficient_quantity': total_qty_in_location >= quantity_needed,
                        'pacchi': group_data['pacchi'],
                        'location': group_data['location'],
                        'available_quantity': str(int(total_qty_in_location)),
                        'needed_quantity': str(int(quantity_needed)),
                    })

            # If after checking all locations we still need quantity, add a "missing" entry
            if needed_quantity > 0:
                detailed_results.append({
                    'occ_arti': occ_arti,
                    'occ_desc_combined': occ_desc_combined,
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
        for idx, item in enumerate(transfer_items):
            process_single_transfer(cursor, item, idx+1)

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

        remaining -= transfer_qty

    if remaining > 0:
        raise ValueError(f"Item {item_idx}: Insufficient quantity (missing {remaining})")

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
                             AND wi.id_art IN ({placeholders})"""
        
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

if __name__ == '__main__':
    # Run with SSL context for HTTPS
    app.run(host='172.16.16.66', port=5000, debug=True, 
    )


