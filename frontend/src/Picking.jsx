import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Input, Button, Table, Layout, Space, message, Tooltip, Spin, Tag, Modal, InputNumber, Pagination, Form, Alert, Typography, Checkbox } from 'antd';
import axios from 'axios';
import { SettingOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';

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
    const [settingsModalVisible, setSettingsModalVisible] = useState(false);
    const [resetConfirmModalVisible, setResetConfirmModalVisible] = useState(false);
    const [pickOperations, setPickOperations] = useState([]);
    const [undoModalVisible, setUndoModalVisible] = useState(false);
    const [selectedOperation, setSelectedOperation] = useState(null);
    
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
                                disabled={!canSelect || record.missing || record.status === 'completed' || highlightedRows.has(record.id)}
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
        const processedIds = new Set();
    
        // First pass: Create parent groups
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
                        total_quantity: 0,
                        picked_quantity: 0
                    });
                }
    
                // Add item to parent's children array
                const parentGroup = groupedData.get(parentKey);
                parentGroup.children.push({
                    ...item,
                    id: item.id || `${parentKey}-${item.occ_arti}`,
                    isChildRow: true
                });
    
                // Update parent totals
                parentGroup.total_quantity += parseInt(item.total_quantity || 0);
                parentGroup.picked_quantity += parseInt(item.picked_quantity || 0);
    
                processedIds.add(item.id);
            }
        });
    
        // Second pass: Add standalone items
        data.forEach(item => {
            if (!item.mpl_padre && !processedIds.has(item.id)) {
                groupedData.set(item.id, {
                    ...item,
                    children: [],
                    isParent: false
                });
            }
        });
    
        // Convert the Map to an array and sort children
        const result = Array.from(groupedData.values()).map(group => {
            if (group.isParent) {
                // Sort children: completed items first, then by article code
                group.children.sort((a, b) => {
                    if (a.status === 'completed' && b.status !== 'completed') return -1;
                    if (a.status !== 'completed' && b.status === 'completed') return 1;
                    return a.occ_arti.localeCompare(b.occ_arti);
                });
    
                // Update parent status based on children
                group.status = group.children.every(child => child.status === 'completed') 
                    ? 'completed' 
                    : 'pending';
            }
            return group;
        });
    
        return result;
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
    setConfirmLoading(true);
    if (pickedQuantity <= 0) {
        notification.error({
            message: 'Errore',
            description: 'La quantità deve essere maggiore di zero.',
            placement: 'bottomRight',
            duration: 5,
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
                duration: 5,
            });
            setConfirmLoading(false);
            return;
        }

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
                    quantity: pickedQuantity,
                    odl: ordineLavoro,
                }),
            });
            
            if (!response.ok) {
                throw new Error('Failed to update pacchi');
            }
            
            const data = await response.json();
            // In your handleQuantityConfirm function where you call storePickOperation:
