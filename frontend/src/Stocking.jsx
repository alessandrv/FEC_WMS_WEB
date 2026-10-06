import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import { Input, Button, Form, Typography, Tabs, Select, Alert, Card, InputNumber, Row, Col, message, Modal, Spin, Checkbox, Tooltip, Table } from 'antd';
import './StockingDettagli.css';
import { useNavigate } from 'react-router-dom';
import TrovaQuantita from "./TrovaQuantita"
import { Pagination } from 'antd';
import ViewMagazzino from "./ViewMagazzino"
import { isEtichetta, normalizzaMovimento, parseEtichetta } from './barcode';
import { addDeposits, clearDepositHistory, findPreviousDeposits, formatDepositTime, readDepositHistory } from './depositHistory';

const { Title } = Typography;
const { Option } = Select;

const StockingDettagli = () => {
  const [articoloCode, setArticoloCode] = useState('');
  const [articoloDaCercare, setArticoloDaCercare] = useState('');
  const [selectedRows, setSelectedRows] = useState([]);

  const [descrizioneArticolo, setDescrizioneArticolo] = useState('');
  const [movimentoCode, setMovimentoCode] = useState('');
  const [quantitaPerPacco, setQuantitaPerPacco] = useState('');
  const [totalePacchi, setTotalePacchi] = useState(1);
  const [dimensione, setDimensione] = useState('Zero');
  const [isDataConsistent, setIsDataConsistent] = useState(false);
  const [forzaDeposito, setForzaDeposito] = useState(false);
  const [showMovimentoInputModal, setShowMovimentoInputModal] = useState(false);
  const [movimentoInput, setMovimentoInput] = useState('');
  // Movement whose articles are listed in "Deposito da Movimento" (saved on the packages deposited from it)
  const [movimentoCaricato, setMovimentoCaricato] = useState('');
  const [activeTab, setActiveTab] = useState('1');
  // Deposits made from this device (browser only, see depositHistory.js)
  const [depositHistory, setDepositHistory] = useState(readDepositHistory);
  const [showArticoliModal, setShowArticoliModal] = useState(false);
  const [articoliMovimento, setArticoliMovimento] = useState([]);
  const [loadingArticoli, setLoadingArticoli] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [depositedArticoli, setDepositedArticoli] = useState([]);
  const [showPartialDepositModal, setShowPartialDepositModal] = useState(false);
const [partialDepositArticle, setPartialDepositArticle] = useState(null);
const [partialDepositQuantity, setPartialDepositQuantity] = useState(0);
const [splitRows, setSplitRows] = useState(new Map()); // tracks original->split row relationships
const [showMultiplePartialDepositModal, setShowMultiplePartialDepositModal] = useState(false);
const [multiplePartialQuantity, setMultiplePartialQuantity] = useState(0);

// Add new function to handle partial deposit

  const navigate = useNavigate();

  const articoloRef = useRef(null);
  const movimentoRef = useRef(null);
  const quantitaRef = useRef(null);
  const totalePacchiRef = useRef(null);
  const dimensioneSelectRef = useRef(null);
  const etichettaTimer = useRef(null);

  useEffect(() => {
    if (articoloRef.current) {
      articoloRef.current.focus();
    }
    return () => clearTimeout(etichettaTimer.current);
  }, []);

  // A label scanned into the article field ('ART,2026,CA,000038' or old 'ART,FORNITORE,MOVIMENTO')
  // fills article and movimento and runs the coherence check. The scanner ends with Enter; the
  // timer covers scanners configured without the Enter suffix.
  const applicaEtichetta = (value) => {
    clearTimeout(etichettaTimer.current);
    const { articolo, movimento } = parseEtichetta(value);
    setArticoloCode(articolo);
    setMovimentoCode(movimento);
    verificaCoerenza(articolo, movimento);
  };

  const handleArticoloChange = (e) => {
    const value = e.target.value;
    setArticoloCode(value);
    clearTimeout(etichettaTimer.current);
    if (isEtichetta(value)) {
      etichettaTimer.current = setTimeout(() => applicaEtichetta(value), 300);
    }
  };

  const handleArticoloEnter = () => {
    if (isEtichetta(articoloCode)) {
      applicaEtichetta(articoloCode);
    } else if (movimentoRef.current) {
      movimentoRef.current.focus();
    }
  };

  const handlePartialDeposit = (record) => {
    setPartialDepositArticle(record);
    setPartialDepositQuantity(record.gim_qmov);
    setShowPartialDepositModal(true);
  };
  const startPartialDeposit = () => {
    if (partialDepositArticle && partialDepositQuantity > 0) {
      setArticoloCode(partialDepositArticle.gim_arti?.trim() || '');
      setDescrizioneArticolo(partialDepositArticle.gim_desc?.trim() || '');
      setQuantitaPerPacco(partialDepositQuantity.toString());
      setShowPartialDepositModal(false);
      setShowWarehouseModal(true);
    }
  };

  const handleMovimentoChange = (e) => {
    const value = e.target.value;
    // A full label scanned here also works: keep only the movimento part
    setMovimentoCode(isEtichetta(value) ? parseEtichetta(value).movimento : value);
  };

  const handleMovimentoEnter = () => verificaCoerenza(articoloCode, movimentoCode);

  // Same article (and movement) already deposited from this device: warn before depositing again
  const previousDeposits = isEtichetta(articoloCode)
    ? []
    : findPreviousDeposits(depositHistory, articoloCode, movimentoCode);

  const verificaCoerenza = async (articolo, movimento) => {
    try {
      // Articolo API call
      const articoloResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/articolo-descrizione`, { params: { codice_articolo: articolo } });
      setDescrizioneArticolo(articoloResponse.data.descrizione || 'Descrizione non trovata');
      setArticoloDaCercare(articolo);

      if (forzaDeposito) {
        message.success('Coerenza ignorata');
        setIsDataConsistent(true);
        if (quantitaRef.current) {
          quantitaRef.current.focus();
        }
        return;
      }

      // Movimento API call
      // Movimento API call: the article must be part of the movement (Skyline document or ADAPTA)
      const movimentoResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/movimento-coerenza`, {
        params: { codice_articolo: articolo, codice_movimento: movimento }
      });

      // Check if movimentoResponse.data is not null or undefined
      if (movimentoResponse.data && movimentoResponse.data.coerenza) {
        message.success('Informazioni coerenti');
        setIsDataConsistent(true);
        if (quantitaRef.current) {
          quantitaRef.current.focus();
        }
      } else {
        message.error('Errore: articolo non presente nel movimento.');
        setIsDataConsistent(false);
      }
    } catch (ex) {
      message.error(`Errore: ${ex.response?.data?.error || ex.message}`);
      setIsDataConsistent(false);
    }
  };

  const handleQuantitaEnter = () => {
    if (totalePacchiRef.current) {
      totalePacchiRef.current.focus();
    }
  };

  const handleTotalePacchiEnter = () => {
    if (dimensioneSelectRef.current) {
      dimensioneSelectRef.current.focus();
    }
  };

  const clearAllFields = () => {
    setArticoloCode('');
    setDescrizioneArticolo('');
    setMovimentoCode('');
    setQuantitaPerPacco('');
    setTotalePacchi(1);
    setDimensione('Zero');
    setIsDataConsistent(false);
    setForzaDeposito(false);
  };
  const handleSelectionChange = (selectedRowKeys, selectedRows) => {
    setSelectedRows(selectedRowKeys);
    
    // If exactly one row is selected, update the article details
    if (selectedRows.length === 1) {
      const selectedRow = selectedRows[0];
      setArticoloCode(selectedRow.gim_arti?.trim() || '');
      setDescrizioneArticolo(selectedRow.gim_desc?.trim() || '');
      setQuantitaPerPacco(parseInt(selectedRow.gim_qmov)); // Add this line
    } else {
      // Clear the single selection details if multiple or no rows are selected
      setArticoloCode('');
      setDescrizioneArticolo('');
      setQuantitaPerPacco(''); // Add this line
    }
  };
  
  const handleShowMagazzino = () => {
    // Only validate if not coming from Deposita button
    if (!showWarehouseModal && !(articoloCode && movimentoCode && quantitaPerPacco)) {
      message.error('Compila tutti i campi per procedere');
      return;
    }
    setShowWarehouseModal(true);
  };

  const handleForzaDepositoChange = (e) => {
    setForzaDeposito(e.target.checked);
    if (e.target.checked) {
      message.success('Coerenza ignorata');
      setIsDataConsistent(true);
      if (quantitaRef.current) {
        quantitaRef.current.focus();
      }
    } else {
      setIsDataConsistent(false);
    }
  };

  const handleShowArticoliMovimento = () => {
    setShowMovimentoInputModal(true);
    setDepositedArticoli([]);
    setSelectedRows([])
  };
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
  const handleMovimentoInputConfirm = async () => {
    if (!movimentoInput) {
      message.error('Inserisci un codice movimento');
      return;
    }
    setSelectedRows([])
    setLoadingArticoli(true);
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-articoli-movimento`, {
        params: { movimento: movimentoInput }
      });
      
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Formato risposta API non valido');
      }
  
      const articoliMovimento = response.data.map(item => ({
        id: generateUUID(), // Use our custom UUID generator
        gim_arti: item.gim_arti || '',
        gim_desc: item.gim_desc || '',
        gim_des2: item.gim_des2 || '',
        gim_qmov: item.gim_qmov || 0
      }));
      
      setArticoliMovimento(articoliMovimento);
      setMovimentoCaricato(normalizzaMovimento(movimentoInput));
      setShowMovimentoInputModal(false);
    } catch (error) {
      console.error('Errore dettagliato:', error);
      message.error(`Errore nel caricamento: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoadingArticoli(false);
    }
  };
  const handleWarehouseComplete = (articoloCodes, dettagli) => {
    setShowWarehouseModal(false);
    const codes = Array.isArray(articoloCodes) ? articoloCodes : [articoloCodes];

    // Remember the deposit on this device and get the form ready for the next package
    if (dettagli && dettagli.length > 0) {
      setDepositHistory(addDeposits(dettagli));
    }
    clearAllFields();
    if (activeTab === '1') {
      // After the map modal has closed (it gives focus back to the last field): ready for the next scan
      setTimeout(() => articoloRef.current && articoloRef.current.focus(), 400);
    }
    
    if (multiplePartialQuantity > 0 && selectedRows.length >= 1) {
      // Handle both single and multiple partial deposits
      const selectedItems = selectedRows.map(id => 
        articoliMovimento.find(item => item.id === id)
      ).filter(Boolean);
  
      setArticoliMovimento(prev => {
        let newArray = [...prev];
        selectedItems.forEach(originalRow => {
          const index = newArray.findIndex(row => row.id === originalRow.id);
          if (index === -1) return;
  
          const depositedQty = parseFloat(multiplePartialQuantity);
          const remainingQty = originalRow.gim_qmov - depositedQty;
  
          // Create new row for remaining quantity
          const newRow = {
            ...originalRow,
            id: generateUUID(),
            gim_qmov: remainingQty,
          };
  
          // Update the original row
          const updatedOriginalRow = {
            ...originalRow,
            gim_qmov: depositedQty,
          };
  
          // Replace original row and add new row after it
          newArray[index] = updatedOriginalRow;
          newArray.splice(index + 1, 0, newRow);
        });
        return newArray;
      });
  
      // Mark all original rows as deposited
      setDepositedArticoli(prev => [...prev, ...selectedRows]);
      
      // Clear states
      setMultiplePartialQuantity(0);
      setSelectedRows([]);
    } else if (partialDepositArticle) {
      // Handle single partial deposit through the row button
      const originalRow = partialDepositArticle;
      const depositedQty = parseFloat(quantitaPerPacco);
      const remainingQty = originalRow.gim_qmov - depositedQty;
      
      // Create new row for remaining quantity
      const newRow = {
        ...originalRow,
        id: generateUUID(),
        gim_qmov: remainingQty,
      };
  
      // Update the original row
      const updatedOriginalRow = {
        ...originalRow,
        gim_qmov: depositedQty,
      };
  
      // Update articoliMovimento with split rows
      setArticoliMovimento(prev => {
        const index = prev.findIndex(row => row.id === originalRow.id);
        const newArray = [...prev];
        newArray[index] = updatedOriginalRow;
        newArray.splice(index + 1, 0, newRow);
        return newArray;
      });
  
      // Mark original row as deposited
      setDepositedArticoli(prev => [...prev, originalRow.id]);
      
      // Clear partial deposit state
      setPartialDepositArticle(null);
      setPartialDepositQuantity(0);
    } else {
      // Handle normal complete deposits
      const completedIds = selectedRows.filter(id => {
        const row = articoliMovimento.find(item => item.id === id);
        return row && codes.includes(row.gim_arti?.trim());
      });
      
      setDepositedArticoli(prev => [...prev, ...completedIds]);
      setSelectedRows(prev => prev.filter(id => !completedIds.includes(id)));
    }
  };

  // Add useEffect to track deposited articles changes
  useEffect(() => {
    console.log('Current deposited articles:', depositedArticoli);
  }, [depositedArticoli]);

  const columns = [

    {
      title: 'Codice Articolo',
      dataIndex: 'gim_arti',
      key: 'gim_arti',
      render: (text) => text ? text.trim() : ''
    },
    {
      title: 'Descrizione Principale',
      dataIndex: 'gim_desc',
      key: 'gim_desc',
      render: (text) => text ? text.trim() : ''
    },
    {
      title: 'Descrizione Secondaria',
      dataIndex: 'gim_des2',
      key: 'gim_des2',
      render: (text) => text ? text.trim() : ''
    },
    {
      title: 'Quantità',
      dataIndex: 'gim_qmov',
      key: 'gim_qmov',
      render: (text, record) => (
        <span style={depositedArticoli.includes(record.id) ? { color: '#52c41a' } : {}}>
          {parseFloat(text)}
        </span>
      )
    },
   
    
  ];
  const rowSelection = {
    selectedRowKeys: selectedRows,
    onChange: handleSelectionChange,
    getCheckboxProps: (record) => ({
      disabled: depositedArticoli.includes(record.id),
      name: record.gim_arti,
    }),
  };
  const checkSelectedRowsQuantity = () => {
    if (selectedRows.length < 1) return false;
    
    const selectedItems = selectedRows.map(id => 
      articoliMovimento.find(item => item.id === id)
    );
    
    const firstQuantity = selectedItems[0]?.gim_qmov;
    return selectedItems.every(item => item?.gim_qmov === firstQuantity);
  };
  const handleMultiplePartialDeposit = () => {
    const selectedItem = articoliMovimento.find(item => item.id === selectedRows[0]);
    if (selectedItem) {
      setMultiplePartialQuantity(selectedItem.gim_qmov);
      setShowMultiplePartialDepositModal(true);
    }
  };
  const startMultiplePartialDeposit = () => {
    if (multiplePartialQuantity > 0) {
      const selectedItems = selectedRows.map(id => 
        articoliMovimento.find(item => item.id === id)
      ).filter(Boolean);
  
      // Set the quantity for the deposit
      setQuantitaPerPacco(multiplePartialQuantity.toString());
      setShowMultiplePartialDepositModal(false);
      setShowWarehouseModal(true);
    }
  };

  const renderTableFooter = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Button
        type="primary"
        onClick={() => {
          if (selectedRows.length === 0) {
            message.warning('Seleziona almeno un articolo');
            return;
          }
          setShowWarehouseModal(true);
        }}
        disabled={selectedRows.length === 0}
      >
        Deposita articoli selezionati ({selectedRows.length})
      </Button>
      
      <Button
        type="primary"
        onClick={handleMultiplePartialDeposit}
        disabled={!checkSelectedRowsQuantity()}
      >
        Deposito parziale ({selectedRows.length})
      </Button>
    </div>
  );
  return (
    <div className="stocking-dettagli">
      <Title level={2} className="title">Deposito</Title>
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
      <Tabs.TabPane tab="Deposito Singolo" key="1">

      <Row gutter={16}>
        <Col xs={24} sm={24} md={12}>
        <Card title="Articolo" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="Codice Articolo">
                <Input
                  value={articoloCode}
                  onChange={handleArticoloChange}
                  onPressEnter={handleArticoloEnter}
                  placeholder="Codice Articolo o etichetta"
                  ref={articoloRef}
                  className="input-small"
                />
              </Form.Item>
              <Form.Item label="Descrizione Articolo">
                <Input
                  value={descrizioneArticolo}
                  readOnly
                  placeholder="Descrizione Articolo"
                  className="input-small"
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={12}>
          <Card title="Movimento" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="Codice Movimento">
              <Input
                  value={movimentoCode}
                  onChange={handleMovimentoChange}
                  onPressEnter={handleMovimentoEnter}
                  placeholder="es. 2026/CA/38 oppure 83005"
                  ref={movimentoRef}
                  className="input-small"
                />
              </Form.Item>
              <Form.Item>
                <Tooltip title="Ignora coerenza articolo e movimento">
                  <Checkbox
                    checked={forzaDeposito}
                    onChange={handleForzaDepositoChange}
                  >
                    Forza deposito
                  </Checkbox>
                </Tooltip>
              </Form.Item>
            </Form>
          </Card>
        </Col>

      
        <Col xs={24} sm={12} md={12}>
          <Card title="Dati Pacco" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="Quantità">
                <Input
                  value={quantitaPerPacco}
                  onChange={(e) => setQuantitaPerPacco(e.target.value)}
                  onPressEnter={handleQuantitaEnter}
                  placeholder="Quantità"
                  ref={quantitaRef}
                  className="input-small"
                />
              </Form.Item>
          
            </Form>
          </Card>
        </Col>
        {/*<Col xs={24} sm={12} md={8}> 
          <Card title="Quantità registrata in magazzino a gestionale" className="card">
            <TrovaQuantita articoloCode={articoloDaCercare} />
          </Card>
        </Col> */}
      </Row>
      {previousDeposits.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message={`Articolo già depositato da questo dispositivo${movimentoCode ? ` per il movimento ${movimentoCode}` : ''}`}
          description={previousDeposits.slice(0, 3).map((entry) => (
            <div key={entry.id}>
              {formatDepositTime(entry.data)}: {entry.pacchi > 1 ? `${entry.pacchi} pacchi da ` : ''}{entry.quantita} pz in {entry.locazione}
            </div>
          ))}
        />
      )}
      <div className="actions">
        <Button type="default" style={{margin:10}} onClick={clearAllFields}>Pulisci campi</Button>
        <Button type="primary" style={{margin:10}} onClick={handleShowMagazzino}>Immagazzina</Button>
     

      </div>        </Tabs.TabPane>
      <Tabs.TabPane tab="Deposito da Movimento" key="2">
          <Card>
            <Form layout="vertical">
              <Form.Item label="Codice Movimento">
                <Input
                  placeholder="Scansiona l'etichetta o inserisci il movimento (2026/CA/38 oppure 83005)"
                  value={movimentoInput}
                  onChange={(e) => setMovimentoInput(e.target.value)}
                  onPressEnter={handleMovimentoInputConfirm}
                  style={{ marginBottom: 16 }}
                />
                <Button 
                  type="primary" 
                  onClick={handleMovimentoInputConfirm}
                  loading={loadingArticoli}
                >
                  Cerca Movimento
                </Button>
              </Form.Item>
            </Form>

            {articoliMovimento.length > 0 && (
         <Table
         rowSelection={{
           type: 'checkbox',
           ...rowSelection,
         }}
         columns={columns}
         dataSource={articoliMovimento}
         rowKey={(record) => record.id}
         rowClassName={(record) => 
           depositedArticoli.includes(record.id) ? 'deposited-row' : ''
         }
         pagination={false}
         footer={renderTableFooter}
       />
            )}
          </Card>
        </Tabs.TabPane>
      </Tabs>

      <Card
        className="card"
        style={{ marginTop: 16 }}
        title={`Depositi recenti su questo dispositivo (${depositHistory.length})`}
        extra={depositHistory.length > 0 && (
          <Button
            size="small"
            onClick={() => Modal.confirm({
              title: 'Svuotare l\'elenco dei depositi recenti?',
              content: 'Viene cancellato solo l\'elenco su questo dispositivo: i pacchi depositati non vengono toccati.',
              okText: 'Svuota',
              cancelText: 'Annulla',
              onOk: () => setDepositHistory(clearDepositHistory()),
            })}
          >
            Svuota elenco
          </Button>
        )}
      >
        <Table
          size="small"
          rowKey="id"
          dataSource={depositHistory}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: 'Nessun deposito registrato su questo dispositivo' }}
          columns={[
            { title: 'Quando', dataIndex: 'data', key: 'data', render: formatDepositTime },
            { title: 'Articolo', dataIndex: 'articolo', key: 'articolo' },
            { title: 'Descrizione', dataIndex: 'descrizione', key: 'descrizione', ellipsis: true },
            { title: 'Movimento', dataIndex: 'movimento', key: 'movimento' },
            { title: 'Qtà', dataIndex: 'quantita', key: 'quantita' },
            { title: 'Pacchi', dataIndex: 'pacchi', key: 'pacchi' },
            { title: 'Locazione', dataIndex: 'locazione', key: 'locazione' },
          ]}
        />
      </Card>


      {/* Movimento Input Modal */}
      <Modal
        title="Inserisci Codice Movimento"
        visible={showMovimentoInputModal}
        onCancel={() => setShowMovimentoInputModal(false)}
        onOk={handleMovimentoInputConfirm}
        confirmLoading={loadingArticoli}
      >
        <Input
          placeholder="Codice Movimento"
          value={movimentoInput}
          onChange={(e) => setMovimentoInput(e.target.value)}
          onPressEnter={handleMovimentoInputConfirm}
        />
      </Modal>

      {/* Articoli List Modal */}
      <Modal
        title="Articoli Movimento"
        visible={showArticoliModal}
        onCancel={() => setShowArticoliModal(false)}
        footer={null}
        width="80%"
        maskClosable={false} // Prevent closing when clicking outside

      >
   <Table
  rowSelection={{
    type: 'checkbox',
    ...rowSelection,
  }}
  columns={columns}
  dataSource={articoliMovimento}
  rowKey={(record) => record.id}
  rowClassName={(record) => 
    depositedArticoli.includes(record.id) ? 'deposited-row' : ''
  }
  pagination={false}
  footer={renderTableFooter}
