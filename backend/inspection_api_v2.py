"""
New Shelf Inspection System API
Clean implementation with proper error handling and normalized database structure
"""

from flask import jsonify, request
from datetime import datetime, date
from decimal import Decimal
import calendar


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
# INSPECTION CYCLES API
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
        FROM inspection_cycles
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
            count_query = "SELECT COUNT(*) FROM shelf_inspections WHERE cycle_id = ?"
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
        FROM inspection_cycles
        ORDER BY start_date DESC
        LIMIT 1
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
            'message': f'Ultimo ciclo: {last_cycle_name} del {last_cycle_date.strftime("%d/%m/%Y")}. '
                      f'{"Puoi creare un nuovo ciclo." if can_create else f"Nuovo ciclo possibile dal {next_allowed_date.strftime("%d/%m/%Y")}."}'
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
    """Create a new inspection cycle (enforces 4-month rule)"""
    try:
        data = request.get_json()
        cycle_name = data.get('cycle_name', f'Ciclo {datetime.now().strftime("%B %Y")}')
        notes = data.get('notes', '')
        
        conn = connect_to_db()
        cursor = conn.cursor()
        conn.autocommit = False
        
        # Check if we can create a new cycle
        status_query = """
        SELECT start_date
        FROM inspection_cycles
        ORDER BY start_date DESC
        LIMIT 1
        """
        cursor.execute(status_query)
        result = cursor.fetchone()
        
        today = date.today()
        
        if result:
            last_cycle_date = result[0]
            months_since = months_between_full(last_cycle_date, today)
            
            if months_since < 4:
                next_allowed = add_months(last_cycle_date, 4)
                return jsonify({
                    'success': False,
                    'error': f'Nuovo ciclo possibile solo dopo 4 mesi dall\'ultimo. Prossima data disponibile: {next_allowed.strftime("%d/%m/%Y")}',
                    'next_allowed_date': next_allowed.strftime('%Y-%m-%d')
                }), 400
        
        # Deactivate current active cycle
        cursor.execute("UPDATE inspection_cycles SET is_active = 0, end_date = ? WHERE is_active = 1", (today,))
        
        # Create new cycle
        insert_query = """
        INSERT INTO inspection_cycles (cycle_name, start_date, is_active, notes)
        VALUES (?, ?, 1, ?)
        """
        cursor.execute(insert_query, (cycle_name, today, notes))
        
        # Get the new cycle ID
        cursor.execute("SELECT id FROM inspection_cycles WHERE start_date = ? AND is_active = 1", (today,))
        new_cycle = cursor.fetchone()
        new_cycle_id = new_cycle[0] if new_cycle else None
        
        conn.commit()
        
        return jsonify({
            'success': True,
            'cycle_id': new_cycle_id,
            'cycle_name': cycle_name,
            'start_date': today.strftime('%Y-%m-%d'),
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


# =============================================
# SHELF INSPECTIONS API
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
            cursor.execute("SELECT id FROM inspection_cycles WHERE is_active = 1 LIMIT 1")
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
        FROM inspection_cycles
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
        FROM shelf_inspections
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


@app.route('/api/v2/shelf-inspections/<shelf_id>', methods=['GET'])
def get_shelf_inspection_v2(shelf_id):
    """Get specific shelf inspection with questions and responses"""
    try:
        cycle_id = request.args.get('cycle_id')
        
        conn = connect_to_db()
        cursor = conn.cursor()
        
        # If no cycle_id specified, get the active cycle
        if not cycle_id:
            cursor.execute("SELECT id FROM inspection_cycles WHERE is_active = 1 LIMIT 1")
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
        FROM shelf_inspections
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
        FROM inspection_responses r
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
            SELECT id FROM shelf_inspections
            WHERE cycle_id = ? AND shelf_id = ?
            """
            cursor.execute(check_query, (cycle_id, shelf_id))
            existing = cursor.fetchone()
            
            inspection_id = None
            
            if existing:
                # Update existing inspection
                inspection_id = existing[0]
                update_query = """
                UPDATE shelf_inspections
                SET status = ?, inspector_name = ?, notes = ?, 
                    inspection_date = ?, updated_at = CURRENT
                WHERE id = ?
                """
                cursor.execute(update_query, (status, inspector_name, notes, today, inspection_id))
            else:
                # Create new inspection
                insert_query = """
                INSERT INTO shelf_inspections 
                (cycle_id, shelf_id, inspection_date, status, inspector_name, notes)
                VALUES (?, ?, ?, ?, ?, ?)
                """
                cursor.execute(insert_query, (cycle_id, shelf_id, today, status, inspector_name, notes))
                
                # Get the new inspection ID
                cursor.execute("SELECT id FROM shelf_inspections WHERE cycle_id = ? AND shelf_id = ?", (cycle_id, shelf_id))
                new_inspection = cursor.fetchone()
                inspection_id = new_inspection[0] if new_inspection else None
            
            if not inspection_id:
                raise Exception("Impossibile ottenere l'ID dell'ispezione")
            
            # Delete existing responses
            cursor.execute("DELETE FROM inspection_responses WHERE inspection_id = ?", (inspection_id,))
            
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
                    cursor.execute("SELECT id FROM inspection_questions WHERE question_text = ? AND is_active = 1", (question_text,))
                    existing_question = cursor.fetchone()
                    question_id = existing_question[0] if existing_question else 1  # Default to first question
                
                insert_response_query = """
                INSERT INTO inspection_responses 
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
        FROM inspection_questions
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