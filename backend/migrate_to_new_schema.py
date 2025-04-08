#!/usr/bin/env python
"""
Migration script to move data from old schema (wms_ispezione, wms_ispezione_domande)
to new schema (wms_inspections, wms_inspection_responses)
"""

import os
import sys
import pyodbc
from datetime import datetime

def connect_to_db():
    """Connect to the Informix database using environment variables"""
    try:
        conn_str = os.environ.get('INFORMIX_CONNECTION_STRING')
        if not conn_str:
            conn_str = "DRIVER={Informix ODBC Driver};SERVER=informix;DATABASE=wms;HOST=localhost;SERVICE=1526;UID=informix;PWD=informix;CLIENT_LOCALE=en_US.UTF8;DB_LOCALE=en_US.UTF8;"
        
        return pyodbc.connect(conn_str)
    except pyodbc.Error as e:
        print(f"Database connection error: {e}")
        sys.exit(1)

def migrate_data():
    """Migrate data from old tables to new tables"""
    conn = connect_to_db()
    cursor = conn.cursor()
    
    try:
        print("Starting migration...")
        
        # Check if new tables exist
        try:
            cursor.execute("SELECT COUNT(*) FROM wms_inspections")
            cursor.execute("SELECT COUNT(*) FROM wms_inspection_responses")
        except pyodbc.ProgrammingError:
            print("ERROR: New tables don't exist. Please create them first.")
            sys.exit(1)
        
        # Check if old tables exist
        try:
            cursor.execute("SELECT COUNT(*) FROM wms_ispezione")
            cursor.execute("SELECT COUNT(*) FROM wms_ispezione_domande")
        except pyodbc.ProgrammingError:
            print("ERROR: Old tables don't exist. Nothing to migrate.")
            sys.exit(1)
        
        # Step 1: Migrate inspection records
        print("Migrating inspection records...")
        
        # Get all inspection records
        cursor.execute("""
        SELECT scaffale, last_check, status,
               CASE WHEN archived IS NULL THEN 0 ELSE archived END as archived
        FROM wms_ispezione
        ORDER BY scaffale, last_check DESC
        """)
        
        inspection_records = cursor.fetchall()
        migrated_count = 0
        
        # Process each inspection, keeping only the latest as current
        shelf_processed = set()
        
        for record in inspection_records:
            shelf_id = record[0]
            inspection_date = record[1]
            status = record[2]
            is_archived = record[3]
            
            # Determine if this is current (only the first/latest for each shelf)
            is_current = 0 if is_archived else (1 if shelf_id not in shelf_processed else 0)
            
            if not is_archived and shelf_id not in shelf_processed:
                shelf_processed.add(shelf_id)
            
            try:
                # Insert into new table
                cursor.execute("""
                INSERT INTO wms_inspections (shelf_id, inspection_date, status, is_current)
                VALUES (?, ?, ?, ?)
                """, (shelf_id, inspection_date, status, is_current))
                migrated_count += 1
            except Exception as e:
                print(f"Error migrating record for shelf {shelf_id}: {e}")
        
        conn.commit()
        print(f"Migrated {migrated_count} inspection records")
        
        # Step 2: Migrate question responses
        print("Migrating inspection question responses...")
        
        # Get all responses
        cursor.execute("""
        SELECT d.scaffale, d.last_check, d.domanda, d.risposta, d.note
        FROM wms_ispezione_domande d
        """)
        
        responses = cursor.fetchall()
        response_count = 0
        
        for response in responses:
            shelf_id = response[0]
            inspection_date = response[1]
            question = response[2]
            answer = response[3]
            notes = response[4]
            
            try:
                # Find the matching inspection ID in the new table
                cursor.execute("""
                SELECT id FROM wms_inspections
                WHERE shelf_id = ? AND inspection_date = ?
                """, (shelf_id, inspection_date))
                
                inspection_result = cursor.fetchone()
                if not inspection_result:
                    print(f"Warning: No matching inspection found for {shelf_id} on {inspection_date}")
                    continue
                
                inspection_id = inspection_result[0]
                
                # Insert the response
                cursor.execute("""
                INSERT INTO wms_inspection_responses (inspection_id, question, answer, notes)
                VALUES (?, ?, ?, ?)
                """, (inspection_id, question, answer, notes))
                
                response_count += 1
            except Exception as e:
                print(f"Error migrating response: {e}")
        
        conn.commit()
        print(f"Migrated {response_count} question responses")
        
        print("Migration completed successfully")
        
    except Exception as e:
        conn.rollback()
        print(f"Migration failed: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    migrate_data() 