/>
      </Modal>


      {/* Update ViewMagazzino to be a modal */}
      <Modal
        title="Mappa Magazzino"
        visible={showWarehouseModal}
        onCancel={() => setShowWarehouseModal(false)}
        footer={null}
        width="90%"
        maskClosable={false} // Prevent closing when clicking outside
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      >
       <ViewMagazzino
  onClose={() => setShowWarehouseModal(false)}
  onComplete={handleWarehouseComplete}
  articoloCode={articoloCode}
  descrizioneArticolo={descrizioneArticolo}
  movimentoCode={activeTab === '2' ? movimentoCaricato : movimentoCode}
  quantita={quantitaPerPacco}
  totalePacchi={totalePacchi}
  dimensione={dimensione}
  selectedItems={selectedRows.map(id => {
    const selectedRow = articoliMovimento.find(item => item.id === id);
    return {
      articoloCode: selectedRow?.gim_arti?.trim() || '',
      descrizioneArticolo: selectedRow?.gim_desc?.trim() || '',
      quantita: multiplePartialQuantity > 0 ? multiplePartialQuantity : parseFloat(selectedRow?.gim_qmov || 0)
    };
  })}
/>
      </Modal>
      <Modal
      title="Deposito Parziale"
      visible={showPartialDepositModal}
      onCancel={() => setShowPartialDepositModal(false)}
      onOk={startPartialDeposit}
      okText="Procedi con deposito"
      cancelText="Annulla"
    >
      {partialDepositArticle && (
        <div>
          <p><strong>Articolo:</strong> {partialDepositArticle.gim_desc?.trim()}</p>
          <p><strong>Codice:</strong> {partialDepositArticle.gim_arti?.trim()}</p>
          <Form.Item 
            label="Quantità da depositare"
            help={`Massimo disponibile: ${partialDepositArticle.gim_qmov}`}
          >
            <InputNumber
              min={1}
              max={partialDepositArticle.gim_qmov}
              value={partialDepositQuantity}
              onChange={(value) => setPartialDepositQuantity(value)}
              style={{ width: '100%' }}
            />
          </Form.Item>
        </div>
      )}
    </Modal>
    <Modal
      title="Deposito Parziale"
      visible={showMultiplePartialDepositModal}
      onCancel={() => setShowMultiplePartialDepositModal(false)}
      onOk={startMultiplePartialDeposit}
      okText="Procedi con deposito"
      cancelText="Annulla"
    >
      <div>
        <p><strong>Articoli selezionati:</strong> {selectedRows.length}</p>
        <p><strong>Quantità attuale per articolo:</strong> {
          articoliMovimento.find(item => item.id === selectedRows[0])?.gim_qmov
        }</p>
        <Form.Item 
          label="Quantità da depositare per ogni articolo"
          help={`Massimo disponibile: ${
            articoliMovimento.find(item => item.id === selectedRows[0])?.gim_qmov
          }`}
        >
          <InputNumber
            min={1}
            max={articoliMovimento.find(item => item.id === selectedRows[0])?.gim_qmov}
            value={multiplePartialQuantity}
            onChange={(value) => setMultiplePartialQuantity(value)}
            style={{ width: '100%' }}
          />
        </Form.Item>
        <Alert
          message="Questa operazione creerà nuove righe con le quantità rimanenti per ogni articolo selezionato."
          type="info"
          showIcon
          style={{ marginTop: '16px' }}
        />
      </div>
    </Modal>
    </div>

  );
};

export default StockingDettagli;