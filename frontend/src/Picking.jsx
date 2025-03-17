import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Input, ConfigProvider, Button, Table, Layout, Space, message, Tooltip, Spin, Tag, Modal, InputNumber, Pagination, Form, Alert, Typography, Checkbox } from 'antd';
import axios from 'axios';
import { SettingOutlined, PlusOutlined, MinusOutlined, FullscreenOutlined } from '@ant-design/icons';

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
    const [otp, setOtp] = useState(['', '', '', '']);

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
    const [highlightedShelf, setHighlightedShelf] = useState('');

    const [prelevaTuttoModalVisible, setPrelevaTuttoModalVisible] = useState(false);

    const [showMissingArticleModal, setShowMissingArticleModal] = useState(false);
    const [missingArticleData, setMissingArticleData] = useState(null);
    const [loadingMissingData, setLoadingMissingData] = useState(false);

    // Add new state for expanded rows
    const [expandedRowKeys, setExpandedRowKeys] = useState([]);

    // Add new state variables
    const [groupPickModalVisible, setGroupPickModalVisible] = useState(false);
    const [locationOTP, setLocationOTP] = useState(['', '', '', '']);
    const [isWarehouseMapOpen, setIsWarehouseMapOpen] = useState(false);

    // 1. Add new state variables
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [selectedRows, setSelectedRows] = useState([]);
    const [multiLocationModalVisible, setMultiLocationModalVisible] = useState(false);
    const locationInputRefs = [
        useRef(null),
        useRef(null),
        useRef(null),
        useRef(null)
    ];
    const handleLocationKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !locationOTP[index] && index > 0) {
            locationInputRefs[index - 1].current?.focus();
        }
    };
    // 1. Fix and add logging to toggleMultiSelectMode
    const toggleMultiSelectMode = () => {
        if (multiSelectMode) {
            // Clear selections when exiting multi-select mode
            setSelectedRows([]);
        }
        setMultiSelectMode(!multiSelectMode);
    };
