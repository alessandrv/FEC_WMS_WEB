import React, { useState, useRef, useEffect } from 'react';
import { Table, Button, Input, Checkbox, Modal, Form, Spin } from 'antd';
import axios from 'axios';

const FornitoriComponent = () => {
  // State variables
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [fornitore, setFornitore] = useState('');
  const [codiceOrdine, setCodiceOrdine] = useState('');
  const [inArrivo, setInArrivo] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [dettagliData, setDettagliData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isCameraModalVisible, setIsCameraModalVisible] = useState(false);
  const [photo, setPhoto] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Fetch data from the server
  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await axios.get('http://172.16.16.69:5000/api/fornitori');
      setData(response.data);
      setFilteredData(response.data); // Initialize with unfiltered data
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = data;

    if (fornitore) {
      filtered = filtered.filter(item =>
        item.des_clifor.trim().toLowerCase().includes(fornitore.trim().toLowerCase())
      );
    }

    if (codiceOrdine) {
      filtered = filtered.filter(item =>
        item.oft_code.toString().includes(codiceOrdine)
      );
    }

    if (inArrivo) {
      filtered = filtered.filter(item => item.oft_inarrivo === 'S');
    }

    setFilteredData(filtered);
  };

  // Handle filter changes
  useEffect(() => {
    applyFilters();
  }, [fornitore, inArrivo, codiceOrdine, data]);

  // Fetch details for a specific record
  const fetchDetails = async (tipo, code) => {
    setDetailsLoading(true);
    try {
      const response = await axios.get('http://172.16.16.69:5000/api/fornitore-details', {
        params: { tipo, code },
      });
      setDettagliData(response.data);
    } catch (error) {
      console.error('Error fetching details:', error);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Handle the 'Aggiorna' button click
  const handleAggiornaClick = () => {
    fetchData();
  };

  // Handle the 'Open Form' button click
  const handleOpenFormClick = () => {
    // Logic to open a new form/modal
    console.log('Open Form button clicked');
  };

  // Handle the 'Dettagli' button click
  const handleDettagliClick = (record) => {
    setSelectedRecord(record);
    fetchDetails(record.oft_tipo, record.oft_code); // Fetch details
    setIsModalVisible(true);
  };

  // Handle modal close
  const handleCancel = () => {
    setIsModalVisible(false);
    setSelectedRecord(null);
    setDettagliData([]);
    setPhoto(null); // Clear photo on modal close
  };

  // Handle camera modal close
  const handleCameraCancel = () => {
    setIsCameraModalVisible(false);
    setPhoto(null); // Clear photo on modal close
  };

  // Start the camera feed
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
    }
  };

  // Capture a photo from the camera feed
  const capturePhoto = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (canvas && video) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const photoURL = canvas.toDataURL('image/png');
      setPhoto(photoURL);
    }
  };

  // Handle opening the camera modal
  const handleOpenCameraModal = () => {
    setIsCameraModalVisible(true);
    startCamera(); // Start the camera feed when the modal opens
  };

  // Columns configuration for the table
  const columns = [
    { title: 'Tipo Ordine', dataIndex: 'oft_tipo', key: 'oft_tipo' },
    { title: 'Codice Ordine', dataIndex: 'oft_code', key: 'oft_code' },
    { title: 'Descrizione Fornitore', dataIndex: 'des_clifor', key: 'des_clifor' },
    { title: 'Stato', dataIndex: 'oft_stat', key: 'oft_stat' },
    { title: 'In Arrivo', dataIndex: 'oft_inarrivo', key: 'oft_inarrivo' },
    {
      title: 'Dettagli',
      key: 'dettagli',
      render: (text, record) => (
        <Button onClick={() => handleDettagliClick(record)}>Dettagli</Button>
      ),
    },
  ];

  // Columns configuration for the details table
  const dettagliColumns = [
    { title: 'Articolo', dataIndex: 'ofc_arti', key: 'ofc_arti' },
    { title: 'Riga', dataIndex: 'ofc_riga', key: 'ofc_riga' },
    { title: 'Descrizione', dataIndex: 'ofc_desc1', key: 'ofc_desc1' },
    { title: 'Quantità Ordinata', dataIndex: 'ofc_qord', key: 'ofc_qord' },
    { title: 'Data Consegna', dataIndex: 'ofc_dtco', key: 'ofc_dtco' },
    { title: 'Stato', dataIndex: 'ofc_stato', key: 'ofc_stato' },
    { title: 'Quantità Arrivata', dataIndex: 'ofc_qtarrivata', key: 'ofc_qtarrivata' },
    { title: 'In Arrivo', dataIndex: 'ofc_inarrivo', key: 'ofc_inarrivo' },
  ];

  return (
    <div>
      <Form layout="inline" style={{ marginBottom: 16 }}>
        <Form.Item>
          <Input
            placeholder="Nome Fornitore"
            value={fornitore}
            onChange={e => setFornitore(e.target.value)}
          />
        </Form.Item>
        <Form.Item>
          <Input
            placeholder="Codice Ordine"
            value={codiceOrdine}
            onChange={e => setCodiceOrdine(e.target.value)}
          />
        </Form.Item>
        <Form.Item>
          <Checkbox
            checked={inArrivo}
            onChange={e => setInArrivo(e.target.checked)}
          >
            In Arrivo
          </Checkbox>
        </Form.Item>
        <Form.Item>
          <Button type="primary" onClick={handleAggiornaClick} loading={loading}>
            Aggiorna
          </Button>
        </Form.Item>
        <Form.Item>
          <Button onClick={handleOpenFormClick}>
            Open Form
          </Button>
        </Form.Item>
      </Form>
      <Table
        dataSource={filteredData}
        columns={columns}
        rowKey="oft_code"
        loading={loading}
      />
      <Modal
        title="Dettagli Fornitore"
        visible={isModalVisible}
        onCancel={handleCancel}
        footer={null}
        width="80%" // Adjust width as needed
        style={{ top: 20 }} // Optional: Adjust top margin
      >
        {detailsLoading ? (
          <Spin />
        ) : (
          <>
            {selectedRecord && (
              <div>
                <p><strong>Tipo Ordine:</strong> {selectedRecord.oft_tipo}</p>
                <p><strong>Codice Ordine:</strong> {selectedRecord.oft_code}</p>
                <p><strong>Descrizione Fornitore:</strong> {selectedRecord.des_clifor}</p>
                <p><strong>Stato:</strong> {selectedRecord.oft_stat}</p>
                <p><strong>In Arrivo:</strong> {selectedRecord.oft_inarrivo}</p>
                <Table
                  dataSource={dettagliData}
                  columns={dettagliColumns}
                  rowKey="ofc_arti"
                  pagination={false}
                />
                <Button type="primary" onClick={handleOpenCameraModal}>
                  Segnala Problemi
                </Button>
              </div>
            )}
          </>
        )}
      </Modal>
      <Modal
        title="Capture Photo"
        visible={isCameraModalVisible}
        onCancel={handleCameraCancel}
        footer={null}
        width="80%"
        style={{ top: 20 }} // Optional: Adjust top margin
      >
        <div style={{ textAlign: 'center' }}>
          <video ref={videoRef} autoPlay style={{ width: '100%' }}></video>
          <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
          <br />
          <Button type="primary" onClick={capturePhoto}>
            Capture Photo
          </Button>
          <br />
          {photo && <img src={photo} alt="Captured" style={{ marginTop: 16, width: '100%' }} />}
        </div>
      </Modal>
    </div>
  );
};

export default FornitoriComponent;
