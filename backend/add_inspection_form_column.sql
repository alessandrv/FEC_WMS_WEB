-- SQL script to add the inspection_form column to wms_ispezione table
-- Run this script manually if the table exists but needs the new column

-- Check if the table exists
-- If not, create it with the inspection_form column
CREATE TABLE IF NOT EXISTS wms_ispezione (
    id SERIAL NOT NULL PRIMARY KEY,
    scaffale VARCHAR(20) NOT NULL,
    last_check DATE,
    status VARCHAR(20) NOT NULL,
    inspection_form TEXT
);

-- If the table exists but doesn't have the inspection_form column, add it
-- For Informix, we can't use IF NOT EXISTS for ALTER TABLE commands
-- So we need to check if the column exists before adding it
-- This script should be run manually after confirming the column doesn't exist

-- For Informix, you would usually check the systables and syscolumns catalogs
-- but for simplicity, we'll just add the column (this may error if column already exists)

-- Add the inspection_form column if it doesn't exist
ALTER TABLE wms_ispezione ADD COLUMN inspection_form TEXT;

-- Note: If this script errors because the column already exists, that's okay
-- Just ignore the error and continue 