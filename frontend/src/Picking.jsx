import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Input, Button, Table, Layout, Space, message, Tooltip, Spin, Tag, Modal, InputNumber, Pagination, Form, Alert } from 'antd';
import WarehouseGrid from './GridComponent';
import axios from 'axios';
import { QuestionCircleOutlined } from '@ant-design/icons';

import './Picking.css';
import { LoadingOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import { notification } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { Tabs } from 'antd';
import { CloseCircleOutlined } from '@ant-design/icons';
import WarehouseGridSystem from './WarehouseGridSystem';
import { Typography } from 'antd';
const { Text } = Typography;

const { TabPane } = Tabs;
const { Content, Sider } = Layout;

const Picking = () => {
    const [selectedLayout, setSelectedLayout] = useState('simple');
    const [selectedRowId, setSelectedRowId] = useState(null);
    const [changeLocationQuantityModalVisible, setChangeLocationQuantityModalVisible] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [selectedQuantity, setSelectedQuantity] = useState(0);

    const [selectedShelf, setSelectedShelf] = useState(null);
    const [occupiedShelves, setOccupiedShelves] = useState(new Set());
    const [articleFilter, setArticleFilter] = useState('simple');
    const [confirmLoading, setConfirmLoading] = useState(false); // State to manage loading
    const [quantityNeeded, setQuantityNeeded] = useState(0);

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

    const [locazioni, setLocazioni] = useState([]);

    const [ordineLavoro, setOrdineLavoro] = useState('');
    const [scaffale, setScaffale] = useState('');
    const [articolo, setArticolo] = useState('');
    const [movimento, setMovimento] = useState('');
    const [tableData, setTableData] = useState([]);
    const [highlightedShelves, setHighlightedShelves] = useState(new Set());
    const [shelfItems, setShelfItems] = useState(new Map());
    const [highlightedRows, setHighlightedRows] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [forcedPickingModalVisible, setForcedPickingModalVisible] = useState(false);
    const [forcedPickingData, setForcedPickingData] = useState(null);
    const [quantityModalVisible, setQuantityModalVisible] = useState(false);
    const [locationChangeModalVisible, setlocationChangeModalVisible] = useState(false);

    const [quantityModalData, setQuantityModalData] = useState(null);
    const [pickedQuantity, setPickedQuantity] = useState(0);
    const [maxAvailableQuantity, setMaxAvailableQuantity] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);

    // New state variables for ARTICOLO Tab
    const [articoloInput, setArticoloInput] = useState('');
    const [articoloQuantity, setArticoloQuantity] = useState(1);
    const [articoloLoading, setArticoloLoading] = useState(false);
    // Add this state variable at the top of your component
    const scaffaleRef = useRef(null);
    const articoloRef = useRef(null);
    const movimentoRef = useRef(null);

    const [prelevaTuttoModalVisible, setPrelevaTuttoModalVisible] = useState(false);

    const [showMissingArticleModal, setShowMissingArticleModal] = useState(false);
    const [missingArticleData, setMissingArticleData] = useState(null);
    const [loadingMissingData, setLoadingMissingData] = useState(false);

    const handleQuantityConfirm = async () => {

        setConfirmLoading(true); // Start loading
        if (pickedQuantity <= 0) {
            notification.error({
                message: 'Errore',
                description: 'La quantità deve essere maggiore di zero.',
                placement: 'bottomRight',
                duration: 5, // Notification will close after 3 seconds
            });
            setConfirmLoading(false);

            return;
        }

        const { mode, rowIndex, rowData, forcedPickingInfo } = quantityModalData;

        if (mode === 'exact') {
            // Handle exact match quantity picking
            if (pickedQuantity > rowData.available_quantity) {
                notification.error({
                    message: 'Errore',
                    description: 'La quantità inserita supera la quantità disponibile.',
                    placement: 'bottomRight',
                    duration: 5, // Notification will close after 3 seconds
                });
                setConfirmLoading(false);

                return;
            }

            const updatedTableData = [...tableData];



            // Extract location details
            const { area, scaffale: scaffalePart, colonna, piano } = rowData.location;

            // Call the API
            try {
                await updatePacchi({
                    articolo,
                    location: { area, scaffale: scaffalePart, colonna, piano },
                    movimento,
                    quantity: pickedQuantity, // Pass the picked quantity
                });
                if (pickedQuantity === rowData.available_quantity) {
                    // User picked the entire quantity; highlight the row normally
                    setHighlightedRows(prev => new Set(prev).add(rowData.id));
                } else {
                    // User picked a partial quantity
                    // Update the original row by subtracting the picked quantity
                    updatedTableData[rowIndex] = {
                        ...rowData,
                        available_quantity: rowData.available_quantity - pickedQuantity,
                    };

                    // Create a new row for the picked quantity
                    const newRow = {
                        ...rowData,
                        available_quantity: pickedQuantity,
                        picked_quantity: pickedQuantity,
                        id: uuidv4(), // Assign a unique ID
                    };

                    // Insert the new row right after the original row
                    updatedTableData.splice(rowIndex + 1, 0, newRow);

                    // Highlight the new row
                    setHighlightedRows(prev => {
                        const newSet = new Set(prev);
                        newSet.add(newRow.id);
                        return newSet;
                    });
                }

                setTableData(updatedTableData);
                setQuantityModalVisible(false);
                setQuantityModalData(null);

            } catch (error) {
                // Handle error if needed
            };

        } else if (mode === 'forced') {
            const { articolo, scaffale, movimento, originalLocation } = forcedPickingInfo;

            // Parse scaffale into area, scaffale, colonna, piano
            const scaffaleParts = scaffale.split('-');
            if (scaffaleParts.length !== 4) {
                notification.error({
                    message: 'Errore',
                    description: 'Formato scaffale non valido. Deve essere "area-scaffale-colonna-piano".',
                    placement: 'bottomRight',
                    duration: 5, // Notification will close after 3 seconds
                });
                setQuantityModalVisible(false);
                setQuantityModalData(null);
                setConfirmLoading(false); // Start loading

                return;
            }

            const [area, scaffalePart, colonna, piano] = scaffaleParts;

            // Check availability with the user-specified quantity
            const isAvailable = await FetchArticoliPresence(
                articolo,
                movimento,
                area,
                scaffalePart,
                colonna,
                piano,
                pickedQuantity
            );

            if (!isAvailable) {
                notification.error({
                    message: 'Errore',
                    description: `Articoli non presenti nella posizione specificata o non nella quantità richiesta.`,
                    placement: 'bottomRight',
                    duration: 5, // Notification will close after 3 seconds
                });
                setQuantityModalVisible(false);
                setQuantityModalData(null);
                setConfirmLoading(false);

                return;
            }

            // Find all rows that match the article code
            const matchingRows = tableData.filter(item => item.occ_arti.trim() === articolo.trim());
            let articleDescription = 'Descrizione non disponibile';
            let originalArticleData = null;

            if (matchingRows.length > 0) {
                // Prioritize rows with a matching location, if any
                originalArticleData = matchingRows.find(item =>
                    item.location &&
                    `${item.location.area}-${item.location.scaffale}-${item.location.colonna}-${item.location.piano}` === originalLocation
                ) || matchingRows[0]; // Fallback to the first matching row if no location match

                articleDescription = originalArticleData.occ_desc_combined || articleDescription;
            } else {
                console.warn(`Nessuna riga trovata per l'articolo ${articolo}. Utilizzo descrizione predefinita.`);
            }

            // Proceed with forced picking as there is enough quantity
            let remainingQuantity = pickedQuantity;

            // Step 1: Deduct the quantity from existing rows (excluding the forced picking location and highlighted rows)

            const updatedTableData = tableData.map(item => {

                if (
                    item.occ_arti.trim() === articolo.trim() &&
                    item.location &&

                    !highlightedRows.has(item.id) // Exclude highlighted rows
                ) {

                    if (remainingQuantity > 0) {
                        const deduction = Math.min(item.available_quantity, remainingQuantity);
                        remainingQuantity -= deduction;
                        const newQuantity = item.available_quantity - deduction;
                        console.log(newQuantity)
                        return newQuantity > 0 ? { ...item, available_quantity: newQuantity } : null;
                    }
                }
                return item;
            }).filter(Boolean);

            // Step 2: Check if a forced pick row for this location already exists
            const existingForcedPick = updatedTableData.find(item =>
                item.occ_arti.trim() === articolo.trim() &&
                item.picked_quantity > 0 &&
                item.location &&
                `${item.location.area}-${item.location.scaffale}-${item.location.colonna}-${item.location.piano}` === scaffale
            );



            // Step 3: Prepare the forced picking row
            const forcedPickingRow = {
                id: uuidv4(), // Assign a unique ID
                occ_arti: articolo,
                occ_desc_combined: articleDescription,
                occ_qmov: pickedQuantity,
                available_quantity: pickedQuantity,
                movimento: movimento,
                location: {
                    area,
                    scaffale: scaffalePart,
                    colonna,
                    piano
                },
                picked_quantity: pickedQuantity,
            };

            // Step 4: Find the index to insert the new row after the scanned article
            const scannedArticleIndex = updatedTableData.findIndex(item =>
                item.occ_arti === articolo &&
                item.location && // Ensure location exists
                `${item.location.area}-${item.location.scaffale}-${item.location.colonna}-${item.location.piano}` === scaffale
            );

            // Insert the forced picking row right after the scanned article, or push it to the end if not found
            if (scannedArticleIndex !== -1) {
                updatedTableData.splice(scannedArticleIndex + 1, 0, forcedPickingRow);
            } else {
                updatedTableData.push(forcedPickingRow);
            }

            // Step 5: Update the table data and highlight the new forced picking row


            // Step 6: Highlight the forced picking row
            const newHighlightedRows = new Set(highlightedRows);
            newHighlightedRows.add(forcedPickingRow.id);



            // Call the API
            try {
                await updatePacchi({
                    articolo,
                    location: { area, scaffale: scaffalePart, colonna, piano },
                    movimento,
                    quantity: pickedQuantity, // Pass the picked quantity
                });
                setHighlightedRows(newHighlightedRows);

                // Reset quantity modal state
                setTableData(updatedTableData);
                setQuantityModalVisible(false);
                setQuantityModalData(null);

            } catch (error) {
                // Handle error if needed
            }

        }
        setConfirmLoading(false); // Stop loading

    };
    useEffect(() => {
        if (articleFilter !== null) {
            console.log(articleFilter); // This will log the updated state
            fetchItems(); // Call your function after the state is updated
        }
    }, [articleFilter]); // This effect runs when articleFilter changes
    const handleHelpRequest = async () => {
        try {
            const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/send-email`, {
                message: 'Mi serve aiuto con il software WMS.',
                order_id: 'HELP_REQUEST',
                image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=' // 1x1 transparent JPEG
            });

            if (response.status === 200) {
                message.success('Richiesta di aiuto inviata con successo');
            }
        } catch (error) {
            console.error('Error sending help request:', error);
            message.error('Errore nell\'invio della richiesta di aiuto');
        }
    };
    const handleLocationChangeModalVisible = (article, rowId) => {
        setLocazioni([]);
        const currentRow = tableData.find(row => row.id === rowId);
        
        if (currentRow) {
            // Calculate total quantity needed for ALL rows of this article
            const totalNeeded = tableData
                .filter(row => 
                    row.occ_arti === article && 
                    !highlightedRows.has(row.id)
                )
                .reduce((sum, row) => sum + row.available_quantity, 0);
                
            setQuantityNeeded(totalNeeded);
            setSelectedRowId(rowId);
        }

        setArticleFilter(article);
        setlocationChangeModalVisible(true);
    };
    const handleLocationChangeModalClose = () => {
        setLocazioni([]);
        setArticleFilter(null);
        setQuantityNeeded(0);
        setSelectedRowId(null); // Reset selected row ID
        setlocationChangeModalVisible(false);
    };
    const handleQuantityCancel = () => {
        setQuantityModalVisible(false);
        setQuantityModalData(null);
        setPickedQuantity(0);
        setMaxAvailableQuantity(0);
        setSelectedRowId(null);
    };
    const getExistingAllocations = () => {
        const allocations = new Map();

        tableData.forEach(row => {
            if (row.location && row.id !== selectedRowId) {
                const key = `${row.location.area}-${row.location.scaffale}-${row.location.colonna}-${row.location.piano}-${row.occ_arti}`;

                if (allocations.has(key)) {
                    allocations.set(key, {
                        ...allocations.get(key),
                        quantity: parseFloat(allocations.get(key).quantity) + parseFloat(row.available_quantity || 0)
                    });
                } else {
                    allocations.set(key, {
                        location: row.location,
                        articolo: row.occ_arti,
                        quantity: parseFloat(row.available_quantity || 0)
                    });
                }
            }
        });

        return allocations;
    };
    const calculateAvailableQuantity = (location, articolo) => {
        // Add null check for location
        if (!location || !location.area) return 0;
        
        const allocations = getExistingAllocations();
        const locationKey = `${location.area}-${location.scaffale}-${location.colonna}-${location.piano}-${articolo}`;

        // Get the highlighted row for this article and location if it exists
        const highlightedRow = tableData.find(row =>
            highlightedRows.has(row.id) &&
            row.occ_arti === articolo &&
            row.location &&
            row.location.area === location.area &&
            row.location.scaffale === location.scaffale &&
            row.location.colonna === location.colonna &&
            row.location.piano === location.piano
        );

        const existingAllocation = allocations.get(locationKey);
        const allocatedQuantity = existingAllocation ? parseFloat(existingAllocation.quantity) : 0;

        // If there's a highlighted row for this location, add back its quantity
        const highlightedQuantity = highlightedRow ? parseFloat(highlightedRow.available_quantity) : 0;

        return parseFloat(location.qta || location.totalQta) - allocatedQuantity + highlightedQuantity;
    };


    const handleArticoloPicking = async () => {
        // Validate inputs
        setScaffale('');
        setMovimento('');
        setArticolo(articoloInput)
        if (!articoloInput.trim()) {
            notification.warning({
                message: 'Attenzione',
                description: 'Inserisci un articolo.',
                placement: 'bottomRight',
                duration: 5,
            });
            return;
        }

        if (articoloQuantity <= 0) {
            notification.error({
                message: 'Errore',
                description: 'La quantità deve essere maggiore di zero.',
                placement: 'bottomRight',
                duration: 5,
            });
            return;
        }

        setArticoloLoading(true);

        try {
            // Make a GET request to the Articolo Search API
            const response = await fetch(
                `${process.env.REACT_APP_API_URL}/api/articolo-search?articolo_id=${encodeURIComponent(
                    articoloInput.trim()
                )}&quantity=${articoloQuantity}`
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Errore durante la ricerca dell\'articolo.');
            }

            const data = await response.json();

            // Optionally, generate unique IDs for each row if not provided by the backend
            const dataWithIds = data.map(item => ({
                ...item,
                id: item.id || uuidv4(), // Use backend provided id or generate one
            }));

            // Update the tableData state
            setTableData(dataWithIds);

            notification.success({
                message: 'Successo',
                description: `Articolo ${articoloInput} trovato e aggiunto alla tabella.`,
                placement: 'bottomRight',
                duration: 5,
            });

            // Optionally, reset the inputs

        } catch (error) {
            notification.error({
                message: 'Errore',
                description: error.message,
                placement: 'bottomRight',
                duration: 5,
            });
        }

        setArticoloLoading(false);
    };


    const handleSearch = async () => {
        setScaffale('');
        setArticolo('');
        setMovimento('');
        setHighlightedRows(new Set());
        setHighlightedShelves(new Set());
        setTableData([]); // Clear the data immediately
        setLoading(true); // Set loading to true
        shelfItems.clear();
        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL}/api/ordine-lavoro?ordine_lavoro=${ordineLavoro}`);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            console.log("Fetched data:", data);

            // Modify the data transformation in handleSearch
            const transformedData = data.reduce((acc, item) => {
                // Group by article code
                const existing = acc.find(i => i.occ_arti === item.occ_arti);
                
                if (existing) {
                    // Only update if we haven't captured a picked quantity yet
                    if (!existing.has_picked && parseInt(item.picked_quantity) > 0) {
                        existing.total_picked = parseInt(item.picked_quantity);
                        existing.has_picked = true;
                    }
                    existing.children.push(item);
                } else {
                    acc.push({
                        ...item,
                        total_picked: parseInt(item.picked_quantity),
                        has_picked: parseInt(item.picked_quantity) > 0,
                        children: [item],
                        isParent: true
                    });
                }
                return acc;
            }, []).flatMap(parentItem => {
                // Create rows for each parent item
                const baseParent = {
                    id: uuidv4(),
                    occ_arti: parentItem.occ_arti,
                    occ_desc_combined: parentItem.occ_desc_combined,
                    status: parentItem.status,
                    isParent: true,
                    total_quantity: parentItem.children.reduce((sum, c) => sum + parseInt(c.needed_quantity), 0),
                    total_picked: parentItem.total_picked
                };

                // Create completed row if any picked quantity
                const completedRow = parentItem.total_picked > 0 ? [{
                    ...baseParent,
                    id: uuidv4(),
                    available_quantity: parentItem.total_picked,
                    status: 'completed',
                    isChildRow: true
                }] : [];

                // Create pending rows for each child location
                const pendingRows = parentItem.children.map(child => ({
                    ...child,
                    id: uuidv4(),
                    available_quantity: parseInt(child.available_quantity),
                    status: 'pending',
                    isChildRow: true,
                    parentId: baseParent.id
                }));

                return [...completedRow, ...pendingRows];
            });

            const newHighlightedShelves = new Set();
            transformedData.forEach(item => {
                if (!item.missing && item.location) {  // Add null check for location
                    const shelfName = `${item.location.scaffale}-${item.location.colonna}-${item.location.piano}`;
                    newHighlightedShelves.add(shelfName);
                    if (!shelfItems.has(shelfName)) {
                        shelfItems.set(shelfName, []);
                    }
                    shelfItems.get(shelfName).push(item);
                }
            });

            console.log("Highlighting shelves:", Array.from(newHighlightedShelves));
            setHighlightedShelves(newHighlightedShelves);
            setTableData(transformedData);
        } catch (error) {
            console.log('Error object:', error);

            if (error.message === 'Network response was not ok') {
                // The response was not ok (e.g., 404 or 500 error)
                notification.error({
                    message: 'Errore',
                    description: 'Errore 404: ordine non trovato',
                    placement: 'bottomRight',
                    duration: 5, // Notification will close after 3 seconds
                });
            } else if (error.message.includes('ERR_CONNECTION_REFUSED')) {
                // Handle connection errors
                notification.error({
                    message: 'Errore',
                    description: 'Errore: Connessione rifiutata',
                    placement: 'bottomRight',
                    duration: 5, // Notification will close after 3 seconds
                });
            } else {
                // Handle other types of errors
                notification.error({
                    message: 'Errore',
                    description: 'Errore di rete: ' + error.message,
                    placement: 'bottomRight',
                    duration: 5, // Notification will close after 3 seconds
                });
            }
        }
        finally {
            setLoading(false); // Set loading to false regardless of success or error
        }
    };


    const getShelfClass = useCallback((shelf) => {
        const isHighlighted = highlightedShelves.has(shelf);
        return isHighlighted ? 'highlighted' : '';
    }, [highlightedShelves]);

    const handleShelfClick = (shelf) => {
        console.log('Clicked shelf:', shelf);
        console.log(highlightedShelves.has(shelf))

    };

    const getTooltipContent = useCallback((shelf) => {
        if (highlightedShelves.has(shelf)) {
            const items = shelfItems.get(shelf) || [];

            // Check if there are items to display
            if (items.length === 0) {
                return <div>No items available for this shelf.</div>;
            }

            // Define columns for the Ant Design Table
            const columns = [
                {
                    title: 'Articolo',
                    dataIndex: 'occ_arti',
                    key: 'occ_arti',
                },
                {
                    title: 'Q.ta',
                    dataIndex: 'available_quantity',
                    key: 'available_quantity',
                },
                {
                    title: 'Mov.',
                    dataIndex: 'movimento',
                    key: 'movimento',
                },
            ];

            return (
                <Table
                    dataSource={items}
                    columns={columns}
                    pagination={false} // Disable pagination
                    rowKey="occ_arti"  // Use unique key for each row
                    showHeader={true}   // Show the header
                    size="small"        // Adjust size of the table
                    style={{ background: '#333' }} // Table background
                    components={{
                        header: {
                            cell: (cellProps) => (
                                <th {...cellProps} style={{ background: '#555', color: '#fff' }}>
                                    {cellProps.children}
                                </th>
                            ),
                        },
                    }}
                    rowClassName={() => 'dark-row'} // Add class to rows for styling
                />
            );
        }
        return null;
    }, [highlightedShelves, shelfItems]);

    const centeredStyle = {

        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '60vh', // This ensures the div takes the full viewport height.
    };

    const updatePacchi = async ({ articolo, location, movimento, quantity }) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_API_URL}/api/update-pacchi`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    articolo,
                    area: location.area,
                    scaffale: location.scaffale,
                    colonna: location.colonna,
                    piano: location.piano,
                    movimento,
                    quantity, // Include the picked quantity
                    odl: ordineLavoro,
                }),
            });
            if (!response.ok) {
                throw new Error('Failed to update pacchi');
            }
            const data = await response.json();
            // Handle success, e.g., update state or notify user
            notification.success({
                message: 'Successo',
                description: `Articolo ${articolo} prelevato da ${location.area}-${location.scaffale}-${location.colonna}-${location.piano}`,
                placement: 'bottomRight'

            });
        } catch (error) {
            // Handle error
            notification.error({
                message: 'Errore',
                description: 'Errore durante l\'aggiornamento dei pacchi.',
            });
        }
    };



    // Add this function within your Picking component
    const FetchArticoliPresence = async (idArt, idMov, area, scaffale, colonna, piano, requiredQuantity) => {
        try {
            const queryParams = new URLSearchParams({
                'id-art': idArt,
                'id-mov': idMov, // Use the forced movimento
                'area': area,
                'scaffale': scaffale,
                'colonna': colonna,
                'piano': piano
            });

            const response = await fetch(`${process.env.REACT_APP_API_URL}/api/item-present?${queryParams.toString()}`);

            if (!response.ok) {
                throw new Error('Errore nella risposta di rete');
            }

            const data = await response.json();

            if (!Array.isArray(data) || data.length === 0) {
                // No articoli found in the specified location
                return false;
            }

            // Sum the available quantity from the response
            const totalAvailableQta = data.reduce((sum, item) => sum + (parseInt(item.qta, 10) || 0), 0);

            // Check if the total available quantity meets the required quantity
            return totalAvailableQta >= requiredQuantity;
        } catch (error) {
            notification.error({
                message: 'Errore',
                description: 'Errore durante la verifica della disponibilità dell\'articolo.',
                placement: 'bottomRight',

            });

            return false;
        }
    };
    useEffect(() => {
        const newShelfItems = new Map();
        const newHighlightedShelves = new Set();

        tableData.forEach((item) => {
            if (
                !item.missing &&
                !highlightedRows.has(item.id) &&
                item.available_quantity > 0 &&
                item.location
            ) {
                const shelfName = `${item.location.scaffale}-${item.location.colonna}-${item.location.piano}`;
                if (!newShelfItems.has(shelfName)) {
                    newShelfItems.set(shelfName, []);
                }
                newShelfItems.get(shelfName).push(item);
                newHighlightedShelves.add(shelfName); // Add shelf to highlightedShelves
            }
        });

        setShelfItems(newShelfItems);
        setHighlightedShelves(newHighlightedShelves); // Update highlightedShelves
    }, [tableData, highlightedRows]);



    useEffect(() => {
        if (quantityModalData) {
            if (quantityModalData.mode === 'exact') {
                // In 'exact' mode, set max and default to available_quantity of the row
                const maxQuantity = quantityModalData.rowData.available_quantity;
                setMaxAvailableQuantity(maxQuantity);
                setPickedQuantity(quantityModalData.rowData.available_quantity);
            } else if (quantityModalData.mode === 'forced') {
                // In 'forced' mode, calculate maxQuantity
                const maxQuantity = tableData
                    .filter(item =>
                        item.occ_arti.trim() === quantityModalData.forcedPickingInfo.articolo.trim() &&
                        !highlightedRows.has(item.id)
                    )
                    .reduce((sum, item) => sum + (parseFloat(item.available_quantity) || 0), 0);
                setMaxAvailableQuantity(maxQuantity);

                // Set default pickedQuantity to maxQuantity
                setPickedQuantity(1);
            }
        } else {
            // Reset when modal data is cleared
            setPickedQuantity(0);
            setMaxAvailableQuantity(0);
        }
    }, [quantityModalData, tableData, highlightedRows]);

    const handleHighlight = useCallback(async () => {
        const newHighlightedRows = new Set(highlightedRows);
        const newHighlightedShelves = new Set(highlightedShelves);
        let matchFound = false;
        let alreadyPickedFound = false;

        // Trim inputs to avoid whitespace issues
        const trimmedArticolo = articolo.trim();
        const trimmedScaffale = scaffale.trim();

        // Check if inputs are provided


        // Find the articles in the tableData based on articolo
        const articleItems = tableData.filter(item =>
            item.occ_arti.trim() === trimmedArticolo
        );

        if (articleItems.length === 0) {
            notification.error({
                message: 'Errore',
                description: 'Articolo non trovato nell\'ordine di lavoro',
                placement: 'bottomRight',
                duration: 5, // Notification will close after 3 seconds
            });
            return;
        }

        // Check if any of the article items are marked as missing
        const isArticleMissing = articleItems.some(item => item.missing);

        // Parse scaffale into area, scaffale, colonna, piano
        const scaffaleParts = trimmedScaffale.split('-');
        if (scaffaleParts.length !== 4) {
            notification.error({
                message: 'Errore',
                description: 'Formato scaffale non valido. Deve essere "area-scaffale-colonna-piano".',
                placement: 'bottomRight',
                duration: 5, // Notification will close after 3 seconds
            });
            return;
        }

        const [area, scaffalePart, colonna, piano] = scaffaleParts;

        const exactMatch = tableData.find(item => {
            const itemArticoloTrimmed = item.occ_arti.trim();
            const articoloMatch = itemArticoloTrimmed === trimmedArticolo;

            const locationExists = !!item.location;
            let locationStringMatch = false;
            let itemLocationString = '';

            if (locationExists) {
                const area = item.location.area || '';
                const scaffalePart = item.location.scaffale || '';
                const colonna = item.location.colonna || '';
                const piano = item.location.piano || '';

                itemLocationString = `${area}-${scaffalePart}-${colonna}-${piano}`;
                locationStringMatch = itemLocationString === trimmedScaffale;
            }

            // Safely check if movimento is present and trim it

            const isHighlighted = highlightedRows.has(item.id);
            const notHighlighted = !isHighlighted;

            // All conditions for exact match
            const allConditionsMet = articoloMatch && locationExists && locationStringMatch && notHighlighted;



            return allConditionsMet; // Only return true if all conditions are met, including movimento
        });

        if (exactMatch) {
            const rowIndex = tableData.indexOf(exactMatch);
            if (highlightedRows.has(exactMatch.id)) {
                alreadyPickedFound = true;
            } else {
                // Prompt for quantity before highlighting
                setQuantityModalData({
                    mode: 'exact',
                    rowIndex,
                    rowData: exactMatch
                });
                setPickedQuantity(exactMatch.available_quantity); // Pre-fill with max quantity
                setQuantityModalVisible(true);
                return; // Exit the function to wait for user input
            }

        } else {
            if (isArticleMissing) {
                notification.error({
                    message: 'Errore',
                    description: 'Articolo mancante. Non è possibile effettuare un prelievo forzato.',
                    placement: 'bottomRight',
                    duration: 5, // Notification will close after 3 seconds
                });
                return;
            }

            // **Forced Picking**: Proceed even if movimento differs
            // Check if there are any non-highlighted rows for this article
            const nonHighlightedRows = tableData.filter(item =>
                item.occ_arti.trim() === trimmedArticolo &&
                !highlightedRows.has(item.id)
            );

            if (nonHighlightedRows.length === 0) {
                notification.info({
                    message: 'Info',
                    description: 'Articolo già prelevato.',
                    placement: 'bottomRight',
                    duration: 5, // Notification will close after 3 seconds
                });
                return;
            }

            // Determine the total required quantity for this articolo
            const totalRequiredQuantity = nonHighlightedRows.reduce((sum, item) => sum + (parseFloat(item.occ_qmov) || 0), 0); // Ensure occ_qmov is defined and numeric

            // Prompt for quantity before highlighting
            setQuantityModalData({
                mode: 'forced',
                forcedPickingInfo: {
                    articolo: trimmedArticolo,
                    scaffale: trimmedScaffale,
                    originalLocation: `${articleItems[0].location.area}-${articleItems[0].location.scaffale}-${articleItems[0].location.colonna}-${articleItems[0].location.piano}`
                }
            });
            // Pre-fill with the total required quantity
            setPickedQuantity(totalRequiredQuantity);
            setQuantityModalVisible(true);
            return; // Exit the function to wait for user input
        }

        setHighlightedRows(newHighlightedRows);
        setHighlightedShelves(newHighlightedShelves);

        if (alreadyPickedFound) {
            notification.info({
                message: 'Info',
                description: 'Articolo già prelevato',
                placement: 'bottomRight',
                duration: 5, // Notification will close after 3 seconds
            });
        } else if ((scaffale || articolo) && !matchFound && !forcedPickingModalVisible) {
            notification.warning({
                message: 'Attenzione',
                description: 'Corrispondenza non trovata',
                placement: 'bottomRight',
                duration: 5, // Notification will close after 3 seconds
            });
        }
    }, [articolo, scaffale, tableData, highlightedRows, highlightedShelves, forcedPickingModalVisible]);

    const renderWarehouseSection = () => {
        if (currentPage === 1) {
            return (
                <div>
                    <WarehouseGridSystem
                        warehouseLayout={layouts[1]}
                        GRID_ROWS={30}
                        GRID_COLS={9}
                        onCellClick={handleShelfClick}
                        getShelfStatus={getShelfStatus}
                        tooltipContent={getTooltipContent}
                        highlightedShelves={highlightedShelves}

                    />
                </div>)
        }
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
                        highlightedShelves={highlightedShelves}

                    />
                </div>)
        }
    };

    const columns = [
        {
            title: 'Articolo',
            dataIndex: 'occ_arti',
            key: 'occ_arti',
        },
        {
            title: 'Descrizione',
            dataIndex: 'occ_desc_combined',
            key: 'occ_desc_combined',
            render: (description) => (
                <span>
                    {description.length > 10 ? (
                        <Tooltip title={description} placement="topLeft">
                            {description.substring(0, 10)}...
                            <InfoCircleOutlined style={{ marginLeft: 4 }} />
                        </Tooltip>
                    ) : (
                        description
                    )}
                </span>
            ),
        },
        {
            title: 'Q.ta Da prelevare',
            dataIndex: 'available_quantity',
            key: 'available_quantity',
        },

        {
            title: 'Posizione',
            dataIndex: 'location',
            key: 'location',
            render: (location, record) => (
                <>
                    {record.status === 'completed' ? (
                        <Tag color="green">Già prelevato</Tag>
                    ) : location && location.area ? (
                        <Tag 
                            color={'geekblue'} 
                            style={{ 
                                wordBreak: 'break-word', 
                                whiteSpace: 'normal', 
                                cursor: highlightedRows.has(record.id) ? 'not-allowed' : 'pointer',
                                opacity: highlightedRows.has(record.id) ? 0.6 : 1
                            }}
                            onClick={!highlightedRows.has(record.id) 
                                ? () => handleLocationChangeModalVisible(record.occ_arti, record.id)
                                : undefined}
                        >
                            {location.area}-{location.scaffale}-{location.colonna}-{location.piano}
                        </Tag>
                    ) : (
                        <Tag 
                            color={'red'} 
                            style={{ wordBreak: 'break-word', whiteSpace: 'normal', cursor: 'pointer' }}
                            onClick={async () => {
                                try {
                                    setLoadingMissingData(true);
                                    const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/articolo-offerte`, {
                                        params: { codice: record.occ_arti.trim() }
                                    });
                                    setMissingArticleData(response.data[0]);
                                    setShowMissingArticleModal(true);
                                } catch (error) {
                                    notification.error({
                                        message: 'Errore',
                                        description: 'Impossibile recuperare i dati dell\'articolo',
                                    });
                                } finally {
                                    setLoadingMissingData(false);
                                }
                            }}
                        >
                            Mancante {loadingMissingData}
                        </Tag>
                    )}
                </>
            ),
        },
        {
            title: 'Azioni',
            key: 'actions',
            render: (_, record) => {
                // Disable button for completed, missing, or already picked items
                const isCompleted = record.status === 'completed';
                const isDisabled = isCompleted || record.missing || highlightedRows.has(record.id);
                
                if (isDisabled) {
                    return null;
                }

                return (
                    <Button
                        type="primary"
                        onClick={() => handlePickFromRow(record)}
                    >
                        Preleva
                    </Button>
                );
            },
        }
    ];

    // Columns configuration for the main table
    const locationColumns = [
        {
            title: 'ID Art',
            dataIndex: 'id_art',
            key: 'id_art',
            sorter: (a, b) => a.id_art.localeCompare(b.id_art),
        },
        {
            title: 'Descrizione',
            dataIndex: 'description',
            key: 'description',
            render: (text) => <span>{text}</span>,
            sorter: (a, b) => a.description.localeCompare(b.description),
        },
        {
            title: 'Codice Fornitore',
            dataIndex: 'fornitore',
            key: 'fornitore',
            sorter: (a, b) => a.fornitore.localeCompare(b.fornitore),
        },
        {
            title: 'Q.ta in magazzino',
            dataIndex: 'totalQta',
            key: 'totalQta',
            sorter: (a, b) => a.totalQta - b.totalQta,
            render: (text) => <span>{text}</span>,
        },
    ];
    // Subcolumns for the subitems table
    const subColumns = [
        {
            title: 'Posizione',
            dataIndex: 'position',
            key: 'position',
            render: (_, record) => `${record.area}-${record.scaffale}-${record.colonna}-${record.piano}`,
            sorter: (a, b) => {
                const posA = `${a.area}-${a.scaffale}-${a.colonna}-${a.piano}`;
                const posB = `${b.area}-${b.scaffale}-${b.colonna}-${b.piano}`;
                return posA.localeCompare(posB);
            }
        },
        {
            title: 'Q.ta Disponibile',
            dataIndex: 'totalQta',
            key: 'availableQta',
            render: (totalQta, record) => {
                const availableQty = calculateAvailableQuantity(record, articleFilter);
                return (
                    <Tooltip title={
                        <>
                            <div>Totale: {totalQta}</div>
                            <div>Disponibile: {availableQty}</div>
                        </>
                    }>
                        <span>{availableQty} / {totalQta}</span>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Azioni',
            key: 'actions',
            render: (_, record) => {
                const currentRow = tableData.find(row => row.id === selectedRowId);
                const isStartingLocation = currentRow?.location?.area === record.area && 
                                          currentRow?.location?.scaffale === record.scaffale && 
                                          currentRow?.location?.colonna === record.colonna && 
                                          currentRow?.location?.piano === record.piano;

                const totalQta = record.totalQta; // Use totalQta instead of availableQty
                const canTakeAll = totalQta >= quantityNeeded; // Check if totalQta is >= quantityNeeded

                return (
                    <Space>
                        <Button
                            type="primary"
                            onClick={() => handleLocationChange(record)}
                            disabled={isStartingLocation}
                        >
                            ✓
                        </Button>
                        {canTakeAll && (
                            <Button
                                type="link"
                                onClick={() => {
                                    setSelectedLocation(record);
                                    setPrelevaTuttoModalVisible(true);
                                }}
                            >
                                Preleva tutto da qui
                            </Button>
                        )}
                    </Space>
                );
            },
        }
    ];

    // Update handleLocationChange to use the calculated available quantity
    const handleLocationChange = (newLocation) => {
        const currentRow = tableData.find(row => row.id === selectedRowId);
        if (!currentRow) return;

        const availableQty = calculateAvailableQuantity(newLocation, articleFilter);
        const rowAvailableQty = currentRow.available_quantity;
        
        setSelectedLocation(newLocation);
        setMaxAvailableQuantity(Math.min(availableQty, rowAvailableQty));
        setSelectedQuantity(Math.min(availableQty, rowAvailableQty));
        setChangeLocationQuantityModalVisible(true);
    };

    // Update handleLocationQuantityChange to properly merge rows
    const handleLocationQuantityChange = () => {
        if (selectedQuantity <= 0) {
            notification.error({
                message: 'Errore',
                description: 'Quantità non valida, locazione già in uso nella sua totalità nella lista di prelievo',
                placement: 'bottomRight',
            });
            return;
        }
        const updatedTableData = [...tableData];
        const rowIndex = updatedTableData.findIndex(row => row.id === selectedRowId);

        if (rowIndex === -1) {
            notification.error({
                message: 'Errore',
                description: 'Riga non trovata nella tabella.',
                placement: 'bottomRight',
            });
            return;
        }

        const rowToUpdate = updatedTableData[rowIndex];

        try {
            // Find all non-highlighted rows in the target location with the same article
            const existingRows = updatedTableData.filter(row =>
                !highlightedRows.has(row.id) &&
                row.id !== selectedRowId &&
                row.occ_arti === rowToUpdate.occ_arti &&
                row.location?.area === selectedLocation.area &&
                row.location?.scaffale === selectedLocation.scaffale &&
                row.location?.colonna === selectedLocation.colonna &&
                row.location?.piano === selectedLocation.piano
            );

            if (parseFloat(selectedQuantity) === parseFloat(rowToUpdate.available_quantity)) {
                // Full quantity move
                if (existingRows.length > 0) {
                    // Merge with the first existing row
                    const existingRowIndex = updatedTableData.indexOf(existingRows[0]);
                    updatedTableData[existingRowIndex] = {
                        ...existingRows[0],
                        available_quantity: existingRows.reduce((sum, row) =>
                            sum + parseFloat(row.available_quantity), 0) + parseFloat(selectedQuantity)
                    };

                    // Remove other existing rows and the original row
                    const rowsToRemove = new Set([
                        ...existingRows.slice(1).map(row => row.id),
                        rowToUpdate.id
                    ]);

                    // Filter out the removed rows
                    const newTableData = updatedTableData.filter(row => !rowsToRemove.has(row.id));
                    setTableData(newTableData);
                } else {
                    // Just update location
                    updatedTableData[rowIndex] = {
                        ...rowToUpdate,
                        location: {
                            area: selectedLocation.area,
                            scaffale: selectedLocation.scaffale,
                            colonna: selectedLocation.colonna,
                            piano: selectedLocation.piano
                        }
                    };
                    setTableData(updatedTableData);
                }
            } else {
                // Partial quantity move
                const remainingQuantity = parseFloat(rowToUpdate.available_quantity) - parseFloat(selectedQuantity);

                // Update original row with remaining quantity
                updatedTableData[rowIndex] = {
                    ...rowToUpdate,
                    available_quantity: remainingQuantity
                };

                if (existingRows.length > 0) {
                    // Add to first existing row and merge all others
                    const existingRowIndex = updatedTableData.indexOf(existingRows[0]);
                    updatedTableData[existingRowIndex] = {
                        ...existingRows[0],
                        available_quantity: existingRows.reduce((sum, row) =>
                            sum + parseFloat(row.available_quantity), 0) + parseFloat(selectedQuantity)
                    };

                    // Remove other existing rows
                    const rowsToRemove = new Set(existingRows.slice(1).map(row => row.id));
                    const newTableData = updatedTableData.filter(row => !rowsToRemove.has(row.id));
                    setTableData(newTableData);
                } else {
                    // Create new row for moved quantity
                    const newRow = {
                        ...rowToUpdate,
                        id: uuidv4(),
                        available_quantity: parseFloat(selectedQuantity),
                        location: {
                            area: selectedLocation.area,
                            scaffale: selectedLocation.scaffale,
                            colonna: selectedLocation.colonna,
                            piano: selectedLocation.piano
                        }
                    };

                    // Insert the new row right after the original row
                    updatedTableData.splice(rowIndex + 1, 0, newRow);
                    setTableData(updatedTableData);
                }
            }

            notification.success({
                message: 'Successo',
                description: `Posizione aggiornata con successo`,
                placement: 'bottomRight',
            });

            handleChangeLocationQuantityModalClose();
            handleLocationChangeModalClose();

        } catch (error) {
            console.error('Error updating location:', error);
            notification.error({
                message: 'Errore',
                description: 'Errore durante l\'aggiornamento della posizione.',
                placement: 'bottomRight',
            });
        }
    };

    const resetInputSearch = () => {
        setOrdineLavoro('');
        setArticoloInput('');

    };

    // Add function to close the quantity modal
    const handleChangeLocationQuantityModalClose = () => {
        setChangeLocationQuantityModalVisible(false);
        setSelectedLocation(null);
        setSelectedQuantity(0);
        setMaxAvailableQuantity(0);
    };
    const fetchItems = async () => {
        try {
            //setLoading(true);
            const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-items`, {
                params: {
                    articleFilter

                },
            });

            if (response.data && response.data.items) {
                setLocazioni(response.data.items);

            } else {
                setLocazioni([]);
            }
        } catch (error) {
            console.error('Error fetching items:', error);
            message.error('Failed to fetch items. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const groupLocations = (items) => {
        const groupedMap = new Map();

        items.forEach(item => {
            const key = `${item.area}-${item.scaffale}-${item.colonna}-${item.piano}`;

            if (groupedMap.has(key)) {
                const existing = groupedMap.get(key);
                groupedMap.set(key, {
                    ...existing,
                    totalQta: parseFloat(existing.totalQta) + parseFloat(item.qta),
                });
            } else {
                groupedMap.set(key, {
                    ...item,
                    totalQta: parseFloat(item.qta)
                });
            }
        });

        return Array.from(groupedMap.values());
    };



    const rowClassName = (record) => {
        if (record.status === 'completed') {
            return 'completed-row';
        }
        if (highlightedRows.has(record.id)) {
            return 'highlighted-row';
        }
        return record.missing ? 'missing-row' : '';
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };
    const handleKeyPressArticolo = (e) => {
        if (e.key === 'Enter') {
            handleArticoloPicking();
        }
    };
    const tableStyle = {
        tableLayout: 'fixed', // Fix the table layout to control column width
    };

    const dataSource = locazioni.map(item => ({
        key: item.id_art, // Unique key for each row
        id_art: item.id_art,
        fornitore: item.fornitore,
        totalQta: item.totalQta,
        description: item.description, // Concatenated description from backend
        subItems: item.subItems,
    }));

    // Update the handlePickFromRow function to be async and handle state updates properly
    const handlePickFromRow = async (record) => {
        if (!record.location) {
            notification.error({
                message: 'Errore',
                description: 'Posizione non disponibile per questo articolo.',
                placement: 'bottomRight',
            });
            return;
        }

        const locationString = `${record.location.area}-${record.location.scaffale}-${record.location.colonna}-${record.location.piano}`;

        // Update states using Promise to ensure they're set before continuing
        await new Promise(resolve => {
            setArticolo(record.occ_arti);
            setScaffale(locationString);
            setSelectedRowId(record.id);
            // Use a short timeout to ensure state updates are processed
            setTimeout(resolve, 50);
        });

        // Set quantity modal data
        setQuantityModalData({
            mode: 'exact',
            rowIndex: tableData.indexOf(record),
            rowData: record
        });

        // Set initial picked quantity
        setPickedQuantity(record.available_quantity);
        setMaxAvailableQuantity(record.available_quantity);

        // Now that all data is ready, show the modal
        setQuantityModalVisible(true);
    };

    // Add a helper function to check if a row can be picked
    const canPickRow = (record) => {
        return !record.missing &&
            record.location &&
            !highlightedRows.has(record.id) &&
            parseFloat(record.available_quantity) > 0;
    };

    // Update the table to show why a row can't be picked
    const getRowTooltip = (record) => {
        if (record.missing) {
            return 'Articolo mancante';
        }
        if (!record.location) {
            return 'Posizione non disponibile';
        }
        if (highlightedRows.has(record.id)) {
            return 'Già prelevato';
        }
        if (parseFloat(record.available_quantity) <= 0) {
            return 'Quantità non disponibile';
        }
        return '';
    };

    const handlePrelevaTuttoConfirm = () => {
        if (!selectedLocation) return;

        const updatedTableData = [...tableData];
        const rowsToUpdate = updatedTableData.filter(row => 
            row.occ_arti === articleFilter && 
            !highlightedRows.has(row.id)
        );

        if (rowsToUpdate.length === 0) return;

        // Find the first occurrence index to maintain position
        const firstOccurrenceIndex = updatedTableData.findIndex(row => 
            row.id === rowsToUpdate[0].id
        );

        // Create consolidated row at original position
        const totalQuantity = rowsToUpdate.reduce((sum, row) => sum + row.available_quantity, 0);
        const newRow = {
            ...rowsToUpdate[0],
            id: uuidv4(),
            available_quantity: totalQuantity,
            location: {
                area: selectedLocation.area,
                scaffale: selectedLocation.scaffale,
                colonna: selectedLocation.colonna,
                piano: selectedLocation.piano
            }
        };

        // Replace first occurrence and remove others
        const newTableData = updatedTableData
            .filter(row => !(row.occ_arti === articleFilter && !highlightedRows.has(row.id) && row.id !== rowsToUpdate[0].id))
            .map(row => row.id === rowsToUpdate[0].id ? newRow : row);

        setTableData(newTableData);
        setPrelevaTuttoModalVisible(false);
        handleLocationChangeModalClose();
        
        notification.success({
            message: 'Successo',
            description: 'Tutte le quantità sono state spostate nella posizione selezionata',
            placement: 'bottomRight',
        });
    };

    return (
        <Layout style={{ minHeight: '100%' }}>

            <Modal
                title={
                    <div>
                        <div>Locazioni articolo</div>
                        <div style={{
                            fontSize: '0.9em',
                            marginTop: '8px',
                            color: 'rgba(0, 0, 0, 0.45)'
                        }}>
                            {dataSource[0]?.description || ''}
                        </div>
                    </div>
                }
                visible={locationChangeModalVisible}
                onOk={handleLocationChangeModalClose}
                onCancel={handleLocationChangeModalClose}
                okText=""
                cancelText="Chiudi"
                width="auto"
                style={{
                    maxWidth: '90vw',
                    minWidth: '90vw',
                    top: 20
                }}
                bodyStyle={{
                    maxHeight: 'calc(100vh - 200px)',
                    overflow: 'auto'
                }}
            >
                {dataSource.length > 0 && (
                    <Table
                        dataSource={groupLocations(dataSource[0].subItems).map(subItem => ({
                            key: `${subItem.id_mov}-${subItem.area}-${subItem.scaffale}-${subItem.colonna}-${subItem.piano}`,
                            id_mov: subItem.id_mov,
                            area: subItem.area,
                            scaffale: subItem.scaffale,
                            colonna: subItem.colonna,
                            piano: subItem.piano,
                            totalQta: subItem.totalQta,
                        }))}
                        columns={subColumns.filter(col => col.key !== 'description')}
                        pagination={false}
                        rowKey="key"
                        scroll={{ x: 'max-content' }}
                        className="striped-table"
                        size="small" // Makes the table more compact
                    />
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
                        <Text>Quantità disponibile in questa posizione: </Text>
                        <Text strong>{maxAvailableQuantity}</Text>
                    </div>
                    <div>
                        <Text>Quantità nella riga selezionata: </Text>
                        <Text strong>{tableData.find(row => row.id === selectedRowId)?.available_quantity || 0}</Text>
                    </div>
                    {maxAvailableQuantity < quantityNeeded && (
                        <Alert
                            message="Nota"
                            description={`Questa posizione ha una quantità inferiore a quella richiesta. 
                            Sarà necessario prelevare la quantità rimanente da un'altra posizione.`}
                            type="warning"
                            showIcon
                        />
                    )}
                    <Form.Item label="Quantità da prelevare">
                        <InputNumber
                            min={1}
                            max={maxAvailableQuantity}
                            value={selectedQuantity}
                            onChange={value => setSelectedQuantity(value)}
                            style={{ width: '100%' }}
                        />
                    </Form.Item>
                </Space>
            </Modal>


            <Modal
                title="Conferma Quantità da Prelevare"
                visible={quantityModalVisible}
                onOk={handleQuantityConfirm}
                onCancel={handleQuantityCancel}
                confirmLoading={confirmLoading} // Apply loading state to the modal
                okText="Conferma"
                cancelText="Annulla"
            >
                {quantityModalData && quantityModalData.mode === 'exact' && (
                    <>
                        <p>Sei sicuro di voler prelevare <strong>{quantityModalData.rowData.occ_arti}</strong> da <strong>{quantityModalData.rowData.location.area}-{quantityModalData.rowData.location.scaffale}-{quantityModalData.rowData.location.colonna}-{quantityModalData.rowData.location.piano}</strong>?</p>
                        <p>Quantità da prelevare: <strong>{quantityModalData.rowData.available_quantity}</strong></p>


                    </>
                )}
                {quantityModalData && quantityModalData.mode === 'forced' && (
                    <>
                        <p>Sei sicuro di voler effettuare un prelievo forzato di <strong>{quantityModalData.forcedPickingInfo.articolo}</strong> da <strong>{quantityModalData.forcedPickingInfo.scaffale}</strong>?</p>
                        <p>Movimento: <strong>{quantityModalData.forcedPickingInfo.movimento}</strong></p>
                        <p>Inserisci la quantità da prelevare: (FORZATO)</p>
                        <InputNumber
                            min={0}

                            value={pickedQuantity}
                            onChange={(value) => setPickedQuantity(value)}
                            style={{ width: '100%' }}
                        />
                    </>
                )}
            </Modal>

            <Modal
                title="Conferma Prelievo Totale"
                visible={prelevaTuttoModalVisible}
                onOk={handlePrelevaTuttoConfirm}
                onCancel={() => setPrelevaTuttoModalVisible(false)}
                okText="Conferma"
                cancelText="Annulla"
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <div>
                        <Text strong>Quantità totale richiesta:</Text> {quantityNeeded}
                    </div>
                    <div>
                        <Text strong>Quantità disponibile in questa posizione:</Text> 
                        {calculateAvailableQuantity(selectedLocation, articleFilter)}
                    </div>
                    {calculateAvailableQuantity(selectedLocation, articleFilter) < quantityNeeded && (
                        <Alert
                            message="Attenzione"
                            description="Questa posizione non ha sufficiente quantità per tutto l'articolo. Verrà prelevato solo quanto disponibile."
                            type="warning"
                            showIcon
                        />
                    )}
                </Space>
            </Modal>

            <Modal
                title={`Dettagli Articolo Mancante - ${missingArticleData?.c_articolo || ''}`}
                visible={showMissingArticleModal}
                onCancel={() => setShowMissingArticleModal(false)}
                footer={null}
                width={600}
            >
                {missingArticleData && (
                    <div style={{ padding: '20px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                                {missingArticleData.lt !== null && (
                                    <tr>
                                        <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
                                            <strong>Lead Time (gg):</strong>
                                        </td>
                                        <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
                                            {missingArticleData.lt}
                                        </td>
                                    </tr>
                                )}
                                <tr>
                                    <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
                                        <strong>Arrivo Mese Corrente:</strong>
                                    </td>
                                    <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
                                        {missingArticleData.off_mc}
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
                                        <strong>Arrivo Mese Successivo:</strong>
                                    </td>
                                    <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
                                        {missingArticleData.off_ms}
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
                                        <strong>Arrivo nei Prossimi due Mesi:</strong>
                                    </td>
                                    <td style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
                                        {missingArticleData.off_msa}
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '8px' }}>
                                        <strong>Arrivo Mesi Successivi:</strong>
                                    </td>
                                    <td style={{ padding: '8px' }}>
                                        {missingArticleData.off_mss}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}
            </Modal>


            <Sider width={"50%"} style={{ background: '#fff' }}>
                <Space direction="vertical" style={{ width: '100%', padding: '20px' }}>
                    <Tabs onChange={() => resetInputSearch()} defaultActiveKey="1" centered>
                        {/* ODL Tab */}
                        <TabPane tab="ODL" key="1">
                            <Input.Group compact>
                                <Input
                                    style={{ width: 'calc(100% - 100px)' }}
                                    placeholder="Ordine di lavoro"
                                    value={ordineLavoro}
                                    onChange={(e) => setOrdineLavoro(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                />
                                <Button type="primary" style={{ width: '100px' }} loading={loading} onClick={handleSearch}>
                                    Cerca ODL
                                </Button>
                            </Input.Group>
                        </TabPane>

                        {/* ARTICOLO Tab */}
                        <TabPane tab="ARTICOLO" key="2">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Input
                                    placeholder="Articolo"
                                    value={articoloInput}
                                    onChange={(e) => setArticoloInput(e.target.value)}
                                    style={{ flexGrow: 7 }} // Represents 70% proportionally
                                    onKeyPress={handleKeyPressArticolo}
                                />
                                <InputNumber
                                    min={1}
                                    value={articoloQuantity}
                                    onChange={(value) => setArticoloQuantity(value)}
                                    style={{ flexGrow: 1 }} // Represents 10% proportionally
                                    onKeyPress={handleKeyPressArticolo}
                                />
                                <Button
                                    type="primary"
                                    loading={articoloLoading}
                                    onClick={handleArticoloPicking}
                                    style={{ flexGrow: 2 }} // Represents 20% proportionally
                                >
                                    Cerca Articolo
                                </Button>
                            </div>

                        </TabPane>

                    </Tabs>

                    {/* Loading spinner */}
                    {loading ? (
                        <div style={centeredStyle}>
                            <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
                        </div>
                    ) : (
                        <Table
                            columns={columns}
                            dataSource={tableData.filter(row => row.available_quantity > 0)}
                            pagination={false}
                            scroll={{ y: 'calc(100vh - 250px)' }}
                            rowKey="id"
                            rowClassName={rowClassName}
                            style={tableStyle}
                            onRow={(record) => ({
                                title: getRowTooltip(record),
                            })}
                        />
                    )}
                </Space>
            </Sider>
            <Layout>
                <div style={{ padding: '20px', background: '#fff' }}>
                    <Input.Group compact style={{ display: 'none' }}> {/* Hide the manual input form */}
                        <Button
                            type="default"
                            icon={<CloseCircleOutlined />}
                            onClick={() => {
                                setScaffale('');
                                setArticolo('');
                            }}
                            style={{ width: 'calc(5% - 10px)' }}
                        />
                        <Input
                            ref={scaffaleRef}
                            style={{ width: 'calc(45% - 10px)', marginRight: '10px' }}
                            placeholder="Scaffale"
                            value={scaffale}
                            onChange={(e) => {
                                setScaffale(e.target.value.replace(/'/g, '-'));
                            }}
                            onPressEnter={() => {
                                if (articoloRef.current) {
                                    articoloRef.current.focus();
                                }
                            }}
                        />
                        <Input
                            ref={articoloRef}
                            style={{ width: 'calc(50% - 10px)' }}
                            placeholder="Articolo"
                            value={articolo}
                            onChange={(e) => setArticolo(e.target.value.trim())}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleHighlight();
                                }
                            }}
                        />
                    </Input.Group>
                </div>
                <Content style={{ padding: '20px' }}>
                    <div className="view-magazzino">
                        {loading ? (
                            <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
                        ) : (
                            <div className="view-magazzino">

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


                </Content>
            </Layout>
        </Layout>
    );
};

export default Picking;