-- SQL script to update the schema for Informix compatibility
-- Run this script to ensure the database schema is compatible with Informix's date handling

-- Create the main inspection table if it doesn't exist
-- This table stores overall inspection status
CREATE TABLE IF NOT EXISTS wms_ispezione (
    scaffale VARCHAR(20) NOT NULL,
    last_check DATE,
    status VARCHAR(20) NOT NULL,
    archived SMALLINT DEFAULT 0,
    PRIMARY KEY (scaffale)
);

-- Create the inspection questions table if it doesn't exist
-- This table stores question responses for each inspection
CREATE TABLE IF NOT EXISTS wms_ispezione_domande (
    scaffale VARCHAR(6) NOT NULL,
    last_check DATE,
    domanda VARCHAR(255) NOT NULL,
    risposta VARCHAR(4) NOT NULL,
    note VARCHAR(255) DEFAULT NULL,
    PRIMARY KEY (scaffale, domanda)
);

-- Add indexes for better performance
CREATE INDEX idx_ispezione_scaffale ON wms_ispezione (scaffale);
CREATE INDEX idx_ispezione_archived ON wms_ispezione (archived);
CREATE INDEX idx_ispezione_domande_scaffale ON wms_ispezione_domande (scaffale);

-- Note: Informix may have different syntax for creating indexes
-- If the above commands fail, try the appropriate Informix syntax:
-- CREATE INDEX idx_ispezione_scaffale ON wms_ispezione (scaffale);

-- Notes:
-- 1. Simplified primary key in wms_ispezione to just use scaffale
--    This avoids issues with date comparisons in Informix
-- 2. Simplified primary key in wms_ispezione_domande to use scaffale and domanda
--    We'll handle the inspection relationship through the scaffale field
-- 3. Dates should be handled carefully in the application code
--    Avoid complex date manipulations in SQL queries 