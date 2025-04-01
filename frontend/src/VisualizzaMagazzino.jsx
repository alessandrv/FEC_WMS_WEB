import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Table, Spin, Input, Button, Pagination, Row, Col, message, Modal, notification, Tooltip, Typography } from 'antd';
import axios from 'axios';
import { LoadingOutlined, ReloadOutlined, FullscreenOutlined, InfoCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import WarehouseGrid from './GridComponent';
import './GridComponent.css';
import WarehouseGridSystem from './WarehouseGridSystem';
import { WarehouseLayouts } from './layouts';

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
  const [currentPage2, setCurrentPage2] = useState(1);
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

  const groupSubitemsByLocationAndMovement = (subitems) => {
    const groupedItems = {};
    
    subitems.forEach(subItem => {
      const groupKey = `${subItem.area}-${subItem.scaffale}-${subItem.colonna}-${subItem.piano}`;
        const locazione = `${subItem.area}-${subItem.scaffale}-${subItem.colonna.toString().padStart(2, '0')}-${subItem.piano}`;
        
        if (!groupedItems[groupKey]) {
            groupedItems[groupKey] = {
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

    // Convert to array and sort by locazione
    return Object.values(groupedItems).sort((a, b) => a.locazione.localeCompare(b.locazione));
  };

  const sortMovimento = (a, b) => {
    // Convert both values to strings for comparison
    const movA = String(a.id_mov);
    const movB = String(b.id_mov);
    
    // First try numeric sorting if both are valid numbers
    const numA = parseInt(movA);
    const numB = parseInt(movB);
    
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    
    // Fall back to string comparison if not both numbers
    return movA.localeCompare(movB);
  };
  const handleShelfClickSelection = (shelf) => {
    setHighlightedShelf(shelf);
    
    // Parse the shelf string (format: "C-01-1")
    const [scaffale, colonna, piano] = shelf.split('-');
    
    // Set values based on which tab is active
    setLocationFilter(['A', scaffale, colonna, piano]);
    
    
    setIsWarehouseMapOpen(false);
  };

  const layouts = WarehouseLayouts;
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
  const handlePageChange2 = (page) => {
    setCurrentPage2(page);
  };

  
  // Function to visualize the location of the subitem
  const visualizeLocation = (subItem) => {
    const { area, scaffale, colonna, piano } = subItem;
    const colFormatted = colonna.toString().padStart(2, '0');
    const shelfToHighlight = `${scaffale}-${colFormatted}-${piano}`;
    console.log(shelfToHighlight)
    highlightedShelves.add(shelfToHighlight)
    const getShelfClass = (shelf) => {
      if (shelf === shelfToHighlight) {
        return 'shelf highlighted';
      }
      return 'shelf';
    };

  setSelectedRecord(subItem);
  setIsModalVisible(true);
  
  };

  const [highlightedShelves, setHighlightedShelves] = useState(new Set());
  const handleShelfClick = (shelf) => {
    console.log(highlightedShelves)
  };

  const getTooltipContent = (shelf) => {
    return shelf;
  };
  const renderWarehouseSection = () => {
    if (currentPage2 === 1) {
        return (
    <div>
    <WarehouseGridSystem
    warehouseLayout={layouts[1]}
    GRID_ROWS = {30}
    GRID_COLS = {9}
    onCellClick={handleShelfClick}
    getShelfStatus={getShelfStatus}
    tooltipContent={getTooltipContent}
    highlightedShelves={highlightedShelves}

  />
</div>)}
else if (currentPage2 === 2) {
    return (
<div>
<WarehouseGridSystem
GRID_ROWS = {16}
GRID_COLS = {22}
warehouseLayout={layouts[2]}
onCellClick={handleShelfClick}
getShelfStatus={getShelfStatus}
tooltipContent={getTooltipContent}
highlightedShelves={highlightedShelves}

/>
</div>)}
};
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
  highlightedShelves.clear()

  setIsModalVisible(false);
  
  };
 // Then update the expandable configuration
const expandableConfig = {
  expandedRowRender: (record) => (
    <Table
      dataSource={record.subItems ? groupSubitemsByLocationAndMovement(record.subItems).map(item => ({
        key: `${item.id_mov}-${item.locazione}`,
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
  return (

    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '95vh' }}>
    <Modal
  title="Visualizzazione della Posizione"
  visible={isModalVisible}
  onCancel={() => cancelModal()}
  footer={null}
  width="80%"
  style={{top: '50%', transform: 'translateY(-50%)' }}

>
  <div style={{ maxHeight: '100%' }}>
    <div className="grid-container">
      {renderWarehouseSection()}
    </div>
    {/* Add Pagination Below the Grids */}
    <div className="pagination-container" style={{ marginTop: '20px', textAlign: 'center' }}>
      <Pagination
        current={currentPage2}
        total={2}
        pageSize={1}
        onChange={(page) => setCurrentPage2(page)}
        showSizeChanger={false}
        simple
      />
    </div>
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
    </div>
  );
};

export default GroupedItemsTable;
