import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Table, Spin, Input, Button, Pagination, Row, Col, message, Modal, notification, Tooltip, Typography, Dropdown, Menu } from 'antd';
import axios from 'axios';
import { LoadingOutlined, ReloadOutlined, FullscreenOutlined, InfoCircleOutlined, CloseCircleOutlined, EditOutlined, CheckOutlined, CloseOutlined, PrinterOutlined, DownOutlined } from '@ant-design/icons';
import './GridComponent.css';
import WarehouseMap from './map/WarehouseMap';

const { Text } = Typography;

const GroupedItemsTable = () => {
  // State variables
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false); // Initially not loading
  const [articleFilter, setArticleFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [filterString, setFilterString] = useState('');
  const [descriptionFilter, setDescriptionFilter] = useState('');
  const [isWarehouseMapOpen, setIsWarehouseMapOpen] = useState(false);
  const [highlightedShelf, setHighlightedShelf] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  
  const [pageSize] = useState(20); // Fixed page size as per requirement
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLayout, setSelectedLayout] = useState('simple');
  const [selectedShelf, setSelectedShelf] = useState(null);
  const [occupiedShelves, setOccupiedShelves] = useState(new Set());
  
  const [locationFilter, setLocationFilter] = useState(['A', '', '', '']); // [area, scaffale, colonna, piano]
