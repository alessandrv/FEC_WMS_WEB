import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Tabs, Typography, Button, message, Modal, notification, Table, Tooltip, Tag, InputNumber, Row, Space, Col, Spin, Pagination, Card, Form, Alert } from 'antd';
import axios from 'axios';
import { InfoCircleOutlined, CloseCircleOutlined, FullscreenOutlined } from '@ant-design/icons';

import WarehouseGrid from './GridComponent';
import './App.css'; // Make sure to import your CSS
import WarehouseGridSystem from './WarehouseGridSystem';
import { LoadingOutlined } from '@ant-design/icons';
import ViewMagazzino from './ViewMagazzino';
const { Text } = Typography;
const App = () => {
  const [activeTab, setActiveTab] = useState('1');

  const [otp, setOtp] = useState(['', '', '', '']);
  const inputRefs = [useRef(), useRef(), useRef(), useRef()];
  const articoloRef = useRef(null);
  const fornitoreRef = useRef(null);
  const [articoloCode, setArticoloCode] = useState('');
  const [fornitoreCode, setFornitoreCode] = useState('');
  const [movimentoCode, setMovimentoCode] = useState('');
  const [transferQuantity, setTransferQuantity] = useState(1);
  const [reservedQuantities, setReservedQuantities] = useState({}); // Format: { 'articleCode-location': quantity }
  const [magazziniArticles, setMagazziniArticles] = useState([]);
  const [magazziniLoading, setMagazziniLoading] = useState(false);
  const [articleLocations, setArticleLocations] = useState({});
  const [locationChangeModalVisible, setLocationChangeModalVisible] = useState(false);
  const [changeLocationQuantityModalVisible, setChangeLocationQuantityModalVisible] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedQuantity, setSelectedQuantity] = useState(0);
  const [maxAvailableQuantity, setMaxAvailableQuantity] = useState(0);
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [articleFilter, setArticleFilter] = useState('');
  const [locationData, setLocationData] = useState([]); // Renamed from dataSource
  const [highlightedRows] = useState(new Set());
  const [isTransferConfirmationOpen, setIsTransferConfirmationOpen] = useState(false);
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
  const [movimentoInput, setMovimentoInput] = useState('');
  const [articoliMovimento, setArticoliMovimento] = useState([]);
  const [loadingArticoli, setLoadingArticoli] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [depositedArticoli, setDepositedArticoli] = useState([]);
  const [movimentoTransfer, setMovimentoTransfer] = useState('');
  const [locationOTP, setLocationOTP] = useState(['', '', '', '']);
  const [locationItems, setLocationItems] = useState([]);
  const [loadingLocationItems, setLoadingLocationItems] = useState(false);
  const [selectedLocationRows, setSelectedLocationRows] = useState([]);
  const [isLocationWarehouseMapOpen, setIsLocationWarehouseMapOpen] = useState(false);
  const [locationPartialQuantity, setLocationPartialQuantity] = useState(0);
  const [showMultiplePartialDepositModal, setShowMultiplePartialDepositModal] = useState(false);
  const [multiplePartialQuantity, setMultiplePartialQuantity] = useState(0);
  const [volumes, setVolumes] = useState([]);
  const [totalVolume, setTotalVolume] = useState(0);
  const [selectedLayout, setSelectedLayout] = useState('simple');
  const [selectedShelf, setSelectedShelf] = useState(null);
  const [occupiedShelves, setOccupiedShelves] = useState(new Set());
  const [partialDepositArticle, setPartialDepositArticle] = useState(null);
  const [partialDepositQuantity, setPartialDepositQuantity] = useState(0);
  const [showPartialDepositModal, setShowPartialDepositModal] = useState(false);
  const [transferConfirmationVisible, setTransferConfirmationVisible] = useState(false);
  const [pendingTransferData, setPendingTransferData] = useState(null);
  const [partialQuantity, setPartialQuantity] = useState(0);
  const [selectedTransferItems, setSelectedTransferItems] = useState([]);


  const handleLocationChangeMagazzini = (location) => {
    if (!selectedRowId) {
      notification.error({
        message: 'Nessuna riga selezionata',
        placement: 'bottomRight',
        duration: 5,
      });
      return;
    }
  
    const selectedArticle = magazziniArticles.find(article => article.id === selectedRowId);
    if (!selectedArticle) {
      notification.error({
        message: 'Articolo non trovato',
        placement: 'bottomRight',
        duration: 5,
      });
      return;
    }
  
    // Make sure we're using the correct properties from the location object
    const locationData = {
      area: location.area,
      scaffale: location.scaffale,
      colonna: location.colonna,
      piano: location.piano,
      qta: location.qta || location.totalQta // Handle both possible property names
    };
  
    setSelectedLocation(locationData);
    setMaxAvailableQuantity(parseFloat(locationData.qta));
    setSelectedQuantity(Math.min(parseFloat(locationData.qta), parseFloat(selectedArticle.gim_qmov)));
    setChangeLocationQuantityModalVisible(true);
    setLocationChangeModalVisible(false);
  };

  const fetchLocations = async (articleCode) => {
    try {
      setLoading(true);
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-items`, {
        params: {
          articleFilter: articleCode
        },
      });
  
      if (response.data && response.data.items) {
        setLocationData(response.data.items);
      } else {
        setLocationData([]);
      }
    } catch (error) {
      console.error('Error fetching locations:', error);
      notification.error({
        message: 'Errore nel caricamento delle locazioni',
        placement: 'bottomRight',
        duration: 5,
      });
    } finally {
      setLoading(false);
    }
  };
  
  const groupLocations = (subItems, articleCode) => {
    if (!subItems) return [];
    
    const groupedMap = new Map();
  
    subItems.forEach(item => {
      const key = `${item.area}-${item.scaffale}-${item.colonna}-${item.piano}`;
      
      if (groupedMap.has(key)) {
        const existing = groupedMap.get(key);
        groupedMap.set(key, {
          ...existing,
          qta: parseInt(existing.qta || 0) + parseInt(item.qta || 0)
        });
      } else {
        groupedMap.set(key, {
          area: item.area,
          scaffale: item.scaffale,
          colonna: item.colonna,
          piano: item.piano,
          qta: parseInt(item.qta || 0),
          key
        });
      }
    });
  
    // Calculate available quantities considering reservations per article
    const locations = Array.from(groupedMap.values()).map(location => {
      const locationKey = `${articleCode}-${location.area}-${location.scaffale}-${location.colonna}-${location.piano}`;
      const reservedQty = reservedQuantities[locationKey] || 0;
      const availableQty = Math.max(0, location.qta - reservedQty);
      
      return {
        ...location,
        totalQta: location.qta,
        qta: availableQty,
        reserved: reservedQty
      };
    });
  
    return locations.sort((a, b) => {
      const locA = `${a.area}-${a.scaffale}-${a.colonna}-${a.piano}`;
      const locB = `${b.area}-${b.scaffale}-${b.colonna}-${b.piano}`;
      return locA.localeCompare(locB);
    });
  };
  
  const locationColumns = [
    {
      title: 'Posizione',
      key: 'location',
      width: '60%',
      render: (_, record) => `${record.area}-${record.scaffale}-${record.colonna}-${record.piano}`,
      sorter: (a, b) => {
        const locA = `${a.area}-${a.scaffale}-${a.colonna}-${a.piano}`;
        const locB = `${b.area}-${b.scaffale}-${b.colonna}-${b.piano}`;
        return locA.localeCompare(locB);
      }
    },
    {
      title: 'Quantità',
      key: 'qta',
      width: '20%',
      render: (_, record) => (
        <span>
          {record.qta}/{record.totalQta}
          {record.reserved > 0 && (
            <Tag color="orange" style={{ marginLeft: 8 }}>
              {record.reserved} riservati
            </Tag>
          )}
        </span>
      )
    },
    {
      title: 'Azioni',
      key: 'actions',
      width: '20%',
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          onClick={() => handleLocationChangeMagazzini(record)}
          disabled={record.qta === 0}
        >
          Seleziona
        </Button>
      ),
    }
  ];


  const handleChangeLocationQuantityModalClose = () => {
    setChangeLocationQuantityModalVisible(false);
    setSelectedLocation(null);
    setSelectedQuantity(0);
  };
  const handleLocationQuantityChange = () => {
    try {
      let updatedTableData = [...magazziniArticles];
      const rowToUpdate = updatedTableData.find(row => row.id === selectedRowId);
      const locationKey = `${selectedLocation.area}-${selectedLocation.scaffale}-${selectedLocation.colonna}-${selectedLocation.piano}`;
  
      const isFullQuantity = parseInt(selectedQuantity, 10) === parseInt(rowToUpdate.gim_qmov, 10);
  
      if (isFullQuantity) {
        // Full quantity move logic
        if (rowToUpdate.location) {
          const oldLocationKey = `${rowToUpdate.location.area}-${rowToUpdate.location.scaffale}-${rowToUpdate.location.colonna}-${rowToUpdate.location.piano}`;
          setReservedQuantities(prev => ({
            ...prev,
            [oldLocationKey]: Math.max(0, (prev[oldLocationKey] || 0) - (rowToUpdate.reservedQuantity || 0))
          }));
        }
  
        const existingRows = updatedTableData.filter(row => 
          row.location && 
          row.gim_arti === rowToUpdate.gim_arti &&
          row.location.area === selectedLocation.area &&
          row.location.scaffale === selectedLocation.scaffale &&
          row.location.colonna === selectedLocation.colonna &&
          row.location.piano === selectedLocation.piano &&
          row.id !== rowToUpdate.id
        );
  
        if (existingRows.length > 0) {
          // Free up reserved quantities for all rows being merged
          existingRows.forEach(row => {
            const rowLocationKey = `${row.location.area}-${row.location.scaffale}-${row.location.colonna}-${row.location.piano}`;
            setReservedQuantities(prev => ({
              ...prev,
              [rowLocationKey]: Math.max(0, (prev[rowLocationKey] || 0) - (row.reservedQuantity || 0))
            }));
          });
  
          // Merge with existing rows
          const existingRowIndex = updatedTableData.indexOf(existingRows[0]);
          const totalQuantity = existingRows.reduce((sum, row) =>
            sum + parseInt(row.gim_qmov, 10), 0) + parseInt(selectedQuantity, 10);
  
          updatedTableData[existingRowIndex] = {
            ...existingRows[0],
            gim_qmov: totalQuantity,
            reservedQuantity: totalQuantity
          };
  
          // Remove other rows
          const rowsToRemove = new Set([
            ...existingRows.slice(1).map(row => row.id),
            rowToUpdate.id
          ]);
          updatedTableData = updatedTableData.filter(row => !rowsToRemove.has(row.id));
  
          // Update reserved quantities for the merged location
          setReservedQuantities(prev => ({
            ...prev,
            [locationKey]: totalQuantity
          }));
        } else {
          // Just update location
          const rowIndex = updatedTableData.indexOf(rowToUpdate);
          updatedTableData[rowIndex] = {
            ...rowToUpdate,
            location: selectedLocation,
            reservedQuantity: parseInt(selectedQuantity, 10)
          };
  
          // Update reserved quantities
          setReservedQuantities(prev => ({
            ...prev,
            [locationKey]: (prev[locationKey] || 0) + parseInt(selectedQuantity, 10)
          }));
        }
      } else {
        // Partial quantity move logic
        const remainingQuantity = parseInt(rowToUpdate.gim_qmov, 10) - parseInt(selectedQuantity, 10);
        const rowIndex = updatedTableData.indexOf(rowToUpdate);
  
        if (rowToUpdate.location) {
          // If the row already had a location, update its reserved quantity
          const oldLocationKey = `${rowToUpdate.location.area}-${rowToUpdate.location.scaffale}-${rowToUpdate.location.colonna}-${rowToUpdate.location.piano}`;
          
          if (oldLocationKey === locationKey) {
            // If selecting the same location, don't modify reserved quantities
            // They will be updated at the end
          } else {
            // If selecting a different location, reduce the reserved quantity by the amount being moved
            setReservedQuantities(prev => ({
              ...prev,
              [oldLocationKey]: Math.max(0, (prev[oldLocationKey] || 0) - parseInt(selectedQuantity, 10))
            }));
          }
        }
        
        // Update original row with remaining quantity
        updatedTableData[rowIndex] = {
          ...rowToUpdate,
          gim_qmov: remainingQuantity,
          reservedQuantity: remainingQuantity
        };
  
        // Check for existing rows with same location
        const existingRows = updatedTableData.filter(row => 
          row.location && 
          row.gim_arti === rowToUpdate.gim_arti &&
          row.location.area === selectedLocation.area &&
          row.location.scaffale === selectedLocation.scaffale &&
          row.location.colonna === selectedLocation.colonna &&
          row.location.piano === selectedLocation.piano &&
          row.id !== rowToUpdate.id
        );
  
        if (existingRows.length > 0) {
          // Add to existing row
          const existingRowIndex = updatedTableData.indexOf(existingRows[0]);
          const totalQuantity = existingRows.reduce((sum, row) =>
            sum + parseInt(row.gim_qmov, 10), 0) + parseInt(selectedQuantity, 10);
  
          updatedTableData[existingRowIndex] = {
            ...existingRows[0],
            gim_qmov: totalQuantity,
            reservedQuantity: totalQuantity
          };
  
          // Remove other existing rows
          const rowsToRemove = new Set(existingRows.slice(1).map(row => row.id));
          updatedTableData = updatedTableData.filter(row => !rowsToRemove.has(row.id));
  
          // Update reserved quantities for the merged location
          setReservedQuantities(prev => ({
            ...prev,
            [locationKey]: (prev[locationKey] || 0) + parseInt(selectedQuantity, 10)
          }));
        } else {
          // Create new row
          const newRow = {
            ...rowToUpdate,
            id: generateUUID(),
            gim_qmov: parseInt(selectedQuantity, 10),
            location: selectedLocation,
            reservedQuantity: parseInt(selectedQuantity, 10)
          };
          updatedTableData.splice(rowIndex + 1, 0, newRow);
  
          // Update reserved quantities
          setReservedQuantities(prev => ({
            ...prev,
            [locationKey]: (prev[locationKey] || 0) + parseInt(selectedQuantity, 10)
          }));
        }
      }
  
      setMagazziniArticles(updatedTableData);
      
      notification.success({
        message: 'Successo',
        description: 'Posizione aggiornata con successo',
        placement: 'bottomRight',
        duration: 5,
      });
  
      handleChangeLocationQuantityModalClose();
      handleLocationChangeModalClose();
    } catch (error) {
      console.error('Error updating location:', error);
      notification.error({
        message: 'Errore',
        description: 'Errore durante l\'aggiornamento della posizione.',
        placement: 'bottomRight',
        duration: 5,
      });
    }
  };
  const handleLocationChangeModalClose = () => {
    setLocationChangeModalVisible(false);
    setChangeLocationQuantityModalVisible(false);
  };

  

// Add handler for warehouse map selection
const handleMagazziniTransferComplete = (destLocation) => {
  setHighlightedShelf(destLocation);
  setIsLocationWarehouseMapOpen(false);
  
  const [scaffaleDest, colonnaDest, pianoDest] = destLocation.split('-');
  const areaDest = 'A';

  // Create the transfer data structure
  const transferItems = selectedTransferItems.map(item => ({
    articolo: item.gim_arti,
    quantity: transferQuantity,
    source: `${item.location.area}-${item.location.scaffale}-${item.location.colonna}-${item.location.piano}`,
    destination: `${areaDest}-${scaffaleDest}-${colonnaDest}-${pianoDest}`,
    fornitore: item.gim_forn || ''
  }));

  setPendingTransferData({
    destLocation: {
      areaDest,
      scaffaleDest,
      colonnaDest,
      pianoDest
    },
    items: transferItems,
    sourceLocations: selectedTransferItems.map(item => item.location)
  });

  setTransferConfirmationVisible(true);
};

// Add the transfer confirmation modal


  const handleMagazziniSearch = async (movimentoCode) => {
  setReservedQuantities({});
    setMagazziniLoading(true);
    try {
      // First fetch articles for the movimento
      const movimentoResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-articoli-movimento`, {
        params: { movimento: movimentoCode }
      });
  
      if (!movimentoResponse.data || !Array.isArray(movimentoResponse.data)) {
        throw new Error('Invalid API response format');
      }
  
      const articles = movimentoResponse.data.map(item => ({
        id: generateUUID(),
        gim_arti: item.gim_arti || '',
        gim_desc: item.gim_desc || '',
        gim_des2: item.gim_des2 || '',
        gim_qmov: item.gim_qmov || 0
      }));
  
      setMagazziniArticles(articles);
  
      // Then fetch locations for each article
      const locationsMap = {};
    
  
      setArticleLocations(locationsMap);
    } catch (error) {
      console.error('Error fetching movimento articles:', error);
      notification.error({
        message: 'Errore durante la ricerca',
        description: 'Riprova.',
        placement: 'bottomRight',
        duration: 5,
      });
    } finally {
      setMagazziniLoading(false);
    }
  };
  const magazziniColumns = [
    {
      title: 'Codice Articolo',
      dataIndex: 'gim_arti',
      key: 'gim_arti',
    },
    {
      title: 'Descrizione',
      dataIndex: 'gim_desc',
      key: 'gim_desc',
    },
    {
      title: 'Quantità',
      dataIndex: 'gim_qmov',
      key: 'gim_qmov',
      render: (text) => parseInt(text, 10) // Convert to integer
    },
    {
      title: 'Posizione',
      key: 'location',
      render: (_, record) => (
        <Tag 
          color={record.location ? 'geekblue' : 'red'} 
          style={{ 
            cursor: record.transferred ? 'not-allowed' : 'pointer',
            opacity: record.transferred ? 0.6 : 1
          }}
          onClick={() => !record.transferred && handleLocationChangeModalVisible(record.gim_arti, record.id)}
        >
          {record.location ? (
            <Space>
              {`${record.location.area}-${record.location.scaffale}-${record.location.colonna}-${record.location.piano}`}
              {!record.transferred && (
                <CloseCircleOutlined 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveLocation(record);
                  }}
                />
              )}
            </Space>
          ) : record.transferred ? 'Trasferito' : 'Seleziona Posizione'}
        </Tag>
      ),
    }
  ];
  
  // Update the handleRemoveLocation function
