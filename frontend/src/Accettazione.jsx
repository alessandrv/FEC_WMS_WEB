import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Input, message, Tag } from 'antd';
import axios from 'axios';
import Webcam from 'react-webcam';
import './Accettazione.css';
import Title from 'antd/es/typography/Title';
import { SearchOutlined } from '@ant-design/icons';

const GroupedItemsTable = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isProblemModalVisible, setIsProblemModalVisible] = useState(false);
  const [orderDetails, setOrderDetails] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editedQuantities, setEditedQuantities] = useState({});
  const [capturedImage, setCapturedImage] = useState(null);
  const [searchText, setSearchText] = useState(''); // New state for search input
  const [tempSearchText, setTempSearchText] = useState(''); // Temporary search state
  const [mismatchedItems, setMismatchedItems] = useState([]); // State for mismatched items
  const [isMismatchModalVisible, setIsMismatchModalVisible] = useState(false); // Modal visibility
  const [emailMessage, setEmailMessage] = useState(''); // New state for the email message

  useEffect(() => {
    fetchItems();
  }, []);
  const resetProblemModal = () => {
    setCapturedImage(null);  // Clear the captured image
    setEmailMessage('');     // Clear the message
  };
  
  const fetchItems = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/ordini-fornitore`);
      setItems(response.data.results || []);
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrder = async (record) => {
    setSelectedOrder(record);
    setIsModalVisible(true);

    // Reset order details and edited quantities when selecting a new order
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
    } finally {
        setLoading(false);
    }
};

  useEffect(() => {
    if (isProblemModalVisible) {
      setCapturedImage(null); // Clear the captured image
    }
  }, [isProblemModalVisible]);
  

 const sendEmailWithPhoto = async () => {
  if (!capturedImage) {
    message.error('Please capture a photo before sending.');
    return;
  }

  try {
    const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/send-email`, {
      image: capturedImage,
      order_id: selectedOrder?.oft_code,
      message: emailMessage || '',  // If no message, send empty string (optional)
    });

    if (response.status === 200) {
      message.success('Email sent successfully');
      setIsProblemModalVisible(false); // Close the modal after email is sent
      resetProblemModal(); // Reset the modal state
    }
  } catch (error) {
    console.error('Error sending email:', error);
    message.error('Failed to send email');
  }
};

  
  

