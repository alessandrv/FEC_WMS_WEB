#!/usr/bin/env python
"""
Migration script for inspection form data

This script migrates inspection data from the old format (JSON stored in inspection_form column)
to the new format (individual rows in wms_ispezione_domande table) and supports the 6-month
inspection cycle by properly setting up the archived flag and inspection dates.

Usage:
    python migrate_inspection_data.py

Make sure to run this with the same Python environment as your main application.
"""

import os
import sys
import json
import pyodbc
from datetime import datetime

# Import the database connection function from your main application
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from backend import connect_to_db
except ImportError:
    print("Could not import connect_to_db from backend.py")
    print("Make sure you're running this script from the correct directory")
    sys.exit(1)

# Inspection questions mapping (used to match JSON keys to questions text)
QUESTIONS_MAPPING = {
    'q1': 'La scaffalatura è stata installata secondo le indicazioni del costruttore?',
    'q2': 'Esiste il lay-out delle scaffalature completo dei prospetti di ciascuna sezione? Il lay-out corrisponde alla situazione attuale?',
    'q3': 'I cartelli indicanti il carico ammesso per ogni sezione sono presenti, corretti e ben visibili?',
    'q4': 'Il personale addetto alle operazioni di movimentazione delle merci è informato e formato circa il corretto uso delle scaffalature ed il significato dei dati espressi nelle tabelle di portata?',
    'q5': 'Vengono utilizzati i corretti accessori per lo stoccaggio, come previsto dal costruttore?',
    'q6': 'Le macchine utilizzate per la movimentazione dei carichi sono quelle previste dal costruttore?',
    'q7': 'La pavimentazione è orizzontale e priva di danni o deformazioni in prossimità dei punti di ancoraggio?',
    'q8': 'L\'area di lavoro è idonea e mantenuta pulita ed ordinata?', 
    'q9': 'Vengono rispettati i limiti degli ingombri a terra e in quota?',
    'q10': 'L\'area è sufficientemente illuminata? (assenza di zone d\'ombra)',
    'q11': 'Altro (specificare)…'
}

