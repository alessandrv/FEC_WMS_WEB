import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Typography, Button, message, Modal, Table, InputNumber, Spin, Pagination, Card, Form } from 'antd';
import axios from 'axios';
import WarehouseGrid from './GridComponent';
import './App.css'; // Make sure to import your CSS
import WarehouseGridSystem from './WarehouseGridSystem';
import { LoadingOutlined } from '@ant-design/icons';
const { Title } = Typography;

const App = () => {
  const [otp, setOtp] = useState(['', '', '', '']);
  const inputRefs = [useRef(), useRef(), useRef(), useRef()];
  const articoloRef = useRef(null);
  const fornitoreRef = useRef(null);
  const movimentoRef = useRef(null);
  const [articoloCode, setArticoloCode] = useState('');
  const [fornitoreCode, setFornitoreCode] = useState('');
  const [movimentoCode, setMovimentoCode] = useState('');
  const [transferQuantity, setTransferQuantity] = useState(1);
  
  const[isTransferConfirmationOpen, setIsTransferConfirmationOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tableData, setTableData] = useState([]);
  const [descriptions, setDescriptions] = useState({});
  const [shelfInfo, setShelfInfo] = useState({});
  const [selectedPackages, setSelectedPackages] = useState([]);
  const [isWarehouseMapOpen, setIsWarehouseMapOpen] = useState(false);
  const [highlightedShelf, setHighlightedShelf] = useState('');
  const [shelvesData, setShelvesData] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  // New state variables for volume calculation
  const [volumes, setVolumes] = useState([]);
  const [totalVolume, setTotalVolume] = useState(0);
  const [selectedLayout, setSelectedLayout] = useState('simple');
    const [selectedShelf, setSelectedShelf] = useState(null);
    const [occupiedShelves, setOccupiedShelves] = useState(new Set());
    const handleShelfClick = (shelf) => {
      setHighlightedShelf(shelf);
      setIsWarehouseMapOpen(false); // Close the map modal
      
      setIsTransferConfirmationOpen(true); // Open the confirmation modal
    };
    const layouts = {
        1: [
            {
                id: 'A',
                startRow: 0,
                startCol: 0,
                width: 8,
                height: 4,
                shelfPattern: 'regular'
              },
              {
                id: 'B',
                startRow: 7,
                startCol: 0,
                width: 7,
                height: 4,
                shelfPattern: 'regular'
              },
              {
                id: 'C',
                startRow: 11,
                startCol: 0,
                width: 7,
                height: 5,
                shelfPattern: 'regular'
              },
              {
                id: 'D',
                startRow: 19,
                startCol: 0,
                width: 2,
                height: 6,
                shelfPattern: 'regular'
              },
              {
                id: 'D',
                startRow: 19,
                startCol: 3,
                width: 5,
                height: 6,
                startingValue: 3,
                shelfPattern: 'regular'
              },
              {
                id: 'X',
                startRow: 25,
                startCol: 3,
                width: 5,
                height: 2,
                startingValue: 1,
                startingFloor: -1,
                spanRow: 2,
                spanCol: 5,
                shelfPattern: 'regular'
              },{
                id: 'TEXT1',
                type: 'customText',
                customText: 'SCALE',
                rotateText: false, // or false for horizontal text
                startRow: 27,
                startCol: 4,
                width: 4,
                height: 2,
                spanRow: 3,
                spanCol: 4
              },
              {
                id: 'TEXT1',
                type: 'customText',
                customText: 'ENTRATA',
                rotateText: false, // or false for horizontal text
                startRow: 29,
                startCol: 1,
                width: 2,
                height: 1,
                spanRow: 1,
                spanCol: 2
              },
              
        ],
        2: [
            {
                id: 'E',
                startRow: 10,
                startCol: 0,
                width: 8,
                height: 5,
                shelfPattern: 'regular'
              },
              {
                id: 'R',
                startRow: 4,
                startCol: 3,
                width: 3,  // Number of columns you want
                height: 1,
                startingValue: 1,
                shelfPattern: 'horizontal',  // Use 'horizontal' instead of 'regular'
                startingFloor: 1
              },
              {
                id: 'R',
                startRow: 5,
                startCol: 3,
                width: 3,  // Number of columns you want
                height: 1,
                startingValue: 2,
                shelfPattern: 'horizontal',  // Use 'horizontal' instead of 'regular'
                startingFloor: 1
              },
              {
                id: 'R',
                startRow: 6,

                startCol: 3,
                width: 3,  // Number of columns you want
                height: 1,
                startingValue: 3,
                shelfPattern: 'horizontal',  // Use 'horizontal' instead of 'regular'
                startingFloor: 1
              },

              

              {
                id: 'S',
                startRow: 3,
                startCol: 8,
                width: 1,
                height: 5,
                startingFloor:-4,
                startingValue:1,
                spanRow: 5,
                spanCol: 1,
                shelfPattern: 'regular'
              },{
                id: 'TEXT1',
                type: 'customText',
                customText: 'RIPARAZIONI',
                rotateText: false, // or false for horizontal text
                startRow: 3,
                startCol: 6,
                width: 1,
                height: 5,
                spanRow: 5,
                spanCol: 1
              },
              {
                id: 'TEXT2',
                type: 'customText',
                customText: 'ENTRATA',
                rotateText: false, // or false for horizontal text
                startRow: 14,
                startCol: 8,
                width: 1,
                spanCol:1,
                height: 1,
              },
              {
                id: 'TEXT3',
                type: 'customText',
                customText: 'POS. DOMENICO',
                rotateText: false, // or false for horizontal text
                startRow: 0,
                startCol: 0,
                width: 1,
                
                height: 1,
              }
              ,
              {
                id: 'TEXT4',
                type: 'customText',
                customText: 'ENTRATA',
                rotateText: false, // or false for horizontal text
                startRow: 0,
                startCol: 8,
                width: 1,
                
                height: 1,
              }
              ,
              {
                id: 'TEXT5',
                type: 'customText',
                customText: 'POS. CECILIA',
                rotateText: false, // or false for horizontal text
                startRow: 0,
                startCol: 9,
                width: 1,
                
                height: 1,
              }
        
         
        ]
      };
      const getShelfStatus = (shelfId) => {
        if (shelfId === selectedShelf) return 'selected';
        if (occupiedShelves.has(shelfId)) return 'full';
        return 'available';
      };
  const handlePageChange = (page) => {
    setCurrentPage(page);
  };
  const handleTransfer = async () => {
    setLoading(true);
    try {
      const payload = {
        area: shelfInfo.area,
        scaffale: shelfInfo.scaffale,
        colonna: shelfInfo.colonna,
        piano: shelfInfo.piano,
        articolo: articoloCode,
        movimento: movimentoCode,
        quantity: transferQuantity,
      };
  
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/initiate-transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
  
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
  
      message.success('Trasferimento avviato con successo');
      setIsModalOpen(false); // Close the modal on success
    } catch (error) {
      message.error('Errore durante il trasferimento');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const renderWarehouseSection = () => {
    if (currentPage === 1) {
        return (
    <div>
    <WarehouseGridSystem
    warehouseLayout={layouts[1]}
    GRID_ROWS = {30}
    GRID_COLS = {9}
    onCellClick={handleShelfClick}
    getShelfStatus={getShelfStatus}
    tooltipContent={getTooltipContent}

  />
</div>)}
else if (currentPage === 2) {
    return (
<div>
<WarehouseGridSystem
GRID_ROWS = {15}
GRID_COLS = {11}
warehouseLayout={layouts[2]}
onCellClick={handleShelfClick}
getShelfStatus={getShelfStatus}
tooltipContent={getTooltipContent}

/>
</div>)}
};

  const openWarehouseMap = () => {
    setIsWarehouseMapOpen(true);
  };

  // Fetch shelves data on component mount
// Fetch shelves data on component mount
useEffect(() => {
  const fetchShelvesData = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/shelves`);
      // Preprocess shelvesData to include shelfCode
      const processedData = response.data.map((shelf) => ({
        ...shelf,
        shelfCode: `${shelf.scaffale}-${shelf.colonna}-${shelf.piano}`,
      }));
      
      setShelvesData(processedData);
    } catch (error) {
      console.error('Error fetching shelves data:', error);
    }
  };

  fetchShelvesData();
}, []);


  // Fetch volumes on component mount
  useEffect(() => {
    const fetchVolumes = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/dimensioni`);
        setVolumes(response.data);
      } catch (error) {
        console.error('Error fetching volumes data:', error);
      }
    };

    fetchVolumes();
  }, []);

  const getShelfClass = useCallback((shelf) => {
    // Assuming the shelf identifier is in the format "A-01-1"
    const [scaffale, colonna, piano] = shelf.split('-');
    const area = 'A'; // Assuming all shelves are in area 'A'. Modify if necessary.
  
    // Find the matching shelf data
    const shelfData = shelvesData.find(
      (s) =>
        s.area === area &&
        s.scaffale === scaffale &&
        s.colonna === colonna &&
        s.piano.toString() === piano
    );
  
    if (!shelfData) {
      return 'grid-item unavailable-shelf'; // Default class if shelf data not found
    }
  
    const hasEnoughSpace = shelfData.volume_libero - totalVolume > 0;
  
    if (shelf === highlightedShelf) {
      return hasEnoughSpace ? 'grid-item highlight-green' : 'grid-item highlight-red';
    }
  
    return hasEnoughSpace ? 'grid-item green' : 'grid-item red';
  }, [shelvesData, totalVolume, highlightedShelf]);
  

  const confirmTransfer = async () => {
    setLoading(true);
    const [scaffaleDest, colonnaDest, pianoDest] = highlightedShelf.split('-');
    const areaDest='A';

    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/api/trasferimento`, {
         articolo : articoloCode,
       
    area:shelfInfo.area,
    scaffale:shelfInfo.scaffale,
    colonna:shelfInfo.colonna,
    piano:shelfInfo.piano,

    areaDest:areaDest,
    scaffaleDest : scaffaleDest,
    colonnaDest : colonnaDest,
    pianoDest : pianoDest,

    movimento :movimentoCode,
    fornitore :fornitoreCode,
    quantity : transferQuantity,
      });
      message.success('Trasferimento completato con successo!');
      setIsTransferConfirmationOpen(false);
      setIsModalOpen(false)
    } catch (error) {
      console.error('Error confirming transfer:', error);
      message.error('Errore nel trasferimento.');
    } finally {
      setLoading(false);
    }
  };
  
  const getTooltipContent = (shelf) => {
    const shelfData = shelvesData.find((s) => s.shelfCode === shelf);
    return shelfData ? `Volume Libero: ${shelfData.volume_libero} m³` : 'N/A';
  };

  const performTransfer = async (destinationShelf) => {
    try {
      // Construct the startingShelf code based on shelfInfo
      const startingShelfCode = `${shelfInfo.area}-${shelfInfo.scaffale}-${shelfInfo.colonna}-${shelfInfo.piano}`;
      
      // Construct the destinationShelf code including the area
      const destinationShelfCode = `${shelfInfo.area}-${destinationShelf}`;
      
      // Prepare the transfer data with all required fields
      const transferData = {
        startingShelf: startingShelfCode,
        destinationShelf: destinationShelfCode,
        totalVolume: totalVolume,
        packages: selectedPackages.map(pkg => ({
          area: pkg.area,
          scaffale: pkg.scaffale,
          colonna: pkg.colonna,
          dimensione: pkg.dimensione,
          fornitore: pkg.fornitore,
          id_art: pkg.id_art,
          id_mov: pkg.id_mov,
          id_pacco: pkg.id_pacco,
          piano: pkg.piano,
          qta: pkg.qta,
          // Remove or add shelfCode based on your decision
          // shelfCode: destinationShelfCode, // Uncomment if shelfCode is added to wms_items
        })),
      };
      
      // Make the API call
      await axios.post(`${process.env.REACT_APP_API_URL}/api/transfer-packages`, transferData);
      
      // Notify the user of success
      message.success('Transfer successful!');
      
      // Reset state as needed
      setIsWarehouseMapOpen(false);
      setIsModalOpen(false);
      setSelectedPackages([]);
      setTotalVolume(0); // Reset total volume
    } catch (error) {
      console.error('Error performing transfer:', error);
      
      // Handle specific error messages from the backend
      if (error.response && error.response.data && error.response.data.error) {
        message.error(`Transfer failed: ${error.response.data.error}`);
      } else {
        message.error('Transfer failed.');
      }
    }
  };
  

  const handleSelect = (e, record) => {
    if (e.target.checked) {
      setSelectedPackages([...selectedPackages, record]);
    } else {
      setSelectedPackages(selectedPackages.filter((item) => item !== record));
    }
  };

  // Columns for the table, excluding 'area', 'scaffale', 'colonna', 'piano'
  const columns = [
    {
      title: 'Select',
      key: 'select',
      render: (_, record) => (
        <input
          type="checkbox"
          onChange={(e) => handleSelect(e, record)}
          checked={selectedPackages.includes(record)}
        />
      ),
    },
    { title: 'ID Art', dataIndex: 'id_art', key: 'id_art' },
    { title: 'Fornitore', dataIndex: 'fornitore', key: 'fornitore' },
    { title: 'Quantità', dataIndex: 'qta', key: 'qta' },
    { title: 'Dimensione', dataIndex: 'dimensione', key: 'dimensione' },
    {
      title: 'Descrizione',
      key: 'descrizione',
      render: (text, record) => descriptions[record.id_art] || <Spin />,
    },
  ];

  const handleChange = (index, value) => {
    if (value === '-') return; // Ignore '-' character

    const newOtp = [...otp];
    newOtp[index] = value.toUpperCase();
    setOtp(newOtp);

    // Log the updated OTP for debugging
    console.log('Updated OTP:', newOtp);

    // Move to next input if not the last input
    if (value && index < 3) {
      if (index === 2 && value.length < 2) return; // For the third input, allow only when 2 chars entered
      inputRefs[index + 1].current.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs[index - 1].current.focus();
    }
    if (e.key === 'Enter') {
      const emptyFields = otp.some((value) => value.trim() === '');
      if (!emptyFields) {
        articoloRef.current.focus();
      } else {
        message.error('Inserisci la locazione completa.');
      }
      
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
  const handleKeyDownArticolo = ( e) => {

    if (e.key === 'Enter') {
      
        fornitoreRef.current.focus();
      
      
    }
    
  };
  const handleKeyDownFornitore = ( e) => {

    if (e.key === 'Enter') {
      
        movimentoRef.current.focus();
      
      
    }
  };
  const handleKeyDownMovimento = ( e) => {

    if (e.key === 'Enter') {
      
      handleConfirm();
      
      
    }
  };
  // Fetch the description for each unique article
  const fetchDescriptions = async (articoli) => {
    const newDescriptions = { ...descriptions };

    const uniqueArticoli = [...new Set(articoli.map((item) => item.id_art))];

    for (const articolo of uniqueArticoli) {
      if (!newDescriptions[articolo]) {
        try {
          const response = await axios.get(
            `${process.env.REACT_APP_API_URL}/api/articolo-descrizione?codice_articolo=${articolo}`
          );
          newDescriptions[articolo] = response.data.descrizione;
        } catch (error) {
          console.error('Error fetching description for', articolo, error);
        }
      }
    }

    setDescriptions(newDescriptions);
  };

  const calculateTotalVolume = useCallback(() => {
    if (volumes.length === 0 || selectedPackages.length === 0) {
      setTotalVolume(0);
      return;
    }

    let total = 0;
    selectedPackages.forEach(pkg => {
      const volumeData = volumes.find(vol => vol.dimensione === pkg.dimensione);
      if (volumeData) {
        total += volumeData.volume;
      } else {
        console.warn(`No volume data found for dimensione: ${pkg.dimensione}`);
      }
    });

    setTotalVolume(total);
  }, [volumes, selectedPackages]);
  const validateFields = () => {
    // Check if OTP fields are empty
    const emptyOtpFields = otp.map((value, index) => {
      if (value.trim() === '') {
        console.log(`Field at index ${index} is empty`);
        return index; // Return the index of the empty field
      }
      return null; // Return null for non-empty fields
    }).filter(index => index !== null); // Filter out the null values
  
    // Check if Codice Articolo or Movimento are empty
    if (articoloCode.trim() === '') {
      console.log('Codice Articolo is empty');
      message.error('Codice Articolo is obbligatorio.');
      return false;
    }
  
    if (movimentoCode.trim() === '') {
      console.log('Movimento is empty');
      message.error('Codice Movimento è obbligatorio.');
      return false;
    }
  
    if (emptyOtpFields.length > 0) {
      message.error('Compila tutti i campi di posizione.');
      return false;
    }
  
    // All fields are filled
    return true;
  };
  const handleConfirm = async () => {
    if (!validateFields()) {
      return;
    }
  
    setLoading(true);
  
    const area = otp[0];
    const scaffale = otp[1];
    const colonna = otp[2];
    const piano = otp[3];
  
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/articoli-scaffale?area=${area}&scaffale=${scaffale}&colonna=${colonna}&piano=${piano}&articolo=${articoloCode}&fornitore=${fornitoreCode}&movimento=${movimentoCode}`
      );
  
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
  
      const data = await response.json();
  
      // Summing up the total quantity
      const totalQuantity = data.reduce((sum, item) => sum + (item.qta || 0), 0);
  
      setShelfInfo({
        area,
        scaffale,
        colonna,
        piano,
        totalQuantity,
      });
      setIsModalOpen(true); // Open the modal
    } catch (error) {
      message.error('Errore di connessione o di scansione');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };
  

  const containerStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh', // Full viewport height
  };

  const cardStyle = {
    width: '400px',
    padding: '20px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)', // Optional shadow for a modern look
  };

  const inputStyle = {
    width: '60px',
    textAlign: 'center',
  };
 
  useEffect(() => {
    if (inputRefs[0].current) {
    // Focus the first input field when the component mounts
    inputRefs[0].current.focus();
    }
  }, []);

  // Recalculate total volume whenever selectedPackages changes
  useEffect(() => {
    calculateTotalVolume();
  }, [selectedPackages, calculateTotalVolume]);

  return (
    <div style={{display:"flex", justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap !important',}}>

    
<div style={containerStyle}>
      <Card title="Trasferimenti" style={cardStyle}>
        {/* Top section with location inputs */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        {['AREA', 'SCAFFALE', 'COLONNA', 'PIANO'].map((label, index) => (
          <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ marginBottom: '4px' }}>{label}</span>
            <Input
              ref={inputRefs[index]}
              value={otp[index]}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              maxLength={index === 2 ? 2 : 1}
              style={inputStyle}
            />
            
          </div>

        )
        )
        }
        </div>

        {/* Form section with article and movimento inputs */}
        <Form layout="vertical">
        <Form.Item label="Codice Articolo">
            <Input ref={articoloRef} onChange={(e) => handleInputChange(e, setArticoloCode, fornitoreRef)} value={articoloCode}  onKeyDown={(e) => handleKeyDownArticolo(e)} placeholder="Codice Articolo" />
          </Form.Item>
          <Form.Item label="Codice Fornitore">
            <Input ref={fornitoreRef} onChange={(e) => handleInputChange(e, setFornitoreCode, movimentoRef)} value={fornitoreCode}  onKeyDown={(e) => handleKeyDownFornitore(e)} placeholder="Codice Fornitore" />
          </Form.Item>
          <Form.Item label="Movimento">
            <Input ref={movimentoRef} onChange={(e) => setMovimentoCode(e.target.value)} value={movimentoCode} onKeyDown={(e) => handleKeyDownMovimento(e)} placeholder="Codice Movimento" />
          </Form.Item>
        </Form>

        {/* Confirm Button */}
        <Button
          type="primary"
          onClick={handleConfirm}
          block
          style={{
            height: '50px',
            marginTop: '10px',
          }}
        >
          Inizia
        </Button>
      </Card>
       {/* Modal with Table */}
       <Modal
       style={{width:"50%"}}
  title={`Scanned Shelf: Area ${shelfInfo.area}, Scaffale ${shelfInfo.scaffale}, Colonna ${shelfInfo.colonna}, Piano ${shelfInfo.piano}`}
  visible={isModalOpen}
  onCancel={() => setIsModalOpen(false)}
  footer={[
    <Button key="cancel" onClick={() => setIsModalOpen(false)}>
      Indietro
    </Button>,
    <Button
    type="primary"
    onClick={() => setIsWarehouseMapOpen(true)}
    disabled={transferQuantity <= 0 || transferQuantity > shelfInfo.totalQuantity}

  >
    Seleziona destinazione
  </Button>
  ,
  ]}
>
  <div style={{ marginBottom: '16px' }}>
    <strong>ID Articolo:</strong> {articoloCode}
  </div>
  <div style={{ marginBottom: '16px' }}>
    <strong>Movimento:</strong> {movimentoCode}
  </div>
  <div style={{ marginBottom: '16px' }}>
    <strong>Quantità Totale:</strong> {shelfInfo.totalQuantity}
  </div>
  <div style={{ marginBottom: '16px' }}>
    <strong>Quantità da spostare:</strong>
    <InputNumber
  min={1} // Ensures the minimum value is 1
  max={shelfInfo.totalQuantity} // Sets the maximum value to the total quantity
  value={transferQuantity} // Binds the value to state
 
  onChange={(value) => {
    if (value <= shelfInfo.totalQuantity) {
      setTransferQuantity(value); // Update the state if within valid range
    }
  }}
  style={{ width: '100%', marginTop: '8px' }}
  onPressEnter={() => {
    // Optional: Handle pressing Enter (e.g., confirm the value)
    if (transferQuantity > 0 && transferQuantity <= shelfInfo.totalQuantity) {
      message.success('Quantità impostata correttamente');
    }
  }}
  step={1} // Allow users to use step increments
  parser={(value) => value.replace(/[^\d]/g, '')} // Ensure only numeric input
  formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} // Format numbers with commas
/>

  </div>
</Modal>
<Modal
  title="Conferma Trasferimento"
  visible={isTransferConfirmationOpen}
  onCancel={() => setIsTransferConfirmationOpen(false)}
  onOk={confirmTransfer} // Function to finalize the transfer
  okText="Conferma"
  cancelText="Annulla"
>
  <div>
  <p><strong>ID Articolo:</strong> {articoloCode}</p>
 
 <p><strong>Movimento:</strong> {movimentoCode}</p>
 <p><strong>Partenza:</strong> {shelfInfo.area}-{shelfInfo.scaffale}-{shelfInfo.colonna}-{shelfInfo.piano}</p>
  <p><strong>Destinazione:</strong> A-{highlightedShelf}</p>

  <p><strong>Quantità:</strong> {transferQuantity}</p>

  </div>
</Modal>
<Modal
  title="Seleziona la posizione di destinazione"
  visible={isWarehouseMapOpen}
  onCancel={() => setIsWarehouseMapOpen(false)}
  footer={null}
  width={1000}
>
  {loading ? (
    <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
  ) : (
    <div className="warehouse-map-container">
      <WarehouseGridSystem
        warehouseLayout={layouts[currentPage]}
        GRID_ROWS={30} // Adjust rows/columns as needed
        GRID_COLS={9}
        onCellClick={handleShelfClick}
        getShelfStatus={getShelfStatus}
        tooltipContent={getTooltipContent}
      />
      <Pagination
        current={currentPage}
        total={Object.keys(layouts).length}
        pageSize={1}
        onChange={(page) => setCurrentPage(page)}
        showSizeChanger={false}
        simple
      />
    </div>
  )}
</Modal>


      <Modal
        title="Selezionare scaffale di destinazione"
        visible={isWarehouseMapOpen}
        onCancel={() => setIsWarehouseMapOpen(false)}
        footer={null}
        width="80%"
      >
        {/* Warehouse Map Content */}
        <div style={{ maxHeight: '100%', overflowY: 'auto' }}>
          <div className="grid-container">
            {renderWarehouseSection()}
          </div>
          {/* Add Pagination Below the Grids */}
          <div className="pagination-container" style={{ marginTop: '20px', textAlign: 'center' }}>
            <Pagination
              current={currentPage}
              total={2}
              pageSize={1}
              onChange={handlePageChange}
              showSizeChanger={false}
              simple
            />
          </div>
        </div>
      </Modal>
    </div></div>
  );
};

export default App;
