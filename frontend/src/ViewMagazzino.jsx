import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { message, Modal, Button, Spin, Pagination } from 'antd'; // Import Spin for loading spinner
import './ViewMagazzino.css';
import { LoadingOutlined, UpOutlined, DownOutlined } from '@ant-design/icons';
import WarehouseGrid from './GridComponent';
import WarehouseGridSystem from './WarehouseGridSystem';

const generateShelfNames = (group, columns, rows) => {
  const shelves = [];
  for (let row = rows; row >= 1; row--) {
    for (let col = 1; col <= columns; col++) {
      const colFormatted = col.toString().padStart(2, '0');
      shelves.push(`${group}-${colFormatted}-${row}`);
    }
  }
  return shelves;
};

const ViewMagazzino = ({
  articoloCode,
  descrizioneArticolo,
  fornitoreCode,
  ragioneSocialeFornitore,
  movimentoCode,
  quantita,
  totalePacchi,
  dimensione,
  onClose,
  selectedItems,

  onComplete
}) => {
  const [highlightedShelf, setHighlightedShelf] = useState('');
  const [shelvesData, setShelvesData] = useState([]);
  const [debug, setDebug] = useState({});
  const [loading, setLoading] = useState(true); // State for loading spinner
  const inputRef = useRef(null);
  const [showHiddenInput, setShowHiddenInput] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedShelf, setSelectedShelf] = useState(null);
  const [occupiedShelves, setOccupiedShelves] = useState(new Set());
  const [depositedArticoli, setDepositedArticoli] = useState(new Set());

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
        },
        {
            id: 'M',
            startRow: 18,
            startCol: 6,
            width: 2,
            height: 1,
            startingValue: 40,
            startingFloor: 0,
            spanCol: 2,
            shelfPattern: 'regular'
        }, {
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
            customText: '↓ PRODUZIONE ↓',
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
            startRow: 11,
            startCol: 0,
            width: 10,
            height: 5,
            shelfPattern: 'regular',
            spanCol: 2
        },
        {
            id: 'M',
            startRow: 11,
            startCol: 10,
            width: 2,
            height: 5,
            shelfPattern: 'regular',
            spanCol: 2,
            spanRow: 5,
            startingValue: 32,
            startingFloor: -4,
        },
        {
            id: 'E',
            startRow: 11,
            startCol: 12,
            width: 4,
            height: 5,
            shelfPattern: 'regular',
            spanCol: 2,
            startingValue: 7,
        },
        {
            id: 'R',
            startRow: 3,
            startCol: 9,
            width: 2,
            height: 2,
            startingValue: 1,
            shelfPattern: 'horizontal',
            startingFloor: 1,
            rotateText: true,
            spanRow: 2
        },
        {
            id: 'R',
            startRow: 3,
            startCol: 11,
            width: 3,
            height: 2,
            startingValue: 1,
            shelfPattern: 'horizontal',
            startingFloor: 0,
            rotateText: true,

            startingValue: 2,
            spanRow: 2,
            borderBottom: false,

            borderLeft: false,
            showText: false,
            spanCol: 3
        },
        {
            id: 'R',
            startRow: 5,
            startCol: 9,
            width: 5,
            height: 4,
            startingValue: 2,
            borderTop: false,

            shelfPattern: 'horizontal',
            startingFloor: 0,
            rotateText: true,
            spanRow: 4,
            spanCol: 5
        },

        {
            id: 'M',
            startRow: 2,
            startCol: 18,
            width: 2,
            height: 11,
            startingFloor: -10,
            startingValue: 48,
            spanRow: 11,
            spanCol: 2,
            shelfPattern: 'regular'
        },
        {
            id: 'M',
            startRow: 3,
            startCol: 14,
            width: 2,
            height: 6,
            startingFloor: -5,
            startingValue: 97,
            spanRow: 6,
            spanCol: 2,
            shelfPattern: 'regular',
        },
        {
            id: 'TEXT2',
            type: 'customText',
            customText: '↓ UFFICI ↓',
            rotateText: false,
            startRow: 15,
            startCol: 16,
            width: 2,
            spanCol: 2,
            height: 1,
        },
        {
            id: 'TEXT3',
            type: 'customText',
            customText: 'POS. DOMENICO',
            rotateText: false,
            startRow: 0,
            startCol: 0,
            width: 2,
            spanCol: 2,
            height: 1,
        },
        {
            id: 'TEXT8',
            type: 'customText',
            customText: '↑ MAGAZZINO ↑',
            rotateText: false,
            startRow: 0,
            startCol: 2,
            width: 2,
            spanCol: 2,
            height: 1,
        },
        {
            id: 'TEXT9',
            type: 'customText',
            customText: 'PRODUZIONE',
            rotateText: false,
            startRow: 2,
            startCol: 0,
            width: 3,
            spanCol: 3,
            height: 8,
            spanRow: 8,
        },
        {
            id: 'TEXT4',
            type: 'customText',
            customText: '↑ MAGAZZINO ↑',
            rotateText: false,
            startRow: 0,
            startCol: 16,
            width: 2,
            spanCol: 2,
            height: 1,
        }
    ]
};
  
  const getShelfStatus = (shelfId) => {
    if (shelfId === selectedShelf) return 'selected';
    if (occupiedShelves.has(shelfId)) return 'full';
    return 'available';
  };
  const [quantitaPerPacco, setQuantitaPerPacco] = useState(0);
  const [volumes, setVolumes] = useState([]);
  const [totalVolumeRequired, setTotalVolumeRequired] = useState(0);
  const [totalVolume, setTotalVolume] = useState(0);
  const [selectedArea, setSelectedArea] = useState('A');
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
GRID_ROWS = {16}
GRID_COLS = {22}
warehouseLayout={layouts[2]}
onCellClick={handleShelfClick}
getShelfStatus={getShelfStatus}
tooltipContent={getTooltipContent}