def migrate_inspection_data():
    """Migrate inspection data from JSON format to individual rows with support for the 6-month cycle"""
    
    print("Starting migration of inspection form data...")
    
    # Connect to the database
    try:
        conn = connect_to_db()
        cursor = conn.cursor()
    except Exception as e:
        print(f"Error connecting to database: {e}")
        return
    
    try:
        # Check table structure and make necessary modifications
        try:
            # Check if the inspection table exists
            cursor.execute("SELECT COUNT(*) FROM wms_ispezione")
        except pyodbc.ProgrammingError:
            print("The wms_ispezione table does not exist. Creating it...")
            create_tables(cursor)
            conn.commit()
        
        # Check if archived column exists, add it if not
        try:
            cursor.execute("SELECT archived FROM wms_ispezione WHERE 1=0")
        except pyodbc.ProgrammingError:
            print("Adding archived column to wms_ispezione table...")
            cursor.execute("ALTER TABLE wms_ispezione ADD archived SMALLINT DEFAULT 0")
            conn.commit()
        
        # Check if inspection_form column exists
        try:
            cursor.execute("SELECT scaffale, last_check, status, inspection_form FROM wms_ispezione WHERE inspection_form IS NOT NULL")
            rows = cursor.fetchall()
            has_inspection_form = True
        except pyodbc.ProgrammingError:
            print("The inspection_form column does not exist. Checking for existing question data...")
            has_inspection_form = False
            
            # Check if we already have data in the questions table
            cursor.execute("SELECT COUNT(*) FROM wms_ispezione_domande")
            count = cursor.fetchone()[0]
            
            if count > 0:
                print(f"Found {count} existing question responses. Migration already completed.")
                return
            
            # Get all inspection records instead
            cursor.execute("SELECT scaffale, last_check, status FROM wms_ispezione")
            rows = cursor.fetchall()
        
        print(f"Found {len(rows)} inspection records to process")
        
        # Process each record
        for row in rows:
            if has_inspection_form:
                scaffale, last_check, status, inspection_form = row
            else:
                scaffale, last_check, status = row
                inspection_form = None
            
            # Make sure last_check is not None
            if not last_check:
                last_check = datetime.now().strftime("%Y-%m-%d")
                
                # Update the record with the current date
                cursor.execute("UPDATE wms_ispezione SET last_check = ? WHERE scaffale = ?", 
                              (last_check, scaffale))
            
            # Set all existing inspections as non-archived (current)
            try:
                cursor.execute("UPDATE wms_ispezione SET archived = 0 WHERE scaffale = ?", 
                              (scaffale,))
            except:
                print(f"Could not update archived status for {scaffale}. Continuing...")
            
            # Skip if no inspection form data or we've already migrated
            if not has_inspection_form or not inspection_form:
                continue
                
            try:
                # Parse the JSON data
                form_data = json.loads(inspection_form)
                
                # Clear any existing entries for this shelf and inspection date
                cursor.execute("DELETE FROM wms_ispezione_domande WHERE scaffale = ? AND last_check = ?", 
                              (scaffale, last_check))
                
                # Insert new entries
                migrated_count = 0
                for question_id, risposta in form_data.items():
                    # Skip note fields, they'll be handled with their question
                    if question_id.endswith('_note'):
                        continue
                    
                    # Get the question text
                    domanda = QUESTIONS_MAPPING.get(question_id)
                    if not domanda:
                        print(f"  Warning: Unknown question ID {question_id} for shelf {scaffale}")
                        continue
                    
                    # Get the note if available
                    note = form_data.get(f"{question_id}_note", "")
                    
                    # Skip if no response
                    if not risposta:
                        continue
                    
                    # Insert the response
                    cursor.execute("""
                        INSERT INTO wms_ispezione_domande (scaffale, last_check, domanda, risposta, note)
                        VALUES (?, ?, ?, ?, ?)
                    """, (scaffale, last_check, domanda, risposta, note))
                    
                    migrated_count += 1
                
                print(f"  Migrated {migrated_count} questions for shelf {scaffale}")
                
            except json.JSONDecodeError:
                print(f"  Error: Invalid JSON data for shelf {scaffale}")
            except Exception as e:
                print(f"  Error processing shelf {scaffale}: {e}")
        
        # Commit all changes
        conn.commit()
        
        # Optionally remove the inspection_form column (commented out for safety)
        """
        if has_inspection_form:
            try:
                print("Removing old inspection_form column...")
                cursor.execute("ALTER TABLE wms_ispezione DROP COLUMN inspection_form")
                conn.commit()
                print("Successfully removed inspection_form column")
            except Exception as e:
                print(f"Could not remove inspection_form column: {e}")
        """
        
        print("Migration completed successfully")
        
    except Exception as e:
        print(f"Error during migration: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def create_tables(cursor):
    """Create the inspection tables if they don't exist"""
    
    # Create the main inspection table
    cursor.execute("""
    CREATE TABLE wms_ispezione (
        scaffale VARCHAR(20) NOT NULL,
        last_check DATE,
        status VARCHAR(20) NOT NULL,
        archived SMALLINT DEFAULT 0,
        PRIMARY KEY (scaffale, last_check)
    )
    """)
    
    # Create the questions table
    cursor.execute("""
    CREATE TABLE wms_ispezione_domande (
        scaffale VARCHAR(6) NOT NULL,
        last_check DATE NOT NULL,
        domanda VARCHAR(255) NOT NULL,
        risposta VARCHAR(4) NOT NULL,
        note VARCHAR(255) DEFAULT NULL,
        PRIMARY KEY (scaffale, last_check, domanda)
    )
    """)
    
    # Create indexes
    cursor.execute("CREATE INDEX idx_ispezione_scaffale ON wms_ispezione (scaffale)")
    cursor.execute("CREATE INDEX idx_ispezione_archived ON wms_ispezione (archived)")
    cursor.execute("CREATE INDEX idx_ispezione_date ON wms_ispezione (last_check)")
    cursor.execute("CREATE INDEX idx_ispezione_domande_scaffale ON wms_ispezione_domande (scaffale)")
    cursor.execute("CREATE INDEX idx_ispezione_domande_date ON wms_ispezione_domande (last_check)")
    
    print("Created inspection tables and indexes")

if __name__ == "__main__":
    migrate_inspection_data() 