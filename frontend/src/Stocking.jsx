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
  const [totalePacchi, setTotalePacchi] = useState(1);
  const [dimensione, setDimensione] = useState('Zero');
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

  const handleArticoloEnter = async () => {
    // Only set the articolo code, don't make API call
    setArticoloCode(articoloCode);
    if (fornitoreRef.current) {
      fornitoreRef.current.focus();
    }
  };

  const handleFornitoreEnter = async () => {
    // Only set the fornitore code, don't make API call
    setFornitoreCode(fornitoreCode);
    if (movimentoRef.current) {
      movimentoRef.current.focus();
    }
  };

  const handleMovimentoEnter = async () => {
    // Perform all API calls here
    try {
      // Articolo API call
      const articoloResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/articolo-descrizione?codice_articolo=${articoloCode}`);
      setDescrizioneArticolo(articoloResponse.data.descrizione || 'Descrizione non trovata');
      setArticoloDaCercare(articoloCode);

      // Fornitore API call
      const fornitoreResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/fornitore-ragione-sociale?codice_fornitore=${fornitoreCode}`);
      setRagioneSocialeFornitore(fornitoreResponse.data.ragione_sociale || 'Fornitore non trovato');

      // Movimento API call
      const movimentoResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/movimento-coerenza?codice_articolo=${articoloCode}&codice_movimento=${movimentoCode}&codice_fornitore=${fornitoreCode}`);
      if (movimentoResponse.data.coerenza) {
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


      <Row gutter={16}>
        <Col xs={24} sm={24} md={12}>
        <Card title="Articolo" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="Codice Articolo">
                <Input
                  value={articoloCode}
                  onChange={(e) => handleInputChange(e, setArticoloCode, fornitoreRef)}
                  onPressEnter={handleArticoloEnter}
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

        <Col xs={24} sm={12} md={12}>
          <Card title="Fornitore" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="Codice Fornitore">
              <Input
                  value={fornitoreCode}
                  onChange={(e) => handleInputChange(e, setFornitoreCode, movimentoRef)}
                  onPressEnter={handleFornitoreEnter}
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
        </Row>

        <Row gutter={16}>
        <Col xs={24} sm={12} md={12}>
          <Card title="Movimento" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="Codice Movimento">
              <Input
                  value={movimentoCode}
                  onChange={(e) => handleInputChange(e, setMovimentoCode, quantitaRef)}
                  onPressEnter={handleMovimentoEnter}
                  placeholder="Codice Movimento"
                  ref={movimentoRef}
                  className="input-small"
                />
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
      <div className="actions">
        <Button type="default" style={{margin:10}} onClick={clearAllFields}>Pulisci campi</Button>
        <Button type="primary" style={{margin:10}} onClick={handleShowMagazzino}>Immagazzina</Button>

      </div>
    </div>
  );
};

export default StockingDettagli;