const locationInputRefs = [useRef(), useRef(), useRef(), useRef()];

  // State for inline editing
  const [editingKey, setEditingKey] = useState('');
  const [editingQuantity, setEditingQuantity] = useState('');
  const [editingLoading, setEditingLoading] = useState(false);

  // State for printing
  const [printLoading, setPrintLoading] = useState(false);
  const [allPrintData, setAllPrintData] = useState([]);

  const groupSubitemsByLocationAndMovement = (subitems) => {
    const groupedItems = {};
    
    subitems.forEach(subItem => {
      const groupKey = `${subItem.id_mov ?? ''}-${subItem.area}-${subItem.scaffale}-${subItem.colonna}-${subItem.piano}`;
        const locazione = `${subItem.area}-${subItem.scaffale}-${subItem.colonna.toString().padStart(2, '0')}-${subItem.piano}`;
        
        if (!groupedItems[groupKey]) {
            groupedItems[groupKey] = {
                id_mov: subItem.id_mov,
                area: subItem.area,
                scaffale: subItem.scaffale,
                colonna: subItem.colonna,
                piano: subItem.piano,
                locazione: locazione,
                totalQta: 0,
                description: subItem.amg_desc + ' ' + subItem.amg_des2,
            };
        }
        
        groupedItems[groupKey].totalQta += subItem.qta;
    });

    // Convert to array and sort by locazione, then movimento
    return Object.values(groupedItems).sort((a, b) => a.locazione.localeCompare(b.locazione) || sortMovimento(a, b));
  };

  const sortMovimento = (a, b) => {
    // ADAPTA movements ('83754') sort numerically, Skyline documents ('2026/CA/48') naturally; no movement last
    const movA = a.id_mov == null ? '' : String(a.id_mov);
    const movB = b.id_mov == null ? '' : String(b.id_mov);
    if (!movA || !movB) return movB.length - movA.length;

    const isNumA = /^\d+$/.test(movA);
    const isNumB = /^\d+$/.test(movB);
    if (isNumA && isNumB) {
      return Number(movA) - Number(movB);
    }
    if (isNumA !== isNumB) return isNumA ? -1 : 1;

    return movA.localeCompare(movB, undefined, { numeric: true });
  };
  const handleShelfClickSelection = (shelf) => {
    setHighlightedShelf(shelf);
    
    // Parse the shelf string (format: "C-01-1")
    const [scaffale, colonna, piano] = shelf.split('-');
    
    // Set values based on which tab is active
    setLocationFilter(['A', scaffale, colonna, piano]);
    
    
    setIsWarehouseMapOpen(false);
  };

    const getShelfStatus = (shelfId) => {
      if (shelfId === selectedShelf) return 'selected';
      if (occupiedShelves.has(shelfId)) return 'full';
      return 'available';
    };
  // Function to fetch items with pagination and filters
  const fetchItems = async (page = 1, limit = 10) => {
    try {
      setLoading(true);
      // Create filterParts with proper hyphen placement
      
  
      // Ensure exactly 4 components
      let filterStringParam = locationFilter.join('-');

      const parts = filterStringParam.split('-').slice(0, 4);
      while (parts.length < 4) parts.push('');
      filterStringParam = parts.join('-');

      // Clear filter if all empty
      if (parts.every(part => !part)) filterStringParam = '';
  
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-items`, {
        params: {
          page,
          limit,
          articleFilter,
          supplierFilter,
          descriptionFilter,
          filterString: filterStringParam
        },
      });
  
      if (response.data?.items) {
        setItems(response.data.items);
        setTotalItems(response.data.total);
        setTotalPages(response.data.totalPages);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
      message.error('Failed to fetch items');
    } finally {
      setLoading(false);
    }
  };
  
  // Update the handleLocationFilterChange function
  const handleLocationFilterChange = (index, value) => {
    const newLocationFilter = [...locationFilter];
    newLocationFilter[index] = value.toUpperCase();
    setLocationFilter(newLocationFilter);
  
    // Auto-focus logic
    if (value.length === (index === 2 ? 2 : 1)) {
      if (index < 3) {
        locationInputRefs[index + 1].current?.focus();
      }
    }
    
    // Don't automatically fetch here - wait for apply filters button
  };

  
  // Handle backspace in location inputs
  const handleLocationFilterKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !locationFilter[index] && index > 0) {
      locationInputRefs[index - 1].current?.focus();
    }
  };
  // Fetch items on component mount and when currentPage changes
  useEffect(() => {
    fetchItems(currentPage, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize]);

  // Add this effect to handle filter changes
 useEffect(() => {
  // Only fetch if all filters are empty (for initial load and clear filters)
  if (articleFilter === '' && 
      supplierFilter === '' && 
      locationFilter.every(f => f === '') && 
      descriptionFilter === '') {
    fetchItems(1, pageSize);
  }
}, [articleFilter, supplierFilter, descriptionFilter, locationFilter]);

  // Function to apply filters and fetch data
  const applyFilters = () => {
    setCurrentPage(1); // Reset to first page when applying new filters
    fetchItems(1, pageSize);
  };

  // Function to clear all filters
  const clearFilters = () => {
    setArticleFilter('');
    setSupplierFilter('');
    setDescriptionFilter('');
    setLocationFilter(['', '', '', '']);
    setCurrentPage(1);
  };

  // Function to handle page change
  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  
  // Function to visualize the location of the subitem
  const visualizeLocation = (subItem) => {
    const { scaffale, colonna, piano } = subItem;
    const colFormatted = colonna.toString().padStart(2, '0');
    const shelfToHighlight = `${scaffale}-${colFormatted}-${piano}`;
    setHighlightedShelves(new Set([shelfToHighlight]));

  setSelectedRecord(subItem);
  setIsModalVisible(true);
  
  };

  const [highlightedShelves, setHighlightedShelves] = useState(new Set());
  const handleShelfClick = () => {};

  const getTooltipContent = (shelf) => {
    return shelf;
  };

  // Functions for inline quantity editing
  const startEditing = (record) => {
    setEditingKey(record.key);
    setEditingQuantity(record.totalQta.toString());
  };

  const cancelEditing = () => {
    setEditingKey('');
    setEditingQuantity('');
  };

  const saveQuantity = async (record) => {
    if (!editingQuantity || isNaN(editingQuantity) || parseFloat(editingQuantity) < 0) {
      message.error('Please enter a valid quantity');
      return;
    }

    const newQuantity = parseFloat(editingQuantity);
    if (newQuantity === record.totalQta) {
      cancelEditing();
      return;
    }

    setEditingLoading(true);
    try {
      const response = await axios.put(`${process.env.REACT_APP_API_URL}/api/update-location-quantity`, {
        id_art: record.id_art,
        id_mov: record.id_mov ?? null,
        area: record.area,
        scaffale: record.scaffale,
        colonna: record.colonna,
        piano: record.piano,
        old_quantity: record.totalQta,
        new_quantity: newQuantity
      });

      if (response.data.message) {
        message.success('Quantità aggiornata con successo');
        // Refresh the data
        fetchItems(currentPage, pageSize);
        cancelEditing();
      }
    } catch (error) {
      console.error('Error updating quantity:', error);
      const errorMessage = error.response?.data?.error || 'Errore durante l\'aggiornamento della quantità';
      message.error(errorMessage);
    } finally {
      setEditingLoading(false);
    }
  };

  const handleQuantityChange = (e) => {
    setEditingQuantity(e.target.value);
  };

  const handleQuantityKeyPress = (e, record) => {
    if (e.key === 'Enter') {
      saveQuantity(record);
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  // Print functions
  const fetchAllDataForPrint = async () => {
    try {
      setPrintLoading(true);
      
      // Create filterParts with proper hyphen placement
      let filterStringParam = locationFilter.join('-');
      const parts = filterStringParam.split('-').slice(0, 4);
      while (parts.length < 4) parts.push('');
      filterStringParam = parts.join('-');
      
      // Clear filter if all empty
      if (parts.every(part => !part)) filterStringParam = '';

      // Fetch all pages of data
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-items`, {
        params: {
          page: 1,
          limit: 99999, // Get all items
          articleFilter,
          supplierFilter,
          descriptionFilter,
          filterString: filterStringParam
        },
      });

      if (response.data?.items) {
        setAllPrintData(response.data.items);
        return response.data.items;
      }
      return [];
    } catch (error) {
      console.error('Error fetching all data for print:', error);
      message.error('Errore nel caricamento dei dati per la stampa');
      return [];
    } finally {
      setPrintLoading(false);
    }
  };

  const generatePrintContent = (data, title) => {
    const currentDate = new Date().toLocaleDateString('it-IT');
    const currentTime = new Date().toLocaleTimeString('it-IT');
    
    let html = `
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px;
              font-size: 12px;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #333;
              padding-bottom: 10px;
            }
            .filters {
              margin-bottom: 20px;
              padding: 10px;
              background-color: #f5f5f5;
              border-radius: 5px;
            }
            .filters strong {
              color: #333;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 20px;
            }
            th, td { 
              border: 1px solid #ddd; 
              padding: 8px; 
              text-align: left;
            }
            th { 
              background-color: #f2f2f2; 
              font-weight: bold;
            }
            .main-row {
              background-color: #fafafa;
              font-weight: bold;
            }
            .sub-row {
              background-color: white;
              font-size: 11px;
            }
            .sub-table {
              margin: 5px 0;
              border: 1px solid #eee;
            }
            .sub-table th {
              background-color: #f8f8f8;
              font-size: 10px;
            }
            .sub-table td {
              font-size: 10px;
              padding: 4px;
            }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${title}</h1>
            <p>Generato il: ${currentDate} alle ${currentTime}</p>
          </div>
          
          <div class="filters">
            <strong>Filtri applicati:</strong><br/>
            ${articleFilter ? `Codice Articolo: ${articleFilter}<br/>` : ''}
            ${descriptionFilter ? `Descrizione: ${descriptionFilter}<br/>` : ''}
            ${locationFilter.some(f => f) ? `Locazione: ${locationFilter.join('-')}<br/>` : ''}
            ${!articleFilter && !descriptionFilter && !locationFilter.some(f => f) ? 'Nessun filtro applicato<br/>' : ''}
            <strong>Totale articoli trovati:</strong> ${data.length}
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Codice Articolo</th>
                <th>Descrizione</th>
                <th>Q.ta Totale</th>
                <th>Dettagli Locazioni</th>
              </tr>
            </thead>
            <tbody>
    `;

    data.forEach(item => {
      const subItemsGrouped = item.subItems ? groupSubitemsByLocationAndMovement(item.subItems) : [];
      
      html += `
        <tr class="main-row">
          <td>${item.id_art}</td>
          <td>${item.description}</td>
          <td>${item.totalQta}</td>
          <td>
            ${subItemsGrouped.length > 0 ? `
              <table class="sub-table">
                <thead>
                  <tr>
                    <th>Locazione</th>
                    <th>Movimento</th>
                    <th>Q.ta</th>
                  </tr>
                </thead>
                <tbody>
                  ${subItemsGrouped.map(subItem => `
                    <tr>
                      <td>${subItem.locazione}</td>
                      <td>${subItem.id_mov ?? '-'}</td>
                      <td>${subItem.totalQta}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : 'Nessuna locazione'}
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
          
          <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #666;">
            Rapporto generato dal sistema WMS - ${currentDate} ${currentTime}
          </div>
        </body>
      </html>
    `;

    return html;
  };

  const printCurrentPage = () => {
    const printContent = generatePrintContent(items, 'Articoli in Magazzino - Pagina Corrente');
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const printAllPages = async () => {
    const allData = await fetchAllDataForPrint();
    if (allData.length > 0) {
      const printContent = generatePrintContent(allData, 'Articoli in Magazzino - Risultati Completi');
      const printWindow = window.open('', '_blank');
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  const printMenu = (
    <Menu>
      <Menu.Item key="current" onClick={printCurrentPage}>
        <PrinterOutlined /> Stampa Pagina Corrente ({items.length} articoli)
      </Menu.Item>
      <Menu.Item key="all" onClick={printAllPages}>
        <PrinterOutlined /> Stampa Tutti i Risultati ({totalItems} articoli)
      </Menu.Item>
    </Menu>
  );
  // Columns configuration for the main table
  const columns = [
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
      title: 'Locazione',
      dataIndex: 'locazione',
      key: 'locazione',
      sorter: (a, b) => a.locazione.localeCompare(b.locazione),
      defaultSortOrder: 'ascend',
    },
    {
      title: 'Movimento',
      dataIndex: 'id_mov',
      key: 'id_mov',
      sorter: sortMovimento,
      render: (mov) => mov ?? '-',
    },
    {
      title: 'Area',
      dataIndex: 'area',
      key: 'area',
      sorter: (a, b) => String(a.area).localeCompare(String(b.area)),
    },
    {
      title: 'Scaffale',
      dataIndex: 'scaffale',
      key: 'scaffale',
      sorter: (a, b) => String(a.scaffale).localeCompare(String(b.scaffale)),
    },
    {
      title: 'Colonna',
      dataIndex: 'colonna',
      key: 'colonna',
      sorter: (a, b) => {
        const colA = String(a.colonna).padStart(2, '0');
        const colB = String(b.colonna).padStart(2, '0');
        return colA.localeCompare(colB);
      },
    },
    {
      title: 'Piano',
      dataIndex: 'piano',
      key: 'piano',
      sorter: (a, b) => Number(a.piano) - Number(b.piano),
    },
    {
      title: 'Q.ta nella posizione',
      dataIndex: 'totalQta',
      key: 'totalQta',
      sorter: (a, b) => a.totalQta - b.totalQta,
      render: (text, record) => {
        const isEditing = editingKey === record.key;
        
        if (isEditing) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Input
                value={editingQuantity}
                onChange={handleQuantityChange}
                onKeyPress={(e) => handleQuantityKeyPress(e, record)}
                style={{ width: '80px' }}
                autoFocus
              />
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => saveQuantity(record)}
                loading={editingLoading}
                style={{ minWidth: '32px' }}
              />
              <Button
                size="small"
                icon={<CloseOutlined />}
                onClick={cancelEditing}
                style={{ minWidth: '32px' }}
              />
            </div>
          );
        }
        
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{text}</span>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => startEditing(record)}
              style={{ padding: '0', minWidth: '24px' }}
            />
          </div>
        );
      },
    },
    {
      title: 'Descrizione',
      dataIndex: 'description',
      key: 'description',
      render: (text) => <span>{text}</span>,
      sorter: (a, b) => String(a.description).localeCompare(String(b.description)),
    },
    {
      title: 'Visualizza',
      key: 'visualizza',
      render: (text, record) => (
        <Button onClick={() => visualizeLocation(record)}>
          Visualizza Posizione
        </Button>
      ),
    },
  ];

  // Prepare dataSource for the main table
  const dataSource = items.map(item => ({
    key: `${item.id_art}-${item.fornitore}`,
    id_art: item.id_art,
    fornitore: item.fornitore,
    totalQta: item.totalQta,
    description: item.description,
    subItems: item.subItems, // Make sure this exists in your data
  }));

  const cancelModal = (subItem) => {
  setHighlightedShelves(new Set());

  setIsModalVisible(false);
  
  };
 // Then update the expandable configuration
const expandableConfig = {
  expandedRowRender: (record) => (
    <Table
      dataSource={record.subItems ? groupSubitemsByLocationAndMovement(record.subItems).map(item => ({
        key: `${item.id_mov}-${item.locazione}`,
        id_art: record.id_art, // Add the parent article ID
        id_mov: item.id_mov,
        area: item.area,
        scaffale: item.scaffale,
        colonna: item.colonna,
        piano: item.piano,
        locazione: item.locazione,
        totalQta: item.totalQta,
        description: item.description,
      })) : []}
      columns={subColumns}
      pagination={false}
      rowKey="key"
    />
  ),
  rowExpandable: (record) => {
    return record && record.subItems && record.subItems.length > 0;
  }
};

  // Add handler for Enter key
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      applyFilters();
    }
  };

  return (

    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '95vh' }}>
    <Modal
  title="Visualizzazione della Posizione"
  open={isModalVisible}
  onCancel={() => cancelModal()}
  footer={null}
  width="80%"
  centered

