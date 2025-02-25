import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Input, Button, Table, Layout, Space, message, Tooltip, Spin, Tag, Modal, InputNumber, Pagination, Form, Alert, Typography, Checkbox } from 'antd';
import axios from 'axios';
import { QuestionCircleOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';

import './Picking.css';
import { LoadingOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import { notification } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { Tabs } from 'antd';
import { CloseCircleOutlined } from '@ant-design/icons';
import WarehouseGridSystem from './WarehouseGridSystem';
const { Text } = Typography;

const { TabPane } = Tabs;
const { Content, Sider } = Layout;

const Picking = () => {
    const [groupLocationModalVisible, setGroupLocationModalVisible] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [groupedLocations, setGroupLocations] = useState([]);
    const [selectedRowId, setSelectedRowId] = useState(null);
    const [changeLocationQuantityModalVisible, setChangeLocationQuantityModalVisible] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [selectedQuantity, setSelectedQuantity] = useState(0);
    const [activeTab, setActiveTab] = useState('1'); // '1' for ODL, '2' for Articolo

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

    // Add new state for expanded rows
    const [expandedRowKeys, setExpandedRowKeys] = useState([]);

    // Add new state variables
    const [groupPickModalVisible, setGroupPickModalVisible] = useState(false);

    // 1. Add new state variables
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [selectedRows, setSelectedRows] = useState([]);
    const [multiLocationModalVisible, setMultiLocationModalVisible] = useState(false);

    // 1. Fix and add logging to toggleMultiSelectMode
    const toggleMultiSelectMode = () => {
        console.log("Toggling multi-select mode, current:", multiSelectMode);
        if (multiSelectMode) {
            // Clear selections when exiting multi-select mode
            setSelectedRows([]);
        }
        setMultiSelectMode(!multiSelectMode);
    };

    // 2. Add logging to getColumnConfig
    const getColumnConfig = () => {
        console.log("Getting column config, multiSelectMode:", multiSelectMode);
        // IMPORTANT: Don't return just the checkbox - merge with existing columns
        const baseColumns = [...columns]; // Use your existing columns array here

        if (multiSelectMode) {
            console.log("Adding checkbox column to:", baseColumns.map(c => c.title));
            // Add checkbox column at the beginning
            return [
                {
                    title: 'Seleziona',
                    key: 'selection',
                    width: 60,
                    render: (_, record) => {
                        // Only allow selection of non-parent, non-completed, non-highlighted rows
                        const canSelect = !record.isParent &&
                            record.status !== 'completed' &&
                            !highlightedRows.has(record.id) &&
                            record.location; // Must have a location

                        console.log("Checkbox for record:", record.id, "canSelect:", canSelect);

                        return (
                            <Checkbox
                                checked={selectedRows.some(row => row.id === record.id)}
                                onChange={(e) => {
                                    console.log("Checkbox changed:", record.id, e.target.checked);
                                    if (canSelect) {
                                        handleRowSelect(record, e.target.checked);
                                    }
                                }}
                                disabled={!canSelect}
                            />
                        );
                    }
                },
                ...baseColumns
            ];
        }

        return baseColumns;
    };

    // 3. Add logging to handleRowSelect
    const handleRowSelect = (record, selected) => {
        console.log("Row select handler called:", record.id, selected);
        if (selected) {
            const newSelectedRows = [...selectedRows, record];
            console.log("Adding to selected rows, new count:", newSelectedRows.length);
            setSelectedRows(newSelectedRows);
        } else {
            const newSelectedRows = selectedRows.filter(row => row.id !== record.id);
            console.log("Removing from selected rows, new count:", newSelectedRows.length);
            setSelectedRows(newSelectedRows);
        }
    };

    // 4. Function to handle the multi-location change



    // 7. Add a button to enable multi-select mode and handle multiple location changes
    // Add this to your layout where appropriate
    const MultiSelectControls = () => (
        <>
            {!multiSelectMode ? (
                <Button
                    type="primary"
                    onClick={() => {
                        console.log("Enabling multi-select mode");
                        toggleMultiSelectMode();
                    }}
                    style={{ marginBottom: 16 }}
                >
                    Cambia locazione multipla
                </Button>
            ) : (
                <Space style={{ marginBottom: 16 }}>
                    <Button onClick={() => {
                        console.log("Canceling multi-select mode");
                        toggleMultiSelectMode();
                    }}>
                        Annulla
                    </Button>
                    <Button
                        type="primary"
                        onClick={openMultiLocationModal}
                        disabled={selectedRows.length === 0}
                        loading={loadingLocations} // Add loading state to button
                    >
                        Cambia locazione ({selectedRows.length})
                    </Button>
                </Space>
            )}
        </>
    );

    // Add function to handle row expansion
    const onExpandedRowsChange = (expandedRows) => {
        setExpandedRowKeys(expandedRows);
    };

    // Modify the groupDataByParent function
    const groupDataByParent = (data) => {
        const groupedData = new Map();
        const processedIds = new Set(); // Track which items have been processed

        // First pass: Create parent groups and track picked quantities
        data.forEach(item => {
            if (item.mpl_padre) {
                const parentKey = item.mpl_padre;

                if (!groupedData.has(parentKey)) {
                    groupedData.set(parentKey, {
                        id: parentKey,
                        occ_arti: parentKey,
                        occ_desc_combined: `Distinta ${parentKey}`,
                        isParent: true,
                        children: [],
                        pickedMap: new Map()
                    });
                }

                const parentGroup = groupedData.get(parentKey);
                const articleKey = item.occ_arti;

                // Track picked quantities per article
                if (!parentGroup.pickedMap.has(articleKey)) {
                    parentGroup.pickedMap.set(articleKey, {
                        picked: parseFloat(item.picked_quantity) || 0,
                        data: item
                    });
                }

                // Mark this item as processed
                processedIds.add(item.id);
            }
        });

        // Second pass: Create children entries
        data.forEach(item => {
            if (item.mpl_padre) {
                const parentGroup = groupedData.get(item.mpl_padre);
                const articleKey = item.occ_arti;

                // Add picked quantity row once per article
                if (parentGroup.pickedMap.has(articleKey)) {
                    const pickedEntry = parentGroup.pickedMap.get(articleKey);
                    if (pickedEntry.picked > 0 && !parentGroup.children.some(c => c.status === 'completed' && c.occ_arti === articleKey)) {
                        parentGroup.children.push({
                            ...pickedEntry.data,
                            // Keep the original ID but make it unique for completed items
                            id: `${pickedEntry.data.id}-completed`,
                            available_quantity: pickedEntry.picked,
                            status: 'completed',
                            isChildRow: true,
                            mpl_padre: parentGroup.id
                        });
                    }
                }

                // Add individual location rows - IMPORTANT: Preserve the original item ID
                if (parseFloat(item.available_quantity) > 0) {
                    parentGroup.children.push({
                        ...item,
                        // Preserve original ID instead of generating a new one
                        isChildRow: true
                    });
                }
            }
        });

        // Third pass: Add only items without mpl_padre that haven't been processed
        console.log(data)

        data.forEach(item => {
            if (!item.mpl_padre && !processedIds.has(item.id)) {
                groupedData.set(item.id, {
                    ...item,
                    children: [],
                    isParent: false
                });
            }
        });

        // Clean up parent groups
        groupedData.forEach(group => {
            if (group.isParent) {
                delete group.pickedMap;
            }
        });

        return Array.from(groupedData.values());
    };

    // Modify the table configuration
    const expandableConfig = {
        expandedRowKeys,
        onExpandedRowsChange,
        expandIcon: ({ expanded, onExpand, record }) => {
            if (!record.children || record.children.length === 0) return null;
            return expanded ? (
                <Button
                    icon={<MinusOutlined />}
                    onClick={e => onExpand(record, e)}
                    type="text"
                    size="small"
                />
            ) : (
                <Button
                    icon={<PlusOutlined />}
                    onClick={e => onExpand(record, e)}
                    type="text"
                    size="small"
                />
            );
        }
    };

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
                
                const response = await fetch(`${process.env.REACT_APP_API_URL}/api/update-pacchi`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        articolo,
                        area: area,
                        scaffale: scaffalePart,
                        colonna: colonna,
                        piano: piano,
                        movimento,
                        quantity: pickedQuantity, // Include the picked quantity
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
                    description: `Articolo ${articolo} prelevato da ${area}-${scaffalePart}-${colonna}-${piano}`,
                    placement: 'bottomRight'
    
                });
                // Make the API call
              
                
                // Only proceed with UI updates if the API call succeeds
                if (pickedQuantity === rowData.available_quantity) {
                    // User picked the entire quantity; highlight the row normally
                    setHighlightedRows(prev => new Set(prev).add(rowData.id));
                } else {
                    // User picked a partial quantity
                    // Update the original row by subtracting the picked quantity
                    updatedTableData[rowIndex] = {
                        ...rowData,
                        available_quantity: parseFloat(rowData.available_quantity) - parseFloat(pickedQuantity),
                    };
            
                    // Create a new row for the picked quantity
                    const newRow = {
                        ...rowData,
                        available_quantity: parseFloat(pickedQuantity),
                        picked_quantity: parseFloat(pickedQuantity),
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
            
                // Update UI state
                setTableData(updatedTableData);
                setQuantityModalVisible(false);
                setQuantityModalData(null);
                
                
            
            } catch (error) {
                // Handle API failure
                console.error("Error updating pacchi:", error);
                notification.error({
                    message: 'Errore',
                    description: 'Il prelievo non è stato registrato. Si prega di riprovare.',
                    placement: 'bottomRight',
                    duration: 5,
                });
                
                // Don't close the modal so user can retry
                setConfirmLoading(false);
                return; // Important: Exit the function early
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
            // For Articolo tab, use articoloQuantity directly
            if (activeTab === '2') {
                setQuantityNeeded(articoloQuantity);
            } else {
                // Existing ODL logic
                const totalNeeded = tableData
                    .filter(row =>
                        row.occ_arti === article &&
                        !highlightedRows.has(row.id) && row.status != 'completed' &&
                        row.isChildRow
                    )
                    .reduce((sum, row) => sum + row.available_quantity, 0);
                setQuantityNeeded(totalNeeded);
            }
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
        setSelectedRows([]);
        if (multiSelectMode) {
            setMultiSelectMode(false);
        }
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
        setSelectedRows([]);
        if (multiSelectMode) {
            setMultiSelectMode(false);
        }
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
                const completedRow = parentItem.total_picked > 0 && !parentItem.mpl_padre ? [{
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
    const handleGroupLocationModalVisible = (record) => {
        setSelectedGroup(record);
        setGroupLocationModalVisible(true);
        // Fetch available locations that can accommodate all items
        fetchGroupLocations(record);
    };

    // Add function to fetch locations for the group
    const fetchGroupLocations = async (group) => {
        try {
            // Create a structured array of articles and their quantities
            const articlesData = group.children.map(child => ({
                article: child.occ_arti,
                quantity: parseFloat(child.available_quantity || 0)
            }));

            const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-group-locations`, {
                params: {
                    articlesData: JSON.stringify(articlesData)
                }
            });

            if (response.data && response.data.locations) {
                setGroupLocations(response.data.locations);
            } else {
                setGroupLocations([]);
                notification.warning({
                    message: 'Attenzione',
                    description: 'Nessuna locazione disponibile per tutti gli articoli del gruppo'
                });
            }
        } catch (error) {
            console.error('Error fetching group locations:', error);
            notification.error({
                message: 'Errore',
                description: 'Impossibile recuperare le locazioni disponibili'
            });
        }
    };
    const columns = [
        // Update the Articolo column render function
        {
            title: 'Articolo',
            dataIndex: 'occ_arti',
            key: 'occ_arti',
            render: (text, record) => (
                record.isParent ? (
                    <span style={{ fontWeight: 600 }}>
                        {record.mpl_padre || record.id} {/* Show mpl_padre if available */}
                    </span>
                ) : (
                    <span>{text}</span>
                )
            )
        },
        {
            title: 'Descrizione',
            dataIndex: 'occ_desc_combined',
            key: 'occ_desc_combined',
            render: (text, record) => (
                <span>
                    {record.isParent ? (
                        "Distinta"
                    ) : (
                        text.length > 10 ? (
                            <Tooltip title={text} placement="topLeft">
                                {text.substring(0, 10)}...
                                <InfoCircleOutlined style={{ marginLeft: 4 }} />
                            </Tooltip>
                        ) : (
                            text
                        )
                    )}
                </span>
            ),
        },
        {
            title: 'Q.ta Da prelevare',
            dataIndex: 'available_quantity',
            key: 'available_quantity',
            render: (text, record) => {
                if (record.isParent) {
                    // Calculate minimum needed quantity from children
                    const childQuantities = record.children?.map(child =>
                        parseFloat(child.needed_quantity || 0)
                    ).filter(q => q > 0) || [];

                    const minQuantity = childQuantities.length > 0
                        ? Math.min(...childQuantities)
                        : 'N/A';

                    return <span>{minQuantity}</span>;
                }
                return <span>{text}</span>;
            },
        },

        {
            title: 'Posizione',
            dataIndex: 'location',
            key: 'location',
            render: (location, record) => {
                // For parent/expandable rows
                if (record.isParent) {
                    // Check if any child has missing items
                    const hasAnyMissingChild = record.children?.some(child => child.missing);

                    if (hasAnyMissingChild) {
                        return <Tag color="red">Incompleto</Tag>;
                    }

                    // Check if all children have the same location
                    const locations = record.children
                        .filter(child => child.location) // Filter out items without location
                        .map(child => `${child.location.area}-${child.location.scaffale}-${child.location.colonna}-${child.location.piano}`);

                    if (locations.length === 0) {
                        return null;
                    }

                    const allSameLocation = locations.every(loc => loc === locations[0]);

                    return allSameLocation ? (
                        <Tag
                            color="geekblue"
                            style={{
                                wordBreak: 'break-word',
                                whiteSpace: 'normal',
                                cursor: 'pointer'
                            }}
                            onClick={() => handleGroupLocationModalVisible(record)}
                        >
                            {locations[0]}
                        </Tag>
                    ) : (
                        <Tag
                            color="orange"
                            style={{
                                cursor: 'pointer'
                            }}
                            onClick={() => handleGroupLocationModalVisible(record)}
                        >
                            Diverse
                        </Tag>

                    );
                }

                // For child rows - original logic
                return (
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
                );
            },
        },
        {
            title: 'Azioni',
            key: 'actions',
            render: (_, record) => {
                const isCompleted = record.status === 'completed';
                const isDisabled = isCompleted || record.missing || highlightedRows.has(record.id);

                // For parent rows: check if any child is missing
                const hasMissingChildren = record.isParent && record.children?.some(child => child.missing);

                if (isDisabled || hasMissingChildren) {
                    return null;
                }

                return (
                    <Space>
                        {record.isParent ? (
                            <Button
                                type="default"
                                onClick={() => {
                                    // ... existing code ...
                                    setSelectedGroup({
                                        ...record,
                                        children: record.children.filter(child =>
                                            !highlightedRows.has(child.id) && child.status !== 'completed'
                                        )
                                    });
                                    setGroupPickModalVisible(true);
                                    console.log(selectedGroup)

                                }}
                            >
                                Preleva distinta
                            </Button>
                        ) : (
                            <Button
                                type="primary"
                                onClick={() => handlePickFromRow(record)}
                            >
                                Preleva
                            </Button>
                        )}
                    </Space>
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
            title: 'Q.ta',
            dataIndex: 'totalQta',
            key: 'availableQta',
            render: (totalQta, record) => {
                const availableQty = calculateAvailableQuantity(record, articleFilter);
                return (
                    <Tooltip title={
                        <div style={{ whiteSpace: 'nowrap' }}>
                            <div>Totale: {totalQta}</div>
                            <div>Disponibile: {availableQty}</div>
                        </div>
                    }>
                        <span>{availableQty} / {totalQta}</span>
                    </Tooltip>
                );
            },
            width: 110, // Set width to 100px
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

                const totalQta = record.totalQta;
                // Use articoloQuantity for Articolo tab, quantityNeeded for ODL tab
                const requiredQty = activeTab === '2' ? articoloQuantity : quantityNeeded;
                const canTakeAll = totalQta >= requiredQty;

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
                                Seleziona questa locazione per l'intera quantità
                            </Button>
                        )}
                    </Space>
                );
            },
        }
    ];
    const handleGroupLocationChange = async (newLocation) => {
        if (!selectedGroup || !newLocation) return;

        try {
            const [area, scaffale, colonna, piano] = newLocation.split('-');
            const updatedTableData = [...tableData];

            // Update all children in the group
            selectedGroup.children.forEach(child => {
                const rowIndex = updatedTableData.findIndex(row => row.id === child.id);
                if (rowIndex !== -1) {
                    updatedTableData[rowIndex] = {
                        ...updatedTableData[rowIndex],
                        location: { area, scaffale, colonna, piano }
                    };
                }
            });

            setTableData(updatedTableData);
            setGroupLocationModalVisible(false);
            setSelectedGroup(null);
            setGroupLocations([]);

            notification.success({
                message: 'Successo',
                description: 'Locazione aggiornata per tutti gli articoli del gruppo',
                placement: 'bottomRight',
            });
        } catch (error) {
            notification.error({
                message: 'Errore',
                description: 'Errore durante l\'aggiornamento delle locazioni',
                placement: 'bottomRight',
            });
        }
    };
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
        // Add null check to prevent forEach on undefined
        if (!items || !Array.isArray(items)) {
            console.warn("groupLocations received invalid input:", items);
            return []; // Return empty array instead of throwing error
        }

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
        let className = '';

        if (record.status === 'completed') {
            className += 'completed-row ';
        }
        if (highlightedRows.has(record.id)) {
            className += 'highlighted-row ';
        }
        if (record.isParent) {
            className += 'parent-row ';
        } else if (!record.isParent && record.mpl_padre) {
            className += 'child-row '; // Add child-row class for nested rows
        }
        if (record.missing) {
            className += 'missing-row ';
        }

        return className.trim();
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
        // Exclude completed rows and highlighted rows from consolidation
        const rowsToUpdate = updatedTableData.filter(row =>
            row.occ_arti === articleFilter &&
            !highlightedRows.has(row.id) &&
            row.status !== 'completed' // Add status check
        );

        if (rowsToUpdate.length === 0) return;

        // Find the first occurrence index to maintain position
        const firstOccurrenceIndex = updatedTableData.findIndex(row =>
            row.id === rowsToUpdate[0].id
        );
        let totalQuantity;
        // Create consolidated row at original position
        if (activeTab === '1') {
            totalQuantity = rowsToUpdate.reduce((sum, row) => sum + row.available_quantity, 0);
        } else {
            totalQuantity = articoloQuantity;

        }
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
            .filter(row => !(
                row.occ_arti === articleFilter &&
                !highlightedRows.has(row.id) &&
                row.status !== 'completed' && // Match the same filter
                row.id !== rowsToUpdate[0].id
            ))
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

    // Add new function to check if group has missing items
    const hasGroupMissingItems = (record) => {
        if (record.children) {
            return record.children.some(child => child.missing);
        }
        return record.missing;
    };

    // Add the group pick modal component
    const GroupPickModal = () => (
        <Modal
            title="Preleva distinta"
            visible={groupPickModalVisible}
            onCancel={() => setGroupPickModalVisible(false)}
            footer={[
                <Button key="back" onClick={() => setGroupPickModalVisible(false)}>
                    Annulla
                </Button>,
                <Button
                    key="submit"
                    type="primary"
                    onClick={() => handleGroupPick()}
                >
                    Conferma prelievo
                </Button>,
            ]}
            width={800}
        >
            {selectedGroup && (
                <div>
                    <div style={{ marginBottom: 16 }}>
                        <Text strong>Distinta articolo: </Text>
                        <Text>{selectedGroup.occ_arti}</Text>
                    </div>

                    <Table
                        dataSource={selectedGroup.children}
                        columns={[
                            {
                                title: 'Articolo',
                                dataIndex: 'occ_arti',
                                key: 'occ_arti',
                            },
                            {
                                title: 'Quantità',
                                dataIndex: 'available_quantity',
                                key: 'available_quantity',
                            },
                            {
                                title: 'Posizione',
                                key: 'location',
                                render: (_, record) => (
                                    record.location ?
                                        `${record.location.area}-${record.location.scaffale}-${record.location.colonna}-${record.location.piano}` :
                                        'Mancante'
                                ),
                            },
                        ]}
                        pagination={false}
                        rowKey="id"
                    />
                </div>
            )}
        </Modal>
    );

    // Add the group pick handler
    // Add the group pick handler
    const handleGroupPick = async () => {
        if (!selectedGroup) return;

        try {
            // Create arrays to collect successful picks
            let successfulPicks = [];
            let failedPicks = [];

            // Process each child item
            for (const child of selectedGroup.children) {
                try {
                    // Skip if already highlighted
                    if (highlightedRows.has(child.id)) continue;

                    // Call update-pacchi API for each item
                    const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/update-pacchi`, {
                        articolo: child.occ_arti,
                        quantity: child.available_quantity,
                        area: child.location.area,
                        scaffale: child.location.scaffale,
                        colonna: child.location.colonna,
                        piano: child.location.piano,
                        movimento: child.movimento || '',
                        odl: ordineLavoro
                    });

                    if (response.data.success) {
                        successfulPicks.push(child.id);

                        // Log the operation

                    } else {
                        failedPicks.push(child.occ_arti);
                    }
                } catch (error) {
                    console.error(`Error picking ${child.occ_arti}:`, error);
                    failedPicks.push(child.occ_arti);
                }
            }

            // Update UI state after all operations
            if (successfulPicks.length > 0) {
                setHighlightedRows(prev => new Set([...prev, ...successfulPicks]));
                setHighlightedShelves(prev => new Set([
                    ...prev,
                    ...successfulPicks.map(id => {
                        const child = selectedGroup.children.find(c => c.id === id);
                        return `${child.location.area}-${child.location.scaffale}-${child.location.colonna}-${child.location.piano}`;
                    })
                ]));
            }

            // Show results notification
            if (failedPicks.length === 0) {
                notification.success({
                    message: 'Successo',
                    description: `Tutti i ${successfulPicks.length} articoli sono stati prelevati con successo`,
                    placement: 'bottomRight'
                });
            } else {
                notification.warning({
                    message: 'Risultato parziale',
                    description: (
                        <div>
                            <p>Articoli prelevati: {successfulPicks.length}</p>
                            <p>Articoli non prelevati: {failedPicks.length}</p>
                            {failedPicks.length > 0 && (
                                <p>Problemi con: {failedPicks.join(', ')}</p>
                            )}
                        </div>
                    ),
                    placement: 'bottomRight',
                    duration: 8
                });
            }

            setGroupPickModalVisible(false);
            setSelectedGroup(null);

        } catch (error) {
            console.error('Error during group pick:', error);
            notification.error({
                message: 'Errore',
                description: 'Si è verificato un errore durante il prelievo della distinta',
                placement: 'bottomRight'
            });
        }
    };

    // 1. Add state for loading locations
    const [loadingLocations, setLoadingLocations] = useState(false);

    // 2. Update the multi-location handler
    const handleMultiLocationChange = async (newLocation) => {
        if (!selectedRows.length || !newLocation) return;
    
        try {
            const [area, scaffale, colonna, piano] = newLocation.split('-');
            const updatedTableData = [...tableData];
            
            // Update all selected rows
            selectedRows.forEach(selectedRow => {
                // Find row in the table data (considering nested children)
                const findAndUpdateRow = (rows) => {
                    for (let i = 0; i < rows.length; i++) {
                        if (rows[i].id === selectedRow.id) {
                            rows[i] = {
                                ...rows[i],
                                location: { area, scaffale, colonna, piano }
                            };
                            return true;
                        }
                        
                        // Check children if present
                        if (rows[i].children && rows[i].children.length) {
                            if (findAndUpdateRow(rows[i].children)) {
                                return true;
                            }
                        }
                    }
                    return false;
                };
                
                findAndUpdateRow(updatedTableData);
            });
    
            setTableData(updatedTableData);
            setMultiLocationModalVisible(false);
            setSelectedRows([]);
            setMultiSelectMode(false);
    
            notification.success({
                message: 'Successo',
                description: `Locazione aggiornata per ${selectedRows.length} articoli selezionati`,
                placement: 'bottomRight',
            });
        } catch (error) {
            notification.error({
                message: 'Errore',
                description: 'Errore durante l\'aggiornamento delle locazioni',
                placement: 'bottomRight',
            });
        }
    };
    

    // 3. Add API call to fetch compatible locations
    const fetchMultiLocations = async () => {
        setLoadingLocations(true);
        try {
            // Create articlesData from selected rows similar to group handling
            const articlesData = selectedRows.map(row => ({
                article: row.occ_arti,
                quantity: parseFloat(row.available_quantity || 0)
            }));

            console.log("Fetching group locations for selected articles:", JSON.stringify(articlesData, null, 2));

            const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-group-locations`, {
                params: {
                    articlesData: JSON.stringify(articlesData)
                }
            });

            console.log("API response:", response.data);

            if (response.data?.locations) {
                setLocazioni(response.data.locations);
            } else {
                setLocazioni([]);
                notification.warning({
                    message: 'Nessuna locazione compatibile',
                    description: 'Non esistono locazioni che possono contenere tutti gli articoli selezionati',
                    placement: 'bottomRight'
                });
            }
        } catch (error) {
            console.error("Location fetch error:", error.response?.data || error.message);
            notification.error({
                message: 'Errore',
                description: error.response?.data?.message || 'Errore durante il recupero delle locazioni',
                placement: 'bottomRight'
            });
        } finally {
            setLoadingLocations(false);
        }
    };
    const fetchedRef = useRef(false);
    const openMultiLocationModal = async () => {
        if (selectedRows.length === 0) {
            notification.warning({
                message: 'Nessuna riga selezionata',
                description: 'Seleziona almeno una riga per cambiare la locazione',
                placement: 'bottomRight'
            });
            return;
        }

        // Show loading in the UI without opening the modal yet
        setLoadingLocations(true);

        try {
            // Create articlesData from selected rows
            const articlesData = selectedRows.map(row => ({
                article: row.occ_arti,
                quantity: parseFloat(row.available_quantity || 0)
            }));

            console.log("Fetching group locations for selected articles:", JSON.stringify(articlesData, null, 2));

            const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-group-locations`, {
                params: {
                    articlesData: JSON.stringify(articlesData)
                }
            });

            console.log("API response:", response.data);

            if (response.data?.locations) {
                setLocazioni(response.data.locations);
                // Only now show the modal
                setMultiLocationModalVisible(true);
            } else {
                setLocazioni([]);
                notification.warning({
                    message: 'Nessuna locazione compatibile',
                    description: 'Non esistono locazioni che possono contenere tutti gli articoli selezionati',
                    placement: 'bottomRight'
                });
            }
        } catch (error) {
            console.error("Location fetch error:", error.response?.data || error.message);
            notification.error({
                message: 'Errore',
                description: error.response?.data?.message || 'Errore durante il recupero delle locazioni',
                placement: 'bottomRight'
            });
        } finally {
            setLoadingLocations(false);
        }
    };
    // 4. Update the MultiLocationChangeModal to use this data
    // Update the MultiLocationChangeModal to match the group location modal style
    const MultiLocationChangeModal = () => {
        const getConsolidatedArticles = () => {
            const articleMap = new Map();

            // Group by article code and sum quantities
            selectedRows.forEach(row => {
                const articleCode = row.occ_arti;
                if (articleMap.has(articleCode)) {
                    const existing = articleMap.get(articleCode);
                    existing.required_quantity += parseFloat(row.available_quantity || 0);
                } else {
                    articleMap.set(articleCode, {
                        id_art: articleCode,
                        required_quantity: parseFloat(row.available_quantity || 0)
                    });
                }
            });

            return Array.from(articleMap.values());
        };
        const consolidatedArticles = getConsolidatedArticles();

        return (
            <Modal
                title="Cambia Locazione Multipla"
                visible={multiLocationModalVisible}
                onCancel={() => {
                    setMultiLocationModalVisible(false);
                    setLocazioni([]); // Clear locations when closing
                }}
                footer={null}
                width="80%"
            >
                <div>
                    <div style={{ marginBottom: 16 }}>
                        <Text strong>Articoli selezionati: </Text>
                        <Text>{consolidatedArticles.length}</Text>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                        <Text strong>Codici articoli: </Text>
                        <Text>{consolidatedArticles.map(a => a.id_art).join(', ')}</Text>
                    </div>

                    {locazioni.length === 0 ? (
                        <Text style={{ fontSize: '18px', textAlign: 'center', display: 'block' }}>
                            Nessuna locazione compatibile tra gli articoli selezionati
                        </Text>
                    ) : (
                        <Table
                            dataSource={getCompatibleLocations().map(location => {
                                // Find available quantities for each article in this location
                                const articlesWithQuantities = consolidatedArticles.map(article => {
                                    // Find this article in the location data
                                    const locationArticleData = locazioni
                                        .find(loc =>
                                            loc.area === location.area &&
                                            loc.scaffale === location.scaffale &&
                                            loc.colonna === location.colonna &&
                                            loc.piano === location.piano
                                        )?.articles?.find(a => a.id_art === article.id_art);

                                    return {
                                        ...article,
                                        available_quantity: locationArticleData?.available_quantity || 0
                                    };
                                });

                                return {
                                    key: location.location,
                                    location: location.location,
                                    articles: articlesWithQuantities
                                };
                            })}
                            columns={[
                                {
                                    title: 'Locazione',
                                    dataIndex: 'location',
                                    key: 'location',
                                },
                                {
                                    title: 'Articoli Disponibili',
                                    key: 'articles',
                                    render: (_, record) => (
                                        <div style={{ maxWidth: 300 }}>
                                            {record.articles.map(article => (
                                                <div key={article.id_art} style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    margin: '4px 0',
                                                    padding: 4,
                                                    backgroundColor: article.available_quantity >= article.required_quantity
                                                        ? '#f6ffed'
                                                        : '#fffbe6'
                                                }}>
                                                    <div style={{ fontWeight: 500 }}>{article.id_art}</div>
                                                    <div>
                                                        <span style={{ marginRight: 8 }}>
                                                            Richiesto: {article.required_quantity}
                                                        </span>
                                                        <span style={{
                                                            color: article.available_quantity >= article.required_quantity
                                                                ? '#389e0d'
                                                                : '#d48806'
                                                        }}>
                                                            Disponibile: {article.available_quantity}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ),
                                },
                                {
                                    title: 'Azioni',
                                    key: 'actions',
                                    render: (_, record) => (
                                        <Button
                                            type="primary"
                                            onClick={() => handleMultiLocationChange(record.location)}
                                        >
                                            Seleziona
                                        </Button>
                                    ),
                                },
                            ]}
                            pagination={false}
                        />
                    )}
                </div>
            </Modal>
        );
    };

    // 5. Update getCompatibleLocations to match API response format
    const getCompatibleLocations = () => {
        console.log("Processing locations:", locazioni);

        return locazioni.map(loc => ({
            area: loc.area,
            scaffale: loc.scaffale,
            colonna: loc.colonna,
            piano: loc.piano,
            location: `${loc.area}-${loc.scaffale}-${loc.colonna}-${loc.piano}`
        }));
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
                        <p>Quantità da prelevare nella locazione: (<strong>Richiesto: {quantityModalData.rowData.available_quantity}</strong>)</p>
                        <InputNumber
                            min={1}
                            max={quantityModalData.rowData.available_quantity}
                            value={pickedQuantity}
                            onChange={(value) => setPickedQuantity(value)}
                            style={{ width: '100%' }}
                        />

                    </>
                )}
                {quantityModalData && quantityModalData.mode === 'forced' && (
                    <>
                        <p>Sei sicuro di voler effettuare un prelievo forzato di <strong>{quantityModalData.forcedPickingInfo.articolo}</strong> da <strong>{quantityModalData.forcedPickingInfo.scaffale}</strong>?</p>
                        <p>Movimento: <strong>{quantityModalData.forcedPickingInfo.movimento}</strong></p>
                        <p>Quantità massima prelevabile: <strong>{maxAvailableQuantity}</strong></p>
                        <InputNumber
                            min={1}
                            max={maxAvailableQuantity}

                            value={pickedQuantity}
                            onChange={(value) => setPickedQuantity(value)}
                            style={{ width: '100%' }}
                        />
                    </>
                )}
            </Modal>

            <Modal
                title="Cambia tutte le locazioni per questo articolo"
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
            <Modal
                title="Cambia locazione gruppo"
                visible={groupLocationModalVisible}
                onCancel={() => {
                    setGroupLocationModalVisible(false);
                    setSelectedGroup(null);
                    setGroupLocations([]);
                }}
                footer={null}
                width="80%"
            >
                {selectedGroup && (
                    <div>
                        <div style={{ marginBottom: 16 }}>
                            {console.log(selectedGroup)}
                            <Text strong>Distinta articolo: </Text>
                            <Text>{selectedGroup.occ_arti}</Text>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <Text strong>Articoli nella distinta da: </Text>
                            <Text>{[...new Set(selectedGroup.children.map(child => child.occ_arti))].length}</Text>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <Text strong>Articoli: </Text>
                            <Text>{[...new Set(selectedGroup.children.map(child => child.occ_arti))].join(', ')}</Text>
                        </div>
                        {groupedLocations.length === 0 ? (
                            <Text style={{ fontSize: '18px', textAlign: 'center', display: 'block' }}>
                                Nessuna locazione compatibile tra gli articoli della distinta
                            </Text>
                        ) : (
                            <Table
                                dataSource={groupedLocations.map(location => ({
                                    key: `${location.area}-${location.scaffale}-${location.colonna}-${location.piano}`,
                                    location: `${location.area}-${location.scaffale}-${location.colonna}-${location.piano}`,
                                    articles: location.articles
                                }))}
                                columns={[
                                    {
                                        title: 'Locazione',
                                        dataIndex: 'location',
                                        key: 'location',
                                    },
                                    {
                                        title: 'Articoli Disponibili',
                                        key: 'articles',
                                        render: (_, record) => (
                                            <div style={{ maxWidth: 300 }}>
                                                {record.articles.map(article => (
                                                    <div key={article.id_art} style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        margin: '4px 0',
                                                        padding: 4,
                                                        backgroundColor: article.available_quantity >= article.required_quantity
                                                            ? '#f6ffed'
                                                            : '#fffbe6'
                                                    }}>
                                                        <div style={{ fontWeight: 500 }}>{article.id_art}</div>
                                                        <div>
                                                            <span style={{ marginRight: 8 }}>
                                                                Richiesto: {article.required_quantity}
                                                            </span>
                                                            <span style={{
                                                                color: article.available_quantity >= article.required_quantity
                                                                    ? '#389e0d'
                                                                    : '#d48806'
                                                            }}>
                                                                Disponibile: {article.available_quantity}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ),
                                    },
                                    {
                                        title: 'Azioni',
                                        key: 'actions',
                                        render: (_, record) => (
                                            <Button
                                                type="primary"
                                                onClick={() => handleGroupLocationChange(record.location)}
                                                disabled={!record.articles.every(a => a.available_quantity >= a.required_quantity)}
                                            >
                                                Seleziona
                                            </Button>
                                        ),
                                    },
                                ]}
                                pagination={false}
                            />
                        )}
                    </div>
                )}
            </Modal>

            <Sider width={"50%"} style={{ background: '#fff' }}>
                <Space direction="vertical" style={{ width: '100%', padding: '20px' }}>
                    {/* Add the MultiSelectControls here, above your tabs */}

                    <Tabs
                        onChange={(key) => {
                            setActiveTab(key);
                            resetInputSearch();
                            // Reset multi-select mode when changing tabs
                            if (multiSelectMode) {
                                toggleMultiSelectMode();
                            }
                        }}
                        defaultActiveKey="1"
                        centered
                    >                        {/* ODL Tab */}
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
                            columns={multiSelectMode ? getColumnConfig() : columns}
                            dataSource={groupDataByParent(tableData.filter(row => row.available_quantity > 0))}
                            pagination={false}
                            scroll={{ y: 'calc(100vh - 250px)' }}
                            rowKey="id"
                            rowClassName={rowClassName}
                            style={tableStyle}
                            footer={() => tableData.length > 0 ? <MultiSelectControls /> : null} // Only show controls when there's data

                            expandable={expandableConfig}
                            onRow={(record) => ({
                                title: getRowTooltip(record),
                                onClick: () => {
                                    if (multiSelectMode) {
                                        // Toggle selection on row click in multi-select mode
                                        const canSelect = !record.isParent &&
                                            record.status !== 'completed' &&
                                            !highlightedRows.has(record.id) &&
                                            record.location;

                                        if (canSelect) {
                                            const isSelected = selectedRows.some(row => row.id === record.id);
                                            handleRowSelect(record, !isSelected);
                                        }
                                    }
                                }
                            })}
                        />
                    )}
                </Space>
            </Sider>
            <Layout style={{ background: '#fff', display: window.innerWidth < 768 ? 'none' : 'block' }}>
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
            <GroupPickModal />
            {/* Include the multi-location change modal */}
            <MultiLocationChangeModal />
        </Layout>
    );
};

export default Picking;