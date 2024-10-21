import React, { useState,useRef, useCallback, useEffect } from 'react';
import { Input, Button, Table, Layout, Space, message, Tooltip, Spin, Tag, Modal, InputNumber, Pagination } from 'antd';
import WarehouseGrid from './GridComponent';
import './Picking.css';
import { LoadingOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import { notification } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { Tabs } from 'antd';
import { CloseCircleOutlined } from '@ant-design/icons';

const { TabPane } = Tabs;
const { Content, Sider } = Layout;

const Picking = () => {
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
    
    const handleQuantityConfirm = async () => {
        if (pickedQuantity <= 0) {
            notification.error({
                message: 'Errore',
                description: 'La quantità deve essere maggiore di zero.',
                placement: 'bottomRight',
                duration: 5, // Notification will close after 3 seconds
            });

            return;
        }

        const { mode, rowIndex, rowData, forcedPickingInfo } = quantityModalData;

        if (mode === 'exact') {
            // Handle exact match quantity picking
            if (pickedQuantity <= 0) {
                notification.error({
                    message: 'Errore',
                    description: 'La quantità deve essere maggiore di zero.',
                    placement: 'bottomRight',
                    duration: 5, // Notification will close after 3 seconds
                });
                return;
            }


            // Handle exact match quantity picking
            if (pickedQuantity > rowData.available_quantity) {
                notification.error({
                    message: 'Errore',
                    description: 'La quantità inserita supera la quantità disponibile.',
                    placement: 'bottomRight',
                    duration: 5, // Notification will close after 3 seconds
                });
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
                    `${item.location.area}-${item.location.scaffale}-${item.location.colonna}-${item.location.piano}` !== scaffale &&
                    !highlightedRows.has(item.id) // Exclude highlighted rows
                ) {
                    if (remainingQuantity > 0) {
                        const deduction = Math.min(item.available_quantity, remainingQuantity);
                        remainingQuantity -= deduction;
                        const newQuantity = item.available_quantity - deduction;

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
    };

    const handleQuantityCancel = () => {
        setQuantityModalVisible(false);
        setQuantityModalData(null);
        setPickedQuantity(0);
    };

    const handleForcedPicking = () => {
        if (forcedPickingData) {
            const { articolo, scaffale, quantity, movimento } = forcedPickingData;

            const scaffaleParts = scaffale.split('-');
            if (scaffaleParts.length !== 4) {

                notification.error({
                    message: 'Errore',
                    description: 'Formato scaffale non valido. Deve essere "area-scaffale-colonna-piano".',
                    placement: 'bottomRight',
                    duration: 5, // Notification will close after 3 seconds
                }); setForcedPickingModalVisible(false);
                return;
            }

            const [area, scaffalePart, colonna, piano] = scaffaleParts;

            // Step 1: Calculate the total required quantity for this articolo
            const totalRequiredQuantity = tableData
                .filter(item => item.occ_arti === articolo)
                .reduce((sum, item) => sum + item.occ_qmov, 0); // Sum of required movement quantity (`occ_qmov`)

            // Step 2: Calculate the total quantity already picked (including forced picks)
            const totalPickedQuantity = tableData
                .filter(item => item.occ_arti === articolo)
                .reduce((sum, item) => sum + item.picked_quantity, 0); // Sum of already picked quantity

            // Step 3: Calculate the remaining quantity that needs to be picked
            const remainingRequiredQuantity = totalRequiredQuantity - totalPickedQuantity;

            // Step 4: Block forced picking if the quantity to be picked exceeds the remaining quantity
            if (quantity > remainingRequiredQuantity) {
                notification.error({
                    message: 'Errore',
                    description: `Non puoi prelevare più di quanto richiesto. Quantità rimanente da prelevare: ${remainingRequiredQuantity}`,
                    placement: 'bottomRight',
                    duration: 5, // Notification will close after 3 seconds
                });
                setForcedPickingModalVisible(false);
                return; // Stop the forced picking action here
            }

            // Proceed with forced picking as there is enough remaining quantity
            let remainingQuantity = quantity;

            // Step 5: Deduct the quantity from existing rows (excluding the forced picking location)
            // Modified code
            const updatedTableData = tableData.map(item => {
                if (item.occ_arti.trim() === articolo.trim() &&
                    item.location &&
                    `${item.location.area}-${item.location.scaffale}-${item.location.colonna}-${item.location.piano}` !== scaffale &&
                    !highlightedRows.has(item.id)) { // Exclude highlighted rows

                    if (remainingQuantity > 0) {
                        const deduction = Math.min(item.available_quantity, remainingQuantity);
                        remainingQuantity -= deduction;
                        const newQuantity = item.available_quantity - deduction;

                        return newQuantity > 0 ? { ...item, available_quantity: newQuantity } : null;
                    }
                }
                return item;
            }).filter(Boolean);


            // Step 6: Check if a forced pick row for this location already exists
            const existingForcedPickIndex = updatedTableData.findIndex(item =>
                item.occ_arti === articolo &&
                item.picked_quantity === 0 && // Indicates it's a forced pick
                item.location && // Ensure location exists
                `${item.location.area}-${item.location.scaffale}-${item.location.colonna}-${item.location.piano}` === scaffale
            );

            if (existingForcedPickIndex !== -1) {
                notification.error({
                    message: 'Errore',
                    description: 'Hai già effettuato un prelievo forzato per questa posizione.',
                    placement: 'bottomRight',
                    duration: 5, // Notification will close after 3 seconds
                });
                setForcedPickingModalVisible(false);
                return;
            }

            // Step 7: Prepare the forced picking row with available_quantity set to 0 and picked_quantity set to quantity
            const forcedPickingRow = {
                occ_arti: articolo,
                occ_desc_combined: tableData.find(item => item.occ_arti === articolo)?.occ_desc_combined || '', // Get description
                occ_qmov: quantity, // Required quantity for this picking
                available_quantity: quantity, // All picked from this row
                movimento: movimento,
                location: {
                    area,
                    scaffale: scaffalePart,
                    colonna,
                    piano
                },
                picked_quantity: quantity, // Amount picked in this forced picking
            };

            // Step 8: Find the index to insert the new row after the scanned article
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

            // Step 9: Update the table data and highlight the new forced picking row
            setTableData(updatedTableData);
            notification.success({
                message: 'Errore',
                description: `Articolo ${articolo} prelevato da ${scaffale}`,
                placement: 'bottomRight',
                duration: 5, // Notification will close after 3 seconds
            });

            // Step 10: Highlight the forced picking row
            const newHighlightedRows = new Set(highlightedRows);
            const newRowIndex = scannedArticleIndex !== -1 ? scannedArticleIndex + 1 : updatedTableData.length - 1;
            newHighlightedRows.add(newRowIndex);
            setHighlightedRows(newHighlightedRows);
        }

        // Close the modal after forced picking action
        setForcedPickingModalVisible(false);
    };

    const handleArticoloPicking = async () => {
        // Validate inputs
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

            // Transform the data
            const transformedData = data.map(item => ({
                id: uuidv4(), // Unique ID for each row
                occ_arti: item.occ_arti,
                occ_desc_combined: item.occ_desc_combined || '',
                occ_qmov: item.occ_qmov,
                available_quantity: item.available_quantity,
                movimento: item.movimento,
                location: {
                    area: item.location.area,
                    scaffale: item.location.scaffale,
                    colonna: item.location.colonna,
                    piano: item.location.piano,
                },
                missing: item.missing || false,
                pacchi: item.id_pacco || false,
                picked_quantity: 0, // Initialize picked_quantity
            }));

            const newHighlightedShelves = new Set();
            transformedData.forEach(item => {
                if (!item.missing) {
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
        const trimmedMovimento = movimento.trim();

        // Check if inputs are provided
        if (!trimmedArticolo || !trimmedScaffale || !trimmedMovimento) {
            notification.warning({
                message: 'Attenzione',
                description: 'Inserisci Articolo, Scaffale e Movimento.',
                placement: 'bottomRight',
                duration: 5, // Notification will close after 3 seconds
            });
            return;
        }

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
            const movimentoMatch = String(item.movimento || '').trim() === trimmedMovimento;

            const isHighlighted = highlightedRows.has(item.id);
            const notHighlighted = !isHighlighted;

            // All conditions for exact match
            const allConditionsMet = articoloMatch && locationExists && locationStringMatch && movimentoMatch && notHighlighted;



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
                    movimento: trimmedMovimento,
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
        } else if ((scaffale || articolo || movimento) && !matchFound && !forcedPickingModalVisible) {
            notification.warning({
                message: 'Attenzione',
                description: 'Corrispondenza non trovata',
                placement: 'bottomRight',
                duration: 5, // Notification will close after 3 seconds
            });
        }
    }, [articolo, scaffale, movimento, tableData, highlightedRows, highlightedShelves, forcedPickingModalVisible]);

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
                        <>

                            <Tooltip title={description} placement="topLeft">
                                {description.substring(0, 10)}...
                                <InfoCircleOutlined style={{ marginLeft: 4 }} />
                            </Tooltip>
                        </>
                    ) : (
                        description
                    )}
                </span>
            ),

        },
        {
            title: 'Q.ta Disponibile',
            dataIndex: 'available_quantity',
            key: 'available_quantity',
        },
        {
            title: 'Movimento',
            dataIndex: 'movimento',
            key: 'movimento',
        },
        {
            title: 'Posizione',
            dataIndex: 'location',
            key: 'location',

            render: location => (
                <>
                    {location.area ? (
                        <Tag color={'geekblue'} key={location} style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                            {location.area}-{location.scaffale}-{location.colonna}-{location.piano}
                        </Tag>

                    ) : (
                        <Tag color={'red'} style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                            Mancante            </Tag>
                    )}
                </>
            ),
        },
    ];


    const rowClassName = (record) => {
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
    const tableStyle = {
        tableLayout: 'fixed', // Fix the table layout to control column width
    };
    return (
        <Layout style={{ minHeight: '100%' }}>

            <Modal
                title="Conferma Quantità da Prelevare"
                visible={quantityModalVisible}
                onOk={handleQuantityConfirm}
                onCancel={handleQuantityCancel}
                okText="Conferma"
                cancelText="Annulla"
            >
                {quantityModalData && quantityModalData.mode === 'exact' && (
                    <>
                        <p>Sei sicuro di voler prelevare <strong>{quantityModalData.rowData.occ_arti}</strong> da <strong>{quantityModalData.rowData.location.area}-{quantityModalData.rowData.location.scaffale}-{quantityModalData.rowData.location.colonna}-{quantityModalData.rowData.location.piano}</strong>?</p>
                        <p>Quantità disponibile: <strong>{quantityModalData.rowData.available_quantity}</strong></p>
                        <p>Inserisci la quantità da prelevare:</p>
                        <InputNumber
                            min={1}
                            max={maxAvailableQuantity}
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
                        <p>Inserisci la quantità da prelevare:</p>
                        <InputNumber
                            min={0}
                            max={maxAvailableQuantity}
                            value={pickedQuantity}
                            onChange={(value) => setPickedQuantity(value)}
                            style={{ width: '100%' }}
                        />

                    </>
                )}
            </Modal>


            <Sider width={"50%"} style={{ background: '#fff' }}>
                <Space direction="vertical" style={{ width: '100%', padding: '20px' }}>
                    <Tabs defaultActiveKey="1" centered>
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
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', gap: '10px' }}>
                                <Input
                                    placeholder="Articolo"
                                    value={articoloInput}
                                    onChange={(e) => setArticoloInput(e.target.value)}
                                    style={{ flexGrow: 7 }} // Represents 70% proportionally
                                />
                                <InputNumber
                                    min={1}
                                    value={articoloQuantity}
                                    onChange={(value) => setArticoloQuantity(value)}
                                    style={{ flexGrow: 1 }} // Represents 10% proportionally
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
                            dataSource={tableData}
                            pagination={false}
                            scroll={{ y: 'calc(100vh - 250px)' }}
                            rowKey="id"
                            rowClassName={rowClassName}
                            style={tableStyle}
                        />
                    )}
                </Space>
            </Sider>
            <Layout>
                <div style={{ padding: '20px', background: '#fff' }}>
                <Input.Group compact>
                <Button
    type="default"
    icon={<CloseCircleOutlined />}
    onClick={() => {
      setScaffale('');
      setArticolo('');
      setMovimento('');
    }}
    style={{ width: 'calc(5% - 10px)' }}
  />
        {/* Scaffale Input */}
        <Input
          ref={scaffaleRef}
          style={{ width: 'calc(25% - 10px)', marginRight: '10px' }}
          placeholder="Scaffale"
          value={scaffale}
          onChange={(e) => setScaffale(e.target.value)}
          onPressEnter={() => {
            // Focus the "Articolo" input when Enter is pressed
            if (articoloRef.current) {
              articoloRef.current.focus();
            }
          }}
        />

        {/* Articolo Input */}
        <Input
  ref={articoloRef}
  style={{ width: 'calc(25% - 10px)', marginRight: '10px' }}
  placeholder="Articolo"
  value={articolo}
  onChange={(e) => {
    const value = e.target.value;
    const parts = value.split(',');

    if (parts.length >= 3) {
      // Set articolo to the first part and movimento to the last part
      if (movimentoRef.current) {
        movimentoRef.current.focus();
      }
      setArticolo(parts[0].trim());  // First part before the first comma
      setMovimento(parts[2].trim()); // Last part after the second comma

    } else {
      // If there are not exactly two commas, we just update articolo
      setArticolo(value.trim());
    }
  }}
  onPressEnter={() => {
    // Focus the "Movimento" input when Enter is pressed
    if (movimentoRef.current) {
      movimentoRef.current.focus();
    }
  }}
/>


        {/* Movimento Input */}
        <Input
          ref={movimentoRef}
          style={{ width: 'calc(25% - 10px)',marginRight: '10px' }}
          placeholder="Movimento"
          value={movimento}
          onChange={(e) => setMovimento(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleHighlight();
            }
          }}
        />
         <Button           style={{ width: 'calc(20% - 10px)' }}
 type="primary" onClick={handleHighlight}>
          Preleva
        </Button>

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