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
              customText: 'ENTRATA',
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
            startRow: 10,
            startCol: 0,
            width: 8,
            height: 5,
            shelfPattern: 'regular'
          },
          {
            id: 'R',
            startRow: 4,
            startCol: 2,
            width: 5,  // Number of columns you want
            height: 1,
            startingValue: 1,
            shelfPattern: 'horizontal',  // Use 'horizontal' instead of 'regular'
            startingFloor: 1
          },
          {
            id: 'R',
            startRow: 5,
            startCol: 2,
            width: 5,  // Number of columns you want
            height: 1,
            startingValue: 2,
            shelfPattern: 'horizontal',  // Use 'horizontal' instead of 'regular'
            startingFloor: 1
          },
          {
            id: 'R',
            startRow: 6,

            startCol: 2,
            width: 5,  // Number of columns you want
            height: 1,
            startingValue: 3,
            shelfPattern: 'horizontal',  // Use 'horizontal' instead of 'regular'
            startingFloor: 1
          },

          

          {
            id: 'S',
            startRow: 3,
            startCol: 8,
            width: 1,
            height: 5,
            startingFloor:-4,
            startingValue:1,
            spanRow: 5,
            spanCol: 1,
            shelfPattern: 'regular'
          },{
            id: 'TEXT1',
            type: 'customText',
            customText: 'RIPARAZIONI',
            rotateText: false, // or false for horizontal text
            startRow: 3,
            startCol: 7,
            width: 1,
            height: 5,
            spanRow: 5,
            spanCol: 1
          },
          {
            id: 'TEXT2',
            type: 'customText',
            customText: 'ENTRATA',
            rotateText: false, // or false for horizontal text
            startRow: 14,
            startCol: 8,
            width: 1,
            spanCol:1,
            height: 1,
          },
          {
            id: 'TEXT3',
            type: 'customText',
            customText: 'POS. DOMENICO',
            rotateText: false, // or false for horizontal text
            startRow: 0,
            startCol: 0,
            width: 1,
            
            height: 1,
          }
          ,
          {
            id: 'TEXT4',
            type: 'customText',
            customText: 'ENTRATA',
            rotateText: false, // or false for horizontal text
            startRow: 0,
            startCol: 8,
            width: 1,
            
            height: 1,
          }
          ,
          {
            id: 'TEXT5',
            type: 'customText',
            customText: 'POS. CECILIA',
            rotateText: false, // or false for horizontal text
            startRow: 0,
            startCol: 9,
            width: 1,
            
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
    setCurrentPage(1);
    fetchItems(1, pageSize);
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
GRID_ROWS = {15}
GRID_COLS = {11}
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
      title: 'Movimento',
      dataIndex: 'id_mov',
      key: 'id_mov',
      sorter: (a, b) => a.id_mov.localeCompare(b.id_mov),
    },
    {
      title: 'Area',
      dataIndex: 'area',
      key: 'area',
      sorter: (a, b) => a.area.localeCompare(b.area),
    },
    {
      title: 'Scaffale',
      dataIndex: 'scaffale',
      key: 'scaffale',
      sorter: (a, b) => a.scaffale.localeCompare(b.scaffale),
    },
    {
      title: 'Colonna',
      dataIndex: 'colonna',
      key: 'colonna',
      sorter: (a, b) => a.colonna.localeCompare(b.colonna),
    },
    {
      title: 'Piano',
      dataIndex: 'piano',
      key: 'piano',
      sorter: (a, b) => a.piano - b.piano,
    },
    {
      title: 'Q.ta nello scaffale',
      dataIndex: 'totalQta',
      key: 'totalQta',
      sorter: (a, b) => a.totalQta - b.totalQta,
    },
    {
      title: 'Descrizione',
      dataIndex: 'description', // Assuming backend concatenates descriptions
      key: 'description',
      render: (text) => <span>{text}</span>,
      sorter: (a, b) => a.description.localeCompare(b.description),
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
    key: item.id_art, // Unique key for each row
    id_art: item.id_art,
    fornitore: item.fornitore,
    totalQta: item.totalQta,
    description: item.description, // Concatenated description from backend
    subItems: item.subItems,
  }));

  const cancelModal = (subItem) => {
  highlightedShelves.clear()

  setIsModalVisible(false);
  
  };

  return (

    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '95vh' }}>
    <Modal
  title="Visualizzazione della Posizione"
  visible={isModalVisible}
  onCancel={() => cancelModal()}
  footer={null}
  width="80%"
>
  <div style={{ maxHeight: '100%', overflowY: 'auto' }}>
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
            style={{ width: 200 }}
          />
        </Col>
        <Col>
          <Input
            placeholder="Search by Codice Fornitore"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            style={{ width: 200 }}
          />
        </Col>
        <Col>
          <Input
            placeholder="Filter by Area-Scaffale-Colonna-Piano (e.g., A-A-01-1)"
            value={filterString}
            onChange={(e) => setFilterString(e.target.value)}
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
            expandable={{
              expandedRowRender: (record) => (
                <Table
                  dataSource={record.subItems.map(subItem => ({
                    key: `${subItem.id_mov}-${subItem.area}-${subItem.scaffale}-${subItem.colonna}-${subItem.piano}`, // Unique key for subitem
                    id_mov: subItem.id_mov,
                    area: subItem.area,
                    scaffale: subItem.scaffale,
                    colonna: subItem.colonna,
                    piano: subItem.piano,
                    totalQta: subItem.qta,
                    description: `${subItem.amg_desc} ${subItem.amg_des2}`.trim(),
                  }))}
                  columns={subColumns}
                  pagination={false}
                  rowKey="key"
                />
              ),
              rowExpandable: (record) => record.subItems.length > 0,
            }}
            rowKey="id_art"
            pagination={false} // Disable internal pagination
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
