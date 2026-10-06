import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Alert, Button, Card, Checkbox, Col, Divider, Drawer, Empty, Form, Input, InputNumber, List, Modal, Row, Select,
  Space, Spin, Table, Tabs, Tag, Tooltip, Typography, message,
} from 'antd';
import {
  CopyOutlined, DeleteOutlined, HistoryOutlined, PlusOutlined, SaveOutlined, UndoOutlined, WarningOutlined,
} from '@ant-design/icons';
import WarehouseGridSystem from '../WarehouseGridSystem';
import { reloadWarehouseMap, useWarehouseMap } from './useWarehouseMap';
import { isShelfSection, mapShelfIds, sectionShelfIds, shelvesOutsideMap } from './mapUtils';

const { Title, Text } = Typography;

// Editor types -> section fields used by WarehouseGridSystem
const SECTION_TYPES = [
  { value: 'regular', label: 'Scaffale (colonne verticali)' },
  { value: 'horizontal', label: 'Scaffale orizzontale' },
  { value: 'customText', label: 'Testo / etichetta' },
  { value: 'blocked', label: 'Zona bloccata' },
];

const sectionType = (section) => (section.type === 'customText' ? 'customText' : section.shelfPattern || 'regular');

const clone = (value) => JSON.parse(JSON.stringify(value));

const intOr = (value, fallback) => (Number.isFinite(value) ? Math.round(value) : fallback);

// Section object as saved, from the editor type and form values
const buildSection = (type, values) => {
  const base = {
    id: (values.id || '').trim().toUpperCase() || 'X',
    startRow: Math.max(0, intOr(values.startRow, 0)),
    startCol: Math.max(0, intOr(values.startCol, 0)),
    width: Math.max(1, intOr(values.width, 1)),
    height: Math.max(1, intOr(values.height, 1)),
  };
  if (type === 'customText') {
    return {
      ...base,
      type: 'customText',
      customText: values.customText || '',
      rotateText: !!values.rotateText,
      spanRow: Math.max(1, intOr(values.spanRow, base.height)),
      spanCol: Math.max(1, intOr(values.spanCol, base.width)),
    };
  }
  if (type === 'blocked') {
    return { ...base, shelfPattern: 'blocked' };
  }
  return {
    ...base,
    shelfPattern: type,
    startingValue: intOr(values.startingValue, 1),
    startingFloor: intOr(values.startingFloor, 1),
    spanRow: Math.max(1, intOr(values.spanRow, 1)),
    spanCol: Math.max(1, intOr(values.spanCol, 1)),
    rotateText: !!values.rotateText,
    showText: values.showText !== false,
    borderTop: values.borderTop !== false,
    borderBottom: values.borderBottom !== false,
    borderLeft: values.borderLeft !== false,
    borderRight: values.borderRight !== false,
  };
};

const formValues = (section) => ({
  spanRow: 1, spanCol: 1, startingValue: 1, startingFloor: 1, rotateText: false, showText: true,
  borderTop: true, borderBottom: true, borderLeft: true, borderRight: true,
  ...section,
});

// shelfId -> sections drawing it, only for ids drawn more than once
const duplicateShelves = (pages) => {
  const owners = new Map();
  pages.forEach((p) => p.sections.forEach((s, index) => {
    sectionShelfIds(s).forEach((id) => {
      if (!owners.has(id)) owners.set(id, []);
      owners.get(id).push({ page: p.title || `Pagina ${p.page}`, pageNumber: p.page, index });
    });
  }));
  return new Map([...owners].filter(([, list]) => list.length > 1));
};

