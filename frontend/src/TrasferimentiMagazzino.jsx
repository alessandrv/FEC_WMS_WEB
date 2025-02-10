import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Tabs, Typography, Button, message, Modal, Table, Tooltip, InputNumber, Spin, Pagination, Card, Form, Alert } from 'antd';
import axios from 'axios';
import {InfoCircleOutlined } from '@ant-design/icons';

import WarehouseGrid from './GridComponent';
import './App.css'; // Make sure to import your CSS
import WarehouseGridSystem from './WarehouseGridSystem';
import { LoadingOutlined } from '@ant-design/icons';
import ViewMagazzino from './ViewMagazzino';
const { Title } = Typography;

const App = () => {
  const [otp, setOtp] = useState(['', '', '', '']);
  const inputRefs = [useRef(), useRef(), useRef(), useRef()];
  const articoloRef = useRef(null);
  const fornitoreRef = useRef(null);
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
  
  const handleMultiplePartialDeposit = () => {
    const selectedItem = articoliMovimento.find(item => item.id === selectedRows[0]);
    if (selectedItem) {
      setMultiplePartialQuantity(selectedItem.gim_qmov);
      setShowMultiplePartialDepositModal(true);
    }
  };
  
  const handleShelfClick = (shelf) => {
    setHighlightedShelf(shelf);
    console.log(shelf)
    setIsWarehouseMapOpen(false);
    
    setIsTransferConfirmationOpen(true);
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
    message.error('Inserisci un codice movimento');
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
    message.error(`Errore nel caricamento: ${error.response?.data?.error || error.message}`);
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

    message.success('Trasferimento avviato con successo');
    setIsModalOpen(false);
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
GRID_ROWS = {16}
GRID_COLS = {22}
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
    
    message.success('Transfer successful!');
    
    setIsWarehouseMapOpen(false);
    setIsModalOpen(false);
    setSelectedPackages([]);
    setTotalVolume(0);
  } catch (error) {
    console.error('Error performing transfer:', error);
    
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
    key: 'gim_qmov'
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
    console.log('Codice Articolo is empty');
    message.error('Codice Articolo is obbligatorio.');
    return false;
  }

  if (emptyOtpFields.length > 0) {
    message.error('Compila tutti i campi di posizione.');
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
  const newOtp = [...locationOTP];
  newOtp[index] = value.toUpperCase();
  setLocationOTP(newOtp);
};

const handleMovimentoLocationSearch = async () => {
  const [area, scaffale, colonna, piano] = locationOTP;
  if (!movimentoTransfer || locationOTP.some(field => !field)) {
    message.error('Compila tutti i campi del movimento e della posizione');
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
    message.success(`Trovati ${groupedItems.length} articoli`);
  } catch (error) {
    console.error('Search error:', error);
    message.error('Errore nella ricerca');
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
    key: 'qta'
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

const handleLocationMultiplePartial = async () => {
  if (selectedLocationRows.length === 0) return;
  
  const minQuantity = Math.min(...selectedLocationRows.map(id => {
    const item = locationItems.find(i => i.id === id);
    return item ? item.qta : 0;
  }));

  await setMultiplePartialQuantity(minQuantity);
  setShowMultiplePartialDepositModal(true);
};

const handleLocationTransferComplete = (destLocation) => {
  setHighlightedShelf(destLocation);
  setIsLocationWarehouseMapOpen(false);
  
  setPendingTransferData(prev => {
    const [scaffaleDest, colonnaDest, pianoDest] = destLocation.split('-');
    const areaDest = 'A';
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
    message.error(`La quantità deve essere tra 1 e ${minQty}`);
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

  return (
    <Modal
      title="Trasferimento Parziale Multiplo"
      visible={showMultiplePartialDepositModal}
      onCancel={() => setShowMultiplePartialDepositModal(false)}
      onOk={handleMultiplePartialConfirm}
      okText="Procedi con trasferimento"
      cancelText="Annulla"
    >
      <div>
        <p><strong>Articoli selezionati:</strong> {selectedLocationRows.length}</p>
        <p>
          <strong>Quantità trasferibile:</strong> {minQuantity}
          <Tooltip title="Quantità massima trasferibile impostata in base all'articolo selezionato con quantità minore">
            <InfoCircleOutlined style={{ marginLeft: '8px' }} />
          </Tooltip>
        </p>
        
        <Form.Item
          label="Quantità da trasferire per ogni articolo"
          help={`Massimo trasferibile: ${minQuantity}`}
        >
          <InputNumber
            min={1}
            max={minQuantity}
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
  );
};

const TransferConfirmationModal = () => (
  <Modal
    title="Conferma Trasferimento"
    visible={transferConfirmationVisible}
    onOk={async () => {
      setTransferConfirmationVisible(false);
      setLoading(true);
      
      try {
        const response = await axios.post(
          `${process.env.REACT_APP_API_URL}/api/trasferimento-multiplo`,
          pendingTransferData.items.map(item => ({
            ...item,
            quantity: item.quantity.toString(),
            area: pendingTransferData.sourceLocation[0],
            scaffale: pendingTransferData.sourceLocation[1],
            colonna: pendingTransferData.sourceLocation[2],
            piano: pendingTransferData.sourceLocation[3],
            ...pendingTransferData.destLocation
          }))
        );

        if (response.data.success) {
          message.success(`Trasferiti ${pendingTransferData.items.length} articoli`);
          handleMovimentoLocationSearch();
        }
      } catch (error) {
        console.error('Transfer error:', error);
        message.error(error.response?.data?.error || 'Errore durante il trasferimento');
      } finally {
        setLoading(false);
        setSelectedLocationRows([]);
        setMultiplePartialQuantity(0);
      }
    }}
    onCancel={() => setTransferConfirmationVisible(false)}
    okText="Conferma"
    cancelText="Annulla"
    width={800}
  >
    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
      <h4>Dettagli Trasferimento</h4>
      <p>
        Da: {pendingTransferData?.sourceLocation.join('-')}<br />
        A: {pendingTransferData?.destLocation.areaDest}-{
          pendingTransferData?.destLocation.scaffaleDest}-{
          pendingTransferData?.destLocation.colonnaDest}-{
          pendingTransferData?.destLocation.pianoDest}
      </p>
      
      <Table
        dataSource={pendingTransferData?.items}
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
            key: 'quantity'
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
  </Modal>
);

const handleRowSelection = (selectedRowKeys, selectedRows) => {
  const quantities = selectedRows.map(row => row.gim_qmov);
  const minQuantity = Math.min(...quantities);
  
  setSelectedRows(selectedRowKeys);
  setPartialQuantity(minQuantity);
};

const handleTransferInitiation = (isPartial) => {
  if (selectedRows.length === 0) {
    message.error('Seleziona almeno un articolo');
    return;
  }

  const selectedItems = selectedRows.map(id => 
    articoliMovimento.find(item => item.id === id)
  );
  
  const minQuantity = Math.min(...selectedItems.map(item => item.gim_qmov));
  
  if (isPartial) {
    setPartialDepositQuantity(minQuantity);
    setPartialQuantity(minQuantity);
    setShowPartialDepositModal(true);
  } else {
    handleTransfer(minQuantity);
  }
};

return (
  <div style={{display:"flex", justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap !important',}}>
  <Tabs defaultActiveKey="1" style={{ width: '100%', padding: '20px' }}>
    <Tabs.TabPane tab="Trasferimento Singolo" key="1">
      <div style={containerStyle}>
      <Card title="Trasferimenti" style={cardStyle}>
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

    <Tabs.TabPane  tab="Trasferimento da Movimento" key="2">
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
            <div style={{ display: 'flex', gap: '8px' }}>
              {['Area', 'Scaffale', 'Colonna', 'Piano'].map((label, index) => (
                <Input
                  key={index}
                  value={locationOTP[index]}
                  onChange={(e) => handleLocationChange(index, e.target.value)}
                  placeholder={label}
                  style={{ width: '80px' }}
                  maxLength={index === 2 ? 2 : 1}
                />
              ))}
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
                      message.warning('Seleziona almeno un articolo');
                      return;
                    }
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
    <Tabs.TabPane tab="Trasferimento tra Magazzini" disabled key="3">
      <Card>
        <Form layout="vertical">
          <Form.Item label="Codice Movimento">
            <Input
              placeholder="Inserisci il codice movimento"
              value={movimentoInput}
              onChange={(e) => setMovimentoInput(e.target.value)}
              onPressEnter={handleMovimentoInputConfirm}
              style={{ marginBottom: 16 }}
            />
            <Button 
              type="primary" 
              onClick={handleMovimentoInputConfirm}
              loading={loadingArticoli}
            >
              Cerca Movimento
            </Button>
          </Form.Item>
        </Form>

        {articoliMovimento.length > 0 && (
          <Table
            rowSelection={{
              type: 'checkbox',
              selectedRowKeys: selectedRows,
              onChange: handleRowSelection,
            }}
            columns={columns}
            dataSource={articoliMovimento}
            rowKey={(record) => record.id}
            rowClassName={(record) => 
              depositedArticoli.includes(record.id) ? 'deposited-row' : ''
            }
            pagination={false}
            footer={() => (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button
                  type="primary"
                  onClick={() => {
                    if (selectedRows.length === 0) {
                      message.warning('Seleziona almeno un articolo');
                      return;
                    }
                    setIsWarehouseMapOpen(true);
                  }}
                  disabled={selectedRows.length === 0}
                >
                  Trasferisci articoli selezionati ({selectedRows.length})
                </Button>
                
                <Button
                  type="primary"
                  onClick={() => handleTransferInitiation(true)}
                  disabled={!checkSelectedRowsQuantity()}
                >
                  Trasferimento Parziale
                </Button>
              </div>
            )}
          />
        )}
      </Card>
    </Tabs.TabPane>
   
  </Tabs>
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
    <strong>Quantità Totale:</strong> {shelfInfo.totalQuantity}
  </div>
  <div style={{ marginBottom: '16px' }}>
    <strong>Quantità da spostare:</strong>
    <InputNumber
  min={1}
  max={shelfInfo.totalQuantity}
  value={transferQuantity}
 
  onChange={(value) => {
    if (value <= shelfInfo.totalQuantity) {
      setTransferQuantity(value);
    }
  }}
  style={{ width: '100%', marginTop: '8px' }}
  onPressEnter={() => {
    if (transferQuantity > 0 && transferQuantity <= shelfInfo.totalQuantity) {
      message.success('Quantità impostata correttamente');
    }
  }}
  step={1}
  parser={(value) => value.replace(/[^\d]/g, '')}
  formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
/>

  </div>
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
        GRID_ROWS={30}
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
      <div style={{ maxHeight: '100%', overflowY: 'auto' }}>
        <div className="grid-container">
          {renderWarehouseSection()}
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
          {renderWarehouseSection()}
        </div>
        <div className="pagination-container" >
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
          message.error('Inserisci una quantità valida');
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
  </div>
);
};

export default App;
