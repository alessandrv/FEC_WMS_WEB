-- ============================================================
-- wms_items.id_mov NUMBER -> VARCHAR2(30)
-- Needed for the new movement keys 'ANNO/TIPO/NUMERO' (e.g. '2026/CA/38').
-- Existing ADAPTA numbers are kept as text ('83005').
-- Only for databases created with the old 01_wms_tables.sql (id_mov NUMBER).
-- ============================================================

ALTER TABLE wms_items ADD (id_mov_txt VARCHAR2(30));
UPDATE wms_items SET id_mov_txt = TO_CHAR(id_mov);
COMMIT;
ALTER TABLE wms_items DROP COLUMN id_mov;
ALTER TABLE wms_items RENAME COLUMN id_mov_txt TO id_mov;
