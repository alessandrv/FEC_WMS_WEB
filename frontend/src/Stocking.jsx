import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import { Input, Button, Form, Typography, InputNumber, Select, Card, Row, Col, message, Modal, Spin } from 'antd';
import './StockingDettagli.css';
import { useNavigate } from 'react-router-dom';
import TrovaQuantita from "./TrovaQuantita"
import { Pagination } from 'antd';

const { Title } = Typography;
const { Option } = Select;

const StockingDettagli = () => {
  const [articoloCode, setArticoloCode] = useState('');
  const [articoloDaCercare, setArticoloDaCercare] = useState('');
  const [descrizioneArticolo, setDescrizioneArticolo] = useState('');
  const [fornitoreCode, setFornitoreCode] = useState('');
  const [ragioneSocialeFornitore, setRagioneSocialeFornitore] = useState('');
  const [movimentoCode, setMovimentoCode] = useState('');
  const [quantitaPerPacco, setQuantitaPerPacco] = useState('');
  const [totalePacchi, setTotalePacchi] = useState();
  const [dimensione, setDimensione] = useState();
  const [isDataConsistent, setIsDataConsistent] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannedArticolo, setScannedArticolo] = useState('');
  const [scannedFornitore, setScannedFornitore] = useState('');
  const [scannedMovimento, setScannedMovimento] = useState('');
  const navigate = useNavigate();

  const articoloRef = useRef(null);
  const fornitoreRef = useRef(null);
  const movimentoRef = useRef(null);
  const quantitaRef = useRef(null);
  const totalePacchiRef = useRef(null);
  const dimensioneSelectRef = useRef(null);
  const scanArticoloRef = useRef(null);
  const scanFornitoreRef = useRef(null);
  const scanMovimentoRef = useRef(null);

  useEffect(() => {
    if (articoloRef.current) {
      articoloRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (isModalVisible && scanArticoloRef.current) {
      scanArticoloRef.current.focus();
    }
  }, [isModalVisible]);

  const handleArticoloEnter = async (code) => {
    const articolo = code || articoloCode;
    setArticoloCode(articolo)
    try {
      const response = await axios.get(`http://172.16.16.69:5000/api/articolo-descrizione?codice_articolo=${articolo}`);
      setDescrizioneArticolo(response.data.descrizione || 'Descrizione non trovata');
      setArticoloDaCercare(articoloCode);
      if (fornitoreRef.current) {
        fornitoreRef.current.focus();
      }
    } catch (ex) {
      message.error(`Errore: ${ex.response?.data?.error || ex.message}`);
    }
  };

  const handleFornitoreEnter = async (code) => {
    const fornitore = code || fornitoreCode;
    setFornitoreCode(fornitore)
    try {
      const response = await axios.get(`http://172.16.16.69:5000/api/fornitore-ragione-sociale?codice_fornitore=${fornitore}`);
      setRagioneSocialeFornitore(response.data.ragione_sociale || 'Fornitore non trovato');
      if (movimentoRef.current) {
        movimentoRef.current.focus();
      }
    } catch (ex) {
      message.error(`Errore: ${ex.response?.data?.error || ex.message}`);
    }
  };

  const handleMovimentoEnter = async (articolo, movimento, fornitore) => {

    try {
      const response = await axios.get(`http://172.16.16.69:5000/api/movimento-coerenza?codice_articolo=${articolo}&codice_movimento=${movimento}&codice_fornitore=${fornitore}`);
      if (response.data.coerenza) {
        message.success('Informazioni coerenti');
        setIsDataConsistent(true);
        if (quantitaRef.current) {
          quantitaRef.current.focus();
        }
      } else {
        message.error('Errore: Movimento, articolo e fornitore non coerenti.');
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
    setFornitoreCode('');
    setRagioneSocialeFornitore('');
    setMovimentoCode('');
    setQuantitaPerPacco('');
    setTotalePacchi();
    setDimensione();
    setIsDataConsistent(false);
  };

  const handleShowMagazzino = () => {
    if (articoloCode && fornitoreCode && movimentoCode && quantitaPerPacco && totalePacchi && isDataConsistent && dimensione) {
      navigate('/view-magazzino', {
        state: {
          articoloCode,
          descrizioneArticolo,
          fornitoreCode,
          ragioneSocialeFornitore,
          movimentoCode,
          quantitaPerPacco,
          totalePacchi,
          dimensione
        }
      });
    } else {
      message.error('Compila tutti i campi per procedere');
    }
  };

  const showModal = () => {
    setIsModalVisible(true);
    setIsProcessing(false);
    setScannedArticolo('');
    setScannedFornitore('');
    setScannedMovimento('');
  };

  const handleOk = () => {
    setIsModalVisible(false);
    setIsProcessing(false);
    setScannedArticolo('');
    setScannedFornitore('');
    setScannedMovimento('');
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    setIsProcessing(false);
    setScannedArticolo('');
    setScannedFornitore('');
    setScannedMovimento('');
  };

  const processScannedCode = async () => {
    setIsProcessing(true);
  
    try {
      await handleArticoloEnter(scannedArticolo);
      await handleFornitoreEnter(scannedFornitore);
      await handleMovimentoEnter(scannedArticolo, scannedMovimento, scannedFornitore);
  
      // Update state variables after processing
      setArticoloCode(scannedArticolo);
      setFornitoreCode(scannedFornitore);
      setMovimentoCode(scannedMovimento);
  
      setIsProcessing(false);
      handleOk();
    } catch (error) {
      // Error handling...
    }
  };
  

  const handleInputChange = (e, setter, nextRef) => {
    const value = e.target.value;
    if (value.includes(',')) {
      const [beforeComma, afterComma] = value.split(',');
      setter(beforeComma);
      if (nextRef && nextRef.current) {
        nextRef.current.focus();
        nextRef.current.input.value = afterComma;
      }
    } else {
      setter(value);
    }
  };

  const handleMovimentoInputChange = (e) => {
    const value = e.target.value;
    setScannedMovimento(value);
    if (value && scannedArticolo && scannedFornitore) {
      processScannedCode();
    }
  };
  

  return (
    <div className="stocking-dettagli">
      <Title level={2} className="title">Stocking Dettagli</Title>

      <Button onClick={showModal} style={{ marginBottom: '20px' }}>Scan QR Code</Button>

      <Modal
        title="Scan QR Code"
        visible={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
        footer={null}
      >
        {isProcessing ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <Spin size="large" />
            <p style={{ marginTop: '10px' }}>Processing scanned code...</p>
          </div>
        ) : (
          <div style={{ padding: '20px' }}>
            <Form layout="vertical">
              <Form.Item label="Articolo">
                <Input
                  ref={scanArticoloRef}
                  value={scannedArticolo}
                  onChange={(e) => handleInputChange(e, setScannedArticolo, scanFornitoreRef)}
                  autoFocus
                />
              </Form.Item>
              <Form.Item label="Fornitore">
                <Input
                  ref={scanFornitoreRef}
                  value={scannedFornitore}
                  onChange={(e) => handleInputChange(e, setScannedFornitore, scanMovimentoRef)}
                />
              </Form.Item>
              <Form.Item label="Movimento">
                <Input
                  ref={scanMovimentoRef}
                  value={scannedMovimento}
                  onChange={(e) => handleInputChange(e, setScannedMovimento, scanMovimentoRef)}
                  onPressEnter={handleMovimentoInputChange}
                />
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>

      <Row gutter={16}>
        <Col xs={24} sm={12} md={8}>
          <Card title="Articolo" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="Codice Articolo">
                <Input
                  value={articoloCode}
                  onChange={(e) => setArticoloCode(e.target.value)}
                  onPressEnter={(e) => handleArticoloEnter(articoloCode)}
                  placeholder="Codice Articolo"
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

        <Col xs={24} sm={12} md={8}>
          <Card title="Fornitore" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="Codice Fornitore">
                <Input
                  value={fornitoreCode}
                  onChange={(e) => setFornitoreCode(e.target.value)}
                  onPressEnter={(e) => handleFornitoreEnter(fornitoreCode)}
                  placeholder="Codice Fornitore"
                  ref={fornitoreRef}
                  className="input-small"
                />
              </Form.Item>
              <Form.Item label="Ragione Sociale Fornitore">
                <Input
                  value={ragioneSocialeFornitore}
                  readOnly
                  placeholder="Ragione Sociale Fornitore"
                  className="input-small"
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={8}>
          <Card title="Movimento" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="Codice Movimento">
                <Input
                  value={movimentoCode}
                  onChange={(e) => setMovimentoCode(e.target.value)}
                  onPressEnter={(e) => handleMovimentoEnter(articoloCode, movimentoCode, fornitoreCode)}
                  placeholder="Codice Movimento"
                  ref={movimentoRef}
                  className="input-small"
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={12} md={8}>
          <Card title="Dati Pacco" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="Quantità per Pacco">
                <Input
                  value={quantitaPerPacco}
                  onChange={(e) => setQuantitaPerPacco(e.target.value)}
                  onPressEnter={handleQuantitaEnter}
                  placeholder="Quantità per Pacco"
                  ref={quantitaRef}
                  className="input-small"
                />
              </Form.Item>
              <Form.Item label="Totale Pacchi">
                <InputNumber
                  min={1}
                  value={totalePacchi}
                  onChange={(value) => setTotalePacchi(value)}
                  onPressEnter={handleTotalePacchiEnter}
                  ref={totalePacchiRef}
                  className="input-small"
                />
              </Form.Item>
              <Form.Item label="Dimensione">
                <Select
                  ref={dimensioneSelectRef}
                  size='large'
                  value={dimensione}
                  onChange={(value) => setDimensione(value)}
                  className="input-small"
                >
                  <Option value="Zero">Zero</Option>
                  <Option value="Piccolo">Piccolo</Option>
                  <Option value="Medio">Medio</Option>
                  <Option value="Grande">Grande</Option>
                </Select>
              </Form.Item>
            </Form>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card title="Quantita registrata in magazzino a gestionale" className="card">
            <TrovaQuantita articoloCode={articoloDaCercare} />
          </Card>
        </Col>
      </Row>
      <div className="actions">
        <Button type="primary" onClick={handleShowMagazzino}>Mostra Magazzino</Button>
        <Button type="default" onClick={clearAllFields}>Pulisci</Button>
      </div>
    </div>
  );
};

export default StockingDettagli;