import React, { useEffect, useState, useRef } from 'react';
import { Table, Button, Modal, Input, message, Tag, Typography, Space, Card, Divider } from 'antd';
import { SearchOutlined, CameraOutlined, SaveOutlined, WarningOutlined, InfoCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import Webcam from 'react-webcam';
import './Accettazione.css';

const { Title, Text } = Typography;

const GroupedItemsTable = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isProblemModalVisible, setIsProblemModalVisible] = useState(false);
  const [orderDetails, setOrderDetails] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editedQuantities, setEditedQuantities] = useState({});
  const [capturedImage, setCapturedImage] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [tempSearchText, setTempSearchText] = useState('');
  const [mismatchedItems, setMismatchedItems] = useState([]);
  const [isMismatchModalVisible, setIsMismatchModalVisible] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');

  const webcamRef = useRef(null);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/ordini-fornitore`);
      setItems(response.data.results || []);
    } catch (error) {
      console.error('Error fetching items:', error);
      message.error('Failed to fetch items');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrder = async (record) => {
    setSelectedOrder(record);
    setIsModalVisible(true);
    setOrderDetails([]);
    setEditedQuantities({});
    setLoading(true);

    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/ordine-details`, {
        params: { ofc_tipo: record.oft_tipo, ofc_code: record.oft_code },
      });
      setOrderDetails(response.data.results || []);
    } catch (error) {
      console.error('Error fetching order details:', error);
      message.error('Failed to fetch order details');
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (value, record) => {
    const newQuantity = value === '' ? record.ofc_qtarrivata : value;
    setEditedQuantities((prev) => ({
      ...prev,
      [record.ofc_riga]: newQuantity,
    }));
  };

  const handleSaveChanges = async () => {
    const mismatches = orderDetails.filter((detail) => {
      const editedValue = editedQuantities[detail.ofc_riga];
      if (editedValue === '' || editedValue == null) return false;
      const arrivedQuantity = parseInt(editedValue, 10);
      const expectedQuantity = parseInt(detail.ofc_qord, 10);
      return arrivedQuantity !== expectedQuantity;
    });

    if (mismatches.length > 0) {
      setMismatchedItems(mismatches);
      setIsMismatchModalVisible(true);
    } else {
      await saveChanges();
    }
  };

  const saveChanges = async () => {
    setLoading(true);
    try {
      const updateRequests = Object.entries(editedQuantities).map(([ofc_riga, ofc_qtarrivata]) =>
        axios.put(`${process.env.REACT_APP_API_URL}/api/update-quantity`, {
          ofc_tipo: selectedOrder.oft_tipo,
          ofc_code: selectedOrder.oft_code,
          ofc_riga,
          ofc_qtarrivata,
        })
      );

      await Promise.all(updateRequests);
      message.success('Quantities updated successfully');
      setEditedQuantities({});
      await handleSelectOrder(selectedOrder);
      sendConfirmationEmail();
    } catch (error) {
      message.error('Error updating quantities');
    } finally {
      setLoading(false);
    }
  };

  const sendConfirmationEmail = async () => {
    const emailData = prepareEmailData();
    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/send-save-confirmation-email`, emailData);
      if (response.status === 200) {
        message.success('Confirmation email sent successfully');
      }
    } catch (error) {
      console.error('Error sending confirmation email:', error);
      message.error('Failed to send confirmation email');
    }
  };

  const prepareEmailData = () => {
    const order_id = selectedOrder?.oft_code;
    const order_tipo = selectedOrder?.oft_tipo;
    const supplier_name = selectedOrder?.cliente_nome;

    const items = orderDetails.map((detail) => ({
      article: detail.ofc_arti,
      article_description: detail.article_description || 'Description not available',
      arrivedQuantity: editedQuantities[detail.ofc_riga] ?? detail.ofc_qtarrivata,
      expectedQuantity: parseInt(parseFloat(detail.ofc_qord), 10),
      deliveryDate: detail.ofc_dtco,
    }));

    return { order_id, order_tipo, supplier_name, items };
  };

  const capturePhoto = () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      setCapturedImage(imageSrc);
    }
  };

  const sendEmailWithPhoto = async () => {
    if (!capturedImage) {
      message.error('Please capture a photo before sending');
      return;
    }

    try {
      const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/send-email`, {
        image: capturedImage,
        order_id: selectedOrder?.oft_code,
        message: emailMessage || '',
      });

      if (response.status === 200) {
        message.success('Email sent successfully');
        setIsProblemModalVisible(false);
        setCapturedImage(null);
        setEmailMessage('');
      }
    } catch (error) {
      console.error('Error sending email:', error);
      message.error('Failed to send email');
    }
  };

  const mainTableColumns = [
    {
      title: 'Fornitore',
      dataIndex: 'cliente_nome',
      key: 'cliente_nome',
      width: 600,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
        <div style={{ padding: 16, background: '#fff', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          <Input
            placeholder="Cerca Articolo"
            value={tempSearchText}
            onChange={(e) => setTempSearchText(e.target.value)}
            onPressEnter={() => {
              setSearchText(tempSearchText);
              confirm();
            }}
            style={{ marginBottom: 8, display: 'block' }}
          />
          <Space>
            <Button
              type="primary"
              onClick={() => {
                setSearchText(tempSearchText);
                confirm();
              }}
              icon={<SearchOutlined />}
              size="small"
            >
              Cerca
            </Button>
            <Button
              onClick={() => {
                setSearchText('');
                setTempSearchText('');
                clearFilters();
              }}
              size="small"
            >
              Reset
            </Button>
          </Space>
        </div>
      ),
      filterIcon: (filtered) => (
        <SearchOutlined style={{ color: searchText ? '#1890ff' : undefined }} />
      ),
    },
    { title: 'Tipo', dataIndex: 'oft_tipo', key: 'oft_tipo', width: 50 },
    { title: 'Codice', dataIndex: 'oft_code', key: 'oft_code' },
    {
      title: 'Data',
      dataIndex: 'oft_data',
      key: 'oft_data',
      render: (date) => new Date(date).toLocaleDateString('it-IT'),
    },
    {
      title: 'Stato consegna',
      dataIndex: 'oft_inarrivo',
      key: 'oft_inarrivo',
      render: (inArrivo, record) =>
        record.oft_stat === 'C' ? null : (
          <Tag color={inArrivo === 'S' ? 'success' : 'error'}>
            {inArrivo === 'S' ? 'In arrivo' : 'Non in arrivo'}
          </Tag>
        ),
      filters: [
        { text: 'In arrivo', value: 'S' },
        { text: 'Non in arrivo', value: 'N' },
      ],
      onFilter: (value, record) => record.oft_inarrivo === value,
    },
    {
      title: 'Stato ordine',
      dataIndex: 'oft_stat',
      key: 'oft_stat',
      filters: [
        { text: 'Aperti', value: 'A' },
        { text: 'Chiusi', value: 'C' },
      ],
      onFilter: (value, record) => record.oft_stat === value,
      render: (stat) => (
        <Tag color={stat === 'A' ? 'success' : 'error'}>
          {stat === 'A' ? 'Aperto' : 'Chiuso'}
        </Tag>
      ),
      defaultFilteredValue: ['A'],
    },
    {
      title: '',
      key: 'select',
      render: (_, record) => (
        <Button type="primary" onClick={() => handleSelectOrder(record)}>
          Seleziona Ordine
        </Button>
      ),
    },
  ];

  const detailsTableColumns = [
    { title: 'Articolo', dataIndex: 'ofc_arti', key: 'ofc_arti' },
    { title: 'Descrizione', dataIndex: 'article_description', key: 'article_description' },
    {
      title: 'Data Consegna',
      dataIndex: 'ofc_dtco',
      key: 'ofc_dtco',
      render: (date) => new Date(date).toLocaleDateString('it-IT'),
    },
    {
      title: 'Stato consegna',
      dataIndex: 'ofc_inarrivo',
      key: 'ofc_inarrivo',
      render: (inArrivo, record) =>
        record.oft_stat === 'C' ? null : (
          <Tag color={inArrivo === 'S' ? 'success' : 'error'}>
            {inArrivo === 'S' ? 'In arrivo' : 'Non in arrivo'}
          </Tag>
        ),
      filters: [
        { text: 'In arrivo', value: 'S' },
        { text: 'Non in arrivo', value: 'N' },
      ],
      onFilter: (value, record) => record.ofc_inarrivo === value,
    },
    {
      title: 'Q.ta attesa',
      dataIndex: 'ofc_qord',
      key: 'ofc_qord',
      render: (value) => parseInt(value, 10),
    },
    {
      title: 'Quantità Arrivata',
      dataIndex: 'ofc_qtarrivata',
      key: 'ofc_qtarrivata',
      render: (text, record) => (
        <Input
          value={editedQuantities[record.ofc_riga] ?? text ?? ''}
          onChange={(e) => handleQuantityChange(e.target.value, record)}
          style={{ width: '100%' }}
        />
      ),
    },
  ];

  return (
    <Card>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Title level={2} style={{ margin: 0 }}>
            Accettazione
          </Title>
        </div>

        <Table
          dataSource={items.filter((item) =>
            item.cliente_nome?.toLowerCase().includes(searchText.toLowerCase())
          )}
          columns={mainTableColumns}
          rowKey="oft_code"
          loading={loading}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 'max-content' }}
          className="custom-table"
        />

        <Modal
          width={1400}
          title={
            <Space>
              <Title level={4} style={{ margin: 0 }}>
                Dettagli Ordine - Codice {selectedOrder?.oft_code}
              </Title>
            </Space>
          }
          visible={isModalVisible}
          onCancel={() => setIsModalVisible(false)}
          footer={[
            <Button danger key="problem" onClick={() => setIsProblemModalVisible(true)} style={{ float: 'left' }} icon={<WarningOutlined />}>
              Segnala danno
            </Button>,
            <Button key="cancel" onClick={() => setIsModalVisible(false)}>
              Chiudi
            </Button>,
            <Button key="save" type="primary" onClick={handleSaveChanges} icon={<SaveOutlined />}>
              Salva Modifiche
            </Button>,
          ]}
        >
          <Table
            dataSource={orderDetails}
            columns={detailsTableColumns}
            rowKey="ofc_arti"
            pagination={false}
            loading={loading}
          />
        </Modal>

        <Modal
          title={
            <Space>
              <WarningOutlined style={{ color: '#faad14' }} />
              <Text strong>Segnala Danno - Scatta Foto</Text>
            </Space>
          }
          visible={isProblemModalVisible}
          onCancel={() => {
            setIsProblemModalVisible(false);
            setCapturedImage(null);
            setEmailMessage('');
          }}
          width={800}
          footer={[
            <Button key="cancel" onClick={() => setIsProblemModalVisible(false)}>
              Annulla
            </Button>,
            <Button key="capture" type="primary" onClick={capturePhoto} icon={<CameraOutlined />}>
              Scatta Foto
            </Button>,
            <Button
              key="sendEmail"
              type="primary"
              onClick={sendEmailWithPhoto}
              disabled={!capturedImage}
            >
              Invia Email
            </Button>,
          ]}
        >
          <div style={{ textAlign: 'center' }}>
            {capturedImage ? (
              <img src={capturedImage} alt="Captured" style={{ maxWidth: '100%', borderRadius: 8 }} />
            ) : (
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                width="100%"
                style={{ borderRadius: 8 }}
              />
            )}
          </div>
          <Input.TextArea
            value={emailMessage}
            onChange={(e) => setEmailMessage(e.target.value)}
            placeholder="Aggiungi un messaggio per descrivere il problema (Opzionale)"
            rows={4}
            style={{ marginTop: 16 }}
          />
        </Modal>

        <Modal
          title={
            <Space>
              <WarningOutlined style={{ color: '#faad14' }} />
              <Text strong>Discrepanza nelle Quantità</Text>
            </Space>
          }
          visible={isMismatchModalVisible}
          onCancel={() => setIsMismatchModalVisible(false)}
          footer={[
            <Button key="cancel" onClick={() => setIsMismatchModalVisible(false)}>
              Annulla
            </Button>,
            <Button key="confirm" type="primary" onClick={handleSaveChanges}>
              Conferma e Salva
            </Button>,
          ]}
        >
          <Text>Le seguenti righe hanno discrepanze tra la quantità attesa e quella ricevuta:</Text>
          <ul style={{ marginTop: 16 }}>
            {mismatchedItems.map((item) => (
              <li key={item.ofc_arti}>
                <Text strong>Articolo: {item.ofc_arti}</Text>
                <Divider type="vertical" />
                <Text>Quantità attesa: {parseInt(item.ofc_qord, 10)}</Text>
                <Divider type="vertical" />
                <Text type="warning">Quantità ricevuta: {editedQuantities[item.ofc_riga] ?? null}</Text>
              </li>
            ))}
          </ul>
        </Modal>
      </Space>
    </Card>
  );
};

export default GroupedItemsTable;