const handleRemoveLocation = (record) => {
  // First, uncheck the row by removing it from selectedRows
  setSelectedRows(prev => prev.filter(id => id !== record.id));
  setSelectedTransferItems(prev => prev.filter(item => item.id !== record.id));

  // Find any unselected row with the same article that doesn't have a location
  const unselectedMatch = magazziniArticles.find(item => 
    item.gim_arti === record.gim_arti && 
    !item.location && 
    !selectedRows.includes(item.id)
  );

  // Update the articles list
  setMagazziniArticles(prev => {
    const updatedArticles = prev.map(item => {
      if (item.id === record.id) {
        // Remove location from current record
        return { ...item, location: null };
      }
      if (unselectedMatch && item.id === unselectedMatch.id) {
        // If there's an unselected match, merge the quantities
        return { 
          ...item, 
          gim_qmov: item.gim_qmov + record.gim_qmov 
        };
      }
      return item;
    });

    // If we found a match to merge with, remove the original record
    if (unselectedMatch) {
      return updatedArticles.filter(item => item.id !== record.id);
    }

    return updatedArticles;
  });
};
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
  
  const checkSelectedRowsQuantity = () => {
    if (selectedRows.length < 1) return false;
    
    const selectedItems = selectedRows.map(id => 
      articoliMovimento.find(item => item.id === id)
    );
    
    const firstQuantity = selectedItems[0]?.gim_qmov;
    return selectedItems.every(item => item?.gim_qmov === firstQuantity);
  };
  

  
  const handleShelfClick = (shelf) => {
    setHighlightedShelf(shelf);

    console.log(shelf)
    setIsWarehouseMapOpen(false);
    
    setIsTransferConfirmationOpen(true);
  };