>
  <div className="grid-container">
    {/* Opens on the page that contains the highlighted shelf */}
    <WarehouseMap
      onCellClick={handleShelfClick}
      getShelfStatus={getShelfStatus}
      tooltipContent={getTooltipContent}
      highlightedShelves={highlightedShelves}
    />
  </div>
</Modal>
      <h2>Articoli in magazzino</h2>
      {/* Filter Inputs and Buttons */}
      <Row gutter={16} style={{ marginBottom: '20px', alignItems:'flex-end' }}>
  <Col>
    <Button
      type="primary"
      icon={<ReloadOutlined />}
      onClick={applyFilters}
    >
      Applica Filtri
    </Button>
  </Col>
  <Col>
    <Input
      placeholder="Cerca per Codice Articolo"
      value={articleFilter}
      onChange={(e) => setArticleFilter(e.target.value)}
      onKeyPress={handleKeyPress}
      style={{ width: 200 }}
    />
  </Col>
  
  <Col>
    <Input
      placeholder="Cerca per Descrizione"
      value={descriptionFilter}
      onChange={(e) => setDescriptionFilter(e.target.value)}
      onKeyPress={handleKeyPress}
      style={{ width: 200 }}
    />
  </Col>
  <Col>
    <div style={{ display: 'flex', alignItems: 'flex-end' }}>
      {['AREA', 'SCAFFALE', 'COLONNA', 'PIANO'].map((label, index) => (
        <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ marginBottom: '4px' }}>{label}</span>
          <Input
            ref={locationInputRefs[index]}
            value={locationFilter[index]}
            onChange={(e) => handleLocationFilterChange(index, e.target.value)}
            onKeyDown={(e) => handleLocationFilterKeyDown(index, e)}
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
  </Col>
  <Col>
    <Button onClick={clearFilters}>
      Pulisci filtri
    </Button>
  </Col>
  <Col>
    <Dropdown overlay={printMenu} placement="bottomLeft" disabled={printLoading}>
      <Button 
        type="default" 
        icon={<PrinterOutlined />}
        loading={printLoading}
      >
        Stampa <DownOutlined />
      </Button>
    </Dropdown>
  </Col>
</Row>
      {/* Main Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
          }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
          </div>
        ) : (
          <Table
          dataSource={items} // Use items directly instead of dataSource
          columns={columns}
          expandable={expandableConfig}
          rowKey="id_art" // Use id_art as the key since that's what the API returns
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      )}
      </div>
      {/* Pagination Controls */}
      <div style={{ marginTop: '20px', textAlign: 'right' }}>
        <Pagination
          current={currentPage}
          pageSize={pageSize}
          total={totalItems}
          onChange={handlePageChange}
          showSizeChanger={false} // Disable changing page size
          showQuickJumper // Allow jumping to a specific page
        />
      </div>

      <Modal
      title="Selezionare scaffale di partenza"
      open={isWarehouseMapOpen}
      onCancel={() => setIsWarehouseMapOpen(false)}
      footer={null}
      centered
      width="80%"
    >
      <div className="grid-container">
        <WarehouseMap
          onCellClick={handleShelfClickSelection}
          getShelfStatus={getShelfStatus}
          tooltipContent={getTooltipContent}
        />
      </div>
    </Modal>
    </div>
  );
};

export default GroupedItemsTable;