/>
</div>)}
};

  // Fetch volumes on component mount
  useEffect(() => {
    const fetchVolumes = async () => {
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/dimensioni`);
        setVolumes(response.data);
      } catch (error) {
        console.error('Error details:', error);
      }
    };

    fetchVolumes();
  }, []);

  // Calculate the total volume based on dimensione and quantitaPerPacco
  useEffect(() => {
    if (volumes.length > 0 && dimensione) {
      const dimensioneData = volumes.find(vol => vol.dimensione === dimensione);
      if (dimensioneData) {
        const calculatedVolume = dimensioneData.volume * totalePacchi;
        setTotalVolumeRequired(calculatedVolume);
        setTotalVolume(calculatedVolume);
      } else {
        console.error(`No matching volume found for dimensione: ${dimensione}`);
      }
    }
  }, [volumes, dimensione, totalePacchi]);

  // Fetch shelves data
  useEffect(() => {
    const fetchShelvesData = async () => {
      setLoading(true); // Start loading
      try {
        const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/shelves`);
        setShelvesData(response.data);
        console.log('Fetched shelves data:', response.data);
      } catch (error) {
        console.error('Error fetching shelves data:', error);
      } finally {
        setLoading(false); // Stop loading
      }
    };

    fetchShelvesData();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (inputRef.current && !inputRef.current.contains(event.target)) {
        inputRef.current.focus();
      }
    };

    document.addEventListener('click', handleClickOutside);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);
