import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Input, Table, Button, Typography, Card, Row, Col, Modal, message, Tooltip, Space, Popconfirm, Tag } from 'antd';
import { CloseCircleOutlined, DeleteOutlined, DownloadOutlined, EnvironmentOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import * as XLSX from 'xlsx';
import './FiveInputPage.css';
import WarehouseMap from './map/WarehouseMap';
import { isEtichetta, parseEtichetta } from './barcode';

const { Title } = Typography;

const API = `${process.env.REACT_APP_API_URL}/api/inventario`;
const REFRESH_MS = 5000;

// Inventory counts are saved in wms_inventario (one row per count) and exported to Excel from here.
// Movement: ADAPTA number ('83754') or Skyline document ('2026/CA/48'); a scanned package label fills both
// the article and the movement.
const FiveInputPage = () => {
  const [articolo, setArticolo] = useState('');
  const [movimento, setMovimento] = useState('');
  const [locazione, setLocazione] = useState('');
  const [quantita, setQuantita] = useState('');
  const [saving, setSaving] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchText, setSearchText] = useState('');

  const articoloRef = useRef(null);
  const movimentoRef = useRef(null);
  const locazioneRef = useRef(null);
  const quantitaRef = useRef(null);

  useEffect(() => {
    articoloRef.current?.focus();
  }, []);

  const fetchRows = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await axios.get(API, {
        params: { page: currentPage, per_page: pageSize, search_text: searchText.trim() },
      });
      setRows(response.data.rows || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Error fetching inventory:', error);
      if (showLoading) message.error('Errore nel caricamento delle righe di inventario');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [currentPage, pageSize, searchText]);

  // Live view: rows inserted by every operator appear without reloading
  useEffect(() => {
    fetchRows(true);
    const timer = setInterval(() => fetchRows(false), REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchRows]);

  const focusNext = (e, nextRef) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nextRef.current?.focus();
    }
  };

  // A scanned package label carries the movement too: fill it and go on to the location
  const handleArticoloKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (isEtichetta(articolo)) {
      const etichetta = parseEtichetta(articolo);
      setArticolo(etichetta.articolo);
      if (etichetta.movimento) {
        setMovimento(etichetta.movimento);
        locazioneRef.current?.focus();
        return;
      }
    }
    movimentoRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!articolo.trim() || !locazione.trim() || !quantita.trim()) {
      message.error('Compila codice articolo, locazione e quantità.');
      return;
    }

    setSaving(true);
    try {
      const scannedLabel = isEtichetta(articolo) ? parseEtichetta(articolo) : null;
      const response = await axios.post(API, {
        codice_articolo: scannedLabel?.articolo || articolo,
        movimento: scannedLabel?.movimento || movimento,
        locazione,
        quantita,
      });
      if (response.data.warning) {
        message.warning(response.data.warning);
      } else {
        message.success('Riga aggiunta');
      }
      // The location stays: the next counts are usually on the same shelf
      setLocazione(response.data.locazione || locazione);
      setArticolo('');
      setMovimento('');
      setQuantita('');
      articoloRef.current?.focus();
      if (currentPage === 1) {
        fetchRows(false);
      } else {
        setCurrentPage(1);
      }
    } catch (error) {
      console.error('Error saving inventory row:', error);
      message.error(error.response?.data?.error || 'Errore durante il salvataggio della riga');
    } finally {
      setSaving(false);
    }
  };

  const handleQuantitaKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const clearLocazione = () => {
    setLocazione('');
    locazioneRef.current?.focus();
  };

  // Map shelves are 'C-01-1' (area A)
  const handleShelfSelected = (shelfId) => {
    setLocazione(`A-${shelfId}`);
    setIsMapOpen(false);
    setTimeout(() => (articolo.trim() ? quantitaRef : articoloRef).current?.focus(), 0);
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/${id}`);
      message.success('Riga eliminata');
      fetchRows(false);
    } catch (error) {
      console.error('Error deleting inventory row:', error);
      message.error(error.response?.data?.error || 'Errore durante l\'eliminazione della riga');
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const response = await axios.get(API, { params: { per_page: 0 } });
      const data = (response.data.rows || []).map((row) => ({
        DATA: row.timestamp,
        CODICE_ARTICOLO: row.codice_articolo,
        DESCRIZIONE: row.descrizione || '',
        MOVIMENTO: row.movimento || '',
        LOCAZIONE: row.locazione,
        QUANTITA: row.quantita,
        IP: row.ip_address || '',
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), 'Inventario');
      const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
      XLSX.writeFile(workbook, `inventario_${stamp}.xlsx`);
      message.success(`Esportate ${data.length} righe`);
    } catch (error) {
      console.error('Error exporting inventory:', error);
      message.error('Errore durante l\'esportazione');
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    {
      title: 'Data',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (value) => (value ? new Date(value.replace(' ', 'T')).toLocaleString('it-IT') : '-'),
    },
    { title: 'Codice Articolo', dataIndex: 'codice_articolo', key: 'codice_articolo' },
    { title: 'Descrizione', dataIndex: 'descrizione', key: 'descrizione', ellipsis: true },
    { title: 'Movimento', dataIndex: 'movimento', key: 'movimento', render: (value) => value || '-' },
    { title: 'Locazione', dataIndex: 'locazione', key: 'locazione' },
    { title: 'Quantità', dataIndex: 'quantita', key: 'quantita' },
    {
      title: 'Inserito da',
      dataIndex: 'ip_address',
      key: 'ip_address',
      render: (ip, record) => (record.is_mine ? <Tag color="blue">{ip} (TU)</Tag> : ip || '-'),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, record) => (
        <Popconfirm
          title="Eliminare questa riga di inventario?"
          okText="Elimina"
          cancelText="Annulla"
          okButtonProps={{ danger: true }}
          onConfirm={() => handleDelete(record.id)}
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="five-input-page">
      <Title level={2} className="title">Inventario</Title>

      <Card className="card">
        <Row gutter={16}>
          <Col xs={24} sm={12} md={6}>
            <div className="field-label">Codice articolo</div>
            <Input
              ref={articoloRef}
              value={articolo}
              onChange={(e) => setArticolo(e.target.value)}
              onKeyDown={handleArticoloKeyDown}
              placeholder="Codice o etichetta"
              className="input-small"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div className="field-label">Movimento</div>
            <Input
              ref={movimentoRef}
              value={movimento}
              onChange={(e) => setMovimento(e.target.value)}
              onKeyDown={(e) => focusNext(e, locazioneRef)}
              placeholder="83754 o 2026/CA/48"
              className="input-small"
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div className="field-label">Locazione</div>
            <Space.Compact className="input-small">
              <Input
                ref={locazioneRef}
                value={locazione}
                onChange={(e) => setLocazione(e.target.value.toUpperCase())}
                onKeyDown={(e) => focusNext(e, quantitaRef)}
                placeholder="A-C-01-1"
              />
              <Tooltip title="Seleziona dalla mappa">
                <Button icon={<EnvironmentOutlined />} onClick={() => setIsMapOpen(true)} />
              </Tooltip>
              <Tooltip title="Pulisci locazione">
                <Button icon={<CloseCircleOutlined />} onClick={clearLocazione} disabled={!locazione} />
              </Tooltip>
            </Space.Compact>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <div className="field-label">Quantità</div>
            <Input
              ref={quantitaRef}
              value={quantita}
              onChange={(e) => setQuantita(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={handleQuantitaKeyDown}
              placeholder="Quantità"
              inputMode="numeric"
              className="input-small"
            />
          </Col>
        </Row>

        <div className="actions">
          <Button type="primary" onClick={handleSubmit} loading={saving}>
            Aggiungi Riga
          </Button>
        </div>
      </Card>

      <Card
        title={`Righe inserite (${total})`}
        className="recent-entries-card"
        extra={
          <Space wrap>
            <Input.Search
              placeholder="Cerca articolo, movimento, locazione, IP"
              allowClear
              onSearch={(value) => {
                setSearchText(value);
                setCurrentPage(1);
              }}
              style={{ width: 300 }}
            />
            <Tooltip title="Aggiorna">
              <Button icon={<ReloadOutlined />} onClick={() => fetchRows(true)} />
            </Tooltip>
            <Button icon={<DownloadOutlined />} onClick={exportExcel} loading={exporting}>
              Esporta Excel
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={rows}
          rowKey="id"
          size="small"
          scroll={{ x: true }}
          loading={loading}
          rowClassName={(record) => (record.is_mine ? 'inventory-row-mine' : '')}
          pagination={{
            current: currentPage,
            pageSize,
            total,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            onChange: (page, size) => {
              setCurrentPage(size !== pageSize ? 1 : page);
              setPageSize(size);
            },
            showTotal: (count) => `Totale ${count} righe`,
          }}
        />
      </Card>

      <Modal
        title="Seleziona locazione"
        open={isMapOpen}
        onCancel={() => setIsMapOpen(false)}
        footer={null}
        centered
        width="80%"
        destroyOnClose
      >
        <div className="grid-container">
          <WarehouseMap
            onCellClick={handleShelfSelected}
            highlightedShelves={locazione ? new Set([locazione.split('-').slice(1).join('-')]) : undefined}
          />
        </div>
      </Modal>
    </div>
  );
};

export default FiveInputPage;