const handlePageChange = (page) => {
  setCurrentPage(page);
};
    // 2. Add logging to getColumnConfig
    const getColumnConfig = () => {
        // Create a copy of the base columns
        const baseColumns = [...columns];

        if (multiSelectMode) {
            // Add an empty first column for the expand button
            // then add the checkbox column as the second column
            return [
                {
                    title: '', // Empty title for expand button column
                    key: 'expand',
                    width: 50, // Narrow column for just the expand button
                    render: () => null // This column is only for the expand button
                },
                {
                    title: '',
                    key: 'selection',
                    width: 30,
                    render: (_, record) => {
                        if (record.isParent) {
                            // For parent rows, check if any children can be selected
                            const selectableChildren = record.children?.filter(child =>
                                child.status !== 'completed' &&
                                !highlightedRows.has(child.id) &&
                                child.location &&
                                !child.missing &&
                                !child.isSpacer
                            ) || [];

                            if (selectableChildren.length === 0) {
                                return null; // No checkbox if no children can be selected
                            }

                            // Count how many children are currently selected
                            const selectedChildren = selectableChildren.filter(child =>
                                selectedRows.some(row => row.id === child.id)
                            );

                            // Determine checkbox state based on selection count
                            let checked = false;
                            let indeterminate = false;

                            if (selectedChildren.length === selectableChildren.length && selectableChildren.length > 0) {
                                checked = true; // All selectable children are selected
                            } else if (selectedChildren.length > 0) {
                                indeterminate = true; // Some children are selected
                            }

                            return (
                                <Checkbox
                                    checked={checked}
                                    indeterminate={indeterminate}
                                    onChange={(e) => {
                                        // Select or deselect all selectable children
                                        const shouldSelect = e.target.checked;
                                        handleDistintaSelect(record, shouldSelect);
                                    }}
                                />
                            );
                        }

                        // For non-parent rows - original logic
                        const canSelect = !record.isParent &&
                            record.status !== 'completed' &&
                            !highlightedRows.has(record.id) &&
                            record.location &&
                            !record.missing &&
                            !record.isSpacer; // Must have a location and not be a special row

                        if (!canSelect) {
                            // If not selectable, show a disabled checkbox with appropriate style
                            return (
                                <Tooltip 
                                    title={
                                        highlightedRows.has(record.id) 
                                            ? "Articolo già prelevato" 
                                            : record.status === 'completed'
                                                ? "Articolo già completato"
                                                : !record.location
                                                    ? "Posizione non disponibile" 
                                                    : record.missing
                                                        ? "Articolo mancante"
                                                        : "Non selezionabile"
                                    }
                                >
                                    <span>
                                        <Checkbox
                                            checked={false}
                                            disabled={true}
                                            style={{
                                                opacity: 0.5,
                                                cursor: 'not-allowed'
                                            }}
                                        />
                                    </span>
                                </Tooltip>
                            );
                        }

                        return (
                            <Checkbox
                                checked={selectedRows.some(row => row.id === record.id)}
                                onChange={(e) => {
                                    handleRowSelect(record, e.target.checked);
                                }}
                            />
                        );
                    }
                },
                ...baseColumns
            ];
        }

        return baseColumns;
    };

    // Add a new function to handle distinta selection
    const handleDistintaSelect = (parentRecord, shouldSelect) => {
        // Find all selectable children
        const selectableChildren = parentRecord.children?.filter(child =>
            child.status !== 'completed' &&
            !highlightedRows.has(child.id) &&
            child.location &&
            !child.missing &&
            !child.isSpacer
        ) || [];

        if (selectableChildren.length === 0) return;

        if (shouldSelect) {
            // Add all selectable children to selection if not already selected
            const childrenToAdd = selectableChildren.filter(child =>
                !selectedRows.some(row => row.id === child.id)
            );

            if (childrenToAdd.length > 0) {
                setSelectedRows([...selectedRows, ...childrenToAdd]);
            }
        } else {
            // Remove all children from selection
            const childIds = new Set(selectableChildren.map(child => child.id));
            setSelectedRows(selectedRows.filter(row => !childIds.has(row.id)));
        }
    };

    // 3. Add logging to handleRowSelect
    const handleRowSelect = (record, selected) => {
        // If the row is highlighted, it can't be selected
        if (highlightedRows.has(record.id)) {
            return;
        }

        if (selected) {
            const newSelectedRows = [...selectedRows, record];
            setSelectedRows(newSelectedRows);
        } else {
            const newSelectedRows = selectedRows.filter(row => row.id !== record.id);
            setSelectedRows(newSelectedRows);
        }
    };

    // 4. Function to handle the multi-location change




    // This button only activates the multi-select mode for location change
    const LocationChangeButton = () => (
        <Button
            type="primary"
            onClick={() => {
                toggleMultiSelectMode();
            }}
            style={{ marginBottom: 16 }}
        >
            Cambio Locazione Multiplo
        </Button>
    );

   

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
        onExpandedRowsChange: (expandedRows) => {
            // Add animation class to child rows when parent is expanded
            setExpandedRowKeys(expandedRows);
        },
        expandIcon: ({ expanded, onExpand, record }) => {
            if (!record.children || record.children.length === 0) return null;
            return expanded ? (
                <Button
                    icon={<MinusOutlined />}
                    onClick={e => {
                        // Stop event propagation to prevent row selection
                        e.stopPropagation();
                        onExpand(record, e);
                    }}
                    type="text"
                    size="small"
                    className="row-expand-icon row-expand-icon-expanded"
                />
            ) : (
                <Button
                    icon={<PlusOutlined />}
                    onClick={e => {
                        // Stop event propagation to prevent row selection
                        e.stopPropagation();
                        onExpand(record, e);
                    }}
                    type="text"
                    size="small"
                    className="row-expand-icon"
                />
            );
        },
        // Position expand icon in the first column - this needs to be index 0
        expandIconColumnIndex: 0,
        // Add custom CSS class to expandable rows for animation
        expandedRowClassName: () => 'expanded-row',
        expandRowByClick: false // Prevent expanding by clicking the whole row (we have our own handler)
    };
    const canUndoOperation = (operation) => {
        // For regular items
        if (operation.type !== 'group') {
            return true;
        }

        // For group operations, check if any items in the group are not highlighted
        // If all items are highlighted, you can't undo it
        const allItemsHighlighted = operation.articoli.every(item =>
            highlightedRows.has(item.originalRow.id)
        );

        return !allItemsHighlighted; // Can undo only if not all items are highlighted
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
                    timestamp: new Date().toISOString(),
                    originalRowIndex: tableData.findIndex(r => r.id === rowData.id),
                    // If row is part of a distinta, add the parentId and set type to groupItem
                    ...(rowData.mpl_padre && {
                        parentId: rowData.mpl_padre,
                        type: 'groupItem'
                    })
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
    const handleLocazione = async () => {
        setPickOperations([]);
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
            const response = await fetch(`${process.env.REACT_APP_API_URL}/api/location-items?area=${locationOTP[0]}&scaffale=${locationOTP[1]}&colonna=${locationOTP[2]}&piano=${locationOTP[3]}`);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();

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

            setHighlightedShelves(newHighlightedShelves);
            setTableData(flattenedData);

        } catch (error) {

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
    const handleSearch = async () => {
        setPickOperations([]);
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

            setHighlightedShelves(newHighlightedShelves);
            setTableData(flattenedData);

        } catch (error) {

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


  

    const handleShelfClick = (shelf) => {


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
                placement: 'bottomRight',

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
        // Use our new function instead
        openMultiLocationModalForDistinta(record);
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
                    description: 'Tutti gli articoli della distinta sono già stati prelevati',
                    placement: 'bottomRight',

                });
                return;
            }

            // Create a structured array of only pending articles and their quantities
            const articlesData = pendingChildren.map(child => ({
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

                if (response.data.locations.length === 0) {
                    notification.warning({
                        message: 'Attenzione',
                        description: 'Nessuna locazione disponibile per gli articoli rimanenti della distinta',
                        placement: 'bottomRight',

                    });
                }
            } else {
                setGroupLocations([]);
                notification.warning({
                    message: 'Attenzione',
                    description: 'Nessuna locazione disponibile per gli articoli rimanenti della distinta',
                    placement: 'bottomRight',

                });
            }
        } catch (error) {
            console.error('Error fetching group locations:', error);
            notification.error({
                message: 'Errore',
                description: 'Impossibile recuperare le locazioni disponibili',
                placement: 'bottomRight',

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
                            onClick={() => openMultiLocationModalForDistinta(record)}
                        >
                            {locations[0]}
                        </Tag></div>
                    ) : (
                        <div style={{ textAlign: 'center' }}><Tag
                            color="orange"
                            style={{
                                cursor: 'pointer'
                            }}
                            onClick={() => openMultiLocationModalForDistinta(record)}
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

                    // MODIFIED SECTION: Check if parent status is completed
                    if (record.status === 'completed') {
                        return null; // Don't show any buttons for completed distinte
                    }

                    // Only show undo button if not completed and operation exists
                    if (groupOperation && highlightedChildren + completedChildren === totalChildren && totalChildren > 0) {
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
    ]; const UndoModal = () => (
        <Modal
            title="Conferma annullamento"
            open={undoModalVisible}
            onOk={() => {
                // Set loading state immediately before starting the operation
                setConfirmLoading(true);
            }}
            onCancel={() => {
                if (!confirmLoading) {
                    setUndoModalVisible(false);
                    setSelectedOperation(null);
                }
            }}
            afterOpenChange={(open) => {
                // If the modal is open and we're in loading state, start the operation
                if (open && confirmLoading) {
                    handleUndoConfirm();
                }
            }}
            confirmLoading={confirmLoading}
            okText="Conferma"
            cancelText="Annulla"
            maskClosable={!confirmLoading}
            closable={!confirmLoading}
            keyboard={!confirmLoading} // Prevent Esc key from closing during loading
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
                        {/* {canTakeAll && (
                            <Button
                                type="link"
                                onClick={() => {
                                    setSelectedLocation(record);
                                    setPrelevaTuttoModalVisible(true);
                                }}
                            >
                                Seleziona questa locazione per l'intera quantità
                            </Button>
                        )} */}
                    </Space>
                );
            },
        }
    ];
    const handleGroupLocationChange = async (newLocation) => {
        if (!selectedGroup || !newLocation) return;

        try {
            // Since we now use openMultiLocationModalForDistinta, we can just delegate to handleMultiLocationChange
            // The selectedRows will be set by openMultiLocationModalForDistinta to be the distinta children
            handleMultiLocationChange(newLocation);
        } catch (error) {
            notification.error({
                message: 'Errore',
                description: 'Errore durante l\'aggiornamento delle locazioni',
                placement: 'bottomRight',
            });
        }
    };
    
  useEffect(() => {
    if (locationOTP[3] !== '') {
        handleLocazione();
    }
    
  }, [locationOTP[3]]); // Runs only when locationOTP changes
    const handleOTPChange = (index, value) => {
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


    // Completely revamped handleGroupPick function
    const handleGroupPick = async () => {
        if (!selectedGroup) return;

        try {
            // Set loading state
            setConfirmLoading(true);

            // Filter children to only include those that need to be picked
            const childrenToProcess = selectedGroup.children.filter(
                child => !highlightedRows.has(child.id) &&
                    child.status !== 'completed' &&
                    !child.isSpacer &&
                    child.location // Only process children with a location
            );

            if (childrenToProcess.length === 0) {
                notification.info({
                    message: 'Nessun articolo da prelevare',
                    description: 'Tutti gli articoli della distinta sono già stati prelevati',
                    placement: 'bottomRight'
                });
                setGroupPickModalVisible(false);
                setSelectedGroup(null);
                setConfirmLoading(false);
                return;
            }

            // Prepare batch data for API
            const batchData = childrenToProcess.map(child => ({
                articolo: child.occ_arti,
                quantity: child.available_quantity,
                area: child.location.area,
                scaffale: child.location.scaffale,
                colonna: child.location.colonna,
                piano: child.location.piano,
                movimento: child.movimento || '',
                rowId: child.id // Include row ID for tracking
            }));

            // Make a single API call with all items
            const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/batch-update-pacchi`, {
                items: batchData,
                odl: ordineLavoro
            });

            // Process results
            const successfulPicks = [];
            const failedPicks = [];
            let updatedTableData = [...tableData];

            // Track processed operations to avoid duplicates
            const processedOperations = new Map();
            // Track existing operations that need to be removed
            const operationsToRemove = new Set();

            if (response.data.results) {
                // First, identify all existing operations for these articles/locations
                // so we don't have race conditions with state updates
                const existingOperationsMap = new Map();

                pickOperations.forEach(op => {
                    if (op.articolo && op.location) {
                        const key = `${op.articolo}-${op.location.area}-${op.location.scaffale}-${op.location.colonna}-${op.location.piano}`;
                        existingOperationsMap.set(key, op);
                    }
                });

                response.data.results.forEach(result => {
                    if (result.success) {
                        successfulPicks.push(result.rowId);

                        // Find the corresponding child
                        const child = childrenToProcess.find(c => c.id === result.rowId);
                        if (child) {
                            // Create keys for lookups
                            const locationKey = `${child.location.area}-${child.location.scaffale}-${child.location.colonna}-${child.location.piano}`;
                            const operationKey = `${child.occ_arti}-${locationKey}`;
                            const existingOpKey = `${child.occ_arti}-${child.location.area}-${child.location.scaffale}-${child.location.colonna}-${child.location.piano}`;

                            // Check if there's an already highlighted row with the same article and location
                            const existingHighlightedRows = updatedTableData.filter(row =>
                                highlightedRows.has(row.id) &&
                                row.occ_arti === child.occ_arti &&
                                row.location?.area === child.location?.area &&
                                row.location?.scaffale === child.location?.scaffale &&
                                row.location?.colonna === child.location?.colonna &&
                                row.location?.piano === child.location?.piano
                            );

                            if (existingHighlightedRows.length > 0) {
                                // Merge with the first existing highlighted row
                                const existingRow = existingHighlightedRows[0];
                                const updatedQuantity = parseFloat(existingRow.available_quantity || 0) + parseFloat(child.available_quantity || 0);

                                // Update the existing row's quantity
                                updatedTableData = updatedTableData.map(row =>
                                    row.id === existingRow.id
                                        ? { ...row, available_quantity: updatedQuantity }
                                        : row
                                );

                                // Remove the child row from the table data since it's been merged
                                updatedTableData = updatedTableData.filter(row => row.id !== child.id);
                            }

                            // Check if there's an existing operation for this article and location
                            const existingOp = existingOperationsMap.get(existingOpKey);

                            if (existingOp) {
                                // Mark the existing operation for removal
                                operationsToRemove.add(existingOp.id);

                                // Create a merged operation
                                const newOperation = {
                                    ...existingOp,
                                    quantity: parseFloat(existingOp.quantity || 0) + parseFloat(child.available_quantity || 0),
                                    parentId: selectedGroup.id, // Ensure parentId is set
                                    type: 'groupItem', // Ensure type is set
                                    // Keep the original row from the existing operation
                                    originalRow: existingOp.originalRow
                                };

                                // Store the merged operation
                                processedOperations.set(operationKey, newOperation);
                            } else {
                                // No existing operation, create a new one
                                const newOperation = {
                                    articolo: child.occ_arti,
                                    location: { ...child.location },
                                    quantity: parseFloat(child.available_quantity || 0),
                                    movimento: child.movimento || '',
                                    originalRow: { ...child },
                                    type: 'groupItem',
                                    parentId: selectedGroup.id
                                };

                                processedOperations.set(operationKey, newOperation);
                            }
                        }
                    } else {
                        const child = childrenToProcess.find(c => c.id === result.rowId);
                        if (child) {
                            failedPicks.push(child.occ_arti);
                        }
                    }
                });

                // Update pickOperations state in a single operation
                if (processedOperations.size > 0 || operationsToRemove.size > 0) {
                    setPickOperations(prev => {
                        // Remove operations that are being replaced
                        const filteredOps = prev.filter(op => !operationsToRemove.has(op.id));

                        // Check if there are existing operations with same article, location AND parentId
                        // that we should merge with
                        const existingOpsMap = new Map();
                        filteredOps.forEach(op => {
                            if (op.articolo && op.location && op.parentId) {
                                const key = `${op.articolo}-${op.location.area}-${op.location.scaffale}-${op.location.colonna}-${op.location.piano}-${op.parentId}`;
                                existingOpsMap.set(key, op);
                            }
                        });

                        // Prepare operations to add, merging with existing ones if needed
                        const finalOpsToAdd = [];
                        const opsToRemove = new Set();

                        // Process each new operation
                        Array.from(processedOperations.values()).forEach(op => {
                            if (op.articolo && op.location && op.parentId) {
                                const key = `${op.articolo}-${op.location.area}-${op.location.scaffale}-${op.location.colonna}-${op.location.piano}-${op.parentId}`;
                                const existingOp = existingOpsMap.get(key);

                                if (existingOp) {
                                    // Merge with existing operation
                                    opsToRemove.add(existingOp.id);
                                    finalOpsToAdd.push({
                                        ...existingOp,
                                        quantity: parseFloat(existingOp.quantity || 0) + parseFloat(op.quantity || 0),
                                        movimento: op.movimento || existingOp.movimento,
                                        parentId: op.parentId,
                                        type: 'groupItem'
                                    });
                                } else {
                                    // Add as new operation
                                    finalOpsToAdd.push({
                                        id: uuidv4(),
                                        timestamp: new Date().toISOString(), // Standardized timestamp
                                        ...op
                                    });
                                }
                            } else {
                                // For operations without parentId
                                finalOpsToAdd.push({
                                    id: uuidv4(),
                                    timestamp: new Date().toISOString(), // Standardized timestamp
                                    ...op
                                });
                            }
                        });

                        // Return filtered ops (minus any merged ones) plus new ones
                        return [
                            ...filteredOps.filter(op => !opsToRemove.has(op.id)),
                            ...finalOpsToAdd
                        ];
                    });
                }
            }

            // Update the table data with merged rows
            setTableData(updatedTableData);

            // Store the group operation for the entire distinta
            if (successfulPicks.length > 0) {
                // Check if there's already a group operation for this group
                const existingGroupOpIndex = pickOperations.findIndex(op =>
                    op.type === 'group' && op.parentId === selectedGroup.id
                );

                // Create a map of merged articles with updated quantities
                const mergedArticoli = new Map();

                childrenToProcess
                    .filter(child => successfulPicks.includes(child.id))
                    .forEach(child => {
                        // Create a location key for matching
                        const locationKey = `${child.location.area}-${child.location.scaffale}-${child.location.colonna}-${child.location.piano}`;
                        const articleKey = `${child.occ_arti}-${locationKey}`;

                        if (mergedArticoli.has(articleKey)) {
                            // If article with same location already exists, update quantity
                            const existing = mergedArticoli.get(articleKey);
                            existing.quantity += parseFloat(child.available_quantity || 0);
                        } else {
                            // Otherwise add new entry
                            mergedArticoli.set(articleKey, {
                                articolo: child.occ_arti,
                                location: { ...child.location },
                                quantity: parseFloat(child.available_quantity || 0),
                                originalRow: { ...child }
                            });
                        }
                    });

                const groupOperation = {
                    id: uuidv4(),
                    timestamp: new Date(),
                    type: 'group',
                    parentId: selectedGroup.id,
                    articoli: Array.from(mergedArticoli.values())
                };

                // Update operations in a single state update
                setPickOperations(prev => {
                    // If there's an existing group operation, don't create a new one
                    // as we've already merged all the individual operations
                    if (existingGroupOpIndex !== -1) {
                        return prev;
                    }
                    return [...prev, groupOperation];
                });
                // Update highlighted rows in a single state update
                setHighlightedRows(prev => {
                    // First, build a map of all rows in the table by article+location
                    // This helps us identify all rows that should be merged, regardless of distinta
                    const allRowsByArticleLocation = new Map();

                    // Map all rows in the tableData by their article+location combination
                    tableData.forEach(row => {
                        if (row.location && row.occ_arti) {
                            const key = `${row.occ_arti}-${row.location.area}-${row.location.scaffale}-${row.location.colonna}-${row.location.piano}`;
                            if (!allRowsByArticleLocation.has(key)) {
                                allRowsByArticleLocation.set(key, []);
                            }
                            allRowsByArticleLocation.get(key).push(row.id);
                        }
                    });

                    // Start with a clean set
                    const newSet = new Set([...prev]);

                    // For each successfully picked row from this operation
                    successfulPicks.forEach(pickedId => {
                        const pickedRow = childrenToProcess.find(c => c.id === pickedId);
                        if (!pickedRow || !pickedRow.location) return;

                        // Get the key for this row
                        const key = `${pickedRow.occ_arti}-${pickedRow.location.area}-${pickedRow.location.scaffale}-${pickedRow.location.colonna}-${pickedRow.location.piano}`;

                        // Find all rows with the same article+location
                        const allRelatedRowIds = allRowsByArticleLocation.get(key) || [];

                        // Check if any of these rows are already highlighted
                        const alreadyHighlightedIds = allRelatedRowIds.filter(id => prev.has(id));

                        if (alreadyHighlightedIds.length > 0) {
                            // We have a merge case - an already highlighted row exists with same article+location

                            // Remove the newly picked row from highlights
                            newSet.delete(pickedId);

                            // Keep only the first already highlighted row and remove others
                            const keepId = alreadyHighlightedIds[0];
                            alreadyHighlightedIds.slice(1).forEach(id => newSet.delete(id));

                            // Make sure the one we're keeping is added (should already be there)
                            newSet.add(keepId);
                        } else {
                            // No existing highlight for this article+location, add the new one
                            newSet.add(pickedId);
                        }
                    });

                    return newSet;
                });
            }

            // Show results notification
            if (failedPicks.length === 0 && successfulPicks.length > 0) {
                notification.success({
                    message: 'Successo',
                    description: `Tutti i ${successfulPicks.length} articoli sono stati prelevati con successo`,
                    placement: 'bottomRight'
                });
            } else if (successfulPicks.length > 0) {
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
            } else {
                notification.error({
                    message: 'Errore',
                    description: 'Nessun articolo è stato prelevato',
                    placement: 'bottomRight'
                });
            }

        } catch (error) {
            console.error('Error during group pick:', error);
            notification.error({
                message: 'Errore',
                description: 'Si è verificato un errore durante il prelievo della distinta',
                placement: 'bottomRight'
            });
        } finally {
            // Only set these after the operation is complete

            setConfirmLoading(false);
            setGroupPickModalVisible(false);
            setSelectedGroup(null);

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

    // Fix the handleUndoConfirm function to properly handle group operations
    const handleUndoConfirm = async () => {
        if (!selectedOperation) return;
        console.log(selectedOperation.type);
        try {
            // Loading state already set from the modal click handler

            if (selectedOperation.type === 'group') {
                // Get all operations related to this distinta - do this first to ensure we have the correct quantities
                const relatedOperations = pickOperations.filter(op =>
                    op.type === 'groupItem' && op.parentId === selectedOperation.parentId
                );
                console.log("Related operations with actual quantities:", relatedOperations);

                // Prepare batch data using the related operations which have the correct merged quantities
                const batchData = [];

                // Map to track which article+location combinations we've already processed
                const processedKeys = new Set();

                // First use the related operations which have the correct merged quantities
                relatedOperations.forEach(op => {
                    const key = `${op.articolo}-${op.location.area}-${op.location.scaffale}-${op.location.colonna}-${op.location.piano}`;

                    if (!processedKeys.has(key)) {
                        processedKeys.add(key);

                        batchData.push({
                            articolo: op.articolo,
                            area: op.location.area,
                            scaffale: op.location.scaffale,
                            colonna: op.location.colonna,
                            piano: op.location.piano,
                            quantity: op.quantity, // Use the correct merged quantity
                            rowId: op.originalRow.id
                        });
                    }
                });

                // Now add any remaining operations from selectedOperation.articoli that weren't in relatedOperations
                selectedOperation.articoli.forEach(item => {
                    const key = `${item.articolo}-${item.location.area}-${item.location.scaffale}-${item.location.colonna}-${item.location.piano}`;

                    if (!processedKeys.has(key)) {
                        processedKeys.add(key);

                        batchData.push({
                            articolo: item.articolo,
                            area: item.location.area,
                            scaffale: item.location.scaffale,
                            colonna: item.location.colonna,
                            piano: item.location.piano,
                            quantity: item.quantity,
                            rowId: item.originalRow.id
                        });
                    }
                });

                console.log("Batch data with correct quantities:", batchData);

                // Make a single API call to undo all items in the group
                const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/batch-undo-pacchi`, {
                    items: batchData,
                    odl: ordineLavoro
                });

                if (response.data.success) {
                    // Get all operations related to this distinta
                    const relatedOperations = pickOperations.filter(op =>
                        op.type === 'groupItem' && op.parentId === selectedOperation.parentId
                    );

                    // Update highlighted rows in a single operation
                    setHighlightedRows(prev => {
                        const newSet = new Set([...prev]);

                        // Find all rows in the table that belong to this distinta
                        const parentId = selectedOperation.parentId;

                        console.log("Undo distinta - parentId:", parentId);
                        console.log("Current highlighted rows:", [...prev]);
                        console.log("Operations to remove:", relatedOperations);
                        console.log("Selected operation:", selectedOperation);

                        // Explicitly handle parent row (the distinta itself)
                        newSet.delete(parentId);

                        // Method 1: Remove rows that match the originalRow.id in operations
                        selectedOperation.articoli.forEach(item => {
                            if (item.originalRow && item.originalRow.id) {
                                console.log("Removing articoli item:", item.originalRow.id);
                                newSet.delete(item.originalRow.id);
                            }
                        });

                        relatedOperations.forEach(op => {
                            if (op.originalRow && op.originalRow.id) {
                                console.log("Removing related op item:", op.originalRow.id);
                                newSet.delete(op.originalRow.id);
                            }
                        });

                        // Method 2: Remove ALL rows from the table that belong to this distinta
                        tableData.forEach(row => {
                            if (row.mpl_padre === parentId || row.id === parentId) {
                                console.log("Removing child of distinta:", row.id);
                                newSet.delete(row.id);
                            }
                            // Also check against the selected operation's parent ID
                            if (selectedOperation.parentId && row.id === selectedOperation.parentId) {
                                console.log("Removing parent row:", row.id);
                                newSet.delete(row.id);
                            }
                        });

                        // Method 3: Remove rows with the same article and location as any operation
                        const operationKeys = new Set();

                        // Collect all article+location combinations in the operations
                        [...relatedOperations, ...selectedOperation.articoli].forEach(op => {
                            if (op.articolo && op.location) {
                                const key = `${op.articolo}-${op.location.area}-${op.location.scaffale}-${op.location.colonna}-${op.location.piano}`;
                                operationKeys.add(key);
                            }
                        });

                        // Remove any highlighted row that matches these combinations
                        tableData.forEach(row => {
                            if (row.occ_arti && row.location) {
                                const key = `${row.occ_arti}-${row.location.area}-${row.location.scaffale}-${row.location.colonna}-${row.location.piano}`;
                                if (operationKeys.has(key)) {
                                    console.log("Removing by article+location match:", row.id);
                                    newSet.delete(row.id);
                                }
                            }
                        });

                        console.log("Remaining highlighted rows:", [...newSet]);
                        return newSet;
                    });

                    // Remove the group operation AND all related individual operations by parentId
                    setPickOperations(prev => prev.filter(op =>
                        op.id !== selectedOperation.id &&
                        (op.type !== 'groupItem' || op.parentId !== selectedOperation.parentId)
                    ));

                    notification.success({
                        message: 'Operazione annullata',
                        description: `Prelievo della distinta annullato con successo.`,
                        placement: 'bottomRight'
                    });
                } else {
                    throw new Error('Failed to undo group operation');
                }
            } else {
                console.log("undoing single item");
                console.log(selectedOperation.type);

                // Handle undoing a regular single item (merged partial picks are handled here)
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

                // Remove this operation from our tracking list.
                setPickOperations(prev => prev.filter(op => op.id !== selectedOperation.id));

                let updatedTableData = [...tableData];

                // Find all rows that belong to the merged group: same article and same location.
                const matchingGroup = updatedTableData.filter(row =>
                    row.occ_arti === selectedOperation.articolo &&
                    row.location &&
                    row.location.area === selectedOperation.location.area &&
                    row.location.scaffale === selectedOperation.location.scaffale &&
                    row.location.colonna === selectedOperation.location.colonna &&
                    row.location.piano === selectedOperation.location.piano
                );

                // Remove all rows matching this criteria from the tableData.
                updatedTableData = updatedTableData.filter(row =>
                    !(row.occ_arti === selectedOperation.articolo &&
                        row.location &&
                        row.location.area === selectedOperation.location.area &&
                        row.location.scaffale === selectedOperation.location.scaffale &&
                        row.location.colonna === selectedOperation.location.colonna &&
                        row.location.piano === selectedOperation.location.piano)
                );

                // Use the original state stored in the operation to restore the row's quantity.
                // This is the pre-pick value.
                const restoredQuantity = parseFloat(selectedOperation.originalRow.available_quantity || 0);

                // Check if there is already a non-highlighted (to_pick) row for this article and location.
                // If so, we merge the restored row with that row.
                const existingUnhighlightedRow = tableData.find(row =>
                    row.occ_arti === selectedOperation.articolo &&
                    row.location &&
                    row.location.area === selectedOperation.location.area &&
                    row.location.scaffale === selectedOperation.location.scaffale &&
                    row.location.colonna === selectedOperation.location.colonna &&
                    row.location.piano === selectedOperation.location.piano &&
                    !highlightedRows.has(row.id) &&
                    row.status === 'to_pick'
                );

                if (existingUnhighlightedRow) {
                    // Merge by replacing with the restored (original) state.
                    const mergedRow = {
                        ...existingUnhighlightedRow,
                        available_quantity: restoredQuantity,
                        status: 'to_pick'
                    };

                    // Get the original index of the row from the operation
                    const originalIndex = selectedOperation.originalRowIndex || 0;

                    // Insert at the original position if possible, or at the end if the index is invalid
                    if (originalIndex >= 0 && originalIndex <= updatedTableData.length) {
                        updatedTableData.splice(originalIndex, 0, mergedRow);
                    } else {
                        updatedTableData.push(mergedRow);
                    }
                } else {
                    // No base row exists; add the restored row directly.
                    const restoredRow = {
                        ...selectedOperation.originalRow,
                        status: 'to_pick'
                    };

                    // Get the original index of the row from the operation
                    const originalIndex = selectedOperation.originalRowIndex || 0;

                    // Insert at the original position if possible, or at the end if the index is invalid
                    if (originalIndex >= 0 && originalIndex <= updatedTableData.length) {
                        updatedTableData.splice(originalIndex, 0, restoredRow);
                    } else {
                        updatedTableData.push(restoredRow);
                    }
                }

                // Update highlightedRows: remove IDs for all rows in the matching group.
                const newHighlightedRows = new Set(highlightedRows);
                matchingGroup.forEach(row => newHighlightedRows.delete(row.id));
                setHighlightedRows(newHighlightedRows);

                // Update the table data with our changes
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
            console.log("After undo", pickOperations);

            // Only set these after the operation is complete
            setConfirmLoading(false);
            setUndoModalVisible(false);
            setSelectedOperation(null);
        }
    };
    const handleUndoRequest = (operation) => {
        console.log("handleUndoRequest", operation);
        setSelectedOperation(operation);
        if (!undoModalVisible) {
            setUndoModalVisible(true);
        }
    };
    const storePickOperation = (operation) => {
        setPickOperations(prev => {
            // Check if there's an existing operation for the same article and location
            const existingOpIndex = prev.findIndex(op =>
                op.articolo === operation.articolo &&
                op.location && operation.location &&
                op.location.area === operation.location.area &&
                op.location.scaffale === operation.location.scaffale &&
                op.location.colonna === operation.location.colonna &&
                op.location.piano === operation.location.piano &&
                // Add check for parentId - only merge if both are from the same parent or both have no parent
                ((op.parentId === operation.parentId) || (!op.parentId && !operation.parentId))
            );

            if (existingOpIndex !== -1) {
                // Merge quantities if exists
                const existingOp = prev[existingOpIndex];
                const newOperation = {
                    ...existingOp,
                    quantity: Number(existingOp.quantity) + Number(operation.quantity),
                    // Preserve movement info if merging distinta operations
                    movimento: operation.movimento || existingOp.movimento,
                    // Make sure we keep the parentId and type when merging
                    parentId: existingOp.parentId || operation.parentId,
                    type: existingOp.type || operation.type
                };
                return [
                    ...prev.filter((_, i) => i !== existingOpIndex),
                    newOperation
                ];

            } else {
                // If no matching operation exists, create a new one
                const newOps = [...prev, {
                    id: uuidv4(),
                    timestamp: new Date().toISOString(), // Use ISO string for consistent format
                    ...operation
                }];
                console.log("Created new operation", newOps);
                return newOps;
            }
        });
    };

    // Add a new function to fetch a single distinta without reloading everything
    const fetchSingleDistinta = async (parentId) => {
        try {
            // Only request the specific distinta data
            const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-distinta`, {
                params: {
                    articolo: parentId
                }
            });

            if (response.data && response.data.distinta) {
                // Update only this specific distinta in the table
                setTableData(prevData => {
                    const newData = [...prevData];
                    const index = newData.findIndex(row => row.id === parentId);

                    if (index !== -1) {
                        newData[index] = response.data.distinta;
                    }

                    return newData;
                });
            }
        } catch (error) {
            console.error("Error fetching single distinta:", error);
            notification.error({
                message: 'Errore',
                description: 'Errore durante il recupero dei dati della distinta.',
                placement: 'bottomRight'
            });
        }
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
      const handleShelfClickSelection = (shelf) => {
        setHighlightedShelf(shelf);
        
        // Parse the shelf string (format: "C-01-1")
        const [scaffale, colonna, piano] = shelf.split('-');
        
        // Set values based on which tab is active
 
          setLocationOTP(['A', scaffale, colonna, piano]);
        
        
        setIsWarehouseMapOpen(false);
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


            const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-group-locations`, {
                params: {
                    articlesData: JSON.stringify(articlesData)
                }
            });


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


            const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-group-locations`, {
                params: {
                    articlesData: JSON.stringify(articlesData)
                }
            });


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

        // Get existing allocations from tableData, excluding selected rows
        const getAllocationsPerArticleLocation = () => {
            const allocations = new Map();

            tableData.forEach(row => {
                // Only consider rows that are not selected and have a location
                if (row.location && !selectedRows.some(selected => selected.id === row.id)) {
                    const key = `${row.location.area}-${row.location.scaffale}-${row.location.colonna}-${row.location.piano}-${row.occ_arti}`;

                    if (allocations.has(key)) {
                        const existing = allocations.get(key);
                        existing.quantity += parseFloat(row.available_quantity || 0);
                    } else {
                        allocations.set(key, {
                            location: row.location,
                            article: row.occ_arti,
                            quantity: parseFloat(row.available_quantity || 0)
                        });
                    }
                }
            });

            return allocations;
        };

        // Filter compatible locations to only include those with sufficient quantity
        const getFilteredCompatibleLocations = () => {
            const compatibleLocations = getCompatibleLocations();
            const allocationsMap = getAllocationsPerArticleLocation();

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

                    // Get allocated quantity for this article in this location
                    const allocationKey = `${area}-${scaffale}-${colonna}-${piano}-${article.id_art}`;
                    const allocated = allocationsMap.get(allocationKey)?.quantity || 0;

                    // Calculate remaining quantity after allocation
                    const remainingQuantity = parseFloat(articleData.available_quantity || 0) - allocated;

                    // Check if remaining quantity is sufficient for this article
                    return remainingQuantity >= parseFloat(article.required_quantity || 0);
                });
            });
        };

        const filteredLocations = getFilteredCompatibleLocations();
        const allocationsMap = getAllocationsPerArticleLocation();

        return (
            <Modal
                title="Cambia Locazione Multipla"
                open={multiLocationModalVisible}
                onCancel={() => {
                    setMultiLocationModalVisible(false);
                    setLocazioni([]); // Clear locations when closing
                    // Dispatch custom event for the modal closing
                    window.dispatchEvent(new Event('modalClosed'));
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
                                    const [area, scaffale, colonna, piano] = location.location.split('-');

                                    const articlesWithQuantities = consolidatedArticles.map(article => {
                                        // Find this article in the location data
                                        const locationArticleData = locazioni
                                            .find(loc =>
                                                loc.area === location.area &&
                                                loc.scaffale === location.scaffale &&
                                                loc.colonna === location.colonna &&
                                                loc.piano === location.piano
                                            )?.articles?.find(a => a.id_art === article.id_art);

                                        // Get allocated quantity for this article in this location
                                        const allocationKey = `${area}-${scaffale}-${colonna}-${piano}-${article.id_art}`;
                                        const allocated = allocationsMap.get(allocationKey)?.quantity || 0;

                                        return {
                                            ...article,
                                            available_quantity: locationArticleData?.available_quantity || 0,
                                            allocated_quantity: allocated,
                                            remaining_quantity: (locationArticleData?.available_quantity || 0) - allocated
                                        };
                                    });

                                    // Check if any article doesn't have enough remaining quantity
                                    const hasInsufficientQuantity = articlesWithQuantities.some(
                                        article => article.required_quantity > article.remaining_quantity
                                    );

                                    return {
                                        key: location.location,
                                        location: location.location,
                                        articles: articlesWithQuantities,
                                        insufficient: hasInsufficientQuantity
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
                                            {record.articles.map(article => {
                                                // Determine if this article has sufficient quantity
                                                const isSufficient = article.remaining_quantity >= article.required_quantity;

                                                return (
                                                    <div key={article.id_art} style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        margin: '4px 0',
                                                        padding: 4,
                                                        backgroundColor: isSufficient ? '#f6ffed' : '#fff1f0'
                                                    }}>
                                                        <div style={{ fontWeight: 500 }}>{article.id_art}</div>
                                                        <div>
                                                            <span style={{ marginRight: 8 }}>
                                                                Richiesto: {article.required_quantity}
                                                            </span>
                                                            <span style={{ marginRight: 8, color: '#389e0d' }}>
                                                                Disponibile: {article.available_quantity}
                                                            </span>
                                                            {article.allocated_quantity > 0 && (
                                                                <span style={{ color: '#d46b08' }}>
                                                                    Impegnato: {article.allocated_quantity}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
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
                                            disabled={record.insufficient}
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
            open={settingsModalVisible}
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
            open={resetConfirmModalVisible}
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

    // Add helper function to open multi-location modal for a distinta
    const openMultiLocationModalForDistinta = async (parentRecord) => {
        if (!parentRecord) return;

        // Find all selectable child rows of this distinta
        const selectableChildren = tableData.filter(row =>
            row.mpl_padre === parentRecord.id &&
            !highlightedRows.has(row.id) &&
            row.status !== 'completed' &&
            row.isChildRow
        );

        if (selectableChildren.length === 0) {
            notification.warning({
                message: 'Nessuna riga selezionabile',
                description: 'Non ci sono righe selezionabili in questa distinta',
                placement: 'bottomRight'
            });
            return;
        }

        // Use the existing logic of openMultiLocationModal but with our own set of rows
        // Show loading in the UI without opening the modal yet
        setLoadingLocations(true);

        try {
            // Create articlesData from the distinta's selectable children
            const articlesData = selectableChildren.map(row => ({
                article: row.occ_arti,
                quantity: parseFloat(row.available_quantity || 0)
            }));

            const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-group-locations`, {
                params: {
                    articlesData: JSON.stringify(articlesData)
                }
            });

            if (response.data?.locations) {
                // Temporarily store the original selectedRows
                const originalSelectedRows = [...selectedRows];

                // Set the selected rows to be the distinta's selectable children for the modal
                setSelectedRows(selectableChildren);

                // Set the locations and open the modal
                setLocazioni(response.data.locations);
                setMultiLocationModalVisible(true);

                // Listen for the modal close to restore the original selected rows
                const handleModalClose = () => {
                    // When the modal closes, restore the original selection
                    setSelectedRows(originalSelectedRows);
                    // Remove this event listener
                    window.removeEventListener('modalClosed', handleModalClose);
                };

                // Add an event listener for when the modal closes
                window.addEventListener('modalClosed', handleModalClose);
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

    // Add a function to handle picking all items at once
    const handlePickAll = async () => {
        // When in multi-select mode, use the selected rows
        const rowsToProcess = multiSelectMode ? selectedRows : tableData.filter(row =>
            !row.isParent &&
            canPickRow(row) &&
            !highlightedRows.has(row.id)
        );

        if (rowsToProcess.length === 0) {
            notification.warning({
                message: 'Nessun articolo selezionato',
                description: 'Seleziona almeno un articolo da prelevare',
                placement: 'bottomRight'
            });
            return;
        }

        // Group articles by code for the summary
        const articleSummary = {};
        rowsToProcess.forEach(row => {
            const articleCode = row.occ_arti;
            const quantity = parseFloat(row.available_quantity || 0);
            
            if (articleSummary[articleCode]) {
                articleSummary[articleCode].quantity += quantity;
                articleSummary[articleCode].locations.push(`${row.location.area}-${row.location.scaffale}-${row.location.colonna}-${row.location.piano}`);
            } else {
                articleSummary[articleCode] = {
                    desc: row.occ_desc_combined,
                    quantity: quantity,
                    locations: [`${row.location.area}-${row.location.scaffale}-${row.location.colonna}-${row.location.piano}`]
                };
            }
        });

        // Create data source for the summary table
        const tableDataSource = Object.entries(articleSummary).map(([code, info], index) => ({
            key: index,
            code: code,
            description: info.desc,
            quantity: info.quantity,
            locations: info.locations.join(', ')
        }));

        // Define columns for the summary table
        const summaryColumns = [
            {
                title: 'Codice',
                dataIndex: 'code',
                key: 'code',
                render: text => <strong>{text}</strong>
            },
            {
                title: 'Descrizione',
                dataIndex: 'description',
                key: 'description',
                ellipsis: true
            },
            {
                title: 'Quantità',
                dataIndex: 'quantity',
                key: 'quantity',
                align: 'right',
                render: qty => <strong>{qty}</strong>
            },
            {
                title: 'Posizioni',
                dataIndex: 'locations',
                key: 'locations',
                ellipsis: true
            }
        ];

        // Create confirmation modal with table summary
        Modal.confirm({
            title: 'Conferma prelievo multiplo',
            content: (
                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    <p>Stai per prelevare i seguenti articoli:</p>
                    <Table 
                        dataSource={tableDataSource} 
                        columns={summaryColumns} 
                        size="small"
                        pagination={false}
                        bordered
                        summary={() => (
                            <Table.Summary>
                                <Table.Summary.Row>
                                    <Table.Summary.Cell index={0} colSpan={2}><strong>Totale</strong></Table.Summary.Cell>
                                    <Table.Summary.Cell index={1} align="right">
                                        <strong>{tableDataSource.reduce((acc, item) => acc + item.quantity, 0)}</strong>
                                    </Table.Summary.Cell>
                                    <Table.Summary.Cell index={2}>
                                        <strong>{rowsToProcess.length} righe</strong>
                                    </Table.Summary.Cell>
                                </Table.Summary.Row>
                            </Table.Summary>
                        )}
                    />
                    <p style={{ marginTop: '10px' }}>Questa operazione può essere annullata successivamente.</p>
                </div>
            ),
            width: 700,
            okText: 'Conferma',
            cancelText: 'Annulla',
            onOk: async () => {
                try {
                    setConfirmLoading(true);

                    // Generate a batch ID for this operation
                    const batchId = uuidv4();

                    // Prepare batch data for API
                    const batchData = rowsToProcess.map(row => ({
                        articolo: row.occ_arti,
                        quantity: parseFloat(row.available_quantity || 0),
                        area: row.location.area,
                        scaffale: row.location.scaffale,
                        colonna: row.location.colonna,
                        piano: row.location.piano,
                        movimento: row.movimento || '',
                        rowId: row.id // Include row ID for tracking
                    }));

                    // Make a single API call with all items
                    const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/batch-update-pacchi`, {
                        items: batchData,
                        odl: ordineLavoro
                    });

                    // Process results
                    const successfulPicks = [];
                    const failedPicks = [];

                    // Create a batch operation record
                    const batchOperation = {
                        id: batchId,
                        timestamp: new Date().toISOString(),
                        type: 'batchPick',
                        description: `Prelievo multiplo di ${rowsToProcess.length} articoli`,
                        articles: rowsToProcess.map(row => row.occ_arti),
                        operations: []
                    };

                    if (response.data.results) {
                        // Process each result
                        response.data.results.forEach((result, index) => {
                            const row = rowsToProcess[index];

                            if (result.success) {
                                // Store operation for undo
                                const operation = {
                                    articolo: row.occ_arti,
                                    location: { ...row.location },
                                    quantity: parseFloat(row.available_quantity || 0),
                                    movimento: row.movimento || '',
                                    originalRow: { ...row },
                                    type: 'batchItem',
                                    batchId: batchId  // Link to the batch
                                };

                                // Store the operation for undo
                                storePickOperation(operation);

                                // Add to batch operations list
                                batchOperation.operations.push(operation);

                                // Add to successful picks
                                successfulPicks.push(row.occ_arti);

                                // Update highlighted rows
                                setHighlightedRows(prev => {
                                    const newSet = new Set(prev);
                                    newSet.add(row.id);
                                    return newSet;
                                });
                                
                                // Remove picked rows from selectedRows to uncheck them in the UI
                                setSelectedRows(prevSelected => 
                                    prevSelected.filter(selectedRow => selectedRow.id !== row.id)
                                );
                            } else {
                                // Add to failed picks
                                failedPicks.push(row.occ_arti);
                            }
                        });

                        // Store the batch operation itself if any picks were successful
                        if (successfulPicks.length > 0) {
                            batchOperation.successCount = successfulPicks.length;
                            batchOperation.failCount = failedPicks.length;
                            setPickOperations(prev => [...prev]);
                        }

                        // Show result notification
                        if (failedPicks.length === 0 && successfulPicks.length > 0) {
                            notification.success({
                                message: 'Prelievo completato',
                                description: `Tutti i ${successfulPicks.length} articoli sono stati prelevati con successo`,
                                placement: 'bottomRight'
                            });
                        } else if (successfulPicks.length > 0) {
                            notification.warning({
                                message: 'Prelievo parziale',
                                description: (
                                    <div>
                                        <p>Articoli prelevati: {successfulPicks.length}</p>
                                        <p>Articoli non prelevati: {failedPicks.length}</p>
                                    </div>
                                ),
                                placement: 'bottomRight',
                                duration: 8
                            });
                        } else {
                            notification.error({
                                message: 'Errore',
                                description: 'Nessun articolo è stato prelevato',
                                placement: 'bottomRight'
                            });
                        }
                    } else {
                        throw new Error('Risposta API non valida');
                    }
                } catch (error) {
                    console.error('Error during batch pick:', error);
                    notification.error({
                        message: 'Errore',
                        description: 'Si è verificato un errore durante il prelievo multiplo',
                        placement: 'bottomRight'
                    });
                } finally {
                    setConfirmLoading(false);
                }
            }
        });
    };

    // Add the handleUndoAll function before the return statement
    const handleUndoAll = () => {
        // Get all operations that can be undone
        const undoableOperations = pickOperations.filter(op => canUndoOperation(op));

        if (undoableOperations.length === 0) {
            notification.warning({
                message: 'Nessuna operazione da annullare',
                description: 'Non ci sono operazioni che possono essere annullate',
                placement: 'bottomRight'
            });
            return;
        }


        // Create confirmation modal
        Modal.confirm({
            title: 'Conferma annullamento multiplo',
            content: (
                <div>
                    <p>Stai per annullare {undoableOperations.length} operazioni di prelievo. Vuoi continuare?</p>
                    <p>Questa operazione ripristinerà tutti gli articoli prelevati.</p>
                </div>
            ),
            okText: 'Conferma',
            cancelText: 'Annulla',
            onOk: async () => {
                try {
                    setConfirmLoading(true);

                    // Prepare batch data - collect all operations to undo
                    const batchData = [];
                    const processedKeys = new Set();

                    // Process each operation
                    undoableOperations.forEach(op => {
                        // For group operations, expand to include all children
                        if (op.type === 'group') {
                            // Find all related operations
                            const groupItems = pickOperations.filter(item =>
                                item.type === 'groupItem' && item.parentId === op.id
                            );

                            // Add each group item
                            groupItems.forEach(item => {
                                const key = `${item.articolo}-${item.location.area}-${item.location.scaffale}-${item.location.colonna}-${item.location.piano}`;

                                if (!processedKeys.has(key)) {
                                    processedKeys.add(key);

                                    batchData.push({
                                        articolo: item.articolo,
                                        area: item.location.area,
                                        scaffale: item.location.scaffale,
                                        colonna: item.location.colonna,
                                        piano: item.location.piano,
                                        quantity: item.quantity,
                                        rowId: item.originalRow.id
                                    });
                                }
                            });
                        }
                        // For batch operations, include all related batch items
                        else if (op.type === 'batchPick') {
                            // Find all related operations
                            const batchItems = pickOperations.filter(item =>
                                item.type === 'batchItem' && item.batchId === op.id
                            );

                            // Add each batch item
                            batchItems.forEach(item => {
                                const key = `${item.articolo}-${item.location.area}-${item.location.scaffale}-${item.location.colonna}-${item.location.piano}`;

                                if (!processedKeys.has(key)) {
                                    processedKeys.add(key);

                                    batchData.push({
                                        articolo: item.articolo,
                                        area: item.location.area,
                                        scaffale: item.location.scaffale,
                                        colonna: item.location.colonna,
                                        piano: item.location.piano,
                                        quantity: item.quantity,
                                        rowId: item.originalRow.id
                                    });
                                }
                            });
                        }
                        // For regular operations
                        else {
                            const key = `${op.articolo}-${op.location.area}-${op.location.scaffale}-${op.location.colonna}-${op.location.piano}`;

                            if (!processedKeys.has(key)) {
                                processedKeys.add(key);

                                batchData.push({
                                    articolo: op.articolo,
                                    area: op.location.area,
                                    scaffale: op.location.scaffale,
                                    colonna: op.location.colonna,
                                    piano: op.location.piano,
                                    quantity: op.quantity,
                                    rowId: op.originalRow.id
                                });
                            }
                        }
                    });

                    // Make a single API call to undo all items
                    const response = await axios.post(`${process.env.REACT_APP_API_URL}/api/batch-undo-pacchi`, {
                        items: batchData,
                        odl: ordineLavoro
                    });

                    if (response.data.success) {
                        // Clear all highlighted rows
                        setHighlightedRows(new Set());

                        // Clear all operations
                        setPickOperations([]);

                        notification.success({
                            message: 'Operazioni annullate',
                            description: `Tutte le ${undoableOperations.length} operazioni sono state annullate con successo`,
                            placement: 'bottomRight',
                            duration: 5
                        });
                    } else {
                        throw new Error(response.data.message || 'Errore durante l\'annullamento delle operazioni');
                    }
                } catch (error) {
                    console.error('Error during batch undo:', error);
                    notification.error({
                        message: 'Errore',
                        description: error.message || 'Si è verificato un errore durante l\'annullamento delle operazioni',
                        placement: 'bottomRight'
                    });
                } finally {
                    setConfirmLoading(false);
                }
            }
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
                open={locationChangeModalVisible}
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
                open={changeLocationQuantityModalVisible}
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
                open={quantityModalVisible}
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
                open={prelevaTuttoModalVisible}
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
                open={showMissingArticleModal}
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
            <SettingsModal />
            <ResetConfirmationModal />
            <Modal
                title="Conferma annullamento"
                open={undoModalVisible}
                onOk={() => {
                    setConfirmLoading(true);
                    requestAnimationFrame(() => {
                        handleUndoConfirm();
                    });
                }}
                onCancel={() => {
                    if (!confirmLoading) {
                        setUndoModalVisible(false);
                        setSelectedOperation(null);
                    }
                }}
                confirmLoading={confirmLoading}
                okText="Conferma"
                cancelText="Annulla"
                maskClosable={!confirmLoading}
                closable={!confirmLoading}
                keyboard={!confirmLoading}
            >
                {confirmLoading ? (
                    <div style={{ textAlign: 'center', margin: '20px 0' }}>
                        <Spin indicator={<LoadingOutlined spin />} size="large" tip="Annullamento in corso..." />
                        <p style={{ marginTop: 10 }}>Attendere il completamento dell'operazione...</p>
                    </div>
                ) : (
                    <>

                        <p>Sei sicuro di voler annullare il prelievo dell'articolo {selectedOperation?.articolo}?</p>
                        <p>Questo ripristinerà la situazione precedente al prelievo.</p>
                    </>
                )}
            </Modal>

            <Sider width={"55%"} style={{ background: '#fff' }}>
                <Space direction="vertical" style={{ width: '100%', padding: '20px' }}>
                    {/* Add the MultiSelectControls here, above your tabs */}


                    <Tabs
                        onChange={(key) => {
                            // Clear table data when switching tabs
                            if (key !== activeTab) {
                                setTableData([]);
                                setHighlightedRows(new Set());
                                setSelectedRows([]);
                            }
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
                        <TabPane tab="LOCAZIONE" key="3">
                            <div style={{ display: 'flex', marginBottom: '20px', alignItems: 'flex-end' }}>
                                {['AREA', 'SCAFFALE', 'COLONNA', 'PIANO'].map((label, index) => (
                                    <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <span style={{ marginBottom: '4px' }}>{label}</span>
                                        <Input
                                            ref={locationInputRefs[index]}
                                            value={locationOTP[index]}
                                            onChange={(e) => handleOTPChange(index, e.target.value)}
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
                                /><Button
                                type="primary"
                                loading={articoloLoading}
                                onClick={handleLocazione}
                                style={{marginLeft: '40px', flex: 2 }} // Represents 20% proportionally
                            >
                                Cerca Locazione
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
                                    <div>
                                        {activeTab !== '3' && (
                                            <>
                                            {!multiSelectMode ? (
                                                <>
                                                <LocationChangeButton />
                                                <Button
                                                    type="primary"
                                                    onClick={toggleMultiSelectMode}
                                                    style={{ marginLeft: 8 }}
                                                >
                                                    Prelievo Multiplo
                                                </Button>
                                                <Button
                                                    type="primary"
                                                    danger
                                                    onClick={handleUndoAll}
                                                    style={{ marginLeft: 8 }}
                                                    loading={confirmLoading}
                                                    disabled={pickOperations.filter(op => canUndoOperation(op)).length === 0}
                                                >
                                                    Annulla Tutto
                                                </Button>
                                                </>
                                            ) : (
                                                <Space>
                                                    <Button onClick={toggleMultiSelectMode}>
                                                        Annulla Selezione
                                                    </Button>
                                                    <Button
                                                        type="primary"
                                                        onClick={openMultiLocationModal}
                                                        disabled={selectedRows.length === 0}
                                                        loading={loadingLocations}
                                                    >
                                                        Cambia locazione ({selectedRows.length})
                                                    </Button>
                                                    <Button
                                                        type="primary"
                                                        onClick={handlePickAll}
                                                        disabled={selectedRows.length === 0}
                                                        loading={confirmLoading}
                                                    >
                                                        Preleva Selezionati ({selectedRows.length})
                                                    </Button>
                                                </Space>
                                            )}
                                            </>
                                        )}
                                    </div>
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
                                        if (record.isParent) {
                                            // For parent rows in multi-select mode,
                                            // don't do anything when clicking on the row itself
                                            // Selection will only happen through the checkbox
                                            return;
                                        } else {
                                            // Original logic for non-parent rows
                                            const canSelect = !record.isParent &&
                                                record.status !== 'completed' &&
                                                !highlightedRows.has(record.id) &&
                                                record.location &&
                                                !record.missing &&
                                                !record.isSpacer; // Must have a location and not be a special row

                                            if (!canSelect) {
                                                // If not selectable, show a disabled checkbox with appropriate style
                                                return (
                                                    <Tooltip 
                                                        title={
                                                            highlightedRows.has(record.id) 
                                                                ? "Articolo già prelevato" 
                                                                : record.status === 'completed'
                                                                    ? "Articolo già completato"
                                                                    : !record.location
                                                                        ? "Posizione non disponibile" 
                                                                        : record.missing
                                                                            ? "Articolo mancante"
                                                                            : "Non selezionabile"
                                                        }
                                                    >
                                                        <span>
                                                            <Checkbox
                                                                checked={false}
                                                                disabled={true}
                                                                style={{
                                                                    opacity: 0.5,
                                                                    cursor: 'not-allowed'
                                                                }}
                                                            />
                                                        </span>
                                                    </Tooltip>
                                                );
                                            }

                                            return (
                                                <Checkbox
                                                    checked={selectedRows.some(row => row.id === record.id)}
                                                    onChange={(e) => {
                                                        handleRowSelect(record, e.target.checked);
                                                    }}
                                                />
                                            );
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
            <Modal
                title="Preleva distinta"
                open={groupPickModalVisible}
                onCancel={() => {
                    if (!confirmLoading) {
                        setGroupPickModalVisible(false);
                        setSelectedGroup(null);
                    }
                }}
                footer={[
                    <Button
                        key="back"
                        onClick={() => {
                            if (!confirmLoading) {
                                setGroupPickModalVisible(false);
                                setSelectedGroup(null);
                            }
                        }}
                        disabled={confirmLoading}
                    >
                        Annulla
                    </Button>,
                    <Button
                        key="submit"
                        type="primary"
                        loading={confirmLoading}
                        onClick={() => {
                            // Set loading state immediately
                            setConfirmLoading(true);
                            // Use requestAnimationFrame to ensure the loading state is applied before starting the operation
                            requestAnimationFrame(() => {
                                handleGroupPick();
                            });
                        }}
                        disabled={confirmLoading}
                    >
                        Conferma prelievo
                    </Button>,
                ]}
                width={800}
                maskClosable={!confirmLoading}
                closable={!confirmLoading}
                keyboard={!confirmLoading}
            >
                {selectedGroup && (
                    <div>
                        <div style={{ marginBottom: 16 }}>
                            <Text strong>Distinta articolo: </Text>
                            <Text>{selectedGroup.occ_arti}</Text>
                        </div>

                        {confirmLoading && (
                            <div style={{ textAlign: 'center', margin: '20px 0' }}>

                                <Spin indicator={<LoadingOutlined spin />} size="large" tip="Prelievo in corso..." />
                                <p style={{ marginTop: 10 }}>Attendere il completamento dell'operazione...</p>
                            </div>
                        )}

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
                            loading={{
                                spinning: confirmLoading,
                                indicator: <LoadingOutlined spin />,
                                size: 'large',
                            }}
                        />
                    </div>
                )}
            </Modal>
            {/* Include the multi-location change modal */}
            <MultiLocationChangeModal />



        </Layout>
    );
};

export default Picking;