const handleQuantityChange = (value, record) => {
  // Use the existing arrived quantity (ofc_qtarrivata) if no value is provided.
  const newQuantity = value === '' ? record.ofc_qtarrivata : value;

  setEditedQuantities((prev) => ({
    ...prev,
    [record.ofc_riga]: newQuantity, // Store the quantity, whether edited or existing
  }));
};
const handleSaveChanges = async () => {
  const mismatches = orderDetails.filter((detail) => {
      const editedValue = editedQuantities[detail.ofc_riga];

      // Skip blank values (empty strings or nulls)
      if (editedValue === '' || editedValue == null) {
          return false;
      }

      const arrivedQuantity = parseInt(editedValue, 10);
      const expectedQuantity = parseInt(detail.ofc_qord, 10);

      // Return true if there's a mismatch
      return arrivedQuantity !== expectedQuantity;
  });

  if (mismatches.length > 0) {
      setMismatchedItems(mismatches);
      setIsMismatchModalVisible(true);
      return; // Halt saving changes until user confirms
  }

  // Save changes first, then send email based on updated data
  await saveChanges();

  // Fetch updated order details and prepare items for the email
  const updatedItems = orderDetails.map((detail) => {
      const arrivedQuantity = detail.ofc_qtarrivata; // Get value directly from the database (orderDetails)
      const expectedQuantity = detail.ofc_qord;

      return {
          article: detail.ofc_arti,
          arrivedQuantity: arrivedQuantity != null ? arrivedQuantity : "Non arrivato", // Mark null as "Non arrivato"
          expectedQuantity: expectedQuantity,
      };
  });

  // Now, send the confirmation email with updated data
  sendConfirmationEmail(); // Send the confirmation email after saving changes
};
const prepareEmailData = () => {
  // Prepare the data to send to the backend
  const order_id = selectedOrder?.oft_code;
  const order_tipo = selectedOrder?.oft_tipo;
  const supplier_name = selectedOrder?.cliente_nome;

  const items = orderDetails.map((detail) => {
    const arrivedQuantity = editedQuantities[detail.ofc_riga] ?? detail.ofc_qtarrivata; // Use edited value or default value
    const expectedQuantity =  parseInt(parseFloat(detail.ofc_qord), 10);;
    const deliveryDate = detail.ofc_dtco; // Delivery date (formatted if needed)
    const description = detail.article_description || 'Descrizione non disponibile'; // Default description

    return {
      article: detail.ofc_arti,
      article_description: description,
      arrivedQuantity,
      expectedQuantity,
      deliveryDate,
    };
  });

  return {
    order_id,
    order_tipo,
    supplier_name,
    items,
  };
};
const sendConfirmationEmail = async () => {
  const emailData = prepareEmailData();
  if (!emailData) {
    message.error('Email data is missing.');
    return;
  }

  try {
    const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/send-save-confirmation-email`, emailData);
    if (response.status === 200) {
      message.success('Email sent successfully');
    }
  } catch (error) {
    console.error('Error sending email:', error);
    message.error('Failed to send email');
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
      message.success('Quantità ricevute aggiornate con successo');
      setEditedQuantities({});
      await handleSelectOrder(selectedOrder); // Refresh order details after saving
  } catch (error) {
      message.error("Errore nell'aggiornamento delle quantità");
  } finally {
      setLoading(false);
  }
};


  
  
  // Confirm save despite mismatches
  const handleConfirmSave = async () => {
    setIsMismatchModalVisible(false);
    await saveChanges();
    sendConfirmationEmail(); // Send the confirmation email after saving changes

  };



  const capturePhoto = (webcamRef) => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      setCapturedImage(imageSrc); // Just set the captured image
    }
  };
  
  // Filter items based on searchText for the "Cliente" column
  const filteredItems = items.filter((item) =>
    item.cliente_nome ? item.cliente_nome.toLowerCase().includes(searchText.toLowerCase()) : false
  );

  const mainTableColumns = [
    {
        title: 'Fornitore',
        dataIndex: 'cliente_nome',
        key: 'cliente_nome',
        width:600,
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
          <div style={{ padding: 8 }}>
            <Input
              placeholder="Cerca Articolo"
              value={tempSearchText}
              onChange={(e) => setTempSearchText(e.target.value)}
              onPressEnter={() => {
                setSearchText(tempSearchText);
                confirm(); // Triggers the table filter
              }}
              style={{ marginBottom: 8, display: 'block' }}
            />
            <Button
              type="primary"
              onClick={() => {
                setSearchText(tempSearchText);
                confirm(); // Triggers the table filter
              }}
              icon={<SearchOutlined />}
              size="small"
              style={{ width: 90, marginRight: 8 }}
            >
              Cerca
            </Button>
            <Button
              onClick={() => {
                setSearchText(''); // Clear the main search state
                setTempSearchText(''); // Clear the input field
                clearFilters(); // Reset filters
              }}
              size="small"
              style={{ width: 90 }}
            >
              Reset
            </Button>
          </div>
        ),
        filterIcon: (filtered) => (
            <SearchOutlined
              style={{
                color: searchText ? 'rgb(230 45 58)' : undefined,
              }}
            />
          ),      },
    { title: 'Tipo',        width:50,
      dataIndex: 'oft_tipo', key: 'oft_tipo' },
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
        record.oft_stat === 'C' ? null : ( // Check if the stat is "Chiuso"
          <Tag color={inArrivo === 'S' ? 'green' : 'red'}>
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
      title: 'Stato ordine', // Column title for oft_stat
      dataIndex: 'oft_stat',
      key: 'oft_stat',
      filters: [
        { text: 'Aperti', value: 'A' },
        { text: 'Chiusi', value: 'C' },
      ],
      onFilter: (value, record) => record.oft_stat === value,
      render: (inArrivo) => (
        <Tag color={inArrivo === 'A' ? 'green' : 'red'}>
          {inArrivo === 'A' ? 'Aperto' : 'Chiuso'}
        </Tag>
      ),
      defaultFilteredValue: ['A'], // Default to show only "A" values
    },
    {
      title: '',
      key: 'select',
      render: (text, record) => (
        <Button onClick={() => handleSelectOrder(record)}>Seleziona Ordine</Button>
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
        record.oft_stat === 'C' ? null : ( // Check if the stat is "Chiuso"
          <Tag color={inArrivo === 'S' ? 'green' : 'red'}>
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
          value={editedQuantities[record.ofc_riga] ?? text ?? ''} // Use edited value or default value by ofc_riga
          onChange={(e) => handleQuantityChange(e.target.value, record)}
          style={{ width: '100%' }}
        />
      ),
    },
  ];
  const webcamRef = React.useRef(null);

  return (
    <>
      <Title level={2} className="title">Accettazione</Title>

      <Table
        dataSource={filteredItems}
        columns={mainTableColumns}
        rowKey="oft_code"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        width={1400}
        title={`Dettagli Ordine - Codice ${selectedOrder?.oft_code}`}
        visible={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={[
          
          <Button color="danger"  variant="filled" key="problem" onClick={() => setIsProblemModalVisible(true)} style={{ float: 'left' }}>
            Segnala danno
          </Button>,
          <Button key="cancel" onClick={() => setIsModalVisible(false)}>
            Close
          </Button>,
          <Button key="save" type="primary" onClick={handleSaveChanges}>
            Save Changes
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
  title="Segnala Danno - Scatta Foto"
  visible={isProblemModalVisible}
  onCancel={() => {
    setIsProblemModalVisible(false);
    resetProblemModal();  // Reset modal state when closed
  }}
  width={800}
  footer={[
    <Button key="cancel" onClick={() => {
      setIsProblemModalVisible(false);
      resetProblemModal();  // Reset modal state on close
    }}>
      Cancel
    </Button>,
    <Button key="capture" type="primary" onClick={() => capturePhoto(webcamRef)}>
      Scatta Foto
    </Button>,
    <Button
      key="sendEmail"
      type="primary"
      onClick={sendEmailWithPhoto}
      disabled={!capturedImage} // Disable button if no image is captured
    >
      Invia Email
    </Button>,
  ]}
>
  {capturedImage ? (
    <img src={capturedImage} alt="Captured" style={{ width: '100%' }} />
  ) : (
    <Webcam
      audio={false}
      ref={webcamRef}
      screenshotFormat="image/jpeg"
      width="100%"
      onUserMedia={() => console.log('Webcam initialized')}
    />
  )}
  <Input.TextArea
    value={emailMessage}
    onChange={(e) => setEmailMessage(e.target.value)}
    placeholder="Aggiungi un messaggio per descrivere il problema (Opzionale)"
    rows={4}
    style={{ marginTop: 16 }}
  />
</Modal>



        {/* Mismatch Notification Modal */}
    <Modal
      title="Discrepanza nelle Quantità"
      visible={isMismatchModalVisible}
      onCancel={() => setIsMismatchModalVisible(false)}
      footer={[
        <Button key="cancel" onClick={() => setIsMismatchModalVisible(false)}>
          Annulla
        </Button>,
        <Button key="confirm" type="primary" onClick={handleConfirmSave}>
          Conferma e Salva
        </Button>,
      ]}
    >
      <p>Le seguenti righe hanno discrepanze tra la quantità attesa e quella ricevuta:</p>
      <ul>
        {mismatchedItems.map((item) => (
          <li key={item.ofc_arti}>
            Articolo: {item.ofc_arti} - Quantità attesa: {parseInt(item.ofc_qord, 10)} - Quantità ricevuta:{" "}
            {editedQuantities[item.ofc_riga] ?? null}
            {console.log(editedQuantities)}
          </li>
        ))}
      </ul>
    </Modal>
    </>
  );
};

export default GroupedItemsTable;