// Update the handleShelfClickSelection function to work with both tabs
const handleShelfClickSelection = (shelf) => {
  setHighlightedShelf(shelf);
  
  // Parse the shelf string (format: "C-01-1")
  const [scaffale, colonna, piano] = shelf.split('-');
  
  // Set values based on which tab is active
  if (activeTab === '1') {
    setOtp(['A', scaffale, colonna, piano]);
  } else if (activeTab === '2') {
    setLocationOTP(['A', scaffale, colonna, piano]);
  }
  
  setIsWarehouseMapOpen(false);
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
const handlePageChange = (page) => {
  setCurrentPage(page);
};
const handleMovimentoInputConfirm = async () => {
  if (!movimentoInput) {
    notification.error({
      message: 'Inserisci un codice movimento',
      placement: 'bottomRight',
      duration: 5,
    });
    return;
  }
  setSelectedRows([]);
  setLoadingArticoli(true);
  try {
    const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-articoli-movimento`, {
      params: { movimento: movimentoInput }
    });
    
    if (!response.data || !Array.isArray(response.data)) {
      throw new Error('Formato risposta API non valido');
    }

    const articoliMovimento = response.data.map(item => ({
      id: generateUUID(),
      gim_arti: item.gim_arti || '',
      gim_desc: item.gim_desc || '',
      gim_des2: item.gim_des2 || '',
      gim_qmov: item.gim_qmov || 0
    }));
    
    setArticoliMovimento(articoliMovimento);
  } catch (error) {
    console.error('Errore dettagliato:', error);
    notification.error({
      message: `Errore nel caricamento: ${error.response?.data?.error || error.message}`,
      placement: 'bottomRight',
      duration: 5,
    });
  } finally {
    setLoadingArticoli(false);
  }
};
const handleTransfer = async (quantity) => {
  setLoading(true);
  try {
    const payload = {
      area: shelfInfo.area,
      scaffale: shelfInfo.scaffale,
      colonna: shelfInfo.colonna,
      piano: shelfInfo.piano,
      articolo: articoloCode,
      quantity: quantity,
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
    notification.success({
      message: 'Trasferimento avviato con successo',
      placement: 'bottomRight',
      duration: 5,
    });
    setIsModalOpen(false);
  } catch (error) {
    notification.error({
      message: 'Errore durante il trasferimento',
      placement: 'bottomRight',
      duration: 5,
    });
    console.error('Error:', error);
  } finally {
    setLoading(false);
  }
};

const renderWarehouseSection2 = () => {
  if (currentPage === 1) {
      return (
  <div> <WarehouseGridSystem
  warehouseLayout={layouts[currentPage]}
  GRID_ROWS={30}
  GRID_COLS={9}
  onCellClick={handleLocationTransferComplete}

 
  getShelfStatus={(cell) => {
    if (!cell) return 'available';
    return 'available';
  }}
  tooltipContent={getTooltipContent}
  currentPage={1}
  onPageChange={() => {}}
/>
</div>)}
else if (currentPage === 2) {
    return (
<div>
<WarehouseGridSystem
          warehouseLayout={layouts[currentPage]}
          GRID_ROWS={16}
          GRID_COLS={22}
          onCellClick={handleLocationTransferComplete}

         
          getShelfStatus={(cell) => {
            if (!cell) return 'available';
            return 'available';
          }}
          tooltipContent={getTooltipContent}
          currentPage={1}
          onPageChange={() => {}}
        />
</div>)}
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
  GRID_ROWS={16}
  GRID_COLS={22}
warehouseLayout={layouts[2]}
onCellClick={handleShelfClick}
getShelfStatus={getShelfStatus}
tooltipContent={getTooltipContent}

/>
</div>)}
};




const renderWarehouseSectionSelection = () => {
  if (currentPage === 1) {
      return (
  <div>
  <WarehouseGridSystem
  warehouseLayout={layouts[1]}
  GRID_ROWS = {30}
  GRID_COLS = {9}
  onCellClick={handleShelfClickSelection}
  getShelfStatus={getShelfStatus}
  tooltipContent={getTooltipContent}

/>
</div>)}
else if (currentPage === 2) {
    return (
<div>
<WarehouseGridSystem
  GRID_ROWS={16}
  GRID_COLS={22}
warehouseLayout={layouts[2]}
onCellClick={handleShelfClickSelection}
getShelfStatus={getShelfStatus}
tooltipContent={getTooltipContent}

/>
</div>)}
};
const openWarehouseMapToSelect = () => {
  setIsWarehouseMapOpen(true);
};
const openWarehouseMap = () => {
  setIsLocationWarehouseMapOpen(true);
};

useEffect(() => {
  const fetchShelvesData = async () => {
    try {
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/shelves`);
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
  const [scaffale, colonna, piano] = shelf.split('-');
  const area = 'A';

  const shelfData = shelvesData.find(
    (s) =>
      s.area === area &&
      s.scaffale === scaffale &&
      s.colonna === colonna &&
      s.piano.toString() === piano
  );

  if (!shelfData) {
    return 'grid-item unavailable-shelf';
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

fornitore :fornitoreCode,
quantity : transferQuantity,
    });
    notification.success({
      message: 'Trasferimento completato con successo!',
      placement: 'bottomRight',
      duration: 5,
    });
    setIsTransferConfirmationOpen(false);
    setIsModalOpen(false)
    
  } catch (error) {
    console.error('Error confirming transfer:', error);
    notification.error({
      message: 'Errore nel trasferimento.',
      placement: 'bottomRight',
      duration: 5,
    });
  }
  
};
  
