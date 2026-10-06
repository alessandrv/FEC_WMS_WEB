-- ============================================================
-- ERP compatibility views: Skyline tables exposed with the old
-- Informix table/column names used by backend.py and the frontend.
--
--   Informix      ->  view            ->  Skyline source
--   mganag        ->  wms_v_mganag    ->  MAG_ANA_ARTICOLI (+ MAG_ANA_ARTIC_FORNIT lead time)
--   mgdepo        ->  wms_v_mgdepo    ->  MAG_GIACENZA (summed per article/warehouse)
--   mggior/bfbolt ->  wms_v_mggior    ->  MAG_MOVIM_RIGHE + MAG_MOVIM_TESTATA
--   agclifor      ->  wms_v_agclifor  ->  ANAGRAFICO_CONTI (supplier mastri 36xx)
--   ofordit       ->  wms_v_ofordit   ->  ACW_ORD_FOR_TEST
--   ofordic       ->  wms_v_ofordic   ->  ACW_ORD_FOR_RIGA
--   mplegami      ->  wms_v_mplegami  ->  PRW_DR / PRW_DR_OP / PRW_DR_ART (alternative 0)
--   mpordgol+ocordic -> wms_v_odl_componenti -> PRW_LANCIO + PRW_LANCIO_ART_PREV
--   mpordil       ->  wms_v_mpordil   ->  PRW_LANCIO
--
-- Conventions:
--   * Skyline codes are CHAR (blank padded): every code is TRIM()med here so
--     backend binds ('ABC') match and JSON values are clean.
--   * Supplier code = 'F' || PARTITARIO  (same format stored in wms_items.fornitore).
--   * Purchase order key: oft_tipo = 'AC', oft_code = 'ANNO/NUMERO' (e.g. '2026/4979').
--
-- Run as FECITALIA after 01_wms_tables.sql. Safe to re-run (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE VIEW wms_v_mganag AS
SELECT TRIM(a.cod_articolo)                                   AS amg_code,
       a.tipo_articolo                                        AS amg_tipo,
       a.desc_articolo_1                                      AS amg_desc,
       NVL(a.desc_articolo_2, ' ')                            AS amg_des2,
       TRIM(a.desc_articolo_1 || ' ' || a.desc_articolo_2)    AS amg_dest,
       NVL(a.tempo_app_medio,
           (SELECT MAX(f.tempo_medio_appr)
              FROM mag_ana_artic_fornit f
             WHERE f.cod_articolo = a.cod_articolo))          AS amg_lead,
       a.data_annullamento                                    AS amg_dann
  FROM mag_ana_articoli a;

CREATE OR REPLACE VIEW wms_v_mgdepo AS
SELECT TRIM(g.cod_articolo)       AS dep_arti,
       TRIM(g.cod_magazzino)      AS dep_code,
       SUM(g.giacenza_gest)       AS dep_qgia,
       SUM(g.qta_riservata_gest)  AS dep_qris
  FROM mag_giacenza g
 GROUP BY TRIM(g.cod_articolo), TRIM(g.cod_magazzino);

CREATE OR REPLACE VIEW wms_v_mggior AS
SELECT r.nro_registrazione                                    AS gim_code,
       r.nro_riga                                             AS gim_riga,
       TRIM(r.cod_articolo)                                   AS gim_arti,
       NVL(r.descr_riga, a.desc_articolo_1)                   AS gim_desc,
       NVL(a.desc_articolo_2, ' ')                            AS gim_des2,
       NVL(r.quantita_gest_car, 0) + NVL(r.quantita_gest_scar, 0) AS gim_qmov,
       TRIM(r.cod_magazzino)                                  AS gim_depo,
       t.data_movimento                                       AS gim_data,
       TRIM(t.cod_causale)                                    AS gim_caus,
       CASE WHEN t.mastro LIKE '36%' THEN 'F' || TRIM(t.partitario) END AS gim_cofo
  FROM mag_movim_righe r
  JOIN mag_movim_testata t ON t.nro_registrazione = r.nro_registrazione
  LEFT JOIN mag_ana_articoli a
         ON a.tipo_articolo = r.tipo_articolo AND a.cod_articolo = r.cod_articolo;

CREATE OR REPLACE VIEW wms_v_agclifor AS
SELECT 'F' || TRIM(c.partitario)                                            AS cod_clifor,
       MAX(TRIM(c.descrizione_1 || ' ' || c.descrizione_2))
           KEEP (DENSE_RANK FIRST ORDER BY c.mastro DESC)                    AS des_clifor
  FROM anagrafico_conti c
 WHERE c.mastro LIKE '36%'
 GROUP BY TRIM(c.partitario);

CREATE OR REPLACE VIEW wms_v_ofordit AS
SELECT TRIM(t.tipo_ord)                         AS oft_tipo,
       t.anno_ord || '/' || t.nro_ord           AS oft_code,
       t.anno_ord                               AS oft_anno,
       t.nro_ord                                AS oft_nume,
       CASE WHEN t.data_ann IS NOT NULL THEN 'X'
            WHEN NVL(t.se_evaso, 'N') = 'S' THEN 'E'
            ELSE 'A' END                        AS oft_stat,
       t.data_ins                               AS oft_data,
       'F' || TRIM(t.partit)                    AS oft_cofo,
       'N'                                      AS oft_inarrivo,
       CAST(NULL AS VARCHAR2(1))                AS oft_actz
  FROM acw_ord_for_test t;

CREATE OR REPLACE VIEW wms_v_ofordic AS
SELECT TRIM(r.tipo_ord)                         AS ofc_tipo,
       r.anno_ord || '/' || r.nro_ord           AS ofc_code,
       r.anno_ord                               AS ofc_anno,
       r.nro_ord                                AS ofc_nume,
       r.riga_ord                               AS ofc_riga,
       TRIM(r.cod_art)                          AS ofc_arti,
       r.desc_riga                              AS ofc_desc,
       ' '                                      AS ofc_des2,
       r.qta_ordinata_gest                      AS ofc_qord,
       NVL(r.qta_ricevuta_gest, 0) + NVL(r.qta_annullata_gest, 0) AS ofc_qcon,
       r.data_prev_cons                         AS ofc_dtco,
       CASE WHEN r.data_ann IS NOT NULL OR NVL(r.se_evasa, 'N') = 'S'
            THEN 'S' ELSE 'N' END               AS ofc_feva,
       CASE WHEN r.data_ann IS NOT NULL THEN 'X'
            WHEN NVL(r.se_evasa, 'N') = 'S' THEN 'E'
            ELSE 'A' END                        AS ofc_stato,
       NVL(r.qta_ricevuta_gest, 0)              AS ofc_qtarrivata,
       'N'                                      AS ofc_inarrivo,
       'F' || TRIM(t.partit)                    AS ofc_cofo
  FROM acw_ord_for_riga r
  JOIN acw_ord_for_test t
    ON t.anno_ord = r.anno_ord AND t.tipo_ord = r.tipo_ord AND t.nro_ord = r.nro_ord;

-- Distinta base: children valid today of the default alternative (0)
CREATE OR REPLACE VIEW wms_v_mplegami AS
SELECT TRIM(d.cod_dr)                                         AS mpl_padre,
       TRIM(a.cod_art)                                        AS mpl_figlio,
       a.qta_impiego / NULLIF(NVL(a.qta_rif, 1), 0)           AS mpl_coimp,
       a.seq                                                  AS mpl_seq,
       NVL(a.dt_valid_fin, o.dt_valid_fin)                    AS mpl_dafi
  FROM prw_dr d
  JOIN prw_dr_op o  ON o.tipo_dr = d.tipo_dr AND o.cod_dr = d.cod_dr AND o.cod_alternat = 0
  JOIN prw_dr_art a ON a.rif_op = o.rif_op
 WHERE NVL(o.dt_valid_iniz, DATE '1900-01-01') <= TRUNC(SYSDATE)
   AND NVL(o.dt_valid_fin,  DATE '9999-12-31') >= TRUNC(SYSDATE)
   AND NVL(a.dt_valid_iniz, DATE '1900-01-01') <= TRUNC(SYSDATE)
   AND NVL(a.dt_valid_fin,  DATE '9999-12-31') >= TRUNC(SYSDATE);

-- Ordine di lavoro (lancio di produzione) -> components to pick.
-- odl_code = NRO_LANCIO (all sottolanci are merged by the backend).
CREATE OR REPLACE VIEW wms_v_odl_componenti AS
SELECT l.nro_lancio                       AS odl_code,
       l.nro_sottolancio                  AS odl_sotto,
       TRIM(l.cod_art)                    AS odl_padre,
       l.qta_pianif                       AS odl_qta,
       l.stato                            AS odl_stato,
       p.seq_op * 100000 + p.seq          AS occ_riga,
       TRIM(p.cod_art)                    AS occ_arti,
       p.qta                              AS occ_qmov,
       TRIM(p.cod_mag_scar)               AS occ_mag
  FROM prw_lancio l
  JOIN prw_lancio_art_prev p
    ON p.nro_lancio = l.nro_lancio AND p.nro_sottolancio = l.nro_sottolancio
 WHERE NVL(p.se_annullato, 'N') <> 'S';

-- Open production quantities per article (replaces mpordil in /api/articolo-offerte)
CREATE OR REPLACE VIEW wms_v_mpordil AS
SELECT TRIM(l.cod_art)                                        AS mol_parte,
       NVL(l.qta_pianif, 0)                                   AS mol_quaor,
       NVL(l.qta_versata, 0)                                  AS mol_quari,
       CASE WHEN l.stato IN ('T', 'C') THEN 'C' ELSE 'A' END  AS mol_stato,
       NVL(l.fin_dt_consegna, NVL(l.prev_dt_consegna, l.dt_consegna)) AS mol_dats
  FROM prw_lancio l;
