import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Typography, Button, message, Modal, Table, Spin, Pagination } from 'antd';
import axios from 'axios';
import WarehouseGrid from './GridComponent';
import './App.css'; // Make sure to import your CSS

const { Title } = Typography;

const App = () => {
  const [otp, setOtp] = useState(['', '', '', '']);
  const inputRefs = [useRef(), useRef(), useRef(), useRef()];
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

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const renderWarehouseSection = () => {
    if (currentPage === 1) {
      return (
        <>
          <WarehouseGrid
            group='A'
            columns={8}
            rows={4}
            getShelfClass={getShelfClass}
            onShelfClick={handleShelfClick}
            tooltipContent={getTooltipContent}
            gridClassName="large-grid"
          />
          <div className="spacer" />
          <div>
            <WarehouseGrid
              group="B"
              columns={7}
              rows={4}
              getShelfClass={getShelfClass}
              onShelfClick={handleShelfClick}
              tooltipContent={getTooltipContent}
              gridClassName="smaller-grid second-group"
            />
            <WarehouseGrid
              group="C"
              columns={7}
              rows={5}
              getShelfClass={getShelfClass}
              onShelfClick={handleShelfClick}
              tooltipContent={getTooltipContent}
              gridClassName="smaller-grid second-group"
            />
          </div>
          <div className="spacer" />
          <WarehouseGrid
            group="D"
            columns={7}
            rows={6}
            getShelfClass={getShelfClass}
            onShelfClick={handleShelfClick}
            tooltipContent={getTooltipContent}
            gridClassName="smaller-grid third-grid"
          />
        </>
      );
    } else if (currentPage === 2) {
      return (
        <>
          <div className="spacer" />
          <WarehouseGrid
            group="E"
            columns={8}
            rows={5}
            getShelfClass={getShelfClass}
            onShelfClick={handleShelfClick}
            tooltipContent={getTooltipContent}
            gridClassName="large-grid"
          />
        </>
      );
    }
  };

  const openWarehouseMap = () => {
    setIsWarehouseMapOpen(true);
  };

  // Fetch shelves data on component mount
// Fetch shelves data on component mount
useEffect(() => {
  const fetchShelvesData = async () => {
    try {
      const response = await axios.get('http://172.16.16.69:5000/api/shelves');
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
        const response = await axios.get('http://172.16.16.69:5000/api/dimensioni');
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
  
  const handleShelfClick = (shelf) => {
    setHighlightedShelf(shelf);

    // Confirm the selection
    Modal.confirm({
      title: `Confirm Transfer to Shelf ${shelf}?`,
      content: (
        <div>
          <p><strong>Destination Shelf:</strong> {shelf}</p>
          <p><strong>Packages to Transfer:</strong></p>
          <ul>
            {selectedPackages.map((pkg) => (
              <li key={pkg.id_mov}>
                {pkg.id_art} - Quantity: {pkg.qta}
              </li>
            ))}
          </ul>
          <p><strong>Total Volume:</strong> {totalVolume} m³</p>
        </div>
      ),
      onOk: () => {
        // Proceed to show summary modal or perform the transfer
        performTransfer(shelf);
      },
    });
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
      await axios.post('http://172.16.16.69:5000/api/transfer-packages', transferData);
      
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
        handleConfirm(); // Call handleConfirm only if all fields are filled
      } else {
        message.error('Please fill all the fields.');
      }
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
            `http://172.16.16.69:5000/api/articolo-descrizione?codice_articolo=${articolo}`
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

  const handleConfirm = async () => {
    // Check for empty fields in the current otp state
    const emptyFields = otp.map((value, index) => {
      if (value.trim() === '') {
        console.log(`Field at index ${index} is empty`);
        return index; // Return the index of the empty field
      }
      return null; // Return null for non-empty fields
    }).filter(index => index !== null); // Filter out the null values

    if (emptyFields.length > 0) {
      message.error('Please fill all the fields.');
      return;
    }

    // Proceed with the API call if all fields are filled
    setLoading(true);

    const area = otp[0];
    const scaffale = otp[1];
    const colonna = otp[2];
    const piano = otp[3];

    try {
      const response = await fetch(
        `http://172.16.16.69:5000/api/articoli-scaffale?area=${area}&scaffale=${scaffale}&colonna=${colonna}&piano=${piano}`
      );

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      setTableData(data); // Set the data to be displayed in the modal table
      setShelfInfo({ area, scaffale, colonna, piano });
      await fetchDescriptions(data); // Fetch descriptions for the items
      message.success('Dati ottenuti');
      setIsModalOpen(true); // Open modal with the results

      // After data is fetched and modal is open, calculate the total volume
      // Do not auto-select all packages; user selects via checkboxes
      // Instead, you might want to reset selectedPackages
      setSelectedPackages([]); // Reset selected packages
      setTotalVolume(0); // Reset total volume
    } catch (error) {
      message.error('Errore di connessione o di scansione');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '60px',
    height: '60px',
    fontSize: '24px',
    textAlign: 'center',
    margin: '0 8px',
  };

  const containerStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    flexDirection: 'column',
  };

  useEffect(() => {
    // Focus the first input field when the component mounts
    inputRefs[0].current.focus();
  }, []);

  // Recalculate total volume whenever selectedPackages changes
  useEffect(() => {
    calculateTotalVolume();
  }, [selectedPackages, calculateTotalVolume]);

  return (
    <div style={containerStyle}>
      <Title level={3}>Trasferimenti</Title>
      <div style={{ display: 'flex', alignItems: 'center' }}>
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
        ))}
        <Button
          type="primary"
          onClick={handleConfirm}
          loading={loading}
          style={{ marginLeft: '16px', height: '60px' }}
        >
          Conferma
        </Button>
      </div>

      {/* Modal with Table */}
      <Modal
        title={`Scanned Shelf: Area ${shelfInfo.area}, Scaffale ${shelfInfo.scaffale}, Colonna ${shelfInfo.colonna}, Piano ${shelfInfo.piano}`}
        visible={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsModalOpen(false)}>
            Cancel
          </Button>,
          <Button
            key="transfer"
            type="primary"
            disabled={selectedPackages.length === 0}
            onClick={openWarehouseMap}
          >
            Transfer
          </Button>,
        ]}
        width={800}
      >
        <Table
          dataSource={tableData}
          columns={columns}
          rowKey="id_mov"
          pagination={false}
        />
        {/* Display Total Volume in the Modal */}
        <div style={{ marginTop: '16px', textAlign: 'right' }}>
          <strong>Total Volume:</strong> {totalVolume} m³
        </div>
      </Modal>

      <Modal
        title="Select Destination Shelf"
        visible={isWarehouseMapOpen}
        onCancel={() => setIsWarehouseMapOpen(false)}
        footer={null}
        width="80%"
      >
        {/* Warehouse Map Content */}
        <div style={{ maxHeight: '90%', overflowY: 'auto' }}>
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
    </div>
  );
};

export default App;
