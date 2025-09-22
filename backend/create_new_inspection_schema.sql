-- New Shelf Inspection System Database Schema
-- This script creates a clean, normalized database structure for shelf inspections

-- Drop existing tables if they exist (careful - this will lose data!)
-- DROP TABLE IF EXISTS wms_inspection_responses;
-- DROP TABLE IF EXISTS wms_inspections;

-- 1. Inspection Cycles Table
-- Manages inspection cycles with 4-month minimum intervals


CREATE TABLE wms_inspection_cycles (
    id SERIAL PRIMARY KEY,
    cycle_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    created_at DATETIME YEAR TO SECOND DEFAULT CURRENT YEAR TO SECOND,
    is_active SMALLINT DEFAULT 1,
    notes VARCHAR(255),
    UNIQUE(start_date)
);


-- 2. Shelf Inspections Table
-- One record per shelf per cycle
CREATE TABLE wms_shelf_inspections (
    id SERIAL PRIMARY KEY,
    cycle_id INTEGER NOT NULL,
    shelf_id VARCHAR(50) NOT NULL,
    inspection_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL 
        CHECK (status IN ('to_check', 'buono', 'warning', 'danger')),
    inspector_name VARCHAR(100),
    created_at DATETIME YEAR TO SECOND DEFAULT CURRENT YEAR TO SECOND,
    updated_at DATETIME YEAR TO SECOND DEFAULT CURRENT YEAR TO SECOND,
    notes VARCHAR(255),
    FOREIGN KEY (cycle_id) REFERENCES wms_inspection_cycles(id),
    UNIQUE(cycle_id, shelf_id)
);


-- 3. Inspection Questions Template Table
-- Standardized questions for inspections
CREATE TABLE wms_inspection_questions (
    id SERIAL PRIMARY KEY,
    question_text VARCHAR(255) NOT NULL,
    question_order INTEGER NOT NULL,
    is_active SMALLINT DEFAULT 1,
    created_at DATETIME YEAR TO SECOND DEFAULT CURRENT YEAR TO SECOND
);


-- 4. Inspection Responses Table
-- Answers to questions for each shelf inspection
CREATE TABLE wms_inspection_responses (
    id SERIAL PRIMARY KEY,
    inspection_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    question_text VARCHAR(255) NOT NULL,
    answer VARCHAR(10) NOT NULL CHECK (answer IN ('SI', 'NO', 'NA')),
    notes VARCHAR(255),
    created_at DATETIME YEAR TO SECOND DEFAULT CURRENT YEAR TO SECOND,
    FOREIGN KEY (inspection_id) REFERENCES wms_shelf_inspections(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES wms_inspection_questions(id),
    UNIQUE (inspection_id, question_id)
);

-- Insert default inspection questions
INSERT INTO wms_inspection_questions (question_text, question_order, is_active)
VALUES ('Lo scaffale è stabile e sicuro?', 1, 1);

INSERT INTO wms_inspection_questions (question_text, question_order, is_active)
VALUES ('Le etichette sono leggibili e corrette?', 2, 1);

INSERT INTO wms_inspection_questions (question_text, question_order, is_active)
VALUES ('Non ci sono danni visibili alla struttura?', 3, 1);

INSERT INTO wms_inspection_questions (question_text, question_order, is_active)
VALUES ('Gli articoli sono disposti correttamente?', 4, 1);

INSERT INTO wms_inspection_questions (question_text, question_order, is_active)
VALUES ('L''area è pulita e ordinata?', 5, 1);

INSERT INTO wms_inspection_questions (question_text, question_order, is_active)
VALUES ('Non ci sono rischi di sicurezza evidenti?', 6, 1);



-- Create the first default cycle (current)
INSERT INTO wms_inspection_cycles (cycle_name, start_date, is_active, notes) 
VALUES ('Ciclo Iniziale', TODAY, 1, 'Primo ciclo di ispezioni del sistema');

COMMIT;