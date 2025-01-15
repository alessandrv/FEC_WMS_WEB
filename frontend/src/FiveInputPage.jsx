import React, { useRef, useState, useEffect } from 'react';
import { Input, Table, Button, Form, Typography, Select, Card, Row, Col, Modal, message, Tooltip } from 'antd';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import './FiveInputPage.css'; // Ensure this CSS file exists for styling
import { useNavigate } from 'react-router-dom';
import Checkbox from 'antd/es/checkbox/Checkbox';
import { EyeOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { Title } = Typography;
const { Option } = Select;

const FiveInputPage = () => {
  // State variables for the 5 inputs
  const [input1, setInput1] = useState('');
  const [input2, setInput2] = useState('');
  const [input3, setInput3] = useState('');
  const [input4, setInput4] = useState('');
  const [input5, setInput5] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Ref hooks for managing focus
  const input1Ref = useRef(null);
  const input2Ref = useRef(null);
  const input3Ref = useRef(null);
  const input4Ref = useRef(null);
  const input5Ref = useRef(null);
// New state variables
const [isPackMultiple, setIsPackMultiple] = useState(false);
const [isFullViewVisible, setIsFullViewVisible] = useState(false);
  const navigate = useNavigate();

  // File handle for the Excel file
  const [fileHandle, setFileHandle] = useState(null);

  // Focus on the first input when the component mounts
  useEffect(() => {
    if (input1Ref.current) {
      input1Ref.current.focus();
    }
  }, []);

  // Function to handle Enter key and focus shifting
  const handleKeyPress = (e, nextRef) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextRef && nextRef.current) {
        nextRef.current.focus();
      }
    }
  };
  const handleSubmitKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };
  // State to store all submitted data
  const [dataRows, setDataRows] = useState([]);

  // Function to request file access
  const loadExistingData = async (handle) => {
    try {
      setIsLoading(true);
      const file = await handle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      // Assuming data is in the first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      // Convert sheet to JSON
      const existingData = XLSX.utils.sheet_to_json(worksheet);
      
      // Add keys to the existing data
      const dataWithKeys = existingData.map((row, index) => ({
        ...row,
        key: `existing-${index}`,
      }));

      setDataRows(dataWithKeys);
      message.success('Dati esistenti caricati con successo!');
    } catch (error) {
      console.error('Error loading existing data:', error);
      message.error('Errore nel caricamento dei dati esistenti.');
    } finally {
      setIsLoading(false);
    }
  };

  // Updated requestFileAccess function
  const requestFileAccess = async () => {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'Excel Files',
            accept: {
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            },
          },
        ],
        multiple: false,
      });

      setFileHandle(handle);
      await loadExistingData(handle);
    } catch (error) {
      console.error(error);
      message.error('Selezione file cancellata o fallita.');
    }
  };
  // Function to write data to the Excel file
  const writeToExcel = async (rows) => {
    if (!fileHandle) {
      message.error('Seleziona prima un file');
      return false;
    }
  
    try {
      // Create a writable stream
      const writable = await fileHandle.createWritable();
  
      // Read existing file content
      const file = await fileHandle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  
      // Assuming data is written to the first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
  
      // Convert existing sheet to JSON
      const existingData = XLSX.utils.sheet_to_json(worksheet);
  
      // Append new rows
      const updatedData = [...existingData, ...rows];
  
      // Convert JSON back to sheet
      const newWorksheet = XLSX.utils.json_to_sheet(updatedData);
  
      // Replace the old sheet with the new one
      workbook.Sheets[sheetName] = newWorksheet;
  
      // Write the updated workbook back to the file
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      await writable.write(wbout);
      await writable.close();
  
      message.success('File Excel aggiornato!');
      return true;
    } catch (error) {
      console.error(error);
      message.error('Errore durante il salvataggio del file. Probabilmente Excel ha il file selezionato aperto.');
      return false;
    }
  };
  
  const columns = [
    {
      title: 'Codice Articolo',
      dataIndex: 'CODICE_ARTICOLO',
      key: 'CODICE_ARTICOLO',
    },
    {
      title: 'Fornitore',
      dataIndex: 'FORNITORE',
      key: 'FORNITORE',
    },
    {
      title: 'Movimento',
      dataIndex: 'MOVIMENTO',
      key: 'MOVIMENTO',
    },
    {
      title: 'Locazione',
      dataIndex: 'LOCAZIONE',
      key: 'LOCAZIONE',
    },
    {
      title: 'Quantità',
      dataIndex: 'QUANTITA',
      key: 'QUANTITA',
    },
    {
      title: 'Pacco Multiplo',
      dataIndex: 'PACCO_MULTIPLO',
      key: 'PACCO_MULTIPLO',
      render: (value) => value === 'X' ? 'X' : '',
    }
  ];
  // Function to handle form submission
  const handleSubmit = async () => {
    if (!input1 || !input2 || !input3 || !input4 || !input5) {
      message.error('Per favore, compila tutti i campi.');
      return;
    }
  
    const newRow = {
      CODICE_ARTICOLO: input1,
      FORNITORE: input2,
      MOVIMENTO: input3,
      LOCAZIONE: input4,
      QUANTITA: input5,
      PACCO_MULTIPLO: isPackMultiple ? 'X' : '',
    };
  
    // Attempt to write to Excel
    const writeSuccess = await writeToExcel([newRow]);
  
    if (writeSuccess) {
      // Only update the table if writing to Excel was successful
      const updatedDataRows = [...dataRows, newRow];
      setDataRows(updatedDataRows);
  
      // Reset the form
      setInput1('');
      setInput2('');
      setInput3('');
      setInput4('');
      setInput5('');
      setIsPackMultiple(false);
  
      // Refocus on the first input
      if (input1Ref.current) {
        input1Ref.current.focus();
      }
  
      message.success('Dati aggiunti con successo!');
    }
  };
  
 // Get last 5 rows for the table
 const getLastFiveRows = () => {
  return dataRows.slice(-5).reverse(); // Reverse to show newest first
};
  return (
    <div className="five-input-page">
      <Title level={2} className="title">Inserimento Dati</Title>

      <Row gutter={16}>
        <Col xs={24} sm={12} md={8}>
          <Card title="Codice articolo" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="COD ARTICOLO">
                <Input
                  value={input1}
                  onChange={(e) => setInput1(e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, input2Ref)}
                  placeholder="Inserisci Codice Articolo"
                  ref={input1Ref}
                  className="input-small"
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={8}>
          <Card title="Fornitore" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="Fornitore">
                <Input
                  value={input2}
                  onChange={(e) => setInput2(e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, input3Ref)}
                  placeholder="Inserisci Fornitore"
                  ref={input2Ref}
                  className="input-small"
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={8}>
          <Card title="Movimento" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="Movimento">
                <Input
                  value={input3}
                  onChange={(e) => setInput3(e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, input4Ref)}
                  placeholder="Inserisci Movimento"
                  ref={input3Ref}
                  className="input-small"
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={12} md={8}>
          <Card title="Locazione" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="Campo Locazione">
                <Input
                  value={input4}
                  onChange={(e) => setInput4(e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, input5Ref)}
                  placeholder="Inserisci Locazione"
                  ref={input4Ref}
                  className="input-small"
                />
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={8}>
          <Card title="Quantità" className="card">
            <Form layout="vertical" className="form">
              <Form.Item label="Campo Quantità">
                <Input
                  value={input5}
                  onChange={(e) => setInput5(e.target.value)}
                  onKeyPress={(e) => handleSubmitKey(e)}
                  placeholder="Inserisci Quantità"
                  ref={input5Ref}
                  className="input-small"
                />
              </Form.Item>
              <Form.Item>
                <Checkbox 
                  checked={isPackMultiple}
                  onChange={(e) => setIsPackMultiple(e.target.checked)}
                >
                  Pacco multiplo
                </Checkbox>
                <Tooltip color={"rgb(230 45 58)"} title="Selezionare se la quantità inserita è divisa tra piu pacchi, non se un singolo pacco ha piu articoli. Esempio: bancale con 30 PP sarà quantità 30 con pacco multiplo. Singolo pacco con 10 ram NON rappresenta pacco multiplo.">
    <InfoCircleOutlined/>
  </Tooltip>
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>

      <div className="actions" style={{ marginTop: '16px', marginBottom: '20px' }}>
        {!fileHandle && (
          <Button type="default" onClick={requestFileAccess} style={{ marginRight: '10px' }}>
            Seleziona File Excel
          </Button>
        )}
        <Button type="primary" onClick={handleSubmit} disabled={!fileHandle} style={{ marginRight: '10px' }}>
          Aggiungi Riga
        </Button>
        <Button 
          type="default" 
          icon={<EyeOutlined />}
          onClick={() => setIsFullViewVisible(true)}
          disabled={!fileHandle}
        >
          Visualizza Tutto
        </Button>
      </div>

      <Card 
        title="Ultime 5 righe inserite" 
        className="recent-entries-card"
        extra={isLoading && <span>Caricamento dati...</span>}
      >
        <Table 
          columns={columns}
          dataSource={getLastFiveRows()}
          pagination={false}
          size="small"
          scroll={{ x: true }}
          loading={isLoading}
        />
      </Card>

      <Modal
        title="Visualizzazione Completa"
        open={isFullViewVisible}
        onCancel={() => setIsFullViewVisible(false)}
        width="80%"
        footer={[
          <Button key="close" onClick={() => setIsFullViewVisible(false)}>
            Chiudi
          </Button>
        ]}
      >
        <Table
          columns={columns}
          dataSource={dataRows}
          pagination={false} 

        />
      </Modal>
    </div>
  );
};

export default FiveInputPage;
