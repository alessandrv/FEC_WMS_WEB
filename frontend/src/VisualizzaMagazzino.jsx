import React, { useEffect, useState } from 'react';
import { Table, Spin, Input, Button, Pagination, Row, Col, message, Modal } from 'antd';
import axios from 'axios';
import { LoadingOutlined, ReloadOutlined } from '@ant-design/icons';
import WarehouseGrid from './GridComponent';
import './GridComponent.css';
import WarehouseGridSystem from './WarehouseGridSystem';

const GroupedItemsTable = () => {
  // State variables
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false); // Initially not loading
  const [articleFilter, setArticleFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [filterString, setFilterString] = useState('');
  const [descriptionFilter, setDescriptionFilter] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPage2, setCurrentPage2] = useState(1);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  
  const [pageSize] = useState(10); // Fixed page size as per requirement
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLayout, setSelectedLayout] = useState('simple');
  const [selectedShelf, setSelectedShelf] = useState(null);
  const [occupiedShelves, setOccupiedShelves] = useState(new Set());
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
          },{
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
          width: 16,
          height: 5,
          shelfPattern: 'regular',
          spanCol: 2
        },
        {
          id: 'R',
          startRow: 3,
          startCol: 9,
          width: 5,
          height: 2,
          startingValue: 1,
          shelfPattern: 'horizontal',
          startingFloor: 1,
          rotateText: true,
          spanRow:2
        },
        {
          id: 'R', 
          startRow: 5,
          startCol: 9,
          width: 5,
          height: 2,
          startingValue: 2,
          shelfPattern: 'horizontal',
          startingFloor: 1,
          rotateText: true,
          spanRow:2

        },
        {
          id: 'R',
          startRow: 7,
          startCol: 9,
          width: 5,
          height: 2,
          startingValue: 3,
          shelfPattern: 'horizontal',
          startingFloor: 1,
          rotateText: true,
          spanRow:2

          
        },
        {
          id: 'S',
          startRow: 2,
          startCol: 18,
          width: 2,
          height: 11,
          startingFloor:-10,
          startingValue:1,
          spanRow: 11,
          spanCol: 2,
          shelfPattern: 'regular'
        },
        {
          id: 'R',
          startRow: 3,
          startCol: 14,
          width: 2,
          height: 6,
          startingFloor:-4,
          startingValue:0,
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
          width: 2,
          spanCol: 2,
          height: 7,
          spanRow: 7,
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
  // Function to fetch items with pagination and filters
  const fetchItems = async (page = 1, limit = 10) => {
    try {
      setLoading(true);
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/get-items`, {
        params: {
          page,
          limit,
          articleFilter,
          supplierFilter,
          filterString,
          descriptionFilter,
        },
      });

      if (response.data && response.data.items) {
        setItems(response.data.items);
        console.log(items)
        setTotalItems(response.data.total);
        setTotalPages(response.data.totalPages);
      } else {
        setItems([]);
        setTotalItems(0);
        setTotalPages(1);
      }
    } catch (error) {
      console.error('Error fetching items:', error);
      message.error('Failed to fetch items. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch items on component mount and when currentPage changes
  useEffect(() => {
    fetchItems(currentPage, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize]);

  // Add this effect to handle filter changes
  useEffect(() => {
    if (articleFilter === '' && supplierFilter === '' && filterString === '' && descriptionFilter === '') {
      fetchItems(1, pageSize);
    }
  }, [articleFilter, supplierFilter, filterString, descriptionFilter]);

  // Function to apply filters and fetch data
  const applyFilters = () => {
    setCurrentPage(1); // Reset to first page when applying new filters
    fetchItems(1, pageSize);
  };

  // Function to clear all filters
  const clearFilters = () => {
    setArticleFilter('');
    setSupplierFilter('');
    setFilterString('');
    setDescriptionFilter('');
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
    key: `${item.id_art}-${item.fornitore}`, // Composite key using both id_art and fornitore
    id_art: item.id_art,
    fornitore: item.fornitore,
    totalQta: item.totalQta,
    description: item.description,
    subItems: item.subItems,
  }));

  const cancelModal = (subItem) => {
  highlightedShelves.clear()

  setIsModalVisible(false);
  
  };
  const expandableConfig = {
    expandedRowRender: (record) => (
      <Table
        dataSource={groupSubitemsByLocationAndMovement(record.subItems).map(item => ({
          key: `${item.id_mov}-${item.locazione}`,
          id_mov: item.id_mov,
          area: item.area,
          scaffale: item.scaffale,
          colonna: item.colonna,
          piano: item.piano,
          locazione: item.locazione,
          totalQta: item.totalQta,
          description: item.description,
        }))}
        columns={subColumns}
        pagination={false}
        rowKey="key"
      />
    ),
    rowExpandable: (record) => record.subItems.length > 0,
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
      <Row gutter={16} style={{ marginBottom: '20px' }}>
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
            placeholder="Search by Codice Articolo"
            value={articleFilter}
            onChange={(e) => setArticleFilter(e.target.value)}
            onKeyPress={handleKeyPress}
            style={{ width: 200 }}
          />
        </Col>
        <Col>
          <Input
            placeholder="Search by Codice Fornitore"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            onKeyPress={handleKeyPress}
            style={{ width: 200 }}
          />
        </Col>
        <Col>
          <Input
            placeholder="Search by Descrizione"
            value={descriptionFilter}
            onChange={(e) => setDescriptionFilter(e.target.value)}
            onKeyPress={handleKeyPress}
            style={{ width: 200 }}
          />
        </Col>
        <Col>
          <Input
            placeholder="Filter by Area-Scaffale-Colonna-Piano (e.g., A-A-01-1)"
            value={filterString}
            onChange={(e) => setFilterString(e.target.value)}
            onKeyPress={handleKeyPress}
            style={{ width: 300 }}
          />
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
          dataSource={dataSource}
          columns={columns}
          expandable={expandableConfig}
          rowKey="id_art"
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
    </div>
  );
};

export default GroupedItemsTable;