const getTooltipContent = (shelf) => {
  const shelfData = shelvesData.find((s) => s.shelfCode === shelf);
  return shelfData ? `Volume Libero: ${shelfData.volume_libero} m³` : 'N/A';
};

const performTransfer = async (destinationShelf) => {
  try {
    const startingShelfCode = `${shelfInfo.area}-${shelfInfo.scaffale}-${shelfInfo.colonna}-${shelfInfo.piano}`;
    
    const destinationShelfCode = `${shelfInfo.area}-${destinationShelf}`;
    
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
      })),
    };
    
    await axios.post(`${process.env.REACT_APP_API_URL}/api/transfer-packages`, transferData);
    
    notification.success({
      message: 'Transferimento avvenuto con successo!',
      placement: 'bottomRight',
      duration: 5,
    });
    
    setIsLocationWarehouseMapOpen(false);
    setIsModalOpen(false);
    setSelectedPackages([]);
    setTotalVolume(0);
  } catch (error) {
    console.error('Error performing transfer:', error);
    
    if (error.response && error.response.data && error.response.data.error) {
      notification.error({
        message: `Transferimento fallito: ${error.response.data.error}`,
        placement: 'bottomRight',
        duration: 5,
      });
    } else {
      notification.error({
        message: 'Transferimento fallito.',
        placement: 'bottomRight',
        duration: 5,
      });
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

const columns = [
  {
    title: 'Codice Articolo',
    dataIndex: 'gim_arti',
    key: 'gim_arti',
    render: (text) => text?.trim() || ''
  },
  {
    title: 'Descrizione',
    dataIndex: 'gim_desc',
    key: 'gim_desc',
    render: (text) => text?.trim() || ''
  },
  {
    title: 'Quantità',
    dataIndex: 'gim_qmov',
    key: 'gim_qmov',
    render: (text) => parseInt(text, 10) // Convert to integer

  }
];

const handleChange = (index, value) => {
  if (value === '-') return;

  const newOtp = [...otp];
  newOtp[index] = value.toUpperCase();
  setOtp(newOtp);

  console.log('Updated OTP:', newOtp);

  if (value && index < 3) {
    if (index === 2 && value.length < 2) return;
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
      notification.error({
        message: 'Inserisci la locazione completa.',
        placement: 'bottomRight',
        duration: 5,
      });
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
    
    handleConfirm();
    
    
  }
  
};
const handleKeyDownFornitore = ( e) => {

  if (e.key === 'Enter') {
    
      fornitoreRef.current.focus();
    
    
  }
};
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
  const emptyOtpFields = otp.filter(field => field.trim() === '');

  if (articoloCode.trim() === '') {
    notification.error({
      message: 'Codice Articolo è obbligatorio.',
      placement: 'bottomRight',
      duration: 5,
    });
    return false;
  }

  if (emptyOtpFields.length > 0) {
    notification.error({
      message: 'Compila tutti i campi di posizione.',
      placement: 'bottomRight',
      duration: 5,
    });
    return false;
  }

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
      `${process.env.REACT_APP_API_URL}/api/articoli-scaffale?area=${area}&scaffale=${scaffale}&colonna=${colonna}&piano=${piano}&articolo=${articoloCode}&fornitore=${fornitoreCode}`
    );

    if (!response.ok) {
      throw new Error('Network response was not ok');
    }

    const data = await response.json();

    const totalQuantity = data.reduce((sum, item) => sum + (item.qta || 0), 0);
  
    setShelfInfo({
      area,
      scaffale,
      colonna,
      piano,
      totalQuantity,
    });
    setIsModalOpen(true);
  } catch (error) {
    notification.error({
      message: 'Errore di connessione o di scansione',
      placement: 'bottomRight',
      duration: 5,
    });
    console.error('Error:', error);
  } finally {
    setLoading(false);
  }
};
  

const containerStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
};

const cardStyle = {
  width: '400px',
  padding: '20px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
};

const inputStyle = {
  width: '60px',
  textAlign: 'center',
};
 
useEffect(() => {
  if (inputRefs[0].current) {
  inputRefs[0].current.focus();
  }
}, []);

useEffect(() => {
  calculateTotalVolume();
}, [selectedPackages, calculateTotalVolume]);

const handleLocationChange = (index, value) => {
  const newLocationOTP = [...locationOTP];
  
  // Convert to uppercase for consistency
  newLocationOTP[index] = value.toUpperCase();
  setLocationOTP(newLocationOTP);

  // Auto-focus logic
  if (value.length === (index === 2 ? 2 : 1)) { // Colonna accepts 2 characters
    if (index < 3) { // If not the last input
      locationInputRefs[index + 1].current?.focus();
    }
  }
};

const handleLocationKeyDown = (index, e) => {
  if (e.key === 'Backspace' && !locationOTP[index] && index > 0) {
    locationInputRefs[index - 1].current?.focus();
  }
};

const handleMovimentoLocationSearch = async () => {
  const [area, scaffale, colonna, piano] = locationOTP;
  if (!movimentoTransfer || locationOTP.some(field => !field)) {
    notification.error({
      message: 'Compila tutti i campi del movimento e della posizione',
      placement: 'bottomRight',
      duration: 5,
    });
    return;
  }

  setLoadingLocationItems(true);
  try {
    const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/movimento-location-items`, {
      params: {
        movimento: movimentoTransfer,
        area,
        scaffale,
        colonna,
        piano
      }
    });
    
    const itemsWithIds = response.data.map(item => ({
      ...item,
      id: generateUUID(),
      originalId: item.id
    }));
    const groupedItems = response.data.reduce((acc, item) => {
      const existingGroup = acc.find(g => g.id_art === item.id_art);
      if (existingGroup) {
        existingGroup.qta += item.qta;
        existingGroup.originalItems.push(item);
      } else {
        acc.push({
          ...item,
          id: `${item.id_art}-${Date.now()}`, // Unique ID for the group
          qta: item.qta,
          originalItems: [item] // Store original items for transfer
        });
      }
      return acc;
    }, []);

    setLocationItems(groupedItems);
 
  } catch (error) {
    console.error('Search error:', error);
    notification.error({
      message: 'Errore nella ricerca',
      placement: 'bottomRight',
      duration: 5,
    });
  } finally {
    setLoadingLocationItems(false);
  }
};

const movimentoLocationColumns = [
  {
    title: 'Codice Articolo',
    dataIndex: 'id_art',
    key: 'id_art'
  },
  {
    title: 'Descrizione',
    dataIndex: 'descrizione',
    key: 'descrizione'
  },
  {
    title: 'Quantità',
    dataIndex: 'qta',
    key: 'qta',
    render: (text) => parseInt(text, 10) // Convert to integer

  },
  {
    title: 'Dimensione',
    dataIndex: 'dimensione',
    key: 'dimensione'
  },
  
];

const handleLocationPartialDeposit = (record) => {
  setPartialDepositArticle(record);
  setPartialDepositQuantity(record.qta);
  setShowPartialDepositModal(true);
};

const checkLocationRowsQuantity = () => {
  if (selectedLocationRows.length > 0) return true;
  
  
};

const handleLocationMultiplePartial = () => {
  if (selectedLocationRows.length === 0) return;
  
  const minQuantity = Math.min(...selectedLocationRows.map(id => {
    const item = locationItems.find(i => i.id === id);
    return item ? item.qta : 0;
  }));
  
  setMultiplePartialQuantity(minQuantity);
  setShowMultiplePartialDepositModal(true);
};
const handleLocationTransferComplete = (destLocation) => {
  setHighlightedShelf(destLocation);
  setIsLocationWarehouseMapOpen(false);
  
  setPendingTransferData(prev => {
    const [scaffaleDest, colonnaDest, pianoDest] = destLocation.split('-');
    const areaDest = 'A';

    // Handle Trasferimento Singolo (tab "1")
    if (activeTab === '1') {
      const items = [{
        articolo: articoloCode,
        quantity: transferQuantity,
        source: `${otp[0]}-${otp[1]}-${otp[2]}-${otp[3]}`,
        destination: `${areaDest}-${scaffaleDest}-${colonnaDest}-${pianoDest}`
      }];

      return {
        destLocation: {
          areaDest,
          scaffaleDest,
          colonnaDest,
          pianoDest
        },
        items,
        sourceLocation: otp
      };
    }
    
    // Handle Trasferimento da Movimento (tab "2")
    else if (activeTab === '2') {
      const [srcArea, srcScaffale, srcColonna, srcPiano] = locationOTP;

      const items = selectedLocationRows.map(id => {
        const item = locationItems.find(i => i.id === id);
        return item ? {
          articolo: item.id_art,
          quantity: multiplePartialQuantity > 0 
            ? Math.min(multiplePartialQuantity, item.qta)
            : item.qta,
          source: `${srcArea}-${srcScaffale}-${srcColonna}-${srcPiano}`,
          destination: `${areaDest}-${scaffaleDest}-${colonnaDest}-${pianoDest}`
        } : null;
      }).filter(Boolean);

      return {
        destLocation: {
          areaDest,
          scaffaleDest,
          colonnaDest,
          pianoDest
        },
        items,
        sourceLocation: locationOTP
      };
    }
    
    // Handle Trasferimento tra Magazzini (tab "3")
    else if (activeTab === '3') {
      const items = selectedTransferItems.map(item => ({
        articolo: item.gim_arti,
        quantity: item.gim_qmov,
        source: item.location ? `${item.location.area}-${item.location.scaffale}-${item.location.colonna}-${item.location.piano}` : '',
        destination: `${areaDest}-${scaffaleDest}-${colonnaDest}-${pianoDest}`
      }));

      return {
        destLocation: {
          areaDest,
          scaffaleDest,
          colonnaDest,
          pianoDest
        },
        items,
        sourceLocations: selectedTransferItems.map(item => item.location)
      };
    }

    return prev;
  });
  
  setTransferConfirmationVisible(true);
};

const handleMultiplePartialConfirm = () => {
  const minQty = Math.min(...selectedLocationRows.map(id => {
    const item = locationItems.find(i => i.id === id);
    return item ? item.qta : 0;
  }));

  if (multiplePartialQuantity > 0 && multiplePartialQuantity <= minQty) {
    setIsLocationWarehouseMapOpen(true);
    setShowMultiplePartialDepositModal(false);
  } else {
    notification.error({
      message: `La quantità deve essere tra 1 e ${minQty}`,
      placement: 'bottomRight',
      duration: 5,
    });
  }
};

const MultiplePartialTransferModal = () => {
  // Get first selected item's details
  const firstSelected = locationItems.find(item => 
    item.id === selectedLocationRows[0]
  );

  // Calculate min quantity across all selected items
  const minQuantity = selectedLocationRows.reduce((min, id) => {
    const item = locationItems.find(i => i.id === id);
    return Math.min(min, item?.qta || 0);
  }, Infinity);
 
  
};


// Add the transfer confirmation modal
const TransferConfirmationModal = () => (
  <Modal
    title="Conferma Trasferimento"
    visible={transferConfirmationVisible}
    onOk={async () => {
      if (!pendingTransferData?.items?.length) {
        notification.error({
          message: 'Nessun dato di trasferimento disponibile',
          placement: 'bottomRight',
          duration: 5,
        });
        return;
      }
      setTransferConfirmationVisible(false);
      setLoading(true);
      
      try {
        for (const item of pendingTransferData.items) {
          await axios.post(
            `${process.env.REACT_APP_API_URL}/api/trasferimento`,
            {
              articolo: item.articolo,
              quantity: parseInt(item.quantity, 10),
              // Source location
              area: item.source.split('-')[0],
              scaffale: item.source.split('-')[1],
              colonna: item.source.split('-')[2],
              piano: item.source.split('-')[3],
              // Destination location
              areaDest: pendingTransferData.destLocation.areaDest,
              scaffaleDest: pendingTransferData.destLocation.scaffaleDest,
              colonnaDest: pendingTransferData.destLocation.colonnaDest,
              pianoDest: pendingTransferData.destLocation.pianoDest
            }
          );
        }

        // Update UI based on active tab
        if (activeTab === '1') {
          setArticoloCode('');
          setOtp(['', '', '', '']);
          setTransferQuantity(0);
        }
        else if (activeTab === '2') {
          const updatedItems = locationItems.map(item => {
            if (selectedLocationRows.includes(item.id)) {
              return { ...item, transferred: true };
            }
            return item;
          });
          setLocationItems(updatedItems);
          setSelectedLocationRows([]);
          handleMovimentoLocationSearch();
        }
        else if (activeTab === '3') {
          const updatedArticles = magazziniArticles.map(article => {
            if (selectedRows.includes(article.id)) {
              return { ...article, transferred: true };
            }
            return article;
          });
          setMagazziniArticles(updatedArticles);
          setSelectedRows([]);
        }

        notification.success({
          message: 'Trasferimento Completato',
          description: `Trasferiti ${pendingTransferData.items.length} articoli`,
          duration: 5,
          placement: 'bottomRight',
        });
        setIsModalOpen(false);
      } catch (error) {
        console.error('Transfer error:', error);
        notification.error({
          message: error.response?.data?.message || 'Errore durante il trasferimento',
          placement: 'bottomRight',
          duration: 5,
        });
      } finally {
        setLoading(false);
      }
    }}
    onCancel={() => setTransferConfirmationVisible(false)}
    okText="Conferma"
    cancelText="Annulla"
    width={800}
  >
    {pendingTransferData && pendingTransferData.items && pendingTransferData.items.length > 0 ? (
      <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
        <h4>Dettagli Trasferimento</h4>
        <Table
          dataSource={pendingTransferData.items}
          pagination={false}
          columns={[
            {
              title: 'Articolo',
              dataIndex: 'articolo',
              key: 'articolo'
            },
            {
              title: 'Quantità',
              dataIndex: 'quantity',
              key: 'quantity',
              render: (text) => parseInt(text, 10) // Convert to integer

            },
            {
              title: 'Da',
              dataIndex: 'source',
              key: 'source'
            },
            {
              title: 'A',
              dataIndex: 'destination',
              key: 'destination'
            }
          ]}
        />
      </div>
    ) : (
      <div>Nessun dato di trasferimento disponibile</div>
    )}
  </Modal>
);
const locationInputRefs = [
  useRef(null),
  useRef(null),
  useRef(null),
  useRef(null)
];


const handleRowSelection = (selectedRowKeys, selectedRows) => {
  const validRows = selectedRows.filter(row => 
    row.location && !row.transferred
  );
  setSelectedRows(validRows);
  setSelectedTransferItems(validRows);
};
const handleLocationChangeModalVisible = (articleCode, rowId) => {
console.log("QUI")
  setArticleFilter(articleCode);
  setSelectedRowId(rowId);
  fetchLocations(articleCode);
  setLocationChangeModalVisible(true);
};

const handleTransferInitiation = (isPartial) => {
  if (selectedTransferItems.length === 0) {
    notification.error({
      message: 'Seleziona almeno un articolo',
      placement: 'bottomRight',
      duration: 5,
    });
    return;
  }

  // Validate all selected items have locations
  const itemsWithoutLocation = selectedTransferItems.filter(item => !item.location);
  if (itemsWithoutLocation.length > 0) {
    notification.error({
      message: 'Tutti gli articoli devono avere una posizione assegnata',
      placement: 'bottomRight',
      duration: 5,
    });
    return;
  }
  
  const minQuantity = Math.min(...selectedTransferItems.map(item => item.gim_qmov));
  
  if (isPartial) {
    setTransferQuantity(minQuantity);
    setShowPartialDepositModal(true);
  } else {
    setTransferQuantity(minQuantity);
    setIsLocationWarehouseMapOpen(true);
  }
};
return (
  <div style={{display:"flex", justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap !important',}}>
  <Tabs defaultActiveKey="1" onChange={setActiveTab} style={{ width: '100%', padding: '20px' }}>
     <Tabs.TabPane tab="Trasferimento Singolo" key="1">
      <div style={containerStyle}>
      <Card title="Trasferimenti" style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'flex-end' }}>
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
              icon={<FullscreenOutlined />}
              onClick={openWarehouseMapToSelect}
        style={{ marginLeft: '10px' }}
      ></Button>
      
      </div>

      <Form layout="vertical">
      <Form.Item label="Codice Articolo">
          <Input ref={articoloRef} onChange={(e) => handleInputChange(e, setArticoloCode, fornitoreRef)} value={articoloCode}  onKeyDown={(e) => handleKeyDownArticolo(e)} placeholder="Codice Articolo" />
        </Form.Item>
     
      </Form>

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
      </div>
    </Tabs.TabPane>

    <Tabs.TabPane  tab="Trasferimento con Movimento" key="2">
    <Card>
        <Form layout="vertical">
          <Form.Item label="Codice Movimento">
            <Input
              value={movimentoTransfer}
              onChange={(e) => setMovimentoTransfer(e.target.value.toUpperCase())}
              placeholder="Inserisci codice movimento"
            />
          </Form.Item>
          
          <Form.Item label="Posizione">
  <div style={{ display: 'flex', marginBottom: '20px', alignItems: 'flex-end' }}>
    {['AREA', 'SCAFFALE', 'COLONNA', 'PIANO'].map((label, index) => (
      <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ marginBottom: '4px' }}>{label}</span>
        <Input
          ref={locationInputRefs[index]}
          value={locationOTP[index]}
          onChange={(e) => handleLocationChange(index, e.target.value)}
          onKeyDown={(e) => handleLocationKeyDown(index, e)}
          maxLength={index === 2 ? 2 : 1}
          style={{
            width: '60px',
            textAlign: 'center',
            marginRight: '8px'
          }}
        />
      </div>
    ))}
    
    <Button 
      icon={<FullscreenOutlined />}
      onClick={() => {
        setCurrentPage(1);
        setIsWarehouseMapOpen(true);
      }}
      style={{ marginLeft: '10px' }}
    />
  </div>
</Form.Item>

          <Button
            type="primary"
            onClick={handleMovimentoLocationSearch}
            loading={loadingLocationItems}
          >
            Cerca Articoli
          </Button>
        </Form>

        {locationItems.length > 0 && (
          <Table
            rowKey="id"
            rowSelection={{
              selectedRowKeys: selectedLocationRows,
              onChange: (selectedKeys) => {
                const validKeys = selectedKeys.filter(key => 
                  locationItems.some(item => item.id === key)
                );
                setSelectedLocationRows(validKeys);
              },
              getCheckboxProps: (record) => ({
                disabled: record.deposited
              })
            }}
            columns={movimentoLocationColumns}
            dataSource={locationItems}
            pagination={false}
            footer={() => (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button
                  type="primary"
                  onClick={() => {
                    if (selectedLocationRows.length === 0) {
                      notification.warning({
                        message: 'Seleziona almeno un articolo',
                        placement: 'bottomRight',
                        duration: 5,
                      });
                      return;
                    }
                    setMultiplePartialQuantity(0);
                    setIsLocationWarehouseMapOpen(true);
                  }}
                  disabled={selectedLocationRows.length === 0}
                >
                  Trasferisci selezionati ({selectedLocationRows.length})
                </Button>
                
                <Button
                  type="primary"
                  onClick={handleLocationMultiplePartial}
                  disabled={!checkLocationRowsQuantity()}
                >
                  Trasferimento parziale multiplo
                </Button>
              </div>
            )}
          />
        )}
      </Card>
    </Tabs.TabPane>
     <Tabs.TabPane tab="Trasferimento tra Magazzini" key="3">
  <Card>
    <Form layout="vertical">
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="Codice Movimento">
            <Input.Search
              placeholder="Inserisci il codice movimento"
              onSearch={handleMagazziniSearch}
              loading={magazziniLoading}
              enterButton
            />
          </Form.Item>
        </Col>
      </Row>
      
      {magazziniArticles.length > 0 && (
       <Table
  rowSelection={{
    selectedRowKeys: selectedRows,
    onChange: (selectedRowKeys, selectedRows) => {
      setSelectedRows(selectedRowKeys);
      setSelectedTransferItems(selectedRows);
    },
    getCheckboxProps: (record) => ({
      disabled: !record.location || record.transferred,
      className: record.transferred ? 'transferred-checkbox' : ''
    })
  }}
  rowClassName={(record) => record.transferred ? 'transferred-row' : ''}
  columns={magazziniColumns}
  dataSource={magazziniArticles}
  rowKey="id"
  loading={magazziniLoading}
  pagination={false}
  footer={() => (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <Button
        type="primary"
        onClick={() => handleTransferInitiation(false)}
        disabled={selectedRows.length === 0}
      >
        Trasferisci selezionati ({selectedRows.length})
      </Button>
      
      
    </div>
  )}
/>
      )}
    </Form>
  </Card>
</Tabs.TabPane>
   
  </Tabs>
     <Modal
     style={{width:"50%"}}
     title={`Scaffale selezionato: Area ${shelfInfo.area}, Scaffale ${shelfInfo.scaffale}, Colonna ${shelfInfo.colonna}, Piano ${shelfInfo.piano}`}
     visible={isModalOpen}
     onCancel={() => setIsModalOpen(false)}
     footer={[
       <Button key="cancel" onClick={() => setIsModalOpen(false)}>
         Indietro
       </Button>,
       <Button
         type="primary"
         onClick={() => setIsLocationWarehouseMapOpen(true)}
         disabled={transferQuantity <= 0 || transferQuantity > shelfInfo.totalQuantity}
       >
         Seleziona destinazione
       </Button>,
     ]}
   >
     {loading ? (
       <div style={{ textAlign: 'center', padding: '20px' }}>
         <Spin size="large" />
       </div>
     ) : (
       <>
         <div style={{ marginBottom: '16px' }}>
           <strong>ID Articolo:</strong> {articoloCode}
         </div>
         <div style={{ marginBottom: '16px' }}>
           <strong>Quantità Totale:</strong> {shelfInfo.totalQuantity}
         </div>
         <div style={{ marginBottom: '16px' }}>
           <strong>Quantità da spostare:</strong>
           <InputNumber
             min={1}
             max={shelfInfo.totalQuantity}
             defaultValue={0}
             value={transferQuantity}
             onChange={(value) => {
               if (value <= shelfInfo.totalQuantity) {
                 setTransferQuantity(value);
               }
             }}
             style={{ width: '100%', marginTop: '8px' }}
             onPressEnter={() => {
               if (transferQuantity > 0 && transferQuantity <= shelfInfo.totalQuantity) {
                 notification.success({
                   message: 'Quantità impostata correttamente',
                   placement: 'bottomRight',
                   duration: 5,
                 });
               }
             }}
             step={1}
             parser={(value) => value.replace(/[^\d]/g, '')}
             formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
           />
         </div>
       </>
     )}
   </Modal>
<Modal
  title="Conferma Trasferimento"
  visible={isTransferConfirmationOpen}
  onCancel={() => setIsTransferConfirmationOpen(false)}
  onOk={confirmTransfer}
  okText="Conferma"
  cancelText="Annulla"
>
  <div>
    <p><strong>ID Articolo:</strong> {articoloCode}</p>
    <p><strong>Partenza:</strong> {shelfInfo.area}-{shelfInfo.scaffale}-{shelfInfo.colonna}-{shelfInfo.piano}</p>
    <p><strong>Destinazione:</strong> A-{highlightedShelf}</p>
    <p><strong>Quantità:</strong> {transferQuantity}</p>
  </div>
</Modal>


    <Modal
      title="Selezionare scaffale di partenza"
      visible={isWarehouseMapOpen}
      onCancel={() => setIsWarehouseMapOpen(false)}
      footer={null}
      style={{top: '50%', transform: 'translateY(-50%)' }}

      width="80%"
    >
      <div style={{ maxHeight: '100%'}}>
        <div className="grid-container">
          {renderWarehouseSectionSelection()}
        </div>
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

    {isLocationWarehouseMapOpen && (
      <Modal
        title="Seleziona Posizione Destinazione"
        visible={isLocationWarehouseMapOpen}
        onCancel={() => setIsLocationWarehouseMapOpen(false)}
        footer={null}
        width="80%"
        style={{top: '50%', transform: 'translateY(-50%)' }}

      >
  <div style={{ maxHeight: '100%'}}>
        <div className="grid-container">
          {renderWarehouseSection2()}
        </div>
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
    )}

    <MultiplePartialTransferModal />
    <TransferConfirmationModal />
    <Modal
      title="Trasferimento Parziale"
      visible={showPartialDepositModal}
      onOk={() => {
        if (partialQuantity <= 0) {
          notification.error({
            message: 'Inserisci una quantità valida',
            placement: 'bottomRight',
            duration: 5,
          });
          return;
        }
        setShowPartialDepositModal(false);
        handleTransfer(partialQuantity);
      }}
      onCancel={() => setShowPartialDepositModal(false)}
    >
      <InputNumber
        min={0}
        max={partialDepositQuantity}
        value={partialQuantity}
        onChange={value => setPartialQuantity(value)}
        style={{ width: '100%' }}
      />
      <div style={{ marginTop: 8 }}>
        Quantità massima disponibile: {partialDepositQuantity}
      </div>
    </Modal>
     <Modal
  title={
    <div>
      <div>Locazioni disponibili</div>
      <div style={{
        fontSize: '0.9em',
        marginTop: '8px',
        color: 'rgba(0, 0, 0, 0.45)'
      }}>
        {locationData[0]?.description || ''}
      </div>
    </div>
  }
  visible={locationChangeModalVisible}
  onCancel={handleLocationChangeModalClose}
  footer={null}
  width={800} // Reduced width since we have fewer columns
>
  {locationData.length > 0 ? (
    <Table
      dataSource={groupLocations(locationData[0]?.subItems || [])}
      columns={locationColumns}
      pagination={false}
      rowKey="key"
      scroll={{ y: 400 }}
      size="small"
    />
  ) : (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      Nessuna locazione contentente l'articolo selezionato
    </div>
  )}
</Modal>
 <Modal
  title="Seleziona quantità"
  visible={changeLocationQuantityModalVisible}
  onOk={handleLocationQuantityChange}
  onCancel={handleChangeLocationQuantityModalClose}
  okText="Conferma"
  cancelText="Annulla"
>
  <Space direction="vertical" style={{ width: '100%' }}>
    <div>
      <Text>Posizione selezionata: </Text>
      <Text strong>
        {selectedLocation ? 
          `${selectedLocation.area}-${selectedLocation.scaffale}-${selectedLocation.colonna}-${selectedLocation.piano}` : 
          ''}
      </Text>
    </div>
    <div>
      <Text>Quantità disponibile in questa posizione: </Text>
      <Text strong>{parseInt(maxAvailableQuantity, 10)}</Text>
    </div>
    <div>
      <Text>Quantità da spostare: </Text>
      <InputNumber
        min={1}
        max={parseInt(selectedQuantity, 10)}
        value={selectedQuantity}
        onChange={value => setSelectedQuantity(value)}
        style={{ width: '100%' }}
        precision={0} // Forces integer values
      />
    </div>
  </Space>
</Modal>
<Modal
  title="Trasferimento Parziale Multiplo"
  visible={showMultiplePartialDepositModal}
  onCancel={() => setShowMultiplePartialDepositModal(false)}
  onOk={() => {
    const minQty = Math.min(...selectedLocationRows.map(id => {
      const item = locationItems.find(i => i.id === id);
      return item ? item.qta : 0;
    }));
    
    if (multiplePartialQuantity > 0 && multiplePartialQuantity <= minQty) {
      setIsLocationWarehouseMapOpen(true);
      setShowMultiplePartialDepositModal(false);
    } else {
      notification.error({
        message: 'Errore',
        description: `La quantità deve essere tra 1 e ${minQty}`,
        placement: 'bottomRight',
        duration: 5,
      });
    }
  }}
  okText="Procedi con trasferimento"
  cancelText="Annulla"
>
  <div>
    <p><strong>Articoli selezionati:</strong> {selectedLocationRows.length}</p>
    <p>
      <strong>Quantità trasferibile:</strong> {Math.min(...selectedLocationRows.map(id => {
        const item = locationItems.find(i => i.id === id);
        return item?.qta || 0;
      }))}
      <Tooltip title="Quantità massima trasferibile impostata in base all'articolo selezionato con quantità minore">
        <InfoCircleOutlined style={{ marginLeft: '8px' }} />
      </Tooltip>
    </p>
    
    <Form.Item
      label="Quantità da trasferire per ogni articolo"
      help={`Massimo trasferibile: ${Math.min(...selectedLocationRows.map(id => {
        const item = locationItems.find(i => i.id === id);
        return item?.qta || 0;
      }))}`}
    >
      <InputNumber
        min={1}
        max={Math.min(...selectedLocationRows.map(id => {
          const item = locationItems.find(i => i.id === id);
          return item?.qta || 0;
        }))}
        value={multiplePartialQuantity}
        onChange={value => setMultiplePartialQuantity(value)}
        style={{ width: '100%' }}
      />
    </Form.Item>

    <Alert
      message="Questa operazione trasferirà la quantità specificata da ogni articolo selezionato mantenendo le quantità residue nella posizione originale."
      type="info"
      showIcon
      style={{ marginTop: '16px' }}
    />
  </div>
</Modal>
  </div>
);
};

export default App;