storePickOperation({
    articolo,
    location: {
        area,
        scaffale: scaffalePart,
        colonna,
        piano
    },
    originalLocation: { ...rowData.location },
    originalRow: { 
        ...rowData,
        // Make sure we explicitly save the ID of the row
        id: rowData.id 
    },
    movimento,
    quantity: pickedQuantity,
    timestamp: new Date().toISOString()
});
            notification.success({
                message: 'Successo',
                description: `Articolo ${articolo} prelevato da ${area}-${scaffalePart}-${colonna}-${piano}`,
                placement: 'bottomRight'
            });
            
            // Find the exact row using ID - we need the current index, not the one from when the modal opened
            const actualIndex = tableData.findIndex(row => row.id === rowData.id);
            if (actualIndex < 0) {
                console.error("Row not found in tableData:", rowData.id);
                setQuantityModalVisible(false);
                setQuantityModalData(null);
                setConfirmLoading(false);
                return;
            }
            
            // Check if there's already a highlighted row with the same article and location
            const existingPickedRowIndex = tableData.findIndex(row => 
                highlightedRows.has(row.id) && 
                row.occ_arti === rowData.occ_arti &&
                row.location &&
                row.location.area === area &&
                row.location.scaffale === scaffalePart &&
                row.location.colonna === colonna &&
                row.location.piano === piano
            );
            
            // Start with the current tableData - we'll only modify what needs to change
            const newTableData = [...tableData];
            
            if (existingPickedRowIndex >= 0) {
                // There's already a highlighted row for this article/location
                // Update the existing highlighted row
                newTableData[existingPickedRowIndex] = {
                    ...newTableData[existingPickedRowIndex],
                    available_quantity: parseFloat(newTableData[existingPickedRowIndex].available_quantity) + parseFloat(pickedQuantity),
                    picked_quantity: parseFloat(newTableData[existingPickedRowIndex].picked_quantity || 0) + parseFloat(pickedQuantity)
                };
                
                if (parseFloat(pickedQuantity) === parseFloat(rowData.available_quantity)) {
                    // Remove the original row if we picked all of it
                    newTableData.splice(actualIndex, 1);
                } else {
                    // Otherwise just update its available quantity
                    newTableData[actualIndex] = {
                        ...newTableData[actualIndex],
                        available_quantity: parseFloat(newTableData[actualIndex].available_quantity) - parseFloat(pickedQuantity)
                    };
                }
            } else {
                // No existing highlighted row for this article/location
                if (parseFloat(pickedQuantity) === parseFloat(rowData.available_quantity)) {
                    // User picked the entire quantity - just highlight the existing row
                    const newHighlightedRows = new Set(highlightedRows);
                    newHighlightedRows.add(rowData.id);
                    setHighlightedRows(newHighlightedRows);
                } else {
                    // Update the original row with reduced quantity
                    newTableData[actualIndex] = {
                        ...newTableData[actualIndex],
                        available_quantity: parseFloat(newTableData[actualIndex].available_quantity) - parseFloat(pickedQuantity)
                    };
                    
                    // Create a new picked row
                    const pickedRow = {
                        ...JSON.parse(JSON.stringify(rowData)),
                        available_quantity: parseFloat(pickedQuantity),
                        picked_quantity: parseFloat(pickedQuantity),
                        id: uuidv4()
                    };
                    
                    // Insert the new row right after the updated row
                    newTableData.splice(actualIndex + 1, 0, pickedRow);
                    
                    // Add the new row to highlighted rows
                    const newHighlightedRows = new Set(highlightedRows);
                    newHighlightedRows.add(pickedRow.id);
                    setHighlightedRows(newHighlightedRows);
                }
            }
            
            // Close the modal
            setQuantityModalVisible(false);
            setQuantityModalData(null);
            
            // Update the table with our changes
            setTableData(newTableData);
            
        } catch (error) {
            console.error("Error updating pacchi:", error);
            notification.error({
                message: 'Errore',
                description: 'Il prelievo non è stato registrato. Si prega di riprovare.',
                placement: 'bottomRight',
                duration: 5,
            });
            setConfirmLoading(false);
            return;
        }
    }
    setConfirmLoading(false);
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
    setExpandedRowKeys([]); // Reset the expanded rows

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

        // Create a map to group items by mpl_padre first
        const groupsByParentId = new Map();
        
        // First pass - group by parent ID and create parent items
        data.forEach(item => {
            if (item.mpl_padre) {
                // This is a child item, add to or create parent group
                if (!groupsByParentId.has(item.mpl_padre)) {
                    groupsByParentId.set(item.mpl_padre, {
                        mpl_padre: item.mpl_padre, // The parent ID
                        children: [item],
                        total_quantity: parseInt(item.total_quantity || 0),
                        total_picked: parseInt(item.picked_quantity || 0),
                        isParent: true,
                        has_picked: parseInt(item.picked_quantity || 0) > 0,
                        // Set parent status based on first child
                        status: item.status
                    });
                } else {
                    // Add to existing parent
                    const parent = groupsByParentId.get(item.mpl_padre);
                    parent.children.push(item);
                    // Update parent totals and status
                    parent.total_quantity += parseInt(item.total_quantity || 0);
                    parent.total_picked += parseInt(item.picked_quantity || 0);
                    parent.has_picked = parent.has_picked || parseInt(item.picked_quantity || 0) > 0;
                    
                    // If any child is not completed, parent isn't completed
                    if (item.status !== 'completed' && parent.status === 'completed') {
                        parent.status = item.status;
                    }
                }
            }
        });

        // Second pass - handle standalone items and transform for table display
        const transformedData = data.reduce((acc, item) => {
            // Skip child items that belong to a distinta/BOM - they'll be handled via their parent
            if (item.mpl_padre) {
                return acc;
            }
            
            // Group by article code for standalone items
            const existing = acc.find(i => i.occ_arti === item.occ_arti && !i.mpl_padre);

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
        }, [...groupsByParentId.values()]); // Include parent groups from first pass
        // Create rows for all items
                console.log("data3:", data);

        const flattenedData = transformedData.flatMap(parentItem => {
            // Create rows for each parent item
            const baseParent = {
                id: uuidv4(),
                occ_arti: parentItem.occ_arti || parentItem.mpl_padre, // Use mpl_padre as occ_arti for distinta
                occ_desc_combined: parentItem.occ_desc_combined || "Distinta di produzione",
                status: parentItem.status,
                isParent: true,
                mpl_padre: parentItem.mpl_padre, // Store the mpl_padre ID
                total_quantity: parentItem.total_quantity || 
                               parentItem.children.reduce((sum, c) => sum + parseInt(c.needed_quantity || c.total_quantity || 0), 0),
                total_picked: parentItem.total_picked || 0
            };
            
            // For completed rows
            const completedRows = parentItem.children
                .filter(child => child.status === 'completed' || parseInt(child.picked_quantity || 0) > 0)
                .map(child => ({
                    ...child,
                    id: uuidv4(),
                    available_quantity: parseInt(child.picked_quantity || 0),
                    status: 'completed',
                    isChildRow: true,
                    parentId: baseParent.id
                }));
            
            // For pending rows
            const pendingRows = parentItem.children
                .filter(child => child.status !== 'completed' && parseInt(child.available_quantity || 0) > 0)
                .map(child => ({
                    ...child,
                    id: uuidv4(),
                    available_quantity: parseInt(child.available_quantity || 0),
                    status: 'pending',
                    isChildRow: true,
                    parentId: baseParent.id
                }));
            console.log("Base Parent Item:", baseParent);
            console.log("Completed Rows:", completedRows);
            console.log("Pending Rows:", pendingRows);
            // Only return the parent if it has any child rows or if we have at least one child
            return parentItem.children.length > 0 ? 
                [baseParent, ...completedRows, ...pendingRows] : [];
        });

        const newHighlightedShelves = new Set();
        flattenedData.forEach(item => {
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
        console.log("flattenedData:", flattenedData);
        setTableData(flattenedData);
        
        } catch (error) {
            console.log('Error object:', error);

            if (error.message === 'Network response was not ok') {
                // The response was not ok (e.g., 404 or 500 error)
                notification.error({
                    message: 'Errore',
                    description: 'Ordine non trovato',
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
            // Filter out completed children, spacers, and highlighted rows (picked in this session)
            const pendingChildren = group.children.filter(
                child => 
                    child.status !== 'completed' && 
                    !child.isSpacer && 
                    !highlightedRows.has(child.id)
            );
            
            // If all items are completed or picked, no need to search for locations
            if (pendingChildren.length === 0) {
                setGroupLocations([]);
                notification.info({
                    message: 'Informazione',
                    description: 'Tutti gli articoli della distinta sono già stati prelevati'
                });
                return;
            }
            
            // Create a structured array of only pending articles and their quantities
            const articlesData = pendingChildren.map(child => ({
                article: child.occ_arti,
                quantity: parseFloat(child.available_quantity || 0)
            }));
            
            console.log("Requesting locations for:", articlesData);
            
            const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-group-locations`, {
                params: {
                    articlesData: JSON.stringify(articlesData)
                }
            });
        
            if (response.data && response.data.locations) {
                setGroupLocations(response.data.locations);
                
                if (response.data.locations.length === 0) {
                    notification.warning({
                        message: 'Attenzione',
                        description: 'Nessuna locazione disponibile per gli articoli rimanenti della distinta'
                    });
                }
            } else {
                setGroupLocations([]);
                notification.warning({
                    message: 'Attenzione',
                    description: 'Nessuna locazione disponibile per gli articoli rimanenti della distinta'
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
                        parseFloat(child.mpl_qta || 0)
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
            // Check if all children are completed (parent status is 'completed')
            if (record.status === 'completed') {
                return <div style={{ textAlign: 'center' }}><Tag color="green">Già prelevato</Tag></div>;
            }

            // Check if any child has missing items
            const hasAnyMissingChild = record.children?.some(child => child.missing);

            if (hasAnyMissingChild) {
                return <div style={{ textAlign: 'center' }}><Tag color="red">Incompleto</Tag></div>;
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
                <div style={{ textAlign: 'center' }}><Tag
                    color="geekblue"
                    style={{
                        wordBreak: 'break-word',
                        whiteSpace: 'normal',
                        cursor: 'pointer'
                    }}
                    onClick={() => handleGroupLocationModalVisible(record)}
                >
                    {locations[0]}
                </Tag></div>
            ) : (
                <div style={{ textAlign: 'center' }}><Tag
                    color="orange"
                    style={{
                        cursor: 'pointer'
                    }}
                    onClick={() => handleGroupLocationModalVisible(record)}
                >
                    Diverse
                </Tag></div>
            );
        }

        // For child rows - original logic
        return (
            <div style={{ textAlign: 'center' }}>
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
            </div>
        );
    },
},
{
    title: 'Azioni',
    key: 'actions',
    render: (_, record) => {
        const isCompleted = record.status === 'completed';
        const isHighlighted = highlightedRows.has(record.id);
        const isDisabled = isCompleted || record.missing;
        const hasMissingChildren = record.isParent && record.children?.some(child => child.missing);
        
        // For child rows that are highlighted, find the corresponding operation
        if (record.isChildRow && isHighlighted) {
            // Find the operation for this specific child row
            const childOperation = pickOperations.find(op => {
                if (op.type === 'group') {
                    // For group operations, check if this child is in the articoli array
                    return op.articoli.some(item => 
                        item.originalRow.id === record.id
                    );
                } else {
                    // For individual operations
                    return op.articolo === record.occ_arti && 
                           record.location &&
                           op.location.area === record.location.area &&
                           op.location.scaffale === record.location.scaffale &&
                           op.location.colonna === record.location.colonna &&
                           op.location.piano === record.location.piano;
                }
            });
            
            if (childOperation) {
                return (
                    <Space style={{ justifyContent: 'center', width: '100%' }}>
                        <Button
                            type="default"
                            danger
                            onClick={() => handleUndoRequest(childOperation)}
                        >
                            Annulla
                        </Button>
                    </Space>
                );
            }
            
            // If highlighted but no operation found (unexpected state), show nothing
            return null;
        }
        
        // For parent distinta rows
        if (record.isParent) {
            // Count how many children are highlighted
            const highlightedChildren = record.children?.filter(child => 
                !child.isSpacer && highlightedRows.has(child.id)
            ).length || 0;
            
            // Count total non-spacer children
            const totalChildren = record.children?.filter(child => !child.isSpacer).length || 0;
            
            // Calculate how many children are completed
            const completedChildren = record.children?.filter(child => 
                !child.isSpacer && child.status === 'completed'
            ).length || 0;
            
            // Find the group operation for this parent
            const groupOperation = pickOperations.find(op => 
                op.type === 'group' && op.parentId === record.id
            );
            
            // If all children are highlighted or completed
            if (highlightedChildren + completedChildren === totalChildren && totalChildren > 0) {
                if (groupOperation) {
                    return (
                        <Space style={{ justifyContent: 'center', width: '100%' }}>
                            <Button
                                type="default"
                                danger
                                onClick={() => handleUndoRequest(groupOperation)}
                            >
                                Annulla Distinta
                            </Button>
                        </Space>
                    );
                }
                return null;
            }
            
            // If some children are highlighted but not all
            if (highlightedChildren > 0) {
                return (
                    <Space style={{ justifyContent: 'center', width: '100%' }}>
                        <Button
                            type="default"
                            onClick={() => {
                                setSelectedGroup({
                                    ...record,
                                    children: record.children.filter(child =>
                                        !highlightedRows.has(child.id) && 
                                        child.status !== 'completed' &&
                                        !child.isSpacer
                                    )
                                });
                                setGroupPickModalVisible(true);
                                setSelectedRows([]);
                                if (multiSelectMode) {
                                    setMultiSelectMode(false);
                                }
                            }}
                        >
                            Preleva Rimanenti
                        </Button>
                    </Space>
                );
            }
            
            // If no children are highlighted, show normal pick button
            return (
                <Space style={{ justifyContent: 'center', width: '100%' }}>
                    <Button
                        type="default"
                        onClick={() => {
                            setSelectedGroup({
                                ...record,
                                children: record.children.filter(child =>
                                    !highlightedRows.has(child.id) && 
                                    child.status !== 'completed' &&
                                    !child.isSpacer
                                )
                            });
                            setGroupPickModalVisible(true);
                            setSelectedRows([]);
                            if (multiSelectMode) {
                                setMultiSelectMode(false);
                            }
                        }}
                    >
                        Preleva Distinta
                    </Button>
                </Space>
            );
        }
        
        // For regular rows (not parent, not child)
        if (isHighlighted) {
            // Find the operation for this row
            const rowOperation = pickOperations.find(op => 
                op.articolo === record.occ_arti && 
                record.location &&
                op.location.area === record.location.area &&
                op.location.scaffale === record.location.scaffale &&
                op.location.colonna === record.location.colonna &&
                op.location.piano === record.location.piano
            );
            
            if (rowOperation) {
                return (
                    <Space style={{ justifyContent: 'center', width: '100%' }}>
                        <Button
                            type="default"
                            danger
                            onClick={() => handleUndoRequest(rowOperation)}
                        >
                            Annulla
                        </Button>
                    </Space>
                );
            }
            
            return null;
        }
        
        if (isDisabled) {
            return null;
        }
        
        // Default action button for unpicked rows
        return (
            <Space style={{ justifyContent: 'center', width: '100%' }}>
                <Button
                    type="primary"
                    onClick={() => handlePickFromRow(record)}
                >
                    Preleva
                </Button>
            </Space>
        );
    },
}
    ];
    const UndoModal = () => (
        <Modal
            title="Conferma annullamento"
            open={undoModalVisible}
            onOk={handleUndoConfirm}
            onCancel={() => {
                setUndoModalVisible(false);
                setSelectedOperation(null);
            }}
            confirmLoading={confirmLoading}
            okText="Conferma"
            cancelText="Annulla"
        >
            <p>Sei sicuro di voler annullare il prelievo dell'articolo {selectedOperation?.articolo}?</p>
            <p>Questo ripristinerà la situazione precedente al prelievo.</p>
        </Modal>
    );
    // Columns configuration for the main table
  
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
        setSelectedRows([]);
        if (multiSelectMode) {
            setMultiSelectMode(false);
        }        
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
    
                        // Store each child operation individually for undo
                        storePickOperation({
                            articolo: child.occ_arti,
                            location: { ...child.location },
                            quantity: parseFloat(child.available_quantity || 0),
                            movimento: child.movimento || '',
                            originalRow: { ...child },
                            type: 'groupItem',
                            parentId: selectedGroup.id
                        });
                    } else {
                        failedPicks.push(child.occ_arti);
                    }
                } catch (error) {
                    console.error(`Error picking ${child.occ_arti}:`, error);
                    failedPicks.push(child.occ_arti);
                }
            }
    
            // Also store the group operation for the entire distinta
            if (successfulPicks.length > 0) {
                const groupOperation = {
                    id: uuidv4(),
                    timestamp: new Date(),
                    type: 'group',
                    parentId: selectedGroup.id,
                    articoli: selectedGroup.children
                        .filter(child => successfulPicks.includes(child.id))
                        .map(child => ({
                            articolo: child.occ_arti,
                            location: child.location,
                            quantity: parseFloat(child.available_quantity || 0),
                            originalRow: { ...child }
                        }))
                };
                
                setPickOperations(prev => [...prev, groupOperation]);
            }
    
            // Update UI state after all operations
            if (successfulPicks.length > 0) {
                setHighlightedRows(prev => new Set([...prev, ...successfulPicks]));
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
            
            // Create a copy of the current table data
            let updatedTableData = [...tableData];
            
            // Group selected rows by article code for merging
            const articleGroups = {};
            selectedRows.forEach(row => {
                if (!articleGroups[row.occ_arti]) {
                    articleGroups[row.occ_arti] = [];
                }
                articleGroups[row.occ_arti].push(row);
            });
            
            // Process each article group
            for (const articleCode in articleGroups) {
                const rowsToProcess = articleGroups[articleCode];
                
                // Calculate total quantity for this article
                const totalQuantity = rowsToProcess.reduce(
                    (sum, row) => sum + parseFloat(row.available_quantity || 0), 0
                );
                
                // Find if there's already a row with this article and target location (not in selected rows)
                const existingTargetRow = updatedTableData.find(row => 
                    !selectedRows.some(selected => selected.id === row.id) &&
                    row.occ_arti === articleCode &&
                    row.location?.area === area &&
                    row.location?.scaffale === scaffale &&
                    row.location?.colonna === colonna &&
                    row.location?.piano === piano
                );
                
                if (existingTargetRow) {
                    // Update existing row at target location
                    existingTargetRow.available_quantity = 
                        parseFloat(existingTargetRow.available_quantity || 0) + totalQuantity;
                    
                    // Remove all selected rows for this article
                    updatedTableData = updatedTableData.filter(row => 
                        !rowsToProcess.some(selected => selected.id === row.id)
                    );
                } else {
                    // No existing row at target location
                    if (rowsToProcess.length === 1) {
                        // Just one row to update - change its location
                        const rowIndex = updatedTableData.findIndex(row => row.id === rowsToProcess[0].id);
                        if (rowIndex !== -1) {
                            updatedTableData[rowIndex] = {
                                ...updatedTableData[rowIndex],
                                location: { area, scaffale, colonna, piano }
                            };
                        }
                    } else {
                        // Multiple rows to merge
                        // Keep the first row, update its location and quantity
                        const firstRowIndex = updatedTableData.findIndex(row => row.id === rowsToProcess[0].id);
                        if (firstRowIndex !== -1) {
                            updatedTableData[firstRowIndex] = {
                                ...updatedTableData[firstRowIndex],
                                location: { area, scaffale, colonna, piano },
                                available_quantity: totalQuantity
                            };
                            
                            // Remove the other rows for this article
                            updatedTableData = updatedTableData.filter(row => 
                                row.id === rowsToProcess[0].id || 
                                !rowsToProcess.some(selected => selected.id === row.id)
                            );
                        }
                    }
                }
            }
            
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
            console.error("Error updating locations:", error);
            notification.error({
                message: 'Errore',
                description: 'Errore durante l\'aggiornamento delle locazioni',
                placement: 'bottomRight',
            });
        }
    };
    
    const handleUndoConfirm = async () => {
        if (!selectedOperation) return;
        
        try {
            setConfirmLoading(true);
            if (selectedOperation.type === 'group') {
                // Handle undoing a group operation
                for (const item of selectedOperation.articoli) {
                    // Call undo API for each article in the group
                    await axios.post(`${process.env.REACT_APP_API_URL}/api/undo-pacchi`, {
                        articolo: item.articolo,
                        area: item.location.area,
                        scaffale: item.location.scaffale,
                        colonna: item.location.colonna,
                        piano: item.location.piano,
                        quantity: item.quantity,
                        odl: ordineLavoro,
                    });
                    
                    // Unhighlight each row
                    const newHighlightedRows = new Set(highlightedRows);
                    newHighlightedRows.delete(item.originalRow.id);
                    setHighlightedRows(newHighlightedRows);
                }
                
                // Remove the operation from tracking
                setPickOperations(prev => prev.filter(op => op.id !== selectedOperation.id));
                
                notification.success({
                    message: 'Operazione annullata',
                    description: `Prelievo della distinta annullato con successo.`,
                    placement: 'bottomRight'
                });
            }else{
            // Make API call to undo the operation
            const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/undo-pacchi`, {
                operationId: selectedOperation.id,
                articolo: selectedOperation.articolo,
                area: selectedOperation.location.area,
                scaffale: selectedOperation.location.scaffale,
                colonna: selectedOperation.location.colonna,
                piano: selectedOperation.location.piano,
                movimento: selectedOperation.movimento,
                quantity: selectedOperation.quantity,
                odl: ordineLavoro,
            });
            
            if (!response.data.success) {
                throw new Error('Failed to undo operation');
            }
            
            // Remove the operation from our tracking list
            setPickOperations(prev => prev.filter(op => op.id !== selectedOperation.id));
            
            // Get the current row that was picked and needs to be restored
            const pickedRowId = selectedOperation.originalRow.id;
            
            // Create a new version of the highlighted rows Set without this row
            const newHighlightedRows = new Set(highlightedRows);
            newHighlightedRows.delete(pickedRowId);
            
            // Get the current table data
            let updatedTableData = [...tableData];
            
            // Find the index of the row that matches our picked item
            const rowIndex = updatedTableData.findIndex(row => 
                row.id === pickedRowId ||
                (row.occ_arti === selectedOperation.articolo && 
                 row.location && 
                 row.location.area === selectedOperation.location.area &&
                 row.location.scaffale === selectedOperation.location.scaffale &&
                 row.location.colonna === selectedOperation.location.colonna &&
                 row.location.piano === selectedOperation.location.piano)
            );
            
            if (rowIndex >= 0) {
                // Row found - update it to be unpicked
                updatedTableData[rowIndex] = {
                    ...updatedTableData[rowIndex],
                    status: 'to_pick',
                    available_quantity: parseFloat(selectedOperation.quantity)
                };
            } else {
                // Don't create a new row - refresh the data instead
                console.warn("Could not find the row to restore. Refreshing data...");
                handleSearch(); // Refresh the whole table
            }
            
            // Update state - do these together to avoid race conditions
            setHighlightedRows(newHighlightedRows);
            setTableData(updatedTableData);
            
            notification.success({
                message: 'Operazione annullata',
                description: `Prelievo di ${selectedOperation.articolo} annullato con successo.`,
                placement: 'bottomRight'
            });
        }
        } catch (error) {
            console.error("Error undoing operation:", error);
            notification.error({
                message: 'Errore',
                description: 'Impossibile annullare l\'operazione. Riprova più tardi.',
                placement: 'bottomRight'
            });
        } finally {
            setConfirmLoading(false);
            setUndoModalVisible(false);
            setSelectedOperation(null);
        }
    };
    const handleUndoRequest = (operation) => {
        setSelectedOperation(operation);
        setUndoModalVisible(true);
    };
    const storePickOperation = (operation) => {
        setPickOperations(prev => [...prev, {
            id: uuidv4(),
            timestamp: new Date(),
            ...operation
        }]);
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

    // Filter compatible locations to only include those with sufficient quantity
    const getFilteredCompatibleLocations = () => {
        const compatibleLocations = getCompatibleLocations();
        
        return compatibleLocations.filter(location => {
            // For each location, check if all articles have sufficient quantities
            const locationString = location.location;
            const [area, scaffale, colonna, piano] = locationString.split('-');
            
            // Check each article in this location
            return consolidatedArticles.every(article => {
                // Find this article in the location data
                const locationData = locazioni.find(loc => 
                    loc.area === area && 
                    loc.scaffale === scaffale && 
                    loc.colonna === colonna && 
                    loc.piano === piano
                );
                
                if (!locationData) return false;
                
                const articleData = locationData.articles?.find(a => a.id_art === article.id_art);
                if (!articleData) return false;
                
                // Check if available quantity is sufficient
                return parseFloat(articleData.available_quantity || 0) >= parseFloat(article.required_quantity || 0);
            });
        });
    };
    
    const filteredLocations = getFilteredCompatibleLocations();

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

                {filteredLocations.length === 0 ? (
                    <Text style={{ fontSize: '18px', textAlign: 'center', display: 'block' }}>
                        Nessuna locazione compatibile con quantità sufficiente per gli articoli selezionati
                    </Text>
                ) : (
                    <Table
                        dataSource={filteredLocations
                            .map(location => {
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
                            })
                            .sort((a, b) => a.location.localeCompare(b.location))} // Sort by Locazione
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
                                                backgroundColor: '#f6ffed' // All rows should be green now
                                            }}>
                                                <div style={{ fontWeight: 500 }}>{article.id_art}</div>
                                                <div>
                                                    <span style={{ marginRight: 8 }}>
                                                        Richiesto: {article.required_quantity}
                                                    </span>
                                                    <span style={{ color: '#389e0d' }}>
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
    const SettingsModal = () => (
        <Modal
            title="Impostazioni"
            visible={settingsModalVisible}
            onCancel={() => setSettingsModalVisible(false)}
            footer={[
                <Button key="close" onClick={() => setSettingsModalVisible(false)}>
                    Chiudi
                </Button>
            ]}
        >
            <div style={{ padding: '10px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                    <Button 
                        type="primary" 
                        danger
                        onClick={showResetConfirmation}
                        style={{ marginRight: 8 }}
                    >
                        Elimina dati prelievo parziale
                    </Button>
                    <Tooltip title="Elimina i dati sul prelievo parziale, non effettua modifiche sul carico e scarico del magazzino ma permette di rieffettuare i prelievi per un ordine su articoli già prelevati">
                        <InfoCircleOutlined style={{ color: '#1890ff' }} />
                    </Tooltip>
                </div>
            </div>
        </Modal>
    );

    const handleResetPartialPickups = async () => {
        try {
            
            await axios.post(`${process.env.REACT_APP_API_URL}/api/reset-partial-pickups`, {
                ordine_lavoro: ordineLavoro
             });
            
            // For now, just clear the highlighted rows and update the UI
            
            // Close the confirmation modal
            // Close the settings modal
            setSettingsModalVisible(false);
            closeResetConfirmation()
            notification.success({
                message: 'Operazione completata',
                description: 'I dati di prelievo parziale sono stati eliminati con successo.',
                placement: 'bottomRight'
            });
            handleSearch()
        } catch (error) {
            console.error("Error resetting partial pickups:", error);
            notification.error({
                message: 'Errore',
                description: 'Si è verificato un errore durante l\'eliminazione dei dati.',
                placement: 'bottomRight'
            });
        }
    };
    const showResetConfirmation = () => {
        setResetConfirmModalVisible(true);
    };
    const closeResetConfirmation = () => {
        setResetConfirmModalVisible(false);
    };
    const ResetConfirmationModal = () => (
        <Modal
            title="Conferma eliminazione"
            visible={resetConfirmModalVisible}
            onCancel={() => setResetConfirmModalVisible(false)}
            footer={[
                <Button key="cancel" onClick={() => setResetConfirmModalVisible(false)}>
                    Annulla
                </Button>,
                <Button key="submit" type="primary" danger onClick={handleResetPartialPickups}>
                    Conferma
                </Button>
            ]}
        >
            <Alert
                            message="Attenzione"
                            description="Sei sicuro di voler eliminare i dati di prelievo parziale? Quest'azione non può essere annullata e ricaricherà i dati dell'ordine, perdendo eventuali prelievi fatti durante questa sessione per quest'ordine."
                            type="warning"
                            showIcon
                        />
        </Modal>
    );
    
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
    title="Cambia Locazione Distinta"
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
                <Text strong>Distinta articolo: </Text>
                <Text>{selectedGroup.occ_arti}</Text>
            </div>
            
            {/* Filter out completed items */}
            {(() => {
                // Get only non-completed children
                const pendingChildren = selectedGroup.children.filter(
                    child => child.status !== 'completed' && !child.isSpacer
                );
                
                // Get unique article codes from pending children
                const pendingArticles = [...new Set(pendingChildren.map(child => child.occ_arti))];
                
                return (
                    <>
                        <div style={{ marginBottom: 16 }}>
                            <Text strong>Articoli da prelevare: </Text>
                            <Text>{pendingArticles.length}</Text>
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <Text strong>Articoli: </Text>
                            <Text>{pendingArticles.join(', ')}</Text>
                        </div>
                        
                       
                    </>
                );
            })()}
            
            {groupedLocations.length === 0 ? (
                <Text style={{ fontSize: '18px', textAlign: 'center', display: 'block' }}>
                    Nessuna locazione compatibile tra gli articoli rimanenti della distinta
                </Text>
            ) : (
                <Table
                    dataSource={groupedLocations
                        .map(location => ({
                            key: `${location.area}-${location.scaffale}-${location.colonna}-${location.piano}`,
                            location: `${location.area}-${location.scaffale}-${location.colonna}-${location.piano}`,
                            articles: location.articles
                        }))
                        .sort((a, b) => a.location.localeCompare(b.location))} // Sort by Locazione
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
            <SettingsModal />
            <ResetConfirmationModal />
            <UndoModal />

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
                            footer={() => tableData.length > 0 ? (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <MultiSelectControls />
                                    <div>
                                        <Button 
                                            icon={<SettingOutlined />} 
                                            onClick={() => setSettingsModalVisible(true)}
                                            type="default"
                                        >
                                        </Button>
                                    </div>
                                </div>
                            ) : null} // Only show controls when there's data

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