const postMultipleShelfData = async (data) => {
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/api/conferma-inserimento-multiplo`, data);
      message.success('Articoli salvati con successo!');
      // Pass all articoloCodes at once instead of calling onComplete multiple times
      const depositedArticoloCodes = selectedItems.map(item => item.articoloCode);
      onComplete && onComplete(depositedArticoloCodes);
    } catch (error) {
      console.error('Error posting shelf data:', error);
      message.error('Errore nel salvataggio dei dati.');
    }
  };
  const postShelfData = async (data) => {
    try {
      await axios.post(`${process.env.REACT_APP_API_URL}/api/conferma-inserimento`, data);
      message.success('Dati salvati con successo!');
      setDepositedArticoli(prev => new Set([...prev, data.codice_articolo]));
      onComplete && onComplete(data.codice_articolo);
    } catch (error) {
      console.error('Error posting shelf data:', error);
      message.error('Errore nel salvataggio dei dati.');
    }
  };
  const handleBarcodeScan = (event) => {
    if (event.key === 'Enter') {
      const scannedValue = event.target.value.trim();
      const [area, scaffale, colonna, piano] = scannedValue.split('-');
      const shelfData = shelvesData.find(s =>
        s.area === area &&
        s.scaffale === scaffale &&
        s.colonna === colonna &&
        s.piano === piano.toString()
      );

      if (!shelfData) {
        message.error(`Scaffale scansionato non presente nel database: ${scannedValue}`);
        event.target.value = '';
        return;
      }

      const hasEnoughSpace = (shelfData.volume_libero - totalVolumeRequired) > 0;

      if (!hasEnoughSpace) {
        message.error(`Lo scaffale ${scannedValue} risulta pieno.`);
        event.target.value = '';
        return;
      }
      setHighlightedShelf(scannedValue);

      const confirmPlacement = () => {
        // Group items by articoloCode and keep original items
        const groupedItems = selectedItems.reduce((acc, item) => {
          const existingGroup = acc.find(g => g.articoloCode === item.articoloCode);
          if (existingGroup) {
            existingGroup.quantita += item.quantita;
            existingGroup.items.push(item);
          } else {
            acc.push({
              articoloCode: item.articoloCode,
              descrizioneArticolo: item.descrizioneArticolo,
              quantita: item.quantita,
              items: [item],
              isExpanded: false
            });
          }
          return acc;
        }, []);
  
        const GroupedItemDisplay = ({ item, index }) => {
          const [isExpanded, setIsExpanded] = useState(false);
  
          return (
            <li key={index} style={{
              padding: '8px',
              borderBottom: '1px solid #f0f0f0',
              marginBottom: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>Articolo:</strong> {item.descrizioneArticolo || item.articoloCode}
                 
                  <strong> - Quantità totale:</strong> {item.quantita}
                </div>
                {item.items.length > 1 && (
                  <Button 
                    type="text" 
                    icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
                    onClick={() => setIsExpanded(!isExpanded)}
                    size="small"
                  />
                )}
              </div>
              
              {isExpanded && item.items.length > 1 && (
                <div style={{ 
                  marginTop: '8px', 
                  paddingLeft: '16px', 
                  borderLeft: '2px solid #f0f0f0'
                }}>
                  {item.items.map((subItem, subIndex) => (
                    <div key={subIndex} style={{ 
                      padding: '4px 0',
                      fontSize: '0.9em',
                      color: '#666'
                    }}>
                      <strong>Quantità:</strong> {subItem.quantita}
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        };
  
        Modal.confirm({
          title: `Confermi immagazzinamento della merce in posizione: ${scannedValue}?`,
          content: (
            <div>
              {selectedItems.length > 1 ? (
                <>
                  <p><strong>Articoli da depositare:</strong></p>
                  <ul style={{ 
                    maxHeight: '300px', 
                    listStyle: 'none',
                    padding: 0
                  }}>
                    {groupedItems.map((item, index) => (
                      <GroupedItemDisplay key={index} item={item} index={index} />
                    ))}
                  </ul>
                </>
              ) : (
                <>
                  <p><strong>Articolo:</strong> {descrizioneArticolo} ({articoloCode})</p>
                  <p><strong>Quantità:</strong> {quantita}</p>
                </>
              )}
              <p><strong>Scaffale rilevato:</strong> {scannedValue}</p>
            </div>
          ),
          okText: 'Immagazzina',
          cancelText: 'Cancella',
          width: 500,
          okButtonProps: {
            type: 'primary',
          },
          onOk: () => {
            // Keep existing onOk logic
            if (selectedItems.length > 1) {
              const postData = {
                area: scannedValue.split('-')[0],
                scaffale: scannedValue.split('-')[1],
                colonna: scannedValue.split('-')[2],
                piano: scannedValue.split('-')[3],
                items: selectedItems.map(item => ({
                  ...item,
                  movimentoCode,
                  dimensioni: "Zero"
                }))
              };
              postMultipleShelfData(postData);
            } else {
              const postData = {
                area: scannedValue.split('-')[0],
                scaffale: scannedValue.split('-')[1],
                colonna: scannedValue.split('-')[2],
                piano: scannedValue.split('-')[3],
                codice_articolo: articoloCode,
                codice_movimento: movimentoCode,
                codice_fornitore: fornitoreCode,
                quantita: quantita,
                dimensioni: "Zero",
                numero_pacchi: 1,
                volume: totalVolume
              };
              postShelfData(postData);
            }
            event.target.value = '';
          },
          onCancel: () => {
            setHighlightedShelf('');
            event.target.value = '';
          },
        });
      };
  
      confirmPlacement();
    }
  };

  const simulateBarcodeScan = (barcode) => {
    const simulatedEvent = {
      key: 'Enter', // Simulate the Enter key press
      target: {
        value: barcode, // Set the scanned barcode value
      },
    };
  
    handleBarcodeScan(simulatedEvent);
  };
  
  const handleShelfClick = (shelf) => {
    setHighlightedShelf(shelf);
    console.log(shelf)
    simulateBarcodeScan(`A-${shelf}`)
    
  };

  const getTooltipContent = useCallback((shelf) => {
  }, [debug]);
  return (
    <div className="view-magazzino">
      {loading ? (
        <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
      ) : (
        <div className="view-magazzino">
          <input
            ref={inputRef}
            type="text"
            className="hidden-input"
            onKeyDown={handleBarcodeScan}
            autoFocus
            inputMode="none"
          />
          <div className="grid-container">
            {renderWarehouseSection()}
          </div>
          <div className="pagination-container">
            <Pagination
              current={currentPage}
              total={2}
              pageSize={1}
              onChange={(page) => setCurrentPage(page)}
              showSizeChanger={false}
              simple
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewMagazzino;