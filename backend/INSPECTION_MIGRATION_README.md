# Inspection Data Structure Migration Guide

## Overview

This guide explains the changes made to the inspection data structure and how to migrate from the old structure to the new one, which supports the 6-month inspection cycle.

### Previous Structure
- Inspection status and data were stored in a single table called `wms_ispezione`
- All question responses were stored as JSON in an `inspection_form` column
- No support for historical inspection data or inspection cycles

### New Structure
- Inspection status is stored in the `wms_ispezione` table with a timestamp
- Individual question responses are stored in a new table called `wms_ispezione_domande`
- Support for 6-month inspection cycles with archived flag for historical records
- Primary keys now include inspection dates to track inspection history

## 6-Month Inspection Cycle

The new system implements a 6-month inspection cycle as follows:

1. **Current Inspections**: Each shelf has one active (non-archived) inspection record
2. **After 6 Months**: When a shelf is inspected and it has been 6+ months since the last inspection:
   - The previous inspection is marked as archived (archived=1)
   - A new inspection record is created with the current date
   - Question responses will be linked to the new inspection date
3. **Within 6 Months**: If a shelf is inspected within 6 months of the last inspection:
   - The existing inspection record is updated
   - Question responses are linked to the same inspection date

This approach ensures that:
- Historical inspection data is preserved
- Only the current inspection data can be edited
- A complete inspection history is maintained for each shelf

## Migration Steps

Follow these steps to migrate your database to the new structure:

1. **Backup your database**
   - Always create a backup before making structural changes

2. **Create the new table structure**
   - Run the SQL script `create_inspection_tables.sql`:
   ```bash
   # For most SQL databases
   psql -U your_username -d your_database -f create_inspection_tables.sql
   
   # For Informix, use appropriate command:
   dbaccess your_database create_inspection_tables.sql
   ```

3. **Migrate existing data**
   - Run the Python migration script:
   ```bash
   python migrate_inspection_data.py
   ```
   - This script will:
     - Create tables if they don't exist
     - Add the archived column to track inspection history
     - Find all records in `wms_ispezione` with `inspection_form` data
     - Parse the JSON data
     - Insert individual question responses into `wms_ispezione_domande`
     - Set all existing inspections as non-archived (active)
     - Print a summary of migrated records

4. **Verify the migration**
   - Check that data exists in the new table:
   ```sql
   SELECT COUNT(*) FROM wms_ispezione_domande;
   ```
   - Verify that archived flags are set correctly:
   ```sql
   SELECT scaffale, last_check, status, archived FROM wms_ispezione;
   ```

5. **Remove the old column** (optional, after verification)
   - Once you're confident the migration is complete, you can remove the old column by uncommenting and running the relevant code in the migration script.

## API Changes

### New Endpoints
- `/api/shelf-inspection-questions/<shelf_id>` (GET) - Get question responses for the current inspection
- `/api/shelf-inspection-questions/<shelf_id>` (POST) - Save question responses for the current inspection
- `/api/shelf-inspection-history/<shelf_id>` (GET) - Get the complete inspection history for a shelf

### Modified Endpoints
- `/api/shelf-inspection/<shelf_id>` (GET) - Now includes a `needs_new_inspection` field
- `/api/shelf-inspection/<shelf_id>` (POST) - Handles the 6-month cycle logic, creating new inspections when needed

## Viewing Inspection History

The new API allows you to view the complete inspection history for a shelf:

1. The `/api/shelf-inspection-history/<shelf_id>` endpoint returns all inspections for a shelf
2. Each inspection record includes:
   - Inspection date (`last_check`)
   - Status at time of inspection (`status`)
   - All question responses for that inspection (`questions` array)
3. The frontend can display this history in a timeline or tabs interface

## Troubleshooting

- **Migration script fails to connect to database**
  - Make sure the database connection details in your `backend.py` are correct
  - Run the script from the correct directory
  
- **Errors about missing columns**
  - The script should handle adding columns if they don't exist
  - If you see errors, check your database user's permissions
  
- **Errors about primary key constraints**
  - The script attempts to handle primary key changes
  - You may need to manually modify the primary key structure first
  
- **Questions/Answers not linked correctly**
  - Ensure the inspection date is correctly set in both tables
  - Check that question IDs match properly between old and new formats

## Additional Resources

- Review `backend.py` for the API implementation details
- Check `IspezioneScaffali.jsx` for the frontend implementation
- See `create_inspection_tables.sql` for the table structure
- The `migrate_inspection_data.py` script includes detailed error handling

If you encounter any issues, please contact the development team. 