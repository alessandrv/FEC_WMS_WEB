-- SQL script to initialize or update the inspection tables for the WMS system
-- Execute this script manually to create or update the tables needed for the inspection functionality

-- Create the primary inspection status table if it doesn't exist
-- This table stores the overall inspection status for each shelf
CREATE TABLE wms_inspections (
    id SERIAL PRIMARY KEY,
    shelf_id VARCHAR(20),
    inspection_date DATE,
    status VARCHAR(20), 
    is_current INT DEFAULT 1,
 
    UNIQUE(shelf_id, inspection_date)
);
CREATE TABLE wms_inspection_responses (
    id SERIAL PRIMARY KEY,
    inspection_id INTEGER,
    question VARCHAR(255),
    answer VARCHAR(10), -- 'SI', 'NO', 'NA'
    notes VARCHAR(255),
    FOREIGN KEY (inspection_id) REFERENCES wms_inspections(id) ON DELETE CASCADE
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ispezione_scaffale ON wms_ispezione (scaffale);
CREATE INDEX IF NOT EXISTS idx_ispezione_archived ON wms_ispezione (archived);
CREATE INDEX IF NOT EXISTS idx_ispezione_date ON wms_ispezione (last_check);
CREATE INDEX IF NOT EXISTS idx_ispezione_domande_scaffale ON wms_ispezione_domande (scaffale);
CREATE INDEX IF NOT EXISTS idx_ispezione_domande_date ON wms_ispezione_domande (last_check);

-- For existing installations that had the inspection_form column, use this to migrate data if needed
-- This is commented out as it needs to be executed manually after checking if the column exists
/*
-- Check if the old inspection_form column exists and the archived column doesn't
-- For Informix databases, you may need to check the system catalogs
-- ALTER TABLE wms_ispezione ADD archived SMALLINT DEFAULT 0;

-- If original table had a PRIMARY KEY only on scaffale:
-- ALTER TABLE wms_ispezione DROP PRIMARY KEY;
-- ALTER TABLE wms_ispezione ADD PRIMARY KEY (scaffale, last_check);

-- If you need to migrate data from the old structure, use the migrate_inspection_data.py script:
-- python migrate_inspection_data.py

-- Then remove the inspection_form column if migration is successful:
-- ALTER TABLE wms_ispezione DROP COLUMN inspection_form;
*/

-- Notes:
-- 1. The wms_ispezione table now tracks inspection history by keeping archived records
-- 2. Primary keys have been updated to allow multiple inspection records per shelf (for different dates)
-- 3. The wms_ispezione_domande table stores individual question responses linked to specific inspection dates
-- 4. This setup allows tracking of inspection history over time (with the 6-month cycle)
-- 5. Make sure to run this script with appropriate database permissions 