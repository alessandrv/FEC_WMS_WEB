from flask import Flask, jsonify, request
import pyodbc
from flask_cors import CORS
from decimal import Decimal
import uuid

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Define your connection string
connection_string = 'DSN=fec;UID=informix;PWD=informix;'
def connect_to_db():
    try:
        return pyodbc.connect(connection_string)
    except pyodbc.Error as e:
        raise Exception(f"Unable to connect to the database: {str(e)}")
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

@app.route('/api/get-items', methods=['GET'])
def get_items():
    """
    Retrieves paginated items from wms_items grouped by id_art along with their descriptions from mganag.
    Accepts 'page', 'limit', 'articleFilter', 'supplierFilter', and 'filterString' as query parameters.
    Returns a JSON object with grouped items and pagination metadata.
    """
    try:
        # Parse query parameters with default values
        page = request.args.get('page', default=1, type=int)
        limit = request.args.get('limit', default=50, type=int)
        article_filter = request.args.get('articleFilter', default='', type=str)
        supplier_filter = request.args.get('supplierFilter', default='', type=str)
        filter_string = request.args.get('filterString', default='', type=str)
        
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

        # Step 1: Count total distinct id_art with applied filters
        count_query = "SELECT COUNT(DISTINCT id_art) FROM wms_items WHERE 1=1"
        params = []

        # Apply filters
        if article_filter:
            # Cast id_art to VARCHAR for LIKE comparison
            count_query += " AND CAST(id_art AS VARCHAR(20)) LIKE ?"
            params.append(f"%{article_filter}%")
        if supplier_filter:
            count_query += " AND codice_fornitore LIKE ?"
            params.append(f"%{supplier_filter}%")
        if filter_string:
            # Expected format: Area-Scaffale-Colonna-Piano (e.g., A-A-01-1)
            try:
                area, scaffale, colonna, piano = filter_string.split('-')
                count_query += " AND EXISTS (SELECT 1 FROM wms_items AS wi2 WHERE wi2.id_art = wms_items.id_art AND wi2.area = ? AND wi2.scaffale = ? AND wi2.colonna = ? AND wi2.piano = ?)"
                params.extend([area, scaffale, colonna, piano])
            except ValueError:
                # Invalid filter string format
                return jsonify({'error': 'Invalid filter string format. Expected format: Area-Scaffale-Colonna-Piano (e.g., A-A-01-1).'}), 400

        cursor.execute(count_query, tuple(params))
        total_distinct_id_art = cursor.fetchone()[0]

        # Step 2: Fetch distinct id_art for the current page with CAST and LIKE
        id_art_query = """
            SELECT SKIP ? FIRST ? id_art
            FROM wms_items
            WHERE 1=1
        """
        # Initialize id_art_params with offset and limit first
        id_art_params = [offset, limit]

        # Apply same filters as count_query
        if article_filter:
            id_art_query += " AND CAST(id_art AS VARCHAR(20)) LIKE ?"
            id_art_params.append(f"%{article_filter}%")
        if supplier_filter:
            id_art_query += " AND codice_fornitore LIKE ?"
            id_art_params.append(f"%{supplier_filter}%")
        if filter_string:
            id_art_query += " AND EXISTS (SELECT 1 FROM wms_items AS wi2 WHERE wi2.id_art = wms_items.id_art AND wi2.area = ? AND wi2.scaffale = ? AND wi2.colonna = ? AND wi2.piano = ?)"
            id_art_params.extend(filter_string.split('-'))

        id_art_query += " GROUP BY id_art ORDER BY id_art "

        cursor.execute(id_art_query, tuple(id_art_params))
        id_art_rows = cursor.fetchall()
        id_art_list = [row[0] for row in id_art_rows]

        if not id_art_list:
            # No items found for the given page
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
            ORDER BY 
                wi.id_art
        """
        cursor.execute(items_query, tuple(id_art_list))
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
                    'codice_fornitore': item.get('codice_fornitore', ''),
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
        # Log the error details (optional)
        app.logger.error(f"Database error: {str(e)}")
        return jsonify({'error': 'Database error occurred.'}), 500

    except Exception as ex:
        # Log the error details (optional)
        app.logger.error(f"Unexpected error: {str(ex)}")
        return jsonify({'error': 'An unexpected error occurred.'}), 500

    finally:
        # Ensure that the cursor and connection are closed properly
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
        query = "SELECT DISTINCT oft_cofo, ofc_arti, gim_code FROM ofordit, ofordic, mggior WHERE oft_cofo = ? AND ofc_arti = ? AND gim_code = ? AND ofc_arti = gim_arti;"
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
    try:
        # Connect to the database
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # Define the query to fetch shelves based on area
        query = "select * FROM wms_items WHERE area = ? AND  scaffale = ? AND colonna= ? AND piano= ?"

        cursor.execute(query, (area, scaffale, colonna, piano))
        
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


@app.route('/api/conferma-inserimento', methods=['POST'])
def conferma_inserimento():
    data = request.json
    area = data.get('area')
    scaffale = data.get('scaffale')
    colonna = data.get('colonna')
    piano = data.get('piano')
    codice_articolo = data.get('codice_articolo')
    codice_movimento = data.get('codice_movimento')
    codice_fornitore = data.get('codice_fornitore')
    quantita = data.get('quantita')
    dimensioni = data.get('dimensioni')
    numero_pacchi = data.get('numero_pacchi')
    volume_totale = data.get('volume')
    
    if not (area and scaffale and colonna and piano and codice_articolo and codice_movimento and codice_fornitore and quantita and dimensioni and numero_pacchi):
        return jsonify({'error': 'Missing required parameters'}), 400
    
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
        transaction = conn.autocommit = False  # Start transaction


        insert_query = """
        INSERT INTO wms_items (id_art, id_mov, fornitore, area, scaffale, colonna, piano, qta, dimensione) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        update_query = """
        UPDATE wms_scaffali 
        SET volume_libero = volume_libero - ?
        WHERE area = ? AND scaffale = ? AND colonna = ? AND piano = ?
        """
        
        for _ in range(numero_pacchi):
            cursor.execute(insert_query, (codice_articolo, codice_movimento, codice_fornitore, area, scaffale, colonna, piano, quantita, dimensioni))
        cursor.execute(update_query, (volume_totale, area, scaffale, colonna, piano))

        conn.commit()  # Commit transaction
        return jsonify({'success': True}), 200

    except pyodbc.Error as e:
        if conn:
            conn.rollback()  # Rollback transaction on error
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
        update_shelf_volume_query = """
        UPDATE wms_scaffali
        SET volume_libero = volume_libero + ?
        WHERE area = ? AND scaffale = ? AND colonna = ? AND piano = ?
        """
        cursor.execute(update_shelf_volume_query, (total_volume_to_add, area, scaffale, colonna, piano))

        conn.commit()
        return jsonify({'success': True}), 200

    except pyodbc.Error as e:
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

        # Find the row after the known gol_ocri value
        found_row = None
        for row in rows:
            if row.gol_ocri > gol_ocri:
                found_row = row
                break

                # If no subsequent row is found, set gol_ocri_new to a large number (e.g., max int)
        if not found_row:
            gol_ocri_new = float('inf')  # No next row found, so consider all subsequent rows
        else:
            # Extract gol_octi, gol_occo, gol_ocri values from the found row
            gol_octi_new, gol_occo_new, gol_ocri_new = found_row.gol_octi, found_row.gol_occo, found_row.gol_ocri

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
    AND p.occ_riga < (
        SELECT MIN(p1.occ_riga)
        FROM ocordic p1
        WHERE p1.occ_arti IS NULL
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
    AND p.occ_riga < (
        SELECT MIN(p1.occ_riga)
        FROM ocordic p1
        WHERE p1.occ_arti IS NULL
          AND p1.occ_tipo = ?
          AND p1.occ_code = ?
          AND p1.occ_riga >= ?
    )
    AND NOT EXISTS (
        SELECT 1 
        FROM mplegami m 
        WHERE m.mpl_padre = p.occ_arti
    );
        """
        params = (
            gol_octi, gol_occo, gol_ocri,  # First block
            gol_octi, gol_occo, gol_ocri,  # Subquery in first block
            gol_octi, gol_occo, gol_ocri,  # Second block
            gol_octi, gol_occo, gol_ocri   # Subquery in second block
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
            if occ_arti.startswith('EG') or occ_arti.startswith('0S'):
                continue

            # Query wms_items for the current occ_arti
            query_wms = """
            SELECT 
                id_art, 
                id_mov, 
                id_pacco,  -- Track id_pacco
                fornitore, 
                area, 
                scaffale, 
                colonna, 
                piano, 
                SUM(qta) AS qta
            FROM 
                wms_items
            WHERE 
                id_art = ?
            GROUP BY 
                id_art, 
                id_mov, 
                id_pacco,  -- Group by id_pacco
                fornitore, 
                area, 
                scaffale, 
                colonna, 
                piano
            ORDER BY
                            id_mov ASC, id_pacco asc

            """
            cursor.execute(query_wms, (occ_arti,))
            wms_rows = cursor.fetchall()

            total_available_quantity = sum(wms_row.qta for wms_row in wms_rows)
            quantity_needed = occ_qmov
            remaining_quantity = quantity_needed

            # Create a dictionary to group results by location
            # Create a dictionary to group results by location
                        # Create a dictionary to group results by location
            location_groups = {}

            # Track how much quantity is still needed
            needed_quantity = remaining_quantity

 
            for wms_row in wms_rows:
                wms_qta = wms_row.qta
                if needed_quantity <= 0:
                    break  # Exit if the required quantity has been satisfied

                # Define the location key based on area, scaffale, colonna, piano
                location_key = (wms_row.area, wms_row.scaffale, wms_row.colonna, wms_row.piano)

                # Ensure id_pacco is valid and contributes to fulfilling the required quantity
                if wms_row.id_pacco and wms_qta > 0:
                    # Initialize the group if the location is new
                    if location_key not in location_groups:
                        location_groups[location_key] = {
                            'total_available_quantity': 0,
                            'pacchi': [],  # Change from id_pacco_list to pacchi
                            'location': {
                                'area': wms_row.area,
                                'scaffale': wms_row.scaffale,
                                'colonna': wms_row.colonna,
                                'piano': wms_row.piano,
                            },
                            'movimento': wms_row.id_mov  # Track movimento separately
                        }

                    # Check if adding this pacco exceeds the needed quantity
                    if wms_qta <= needed_quantity:
                        # Fulfill from this location as it doesn't exceed the needed quantity
                        location_groups[location_key]['pacchi'].append({
                            'id_pacco': wms_row.id_pacco,
                            'quantity': wms_qta
                        })
                        location_groups[location_key]['total_available_quantity'] += wms_qta
                        needed_quantity -= wms_qta  # Reduce the needed quantity
                    else:
                        # Only take what's needed from this location to fulfill the order
                        location_groups[location_key]['pacchi'].append({
                            'id_pacco': wms_row.id_pacco,
                            'quantity': needed_quantity  # Take only the remaining needed quantity
                        })
                        location_groups[location_key]['total_available_quantity'] += needed_quantity
                        needed_quantity = 0  # Fulfilled the total needed quantity
                        break  # Exit as the order is fully satisfied

            # Now process the locations and add the results
            for location_key, group_data in location_groups.items():
                detailed_results.append({
                    'occ_arti': occ_arti,
                    'movimento': group_data['movimento'],
                    'occ_desc_combined': occ_desc_combined,
                    'sufficient_quantity': group_data['total_available_quantity'] >= quantity_needed,
                    'pacchi': group_data['pacchi'],  # Updated to include pacchi with quantities
                    'location': group_data['location'],
                    'available_quantity': str(int(group_data['total_available_quantity'])),  # Provide the available amount
                    'needed_quantity': str(int(quantity_needed)),  # Add the originally needed quantity
                })

            # If there's still remaining quantity, add a "missing" entry for the shortfall
            if needed_quantity > 0:
                detailed_results.append({
                    'occ_arti': occ_arti,
                    'occ_desc_combined': occ_desc_combined,
                    'missing': True,
                    'pacchi': None,  # No valid pacchi available for missing items
                    'location': {
                        'area': None,
                        'scaffale': None,
                        'colonna': None,
                        'piano': None,
                    },
                    'available_quantity': str(int(needed_quantity)),  # No more available quantity
                    'needed_quantity': str(int(needed_quantity)),  # Indicate how much is missing
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

        # Step 2: Fetch available locations ordered by movimento number
        query_locations = """
            SELECT 
                id_mov AS movimento,
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
                id_mov, area, scaffale, colonna, piano
            ORDER BY 
                movimento ASC
        """
        cursor.execute(query_locations, (articolo_id,))
        location_rows = cursor.fetchall()

        detailed_results = []
        accumulated_quantity = 0

        for row in location_rows:
            if accumulated_quantity >= required_quantity:
                break  # Required quantity fulfilled

            available = row.available_quantity
            movement = row.movimento

            # Determine how much to pick from this location
            pick_quantity = min(available, required_quantity - accumulated_quantity)

            detailed_results.append({
                'id': str(uuid.uuid4()),  # Unique identifier for React's key
                'occ_arti': articolo_id,
                'occ_desc_combined': occ_desc_combined,
                'movimento': movement,
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
                'movimento': None,
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

if __name__ == '__main__':
    app.run(host='172.16.16.69', port=5000, debug=True)