const MapEditor = () => {
  const { map, occupancy, loading, error } = useWarehouseMap();
  const [pages, setPages] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  // History: saved versions; restoredFrom = label of the version loaded into the editor
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [restoredFrom, setRestoredFrom] = useState(null);
  const [form] = Form.useForm();
  const lastWarned = useRef('');

  // Start from the saved map (and again after every save)
  useEffect(() => {
    if (map && pages === null) {
      setPages(clone([...map.pages].sort((a, b) => a.page - b.page)));
    }
  }, [map, pages]);

  const draft = useMemo(() => ({ pages: pages || [] }), [pages]);
  const dirty = useMemo(
    () => !!map && !!pages && JSON.stringify(pages) !== JSON.stringify([...map.pages].sort((a, b) => a.page - b.page)),
    [map, pages],
  );

  // Ask before leaving the page with unsaved changes
  useEffect(() => {
    const handler = (event) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const occupancyById = useMemo(() => new Map(occupancy.map((loc) => [loc.shelf_id, loc])), [occupancy]);
  const savedIds = useMemo(() => mapShelfIds(map), [map]);
  const outside = useMemo(() => shelvesOutsideMap(draft, occupancy), [draft, occupancy]);

  // Shelf codes drawn by more than one section (on any page). Sometimes wanted (an irregular shelf
  // drawn with overlapping sections, like R on page 2), so at save time only new ones are flagged.
  const duplicates = useMemo(() => duplicateShelves(pages || []), [pages]);
  const newDuplicates = useMemo(() => {
    const saved = duplicateShelves(map?.pages || []);
    return [...duplicates.keys()].filter((id) => !saved.has(id));
  }, [duplicates, map]);

  const page = pages?.[pageIndex];
  const section = page && selected !== null ? page.sections[selected] : null;

  // Occupied shelves that a new version of the map would lose
  const occupiedLost = (beforePages, afterPages) => {
    const after = mapShelfIds({ pages: afterPages });
    return [...mapShelfIds({ pages: beforePages })].filter((id) => occupancyById.has(id) && !after.has(id));
  };

  const describeShelves = (ids) => (
    <div style={{ maxHeight: 240, overflow: 'auto' }}>
      {ids.map((id) => {
        const loc = occupancyById.get(id);
        return (
          <div key={id}>
            <Tag color="red">{loc?.locazione || id}</Tag>
            {loc ? `${loc.pacchi} pacchi, qta ${loc.qta}` : ''}
          </div>
        );
      })}
    </div>
  );

  // Apply a change; warn (without blocking) when shelves with packages leave the map
  const updatePages = (nextPages) => {
    const lost = occupiedLost(pages, nextPages);
    setPages(nextPages);
    const key = lost.join(',');
    if (lost.length > 0 && key !== lastWarned.current) {
      message.warning({
        key: 'map-lost',
        duration: 6,
        content: `Attenzione: ${lost.length} scaffal${lost.length === 1 ? 'e' : 'i'} con articoli non più in mappa (${lost.slice(0, 5).join(', ')}${lost.length > 5 ? '…' : ''}). Gli articoli NON vengono eliminati.`,
      });
    }
    lastWarned.current = key;
  };

  const updatePage = (changes) => {
    const next = clone(pages);
    next[pageIndex] = { ...next[pageIndex], ...changes };
    updatePages(next);
  };

  const selectSection = (index) => {
    setSelected(index);
    if (index !== null && page?.sections[index]) {
      form.setFieldsValue({ type: sectionType(page.sections[index]), ...formValues(page.sections[index]) });
    }
  };

  const onFormChange = (_, allValues) => {
    if (selected === null) return;
    const next = clone(pages);
    next[pageIndex].sections[selected] = buildSection(allValues.type, allValues);
    updatePages(next);
  };

  // Move a section (drag & drop or arrow keys); shelf codes don't depend on the position
  const moveSection = (index, startRow, startCol) => {
    const next = clone(pages);
    const target = next[pageIndex].sections[index];
    target.startRow = Math.max(0, startRow);
    target.startCol = Math.max(0, startCol);
    setPages(next);
    setSelected(index);
    form.setFieldsValue({ type: sectionType(target), ...formValues(target) });
  };

  // Arrow keys nudge the selected section by one cell (not while typing in a field)
  useEffect(() => {
    const onKey = (event) => {
      if (selected === null || !page?.sections[selected]) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const delta = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
      if (!delta) return;
      event.preventDefault();
      const current = page.sections[selected];
      moveSection(selected, current.startRow + delta[0], current.startCol + delta[1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const addSection = (row = 0, col = 0) => {
    // First letter not used by a shelf section on ANY page (same letter = same shelf codes)
    const usedLetters = new Set(pages.flatMap((p) => p.sections.filter(isShelfSection).map((s) => s.id)));
    const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((l) => !usedLetters.has(l));
    if (!letter) {
      message.warning('Tutte le lettere sono già usate: imposta il codice della nuova sezione a mano');
    }
    const newSection = buildSection('regular', { id: letter || '?', startRow: row, startCol: col, width: 1, height: 1 });
    const next = clone(pages);
    next[pageIndex].sections.push(newSection);
    updatePages(next);
    const index = next[pageIndex].sections.length - 1;
    setSelected(index);
    form.setFieldsValue({ type: 'regular', ...formValues(newSection) });
  };

  const duplicateSection = () => {
    const copy = { ...clone(section), startRow: section.startRow + section.height };
    const next = clone(pages);
    next[pageIndex].sections.push(copy);
    updatePages(next);
    selectSection(null);
  };

  const deleteSection = () => {
    const next = clone(pages);
    next[pageIndex].sections.splice(selected, 1);
    const lost = occupiedLost(pages, next);
    const apply = () => {
      setPages(next);
      setSelected(null);
      lastWarned.current = '';
    };
    if (lost.length === 0) {
      apply();
      return;
    }
    Modal.confirm({
      title: `La sezione contiene ${lost.length} scaffal${lost.length === 1 ? 'e' : 'i'} con articoli`,
      icon: <WarningOutlined style={{ color: '#faad14' }} />,
      width: 520,
      content: (
        <div>
          <p>Rimuovendo la sezione questi scaffali non saranno più visibili sulla mappa.
            <strong> Gli articoli NON vengono eliminati</strong>: restano nelle loro locazioni e compariranno nell'elenco
            «Scaffali con articoli non presenti nella mappa» finché lo scaffale non viene ricreato.</p>
          {describeShelves(lost)}
        </div>
      ),
      okText: 'Rimuovi comunque',
      okButtonProps: { danger: true },
      cancelText: 'Annulla',
      onOk: apply,
    });
  };

  const addPage = () => {
    const number = Math.max(0, ...pages.map((p) => p.page)) + 1;
    const next = [...clone(pages), { page: number, title: `Pagina ${number}`, rows: 20, cols: 20, sections: [] }];
    setPages(next);
    setPageIndex(next.length - 1);
    setSelected(null);
  };

  const deletePage = () => {
    if (pages.length === 1) {
      message.error('La mappa deve avere almeno una pagina');
      return;
    }
    const next = clone(pages);
    next.splice(pageIndex, 1);
    const lost = occupiedLost(pages, next);
    Modal.confirm({
      title: `Eliminare "${page.title || `Pagina ${page.page}`}"?`,
      width: 520,
      content: lost.length > 0 ? (
        <div>
          <Alert type="warning" showIcon style={{ marginBottom: 8 }}
            message={`${lost.length} scaffali di questa pagina contengono articoli`}
            description="Gli articoli NON vengono eliminati: le locazioni compariranno tra gli scaffali da ricreare." />
          {describeShelves(lost)}
        </div>
      ) : 'La pagina non contiene scaffali con articoli.',
      okText: 'Elimina pagina',
      okButtonProps: { danger: true },
      cancelText: 'Annulla',
      onOk: () => {
        setPages(next);
        setPageIndex(Math.max(0, pageIndex - 1));
        setSelected(null);
      },
    });
  };

  const resetDraft = () => {
    Modal.confirm({
      title: 'Annullare tutte le modifiche non salvate?',
      okText: 'Annulla modifiche',
      cancelText: 'Continua a modificare',
      onOk: () => {
        setPages(clone([...map.pages].sort((a, b) => a.page - b.page)));
        setSelected(null);
        lastWarned.current = '';
      },
    });
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/map-layout/history`);
      setHistory(response.data || []);
    } catch (e) {
      message.error(`Errore nel caricamento della cronologia: ${e.response?.data?.error || e.message}`);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Load an old version into the editor: it goes live only when saved (as a new version),
  // with the same warnings as any other change
  const loadVersion = (version, label) => {
    const doLoad = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/map-layout/version/${version}`);
        setPages(clone([...response.data.pages].sort((a, b) => a.page - b.page)));
        setPageIndex(0);
        setSelected(null);
        setRestoredFrom(label);
        setHistoryOpen(false);
        lastWarned.current = '';
        message.info(`${label} caricata nell'editor: controlla gli avvisi e premi «Salva mappa» per ripristinarla`, 6);
      } catch (e) {
        message.error(`Errore nel caricamento: ${e.response?.data?.error || e.message}`);
      }
    };
    if (!dirty) {
      doLoad();
      return;
    }
    Modal.confirm({
      title: 'Ci sono modifiche non salvate',
      content: `Caricando ${label} le modifiche non salvate andranno perse.`,
      okText: 'Carica comunque',
      cancelText: 'Annulla',
      onOk: doLoad,
    });
  };

  const save = () => {
    const lostVsSaved = [...savedIds].filter((id) => occupancyById.has(id) && !mapShelfIds(draft).has(id));
    const doSave = async () => {
      setSaving(true);
      try {
        await axios.put(`${process.env.REACT_APP_API_URL}/api/map-layout`, {
          pages,
          scaffali_fuori_mappa: outside.map((loc) => loc.locazione),
          note: note.trim() || (restoredFrom ? `Ripristino ${restoredFrom}` : ''),
        });
        await reloadWarehouseMap();
        setPages(null); // re-initialised from the saved map
        setSelected(null);
        setNote('');
        setRestoredFrom(null);
        message.success('Mappa salvata: tutte le pagine del WMS usano la nuova mappa');
      } catch (e) {
        message.error(`Errore nel salvataggio: ${e.response?.data?.error || e.message}`);
      } finally {
        setSaving(false);
      }
    };
    if (outside.length === 0 && newDuplicates.length === 0) {
      doSave();
      return;
    }
    Modal.confirm({
      title: outside.length > 0
        ? 'Salvare la mappa con scaffali che contengono articoli fuori mappa?'
        : 'Salvare la mappa con nuovi scaffali duplicati?',
      icon: <WarningOutlined style={{ color: '#faad14' }} />,
      width: 560,
      content: (
        <div>
          {newDuplicates.length > 0 && (
            <Alert type="warning" showIcon style={{ marginBottom: 8 }}
              message={`${newDuplicates.length} nuovi codici scaffale sono disegnati da più sezioni`}
              description={`Es. A-${newDuplicates.slice(0, 5).join(', A-')}: la stessa locazione comparirà in più punti della mappa. Se non è voluto, cambia codice o numerazione.`} />
          )}
          {outside.length > 0 && (
            <>
              <p><strong>Nessun articolo viene eliminato o spostato.</strong> Queste locazioni restano registrate e saranno
                mostrate su tutte le mappe nell'elenco «Scaffali con articoli non presenti nella mappa» finché non vengono
                ricreate.</p>
              {lostVsSaved.length > 0 && <p>Rimossi con questa modifica: {lostVsSaved.length}</p>}
              {describeShelves(outside.map((loc) => loc.shelf_id))}
            </>
          )}
        </div>
      ),
      okText: 'Salva comunque',
      cancelText: 'Annulla',
      onOk: doSave,
    });
  };

  if (loading || pages === null) {
    return <div style={{ textAlign: 'center', padding: 60 }}><Spin tip="Caricamento mappa..." /></div>;
  }
  if (!map) {
    return <Alert type="error" showIcon message="Mappa non disponibile" description={error} />;
  }

  const type = section ? sectionType(section) : null;
  const sectionIds = section ? [...sectionShelfIds(section)] : [];
  const sectionOccupied = sectionIds.filter((id) => occupancyById.has(id));
  const sectionDuplicates = sectionIds.filter((id) => duplicates.has(id));
  const duplicateWhere = sectionDuplicates.length > 0
    ? [...new Set(sectionDuplicates.flatMap((id) => duplicates.get(id))
        .filter((o) => !(o.pageNumber === page.page && o.index === selected))
        .map((o) => `${o.page}, sezione ${o.index + 1}`))]
    : [];
  const outOfBounds = section && (section.startRow + section.height > page.rows || section.startCol + section.width > page.cols);

  const outsideColumns = [
    { title: 'Locazione', dataIndex: 'locazione', key: 'locazione', render: (v) => <Tag color="red">{v}</Tag> },
    { title: 'Pacchi', dataIndex: 'pacchi', key: 'pacchi' },
    { title: 'Quantità', dataIndex: 'qta', key: 'qta' },
    { title: 'Articoli', dataIndex: 'articoli', key: 'articoli' },
    {
      title: 'Stato', key: 'stato',
      render: (_, loc) => (savedIds.has(loc.shelf_id)
        ? <Tag color="orange">Rimosso in questa modifica</Tag>
        : <Tag>Già fuori dalla mappa salvata</Tag>),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 12 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>Editor mappa magazzino</Title>
          <Text type="secondary">
            {map.version ? `Versione ${map.version} del ${map.updated_at}` : 'Mappa originale (mai modificata)'}
            {dirty && <Tag color="gold" style={{ marginLeft: 8 }}>Modifiche non salvate</Tag>}
            {restoredFrom && <Tag color="blue" style={{ marginLeft: 8 }}>Caricata: {restoredFrom}</Tag>}
          </Text>
        </Col>
        <Col>
          <Space wrap>
            <Button icon={<HistoryOutlined />} onClick={openHistory}>Cronologia</Button>
            <Input
              style={{ width: 240 }}
              placeholder="Nota della modifica (facoltativa)"
              value={note}
              maxLength={255}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button icon={<UndoOutlined />} disabled={!dirty} onClick={resetDraft}>Annulla modifiche</Button>
            <Button type="primary" icon={<SaveOutlined />} disabled={!dirty} loading={saving} onClick={save}>Salva mappa</Button>
          </Space>
        </Col>
      </Row>

      <Drawer
        title="Cronologia della mappa"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        width={480}
      >
        <Text type="secondary">
          Ogni salvataggio crea una nuova versione. Caricando una versione la vedi nell'editor con i relativi avvisi;
          diventa attiva solo dopo «Salva mappa» (come nuova versione, quindi anche il ripristino si può annullare).
        </Text>
        <List
          style={{ marginTop: 12 }}
          loading={historyLoading}
          dataSource={[...history, { version: 'originale', original: true }]}
          renderItem={(item, index) => {
            const label = item.original ? 'la mappa originale' : `la versione ${item.version}`;
            return (
              <List.Item
                actions={[
                  index === 0 && !item.original
                    ? <Tag color="green">In uso</Tag>
                    : <Button size="small" onClick={() => loadVersion(item.version, label)}>Carica</Button>,
                ]}
              >
                <List.Item.Meta
                  title={item.original ? 'Mappa originale del WMS' : `Versione ${item.version}`}
                  description={item.original
                    ? (history.length === 0 ? 'In uso (mai modificata)' : 'Layout iniziale, prima di ogni modifica')
                    : (
                      <span>
                        {item.created_at}{item.created_by ? ` — ${item.created_by}` : ''}
                        {item.note && <><br /><i>{item.note}</i></>}
                      </span>
                    )}
                />
              </List.Item>
            );
          }}
        />
      </Drawer>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Modificare la mappa non sposta e non elimina gli articoli"
        description="Gli scaffali che contengono pacchi sono evidenziati in rosa. Se uno scaffale con articoli viene rimosso, le sue locazioni restano registrate e compaiono nell'elenco in fondo (e su tutte le mappe) finché lo scaffale non viene ricreato."
      />

      <Tabs
        activeKey={String(pageIndex)}
        onChange={(key) => { setPageIndex(Number(key)); setSelected(null); }}
        type="editable-card"
        onEdit={(_, action) => (action === 'add' ? addPage() : deletePage())}
        items={pages.map((p, index) => ({ key: String(index), label: p.title || `Pagina ${p.page}`, closable: pages.length > 1 }))}
      />

      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Card size="small">
            <Space wrap style={{ marginBottom: 8 }}>
              <span>Titolo</span>
              <Input style={{ width: 200 }} value={page.title} onChange={(e) => updatePage({ title: e.target.value })} />
              <span>Righe</span>
              <InputNumber min={1} max={200} value={page.rows} onChange={(v) => updatePage({ rows: intOr(v, page.rows) })} />
              <span>Colonne</span>
              <InputNumber min={1} max={200} value={page.cols} onChange={(v) => updatePage({ cols: intOr(v, page.cols) })} />
              <Button icon={<PlusOutlined />} onClick={() => addSection()}>Aggiungi sezione</Button>
            </Space>
            <div style={{ marginBottom: 4 }}>
              <Text type="secondary">
                Clicca una sezione per modificarla, trascinala per spostarla (o usa le frecce della tastiera),
                clicca una cella vuota per crearne una nuova in quel punto.
              </Text>
            </div>
            <WarehouseGridSystem
              warehouseLayout={page.sections}
              GRID_ROWS={page.rows}
              GRID_COLS={page.cols}
              getShelfStatus={(id) => (occupancyById.has(id) ? 'full' : 'available')}
              tooltipContent={(id) => {
                const loc = occupancyById.get(id);
                return loc ? `${loc.locazione}: ${loc.pacchi} pacchi, qta ${loc.qta}` : `A-${id}: vuoto`;
              }}
              onSectionClick={(index) => selectSection(index)}
              selectedSection={selected}
              onEmptyCellClick={(row, col) => addSection(row, col)}
              onSectionMove={moveSection}
              height="65vh"
            />
            <Space style={{ marginTop: 8 }}>
              <Tag color="#fff1f0" style={{ color: '#000', border: '1px solid #ffa39e' }}>Con articoli</Tag>
              <Tag style={{ background: 'white' }}>Vuoto</Tag>
              <Tag style={{ border: '2px dashed #1677ff' }}>Sezione selezionata</Tag>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card size="small" title={section ? 'Sezione selezionata' : 'Sezioni della pagina'}>
            {!section && (
              <Table
                size="small"
                pagination={false}
                rowKey={(_, index) => index}
                dataSource={page.sections.map((s, index) => ({ ...s, index }))}
                onRow={(record) => ({ onClick: () => selectSection(record.index), style: { cursor: 'pointer' } })}
                locale={{ emptyText: <Empty description="Nessuna sezione" /> }}
                columns={[
                  { title: 'Codice', key: 'id', render: (_, s) => (s.type === 'customText' ? <i>{s.customText}</i> : <b>{s.id}</b>) },
                  { title: 'Tipo', key: 'tipo', render: (_, s) => SECTION_TYPES.find((t) => t.value === sectionType(s))?.label },
                  { title: 'Pos.', key: 'pos', render: (_, s) => `${s.startRow},${s.startCol} (${s.width}×${s.height})` },
                  {
                    title: 'Articoli', key: 'occ',
                    render: (_, s) => {
                      const n = [...sectionShelfIds(s)].filter((id) => occupancyById.has(id)).length;
                      return n > 0 ? <Tag color="red">{n}</Tag> : null;
                    },
                  },
                ]}
              />
            )}

            {section && (
              <>
                <Space style={{ marginBottom: 12 }}>
                  <Button onClick={() => selectSection(null)}>← Elenco sezioni</Button>
                  <Tooltip title="Duplica sotto la sezione">
                    <Button icon={<CopyOutlined />} onClick={duplicateSection}>Duplica</Button>
                  </Tooltip>
                  <Button danger icon={<DeleteOutlined />} onClick={deleteSection}>Rimuovi</Button>
                </Space>

                {outOfBounds && (
                  <Alert type="warning" showIcon style={{ marginBottom: 8 }}
                    message="La sezione esce dai bordi della pagina: le celle fuori griglia non vengono disegnate" />
                )}
                {sectionDuplicates.length > 0 && (
                  <Alert type="warning" showIcon style={{ marginBottom: 8 }}
                    message={`${sectionDuplicates.length} scaffali hanno lo stesso codice di un'altra sezione`}
                    description={`Es. A-${sectionDuplicates.slice(0, 3).join(', A-')}, già in: ${duplicateWhere.join('; ')}. Va bene solo se è lo stesso scaffale disegnato in più parti; altrimenti cambia codice o numerazione.`} />
                )}
                {sectionOccupied.length > 0 && (
                  <Alert type="warning" showIcon style={{ marginBottom: 8 }}
                    message={`${sectionOccupied.length} scaffali di questa sezione contengono articoli`}
                    description="Spostare, ridimensionare o rinumerare la sezione può togliere questi scaffali dalla mappa (gli articoli restano dove sono)." />
                )}

                <Form form={form} layout="vertical" size="small" onValuesChange={onFormChange}>
                  <Form.Item name="type" label="Tipo">
                    <Select options={SECTION_TYPES} />
                  </Form.Item>
                  {type !== 'customText' && type !== 'blocked' && (
                    <Form.Item name="id" label="Codice scaffale" tooltip="Lettera dello scaffale (es. A, B, M)">
                      <Input maxLength={2} style={{ textTransform: 'uppercase' }} />
                    </Form.Item>
                  )}
                  {type === 'customText' && (
                    <Form.Item name="customText" label="Testo">
                      <Input />
                    </Form.Item>
                  )}
                  <Row gutter={8}>
                    <Col span={12}><Form.Item name="startRow" label="Riga iniziale"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col span={12}><Form.Item name="startCol" label="Colonna iniziale"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col span={12}><Form.Item name="width" label="Larghezza (celle)"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
                    <Col span={12}><Form.Item name="height" label="Altezza (celle)"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
                  </Row>
                  {(type === 'regular' || type === 'horizontal') && (
                    <Row gutter={8}>
                      <Col span={12}>
                        <Form.Item name="startingValue" label="Prima colonna (n°)"
                          tooltip={type === 'horizontal' ? 'Numero della prima colonna, cresce verso il basso' : 'Numero della prima colonna, cresce verso destra'}>
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="startingFloor" label="Primo piano (n°)"
                          tooltip={type === 'horizontal' ? 'Piano della prima cella a sinistra' : 'Piano della riga più in basso'}>
                          <InputNumber style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}
                  {type !== 'blocked' && (
                    <Row gutter={8}>
                      <Col span={12}><Form.Item name="spanRow" label="Celle unite (righe)"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col span={12}><Form.Item name="spanCol" label="Celle unite (colonne)"><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
                    </Row>
                  )}
                  {type !== 'blocked' && (
                    <Space wrap>
                      <Form.Item name="rotateText" valuePropName="checked" noStyle><Checkbox>Testo ruotato</Checkbox></Form.Item>
                      {type !== 'customText' && (
                        <Form.Item name="showText" valuePropName="checked" noStyle><Checkbox>Mostra codice</Checkbox></Form.Item>
                      )}
                    </Space>
                  )}
                  {(type === 'regular' || type === 'horizontal') && (
                    <>
                      <Divider plain style={{ margin: '8px 0' }}>Bordi</Divider>
                      <Space wrap>
                        <Form.Item name="borderTop" valuePropName="checked" noStyle><Checkbox>Sopra</Checkbox></Form.Item>
                        <Form.Item name="borderBottom" valuePropName="checked" noStyle><Checkbox>Sotto</Checkbox></Form.Item>
                        <Form.Item name="borderLeft" valuePropName="checked" noStyle><Checkbox>Sinistra</Checkbox></Form.Item>
                        <Form.Item name="borderRight" valuePropName="checked" noStyle><Checkbox>Destra</Checkbox></Form.Item>
                      </Space>
                    </>
                  )}
                </Form>

                {sectionIds.length > 0 && (
                  <>
                    <Divider plain style={{ margin: '12px 0 8px' }}>Scaffali generati ({sectionIds.length})</Divider>
                    <div style={{ maxHeight: 160, overflow: 'auto' }}>
                      {sectionIds.map((id) => (
                        <Tag key={id} color={duplicates.has(id) ? 'purple' : occupancyById.has(id) ? 'red' : undefined}>A-{id}</Tag>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        style={{ marginTop: 16 }}
        title={
          <span>
            <WarningOutlined style={{ color: outside.length ? '#faad14' : '#52c41a', marginRight: 8 }} />
            Scaffali con articoli non presenti nella mappa — da ricreare ({outside.length})
          </span>
        }
      >
        {outside.length === 0 ? (
          <Text type="secondary">Tutte le locazioni con articoli sono presenti nella mappa.</Text>
        ) : (
          <>
            <Text type="secondary">
              Questi scaffali contengono pacchi ma non esistono nella mappa: ricreali (stesso codice, colonna e piano)
              per poter di nuovo vedere e selezionare i pacchi dalla mappa. Gli articoli non sono stati toccati.
            </Text>
            <Table size="small" style={{ marginTop: 8 }} rowKey="locazione" pagination={{ pageSize: 20, hideOnSinglePage: true }}
              dataSource={outside} columns={outsideColumns} />
          </>
        )}
      </Card>
    </div>
  );
};

export default MapEditor;
