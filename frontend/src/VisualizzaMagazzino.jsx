import React, { useEffect, useState } from 'react';
import { Table, Spin, Input, Button, Pagination, Row, Col, message, Modal } from 'antd';
import axios from 'axios';
import { LoadingOutlined, ReloadOutlined } from '@ant-design/icons';
import WarehouseGrid from './GridComponent';
import './GridComponent.css';

const GroupedItemsTable = () => {
  // State variables
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false); // Initially not loading
  const [articleFilter, setArticleFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [filterString, setFilterString] = useState('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10); // Fixed page size as per requirement
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Function to fetch items with pagination and filters
  const fetchItems = async (page = 1, limit = 10) => {
    try {
      setLoading(true);
      const response = await axios.get('${process.env.REACT_APP_API_URL}/api/get-items', {
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

  // Function to visualize the location of the subitem
  const visualizeLocation = (subItem) => {
    const { area, scaffale, colonna, piano } = subItem;

    const colFormatted = colonna.toString().padStart(2, '0');
    const shelfToHighlight = `${scaffale}-${colFormatted}-${piano}`;

    const getShelfClass = (shelf) => {
      if (shelf === shelfToHighlight) {
        return 'shelf highlighted';
      }
      return 'shelf';
    };

    const handleShelfClick = (shelf) => {
      // Implement if needed
    };

    const getTooltipContent = (shelf) => {
      return shelf;
    };

    Modal.info({
      title: 'Visualizzazione della Posizione',
      content: (
        <div style={{ maxHeight: '80vh', overflowY: 'auto' }}>
          <div className="grid-container">
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
          </div>
        </div>
      ),
      width: '80%', // Adjust as needed
      onOk() {},
    });
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
      dataIndex: 'codice_fornitore',
      key: 'codice_fornitore',
      sorter: (a, b) => a.codice_fornitore.localeCompare(b.codice_fornitore),
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
    codice_fornitore: item.codice_fornitore,
    totalQta: item.totalQta,
    description: item.description, // Concatenated description from backend
    subItems: item.subItems,
  }));

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '95vh' }}>
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
            Clear Filters
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
